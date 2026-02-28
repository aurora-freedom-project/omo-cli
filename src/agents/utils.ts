import type { AgentConfig } from "@opencode-ai/sdk"
import type { BuiltinAgentName, AgentOverrideConfig, AgentOverrides, AgentFactory, AgentPromptMetadata } from "./types"
import type { CategoriesConfig, CategoryConfig, GitMasterConfig } from "../config/schema"
import { createOrchestratorAgent } from "./orchestrator"
import { createArchitectAgent, ARCHITECT_PROMPT_METADATA } from "./architect"
import { createResearcherAgent, RESEARCHER_PROMPT_METADATA } from "./researcher"
import { createExplorerAgent, EXPLORER_PROMPT_METADATA } from "./explorer"
import { createVisionAgent, VISION_PROMPT_METADATA } from "./vision"
import { createConsultantAgent } from "./conductor"
import { createConductorAgent } from "./navigator"
import { createReviewerAgent } from "./reviewer"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "./dynamic-agent-prompt-builder"
import { deepMerge, fetchAvailableModels, resolveModelWithFallback, AGENT_MODEL_REQUIREMENTS, findCaseInsensitive, includesCaseInsensitive, readConnectedProvidersCache } from "../shared"
import { DEFAULT_CATEGORIES, CATEGORY_DESCRIPTIONS } from "../tools/delegate-task/constants"
import { resolveMultipleSkills } from "../features/opencode-skill-loader/skill-content"
import { createBuiltinSkills } from "../features/builtin-skills"
import type { LoadedSkill, SkillScope } from "../features/opencode-skill-loader/types"
import type { BrowserAutomationProvider } from "../config/schema"

type AgentSource = AgentFactory | AgentConfig

const agentSources: Partial<Record<BuiltinAgentName, AgentSource>> = {
  // Canonical agent names only — no legacy duplicates
  orchestrator: createOrchestratorAgent,
  architect: createArchitectAgent,
  researcher: createResearcherAgent,
  explorer: createExplorerAgent,
  vision: createVisionAgent,
  consultant: createConsultantAgent,
  reviewer: createReviewerAgent,
  // Note: conductor is handled specially in createBuiltinAgents()
  // because it needs OrchestratorContext, not just a model string
  // Note: planner/coder is registered in config-handler.ts, not here
}

/**
 * Metadata for each agent, used to build Orchestrator's dynamic prompt sections
 * (Delegation Table, Tool Selection, Key Triggers, etc.)
 */
const agentMetadata: Partial<Record<BuiltinAgentName, AgentPromptMetadata>> = {
  architect: ARCHITECT_PROMPT_METADATA,
  researcher: RESEARCHER_PROMPT_METADATA,
  explorer: EXPLORER_PROMPT_METADATA,
  vision: VISION_PROMPT_METADATA,
}

function isFactory(source: AgentSource): source is AgentFactory {
  return typeof source === "function"
}

export function buildAgent(
  source: AgentSource,
  model: string,
  categories?: CategoriesConfig,
  gitMasterConfig?: GitMasterConfig,
  browserProvider?: BrowserAutomationProvider
): AgentConfig {
  const base = isFactory(source) ? source(model) : source
  const categoryConfigs: Record<string, CategoryConfig> = categories
    ? { ...DEFAULT_CATEGORIES, ...categories }
    : DEFAULT_CATEGORIES

  const agentWithCategory = base as AgentConfig & { category?: string; skills?: string[]; variant?: string }
  if (agentWithCategory.category) {
    const categoryConfig = categoryConfigs[agentWithCategory.category]
    if (categoryConfig) {
      if (!base.model) {
        base.model = categoryConfig.model
      }
      if (base.temperature === undefined && categoryConfig.temperature !== undefined) {
        base.temperature = categoryConfig.temperature
      }
      if (base.variant === undefined && categoryConfig.variant !== undefined) {
        base.variant = categoryConfig.variant
      }
    }
  }

  if (agentWithCategory.skills?.length) {
    const { resolved } = resolveMultipleSkills(agentWithCategory.skills, { gitMasterConfig, browserProvider })
    if (resolved.size > 0) {
      const skillContent = Array.from(resolved.values()).join("\n\n")
      base.prompt = skillContent + (base.prompt ? "\n\n" + base.prompt : "")
    }
  }

  return base
}

/**
 * Creates OmO-specific environment context (time, timezone, locale).
 * Note: Working directory, platform, and date are already provided by OpenCode's system.ts,
 * so we only include fields that OpenCode doesn't provide to avoid duplication.
 * See: https://github.com/aurora-freedom-project/omo-cli/issues/379
 */
