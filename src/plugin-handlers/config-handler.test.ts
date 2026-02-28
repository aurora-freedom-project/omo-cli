import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test"
import { resolveCategoryConfig, createConfigHandler } from "./config-handler"
import type { CategoryConfig } from "../config/schema"
import type { OmoCliConfig } from "../config"

import * as agents from "../agents"
import * as worker from "../agents/worker"
import * as commandLoader from "../features/claude-code-command-loader"
import * as builtinCommands from "../features/builtin-commands"
import * as skillLoader from "../features/opencode-skill-loader"
import * as agentLoader from "../features/claude-code-agent-loader"
import * as mcpLoader from "../features/claude-code-mcp-loader"
import * as pluginLoader from "../features/claude-code-plugin-loader"
import * as mcpModule from "../mcp"
import * as shared from "../shared"
import * as configDir from "../shared/opencode-config-dir"
import * as permissionCompat from "../shared/permission-compat"
import * as modelResolver from "../shared/model-resolver"

beforeEach(() => {
  spyOn(agents, "createBuiltinAgents").mockResolvedValue({
    orchestrator: { name: "orchestrator", prompt: "test", mode: "primary" },
    architect: { name: "architect", prompt: "test", mode: "subagent" },
  })

  spyOn(worker, "createWorkerAgentWithOverrides").mockReturnValue({
    name: "worker",
    prompt: "test",
    mode: "subagent",
  })

  spyOn(commandLoader, "loadUserCommands").mockResolvedValue({})
  spyOn(commandLoader, "loadProjectCommands").mockResolvedValue({})
  spyOn(commandLoader, "loadOpencodeGlobalCommands").mockResolvedValue({})
  spyOn(commandLoader, "loadOpencodeProjectCommands").mockResolvedValue({})

  spyOn(builtinCommands, "loadBuiltinCommands").mockReturnValue({})

  spyOn(skillLoader, "loadUserSkills").mockResolvedValue({})
  spyOn(skillLoader, "loadProjectSkills").mockResolvedValue({})
  spyOn(skillLoader, "loadOpencodeGlobalSkills").mockResolvedValue({})
  spyOn(skillLoader, "loadOpencodeProjectSkills").mockResolvedValue({})
  spyOn(skillLoader, "discoverUserClaudeSkills").mockResolvedValue([])
  spyOn(skillLoader, "discoverProjectClaudeSkills").mockResolvedValue([])
  spyOn(skillLoader, "discoverOpencodeGlobalSkills").mockResolvedValue([])
  spyOn(skillLoader, "discoverOpencodeProjectSkills").mockResolvedValue([])

  spyOn(agentLoader, "loadUserAgents").mockReturnValue({})
  spyOn(agentLoader, "loadProjectAgents").mockReturnValue({})

  spyOn(mcpLoader, "loadMcpConfigs").mockResolvedValue({ servers: {}, loadedServers: [] })

  spyOn(pluginLoader, "loadAllPluginComponents").mockResolvedValue({
    commands: {},
    skills: {},
    agents: {},
    mcpServers: {},
    hooksConfigs: [],
    plugins: [],
    errors: [],
  })

  spyOn(mcpModule, "createBuiltinMcps").mockReturnValue({})

  spyOn(shared, "log").mockImplementation(() => { })
  spyOn(shared, "fetchAvailableModels").mockResolvedValue(new Set(["anthropic/claude-opus-4-5"]))
  spyOn(shared, "readConnectedProvidersCache").mockReturnValue(null)

  spyOn(configDir, "getOpenCodeConfigPaths").mockReturnValue({
    configDir: "/tmp/.config/opencode",
    configJson: "/tmp/.config/opencode/opencode.json",
    configJsonc: "/tmp/.config/opencode/opencode.jsonc",
    packageJson: "/tmp/.config/opencode/package.json",
    omoConfig: "/tmp/.config/opencode/omo-cli.json",
  })

  spyOn(permissionCompat, "migrateAgentConfig").mockImplementation((config: Record<string, unknown>) => config)

  spyOn(modelResolver, "resolveModelWithFallback").mockReturnValue({ model: "anthropic/claude-opus-4-5", source: "override" })
})