export function createEnvContext(): string {
  const now = new Date()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const locale = Intl.DateTimeFormat().resolvedOptions().locale

  const dateStr = now.toLocaleDateString(locale, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  const timeStr = now.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })

  return `
<omo-env>
  Current date: ${dateStr}
  Current time: ${timeStr}
  Timezone: ${timezone}
  Locale: ${locale}
</omo-env>`
}

/**
 * Expands a category reference from an agent override into concrete config properties.
 * Category properties are applied unconditionally (overwriting factory defaults),
 * because the user's chosen category should take priority over factory base values.
 * Direct override properties applied later via mergeAgentConfig() will supersede these.
 */
function applyCategoryOverride(
  config: AgentConfig,
  categoryName: string,
  mergedCategories: Record<string, CategoryConfig>
): AgentConfig {
  const categoryConfig = mergedCategories[categoryName]
  if (!categoryConfig) return config

  const result = { ...config } as AgentConfig & Record<string, unknown>
  if (categoryConfig.model) result.model = categoryConfig.model
  if (categoryConfig.variant !== undefined) result.variant = categoryConfig.variant
  if (categoryConfig.temperature !== undefined) result.temperature = categoryConfig.temperature
  if (categoryConfig.reasoningEffort !== undefined) result.reasoningEffort = categoryConfig.reasoningEffort
  if (categoryConfig.textVerbosity !== undefined) result.textVerbosity = categoryConfig.textVerbosity
  if (categoryConfig.thinking !== undefined) result.thinking = categoryConfig.thinking
  if (categoryConfig.top_p !== undefined) result.top_p = categoryConfig.top_p
  if (categoryConfig.maxTokens !== undefined) result.maxTokens = categoryConfig.maxTokens

  return result as AgentConfig
}

function mergeAgentConfig(
  base: AgentConfig,
  override: AgentOverrideConfig
): AgentConfig {
  const { prompt_append, ...rest } = override
  const merged = deepMerge(base, rest as Partial<AgentConfig>)

  if (prompt_append && merged.prompt) {
    merged.prompt = merged.prompt + "\n" + prompt_append
  }

  return merged
}

function mapScopeToLocation(scope: SkillScope): AvailableSkill["location"] {
  if (scope === "user" || scope === "opencode") return "user"
  if (scope === "project" || scope === "opencode-project") return "project"
  return "plugin"
}

export async function createBuiltinAgents(
  disabledAgents: string[] = [],
  agentOverrides: AgentOverrides = {},
  directory?: string,
  systemDefaultModel?: string,
  categories?: CategoriesConfig,
  gitMasterConfig?: GitMasterConfig,
  discoveredSkills: LoadedSkill[] = [],
  client?: any,
  browserProvider?: BrowserAutomationProvider,
  uiSelectedModel?: string
): Promise<Record<string, AgentConfig>> {
  const connectedProviders = readConnectedProvidersCache()
  const availableModels = client
    ? await fetchAvailableModels(client, { connectedProviders: connectedProviders ?? undefined })
    : new Set<string>()

  const result: Record<string, AgentConfig> = {}
  const availableAgents: AvailableAgent[] = []

  const mergedCategories = categories
    ? { ...DEFAULT_CATEGORIES, ...categories }
    : DEFAULT_CATEGORIES

  const availableCategories: AvailableCategory[] = Object.entries(mergedCategories).map(([name]) => ({
    name,
    description: categories?.[name]?.description ?? CATEGORY_DESCRIPTIONS[name] ?? "General tasks",
  }))

  const builtinSkills = createBuiltinSkills({ browserProvider })
  const builtinSkillNames = new Set(builtinSkills.map(s => s.name))

  const builtinAvailable: AvailableSkill[] = builtinSkills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    location: "plugin" as const,
  }))

  const discoveredAvailable: AvailableSkill[] = discoveredSkills
    .filter(s => !builtinSkillNames.has(s.name))
    .map((skill) => ({
      name: skill.name,
      description: skill.definition.description ?? "",
      location: mapScopeToLocation(skill.scope),
    }))

  const availableSkills: AvailableSkill[] = [...builtinAvailable, ...discoveredAvailable]

  for (const [name, source] of Object.entries(agentSources)) {
    const agentName = name as BuiltinAgentName

    if (agentName === "orchestrator") continue
    if (agentName === "atlas") continue
    if (includesCaseInsensitive(disabledAgents, agentName)) continue

    const override = findCaseInsensitive(agentOverrides, agentName)
    const requirement = AGENT_MODEL_REQUIREMENTS[agentName]

    const resolution = resolveModelWithFallback({
      uiSelectedModel,
      userModel: override?.model,
      fallbackChain: requirement?.fallbackChain,
      availableModels,
      systemDefaultModel,
    })
    if (!resolution) continue
    const { model, variant: resolvedVariant } = resolution

    let config = buildAgent(source, model, mergedCategories, gitMasterConfig, browserProvider)

    // Apply resolved variant from model fallback chain
    if (resolvedVariant) {
      config = { ...config, variant: resolvedVariant }
    }

    // Expand override.category into concrete properties (higher priority than factory/resolved)
    const overrideCategory = (override as Record<string, unknown> | undefined)?.category as string | undefined
    if (overrideCategory) {
      config = applyCategoryOverride(config, overrideCategory, mergedCategories)
    }

    if (agentName === "researcher" && directory && config.prompt) {
      const envContext = createEnvContext()
      config = { ...config, prompt: config.prompt + envContext }
    }

    // Direct override properties take highest priority
    if (override) {
      config = mergeAgentConfig(config, override)
    }

    result[name] = config

    const metadata = agentMetadata[agentName]
    if (metadata) {
      availableAgents.push({
        name: agentName,
        description: config.description ?? "",
        metadata,
      })
    }
  }

  if (!disabledAgents.includes("orchestrator")) {
    const orchestratorOverride = agentOverrides["orchestrator"]
    const orchestratorRequirement = AGENT_MODEL_REQUIREMENTS["orchestrator"]

    const orchestratorResolution = resolveModelWithFallback({
      uiSelectedModel,
      userModel: orchestratorOverride?.model,
      fallbackChain: orchestratorRequirement?.fallbackChain,
      availableModels,
      systemDefaultModel,
    })

    if (orchestratorResolution) {
      const { model: orchestratorModel, variant: orchestratorResolvedVariant } = orchestratorResolution

      let orchestratorConfig = createOrchestratorAgent(
        orchestratorModel,
        availableAgents,
        undefined,
        availableSkills,
        availableCategories
      )

      if (orchestratorResolvedVariant) {
        orchestratorConfig = { ...orchestratorConfig, variant: orchestratorResolvedVariant }
      }

      const orchOverrideCategory = (orchestratorOverride as Record<string, unknown> | undefined)?.category as string | undefined
      if (orchOverrideCategory) {
        orchestratorConfig = applyCategoryOverride(orchestratorConfig, orchOverrideCategory, mergedCategories)
      }

      if (directory && orchestratorConfig.prompt) {
        const envContext = createEnvContext()
        orchestratorConfig = { ...orchestratorConfig, prompt: orchestratorConfig.prompt + envContext }
      }

      if (orchestratorOverride) {
        orchestratorConfig = mergeAgentConfig(orchestratorConfig, orchestratorOverride)
      }

      result["orchestrator"] = orchestratorConfig
    }
  }

  if (!disabledAgents.includes("conductor") && !disabledAgents.includes("navigator")) {
    const orchestratorOverride = agentOverrides["conductor"]
    const conductorRequirement = AGENT_MODEL_REQUIREMENTS["conductor"]

    const conductorResolution = resolveModelWithFallback({
      uiSelectedModel,
      userModel: orchestratorOverride?.model,
      fallbackChain: conductorRequirement?.fallbackChain,
      availableModels,
      systemDefaultModel,
    })

    if (conductorResolution) {
      const { model: conductorModel, variant: conductorResolvedVariant } = conductorResolution

      let orchestratorConfig = createConductorAgent({
        model: conductorModel,
        availableAgents,
        availableSkills,
        userCategories: categories,
      })

      if (conductorResolvedVariant) {
        orchestratorConfig = { ...orchestratorConfig, variant: conductorResolvedVariant }
      }

      const conductorOverrideCategory = (orchestratorOverride as Record<string, unknown> | undefined)?.category as string | undefined
      if (conductorOverrideCategory) {
        orchestratorConfig = applyCategoryOverride(orchestratorConfig, conductorOverrideCategory, mergedCategories)
      }

      if (orchestratorOverride) {
        orchestratorConfig = mergeAgentConfig(orchestratorConfig, orchestratorOverride)
      }

      // Conductor is a background agent - hide from Tab selector
      result["conductor"] = { ...orchestratorConfig, hidden: true }
    }
  }

  return result
}