afterEach(() => {
  (agents.createBuiltinAgents as { mockRestore?: () => void })?.mockRestore?.()
    ; (worker.createWorkerAgentWithOverrides as { mockRestore?: () => void })?.mockRestore?.()
    ; (commandLoader.loadUserCommands as { mockRestore?: () => void })?.mockRestore?.()
    ; (commandLoader.loadProjectCommands as { mockRestore?: () => void })?.mockRestore?.()
    ; (commandLoader.loadOpencodeGlobalCommands as { mockRestore?: () => void })?.mockRestore?.()
    ; (commandLoader.loadOpencodeProjectCommands as { mockRestore?: () => void })?.mockRestore?.()
    ; (builtinCommands.loadBuiltinCommands as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.loadUserSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.loadProjectSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.loadOpencodeGlobalSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.loadOpencodeProjectSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.discoverUserClaudeSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.discoverProjectClaudeSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.discoverOpencodeGlobalSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (skillLoader.discoverOpencodeProjectSkills as { mockRestore?: () => void })?.mockRestore?.()
    ; (agentLoader.loadUserAgents as { mockRestore?: () => void })?.mockRestore?.()
    ; (agentLoader.loadProjectAgents as { mockRestore?: () => void })?.mockRestore?.()
    ; (mcpLoader.loadMcpConfigs as { mockRestore?: () => void })?.mockRestore?.()
    ; (pluginLoader.loadAllPluginComponents as { mockRestore?: () => void })?.mockRestore?.()
    ; (mcpModule.createBuiltinMcps as { mockRestore?: () => void })?.mockRestore?.()
    ; (shared.log as { mockRestore?: () => void })?.mockRestore?.()
    ; (shared.fetchAvailableModels as { mockRestore?: () => void })?.mockRestore?.()
    ; (shared.readConnectedProvidersCache as { mockRestore?: () => void })?.mockRestore?.()
    ; (configDir.getOpenCodeConfigPaths as { mockRestore?: () => void })?.mockRestore?.()
    ; (permissionCompat.migrateAgentConfig as { mockRestore?: () => void })?.mockRestore?.()
    ; (modelResolver.resolveModelWithFallback as { mockRestore?: () => void })?.mockRestore?.()
})

describe("Plan agent demote behavior", () => {
  test("plan agent should be demoted to subagent mode when replacePlan is true", async () => {
    // #given
    const pluginConfig: OmoCliConfig = {
      sisyphus_agent: {
        planner_enabled: true,
        replace_plan: true,
      },
    }
    const config: Record<string, unknown> = {
      model: "anthropic/claude-opus-4-5",
      agent: {
        plan: {
          name: "plan",
          mode: "primary",
          prompt: "original plan prompt",
        },
      },
    }
    const handler = createConfigHandler({
      ctx: { directory: "/tmp" },
      pluginConfig,
      modelCacheState: {
        anthropicContext1MEnabled: false,
        modelContextLimitsCache: new Map(),
      },
    })

    // #when
    await handler(config)

    // #then
    const agents = config.agent as Record<string, { mode?: string; name?: string }>
    expect(agents.plan).toBeDefined()
    expect(agents.plan.mode).toBe("subagent")
    expect(agents.plan.name).toBe("plan")
  })

  test("planner should have mode 'all' to be callable via delegate_task", async () => {
    // #given
    const pluginConfig: OmoCliConfig = {
      sisyphus_agent: {
        planner_enabled: true,
      },
    }
    const config: Record<string, unknown> = {
      model: "anthropic/claude-opus-4-5",
      agent: {},
    }
    const handler = createConfigHandler({
      ctx: { directory: "/tmp" },
      pluginConfig,
      modelCacheState: {
        anthropicContext1MEnabled: false,
        modelContextLimitsCache: new Map(),
      },
    })

    // #when
    await handler(config)

    // #then
    const agents = config.agent as Record<string, { mode?: string }>
    expect(agents.planner).toBeDefined()
    expect(agents.planner.mode).toBe("all")
  })
})

describe("Planner category config resolution", () => {
  test("resolves ultrabrain category config", () => {
    // #given
    const categoryName = "ultrabrain"

    // #when
    const config = resolveCategoryConfig(categoryName)

    // #then
    expect(config).toBeDefined()
    expect(config?.model).toBe("openai/gpt-5.2-codex")
    expect(config?.variant).toBe("xhigh")
  })

  test("resolves visual-engineering category config", () => {
    // #given
    const categoryName = "visual-engineering"

    // #when
    const config = resolveCategoryConfig(categoryName)

    // #then
    expect(config).toBeDefined()
    expect(config?.model).toBe("google/gemini-3-pro")
  })

  test("user categories override default categories", () => {
    // #given
    const categoryName = "ultrabrain"
    const userCategories: Record<string, CategoryConfig> = {
      ultrabrain: {
        model: "google/antigravity-claude-opus-4-5-thinking",
        temperature: 0.1,
      },
    }

    // #when
    const config = resolveCategoryConfig(categoryName, userCategories)

    // #then
    expect(config).toBeDefined()
    expect(config?.model).toBe("google/antigravity-claude-opus-4-5-thinking")
    expect(config?.temperature).toBe(0.1)
  })

  test("returns undefined for unknown category", () => {
    // #given
    const categoryName = "nonexistent-category"

    // #when
    const config = resolveCategoryConfig(categoryName)

    // #then
    expect(config).toBeUndefined()
  })

  test("falls back to default when user category has no entry", () => {
    // #given
    const categoryName = "ultrabrain"
    const userCategories: Record<string, CategoryConfig> = {
      "visual-engineering": {
        model: "custom/visual-model",
      },
    }

    // #when
    const config = resolveCategoryConfig(categoryName, userCategories)

    // #then - falls back to DEFAULT_CATEGORIES
    expect(config).toBeDefined()
    expect(config?.model).toBe("openai/gpt-5.2-codex")
    expect(config?.variant).toBe("xhigh")
  })

  test("preserves all category properties (temperature, top_p, tools, etc.)", () => {
    // #given
    const categoryName = "custom-category"
    const userCategories: Record<string, CategoryConfig> = {
      "custom-category": {
        model: "test/model",
        temperature: 0.5,
        top_p: 0.9,
        maxTokens: 32000,
        tools: { tool1: true, tool2: false },
      },
    }

    // #when
    const config = resolveCategoryConfig(categoryName, userCategories)

    // #then
    expect(config).toBeDefined()
    expect(config?.model).toBe("test/model")
    expect(config?.temperature).toBe(0.5)
    expect(config?.top_p).toBe(0.9)
    expect(config?.maxTokens).toBe(32000)
    expect(config?.tools).toEqual({ tool1: true, tool2: false })
  })
})

describe("Planner direct override priority over category", () => {
  test("direct reasoningEffort takes priority over category reasoningEffort", async () => {
    // #given - category has reasoningEffort=xhigh, direct override says "low"
    const pluginConfig: OmoCliConfig = {
      sisyphus_agent: {
        planner_enabled: true,
      },
      categories: {
        "test-planning": {
          model: "openai/gpt-5.2",
          reasoningEffort: "xhigh",
        },
      },
      agents: {
        planner: {
          category: "test-planning",
          reasoningEffort: "low",
        },
      },
    }
    const config: Record<string, unknown> = {
      model: "anthropic/claude-opus-4-5",
      agent: {},
    }
    const handler = createConfigHandler({
      ctx: { directory: "/tmp" },
      pluginConfig,
      modelCacheState: {
        anthropicContext1MEnabled: false,
        modelContextLimitsCache: new Map(),
      },
    })

    // #when
    await handler(config)

    // #then - direct override's reasoningEffort wins
    const agents = config.agent as Record<string, { reasoningEffort?: string }>
    expect(agents.planner).toBeDefined()
    expect(agents.planner.reasoningEffort).toBe("low")
  })

  test("category reasoningEffort applied when no direct override", async () => {
    // #given - category has reasoningEffort but no direct override
    const pluginConfig: OmoCliConfig = {
      sisyphus_agent: {
        planner_enabled: true,
      },
      categories: {
        "reasoning-cat": {
          model: "openai/gpt-5.2",
          reasoningEffort: "high",
        },
      },
      agents: {
        planner: {
          category: "reasoning-cat",
        },
      },
    }
    const config: Record<string, unknown> = {
      model: "anthropic/claude-opus-4-5",
      agent: {},
    }
    const handler = createConfigHandler({
      ctx: { directory: "/tmp" },
      pluginConfig,
      modelCacheState: {
        anthropicContext1MEnabled: false,
        modelContextLimitsCache: new Map(),
      },
    })

    // #when
    await handler(config)

    // #then - category's reasoningEffort is applied
    const agents = config.agent as Record<string, { reasoningEffort?: string }>
    expect(agents.planner).toBeDefined()
    expect(agents.planner.reasoningEffort).toBe("high")
  })

  test("direct temperature takes priority over category temperature", async () => {
    // #given
    const pluginConfig: OmoCliConfig = {
      sisyphus_agent: {
        planner_enabled: true,
      },
      categories: {
        "temp-cat": {
          model: "openai/gpt-5.2",
          temperature: 0.8,
        },
      },
      agents: {
        planner: {
          category: "temp-cat",
          temperature: 0.1,
        },
      },
    }
    const config: Record<string, unknown> = {
      model: "anthropic/claude-opus-4-5",
      agent: {},
    }
    const handler = createConfigHandler({
      ctx: { directory: "/tmp" },
      pluginConfig,
      modelCacheState: {
        anthropicContext1MEnabled: false,
        modelContextLimitsCache: new Map(),
      },
    })

    // #when
    await handler(config)

    // #then - direct temperature wins over category
    const agents = config.agent as Record<string, { temperature?: number }>
    expect(agents.planner).toBeDefined()
    expect(agents.planner.temperature).toBe(0.1)
  })
})
