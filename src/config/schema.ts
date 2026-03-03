/**
 * @module config/schema
 *
 * Zod schemas defining the complete omo-cli configuration structure.
 * Used for validation of `omo-cli.json` and `omo-cli.jsonc` config files.
 *
 * Exports two categories:
 * - **Schemas** (`*Schema`): Zod validators for parsing and validation
 * - **Types** (`*Config`, `*Name`): TypeScript types inferred from schemas
 */

import { z } from "zod"
import { AnyMcpNameSchema, McpNameSchema } from "../mcp/types"

/** Permission value: ask the user, allow automatically, or deny. */
const PermissionValue = z.enum(["ask", "allow", "deny"])

const BashPermission = z.union([
  PermissionValue,
  z.record(z.string(), PermissionValue),
])

const SkillPermissionSchema = z.union([
  PermissionValue,
  z.record(z.string(), PermissionValue),
])

const AgentPermissionSchema = z.object({
  edit: PermissionValue.optional(),
  bash: BashPermission.optional(),
  webfetch: PermissionValue.optional(),
  doom_loop: PermissionValue.optional(),
  external_directory: PermissionValue.optional(),
  skill: SkillPermissionSchema.optional(),
  task: z.union([PermissionValue, z.record(z.string(), PermissionValue)]).optional(),
})

/** All recognized agent names (native + legacy, resolved via AGENT_NAME_MAP). */
export const BuiltinAgentNameSchema = z.enum([
  // New native-friendly names
  "orchestrator",
  "conductor", // New friendly name for Conductor
  "planner",
  "consultant", // New friendly name for Consultant
  "reviewer",
  "architect", // New friendly name for Architect
  "worker",
  "vision",
  "explorer",
  "researcher",

  // Alternative/Legacy functional names
  "coder",
  "advisor",
  "navigator",
  "builder",

  // Legacy names (backwards compat — resolved via AGENT_NAME_MAP)
  "sisyphus",
  "prometheus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "atlas",
])

/** Built-in skill names that can be disabled via `disabled_skills`. */
export const BuiltinSkillNameSchema = z.enum([
  "playwright",
  "agent-browser",
  "frontend-ui-ux",
  "git-master",
])

/** Agent names that can have overrides in the `agents` config section. */
export const OverridableAgentNameSchema = z.enum([
  // Native names
  "build",
  "plan",
  "orchestrator",
  "conductor",
  "worker",
  "builder",
  "coder",
  "planner",
  "consultant",
  "reviewer",
  "advisor",
  "architect",
  "researcher",
  "explorer",
  "vision",
  "navigator",
  // Legacy names (backwards compat)
  "sisyphus",
  "sisyphus-junior",
  "OpenCode-Builder",
  "prometheus",
  "metis",
  "momus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "atlas",
])

/** Alias for BuiltinAgentNameSchema — the canonical agent name validator. */
export const AgentNameSchema = BuiltinAgentNameSchema

/** All recognized hook names that can be disabled via `disabled_hooks`. */
export const HookNameSchema = z.enum([
  "todo-continuation-enforcer",
  "context-window-monitor",
  "cost-metering",
  "session-recovery",
  "session-notification",
  "comment-checker",
  "grep-output-truncator",
  "tool-output-truncator",
  "directory-agents-injector",
  "directory-readme-injector",
  "empty-task-response-detector",
  "think-mode",
  "anthropic-context-window-limit-recovery",
  "rules-injector",
  "background-notification",
  "auto-update-checker",
  "startup-toast",
  "keyword-detector",
  "agent-usage-reminder",
  "non-interactive-env",
  "interactive-bash-session",

  "thinking-block-validator",
  "ralph-loop",
  "category-skill-reminder",

  "compaction-context-injector",
  "claude-code-hooks",
  "auto-slash-command",
  "edit-error-recovery",
  "delegate-task-retry",
  "coder-md-only",
  "worker-notepad",
  "navigator",
  "question-label-truncator",
  "subagent-question-blocker",
  "memory-capture",
  "task-resume-info",
  // Legacy hook names (backwards compat)
  "prometheus-md-only",
  "sisyphus-junior-notepad",
  "atlas",
  "start-work",
])

/** Built-in slash command names that can be disabled. */
export const BuiltinCommandNameSchema = z.enum([
  "init-deep",
  "start-work",
])

/** Per-agent configuration overrides (model, tools, prompt, etc.). */
export const AgentOverrideConfigSchema = z.object({
  /** @deprecated Use `category` instead. Model is inherited from category defaults. */
  model: z.string().optional(),
  variant: z.string().optional(),
  /** Category name to inherit model and other settings from CategoryConfig */
  category: z.string().optional(),
  /** Skill names to inject into agent prompt */
  skills: z.array(z.string()).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  prompt: z.string().optional(),
  prompt_append: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  disable: z.boolean().optional(),
  description: z.string().optional(),
  mode: z.enum(["subagent", "primary", "all"]).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  permission: AgentPermissionSchema.optional(),
  /** Maximum tokens for response. Passed directly to OpenCode SDK. */
  maxTokens: z.number().optional(),
  /** Maximum steps/iterations for the agent. Maps to native OpenCode maxSteps. */
  maxSteps: z.number().optional(),
  /** Hide this agent from the agent picker UI. */
  hidden: z.boolean().optional(),
  /** Extended thinking configuration (Anthropic). Overrides category and default settings. */
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
  /** Reasoning effort level (OpenAI). Overrides category and default settings. */
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  /** Text verbosity level. */
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  /** Provider-specific options. Passed directly to OpenCode SDK. */
  providerOptions: z.record(z.string(), z.unknown()).optional(),
})

/** Map of agent names to their individual override configurations. */
export const AgentOverridesSchema = z.object({
  // Native names
  build: AgentOverrideConfigSchema.optional(),
  plan: AgentOverrideConfigSchema.optional(),
  orchestrator: AgentOverrideConfigSchema.optional(),
  conductor: AgentOverrideConfigSchema.optional(),
  worker: AgentOverrideConfigSchema.optional(),
  builder: AgentOverrideConfigSchema.optional(),
  coder: AgentOverrideConfigSchema.optional(),
  planner: AgentOverrideConfigSchema.optional(),
  consultant: AgentOverrideConfigSchema.optional(),
  reviewer: AgentOverrideConfigSchema.optional(),
  advisor: AgentOverrideConfigSchema.optional(),
  architect: AgentOverrideConfigSchema.optional(),
  researcher: AgentOverrideConfigSchema.optional(),
  explorer: AgentOverrideConfigSchema.optional(),
  vision: AgentOverrideConfigSchema.optional(),
  navigator: AgentOverrideConfigSchema.optional(),
  // Legacy names (backwards compat)
  sisyphus: AgentOverrideConfigSchema.optional(),
  "sisyphus-junior": AgentOverrideConfigSchema.optional(),
  "OpenCode-Builder": AgentOverrideConfigSchema.optional(),
  prometheus: AgentOverrideConfigSchema.optional(),
  metis: AgentOverrideConfigSchema.optional(),
  momus: AgentOverrideConfigSchema.optional(),
  oracle: AgentOverrideConfigSchema.optional(),
  librarian: AgentOverrideConfigSchema.optional(),
  explore: AgentOverrideConfigSchema.optional(),
  "multimodal-looker": AgentOverrideConfigSchema.optional(),
  atlas: AgentOverrideConfigSchema.optional(),
})

/** Controls which Claude Code integration features are enabled. */
export const ClaudeCodeConfigSchema = z.object({
  mcp: z.boolean().optional(),
  commands: z.boolean().optional(),
  skills: z.boolean().optional(),
  agents: z.boolean().optional(),
  hooks: z.boolean().optional(),
  plugins: z.boolean().optional(),
  plugins_override: z.record(z.string(), z.boolean()).optional(),
})

/** Legacy Sisyphus agent behavior toggles. */
export const SisyphusAgentConfigSchema = z.object({
  disabled: z.boolean().optional(),
  default_builder_enabled: z.boolean().optional(),
  planner_enabled: z.boolean().optional(),
  replace_plan: z.boolean().optional(),
})

/** Category configuration — shared model/tool defaults inherited by agents assigned to this category. */
export const CategoryConfigSchema = z.object({
  /** Human-readable description of the category's purpose. Shown in delegate_task prompt. */
  description: z.string().optional(),
  model: z.string().optional(),
  variant: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  maxTokens: z.number().optional(),
  thinking: z.object({
    type: z.enum(["enabled", "disabled"]),
    budgetTokens: z.number().optional(),
  }).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional(),
  textVerbosity: z.enum(["low", "medium", "high"]).optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
  prompt_append: z.string().optional(),
  /** Mark agent as unstable - forces background mode for monitoring. Auto-enabled for gemini models. */
  is_unstable_agent: z.boolean().optional(),
})

/** Built-in category names for agent grouping (native + legacy). */
export const BuiltinCategoryNameSchema = z.enum([
  // Friendly names
  "frontend",
  "backend",
  "deep-reasoning",
  "creative",
  "quick",
  "simple",
  "complex",
  "docs",

  // Legacy names
  "visual-engineering",
  "ultrabrain",
  "artistry",
  "unspecified-low",
  "unspecified-high",
  "writing",
  "business-logic", // Was missing in original enum but used in default config? Let's add it to be safe if it was implicitly allowed or missing.
])

/** Map of category names to their configurations. */
export const CategoriesConfigSchema = z.record(z.string(), CategoryConfigSchema)

/** Comment checker feature configuration. */
export const CommentCheckerConfigSchema = z.object({
  /** Custom prompt to replace the default warning message. Use {{comments}} placeholder for detected comments XML. */
  custom_prompt: z.string().optional(),
})

/** Dynamic context pruning strategies and thresholds. */
export const DynamicContextPruningConfigSchema = z.object({
  /** Enable dynamic context pruning (default: false) */
  enabled: z.boolean().default(false),
  /** Notification level: off, minimal, or detailed (default: detailed) */
  notification: z.enum(["off", "minimal", "detailed"]).default("detailed"),
  /** Turn protection - prevent pruning recent tool outputs */
  turn_protection: z.object({
    enabled: z.boolean().default(true),
    turns: z.number().min(1).max(10).default(3),
  }).optional(),
  /** Tools that should never be pruned */
  protected_tools: z.array(z.string()).default([
    "task", "todowrite", "todoread",
    "lsp_rename",
    "session_read", "session_write", "session_search",
  ]),
  /** Pruning strategies configuration */
  strategies: z.object({
    /** Remove duplicate tool calls (same tool + same args) */
    deduplication: z.object({
      enabled: z.boolean().default(true),
    }).optional(),
    /** Prune write inputs when file subsequently read */
    supersede_writes: z.object({
      enabled: z.boolean().default(true),
      /** Aggressive mode: prune any write if ANY subsequent read */
      aggressive: z.boolean().default(false),
    }).optional(),
    /** Prune errored tool inputs after N turns */
    purge_errors: z.object({
      enabled: z.boolean().default(true),
      turns: z.number().min(1).max(20).default(5),
    }).optional(),
  }).optional(),
})

/** Experimental / opt-in feature toggles. */
export const ExperimentalConfigSchema = z.object({
  aggressive_truncation: z.boolean().optional(),
  auto_resume: z.boolean().optional(),
  /** Truncate all tool outputs, not just whitelisted tools (default: false). Tool output truncator is enabled by default - disable via disabled_hooks. */
  truncate_all_tool_outputs: z.boolean().optional(),
  /** Dynamic context pruning configuration */
  dynamic_context_pruning: DynamicContextPruningConfigSchema.optional(),
})

/** Skill source: either a path string or an object with path + glob options. */
export const SkillSourceSchema = z.union([
  z.string(),
  z.object({
    path: z.string(),
    recursive: z.boolean().optional(),
    glob: z.string().optional(),
  }),
])

/** Full skill definition with template, model, agent assignment, and metadata. */
export const SkillDefinitionSchema = z.object({
  description: z.string().optional(),
  template: z.string().optional(),
  from: z.string().optional(),
  model: z.string().optional(),
  agent: z.string().optional(),
  subtask: z.boolean().optional(),
  "argument-hint": z.string().optional(),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  "allowed-tools": z.array(z.string()).optional(),
  disable: z.boolean().optional(),
})

/** Skill entry: `true` to enable, or a full SkillDefinition for customization. */
export const SkillEntrySchema = z.union([
  z.boolean(),
  SkillDefinitionSchema,
])

/** Skills config: simple string array or detailed record with sources/enable/disable. */
export const SkillsConfigSchema = z.union([
  z.array(z.string()),
  z.record(z.string(), SkillEntrySchema).and(z.object({
    sources: z.array(SkillSourceSchema).optional(),
    enable: z.array(z.string()).optional(),
    disable: z.array(z.string()).optional(),
  }).partial()),
])

/** Ralph loop iteration settings (opt-in). */
export const RalphLoopConfigSchema = z.object({
  /** Enable ralph loop functionality (default: false - opt-in feature) */
  enabled: z.boolean().default(false),
  /** Default max iterations if not specified in command (default: 100) */
  default_max_iterations: z.number().min(1).max(1000).default(100),
  /** Custom state file directory relative to project root (default: .opencode/) */
  state_dir: z.string().optional(),
})

/** Background task concurrency and timeout settings. */
export const BackgroundTaskConfigSchema = z.object({
  defaultConcurrency: z.number().min(1).optional(),
  providerConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  modelConcurrency: z.record(z.string(), z.number().min(0)).optional(),
  /** Stale timeout in milliseconds - interrupt tasks with no activity for this duration (default: 180000 = 3 minutes, minimum: 60000 = 1 minute) */
  staleTimeoutMs: z.number().min(60000).optional(),
})

/** Session notification feature configuration. */
export const NotificationConfigSchema = z.object({
  /** Force enable session-notification even if external notification plugins are detected (default: false) */
  force_enable: z.boolean().optional(),
})

/** Git commit watermark/co-author settings. */
export const GitMasterConfigSchema = z.object({
  /** Add "Ultraworked with Orchestrator" footer to commit messages (default: true) */
  commit_footer: z.boolean().default(true),
  /** Add "Co-authored-by: Orchestrator" trailer to commit messages (default: true) */
  include_co_authored_by: z.boolean().default(true),
})

/** Valid browser automation provider names. */
export const BrowserAutomationProviderSchema = z.enum(["playwright", "agent-browser", "dev-browser"])

/** Browser automation engine configuration. */
export const BrowserAutomationConfigSchema = z.object({
  /**
   * Browser automation provider to use for the "playwright" skill.
   * - "playwright": Uses Playwright MCP server (@playwright/mcp) - default
   * - "agent-browser": Uses Vercel's agent-browser CLI (requires: bun add -g agent-browser)
   * - "dev-browser": Uses dev-browser skill with persistent browser state
   */
  provider: BrowserAutomationProviderSchema.default("playwright"),
})

/** Valid tmux layout presets. */
export const TmuxLayoutSchema = z.enum([
  'main-horizontal',  // main pane top, agent panes bottom stack
  'main-vertical',    // main pane left, agent panes right stack (default)
  'tiled',            // all panes same size grid
  'even-horizontal',  // all panes horizontal row
  'even-vertical',    // all panes vertical stack
])

/** Tmux pane management configuration. */
export const TmuxConfigSchema = z.object({
  enabled: z.boolean().default(false),
  layout: TmuxLayoutSchema.default('main-vertical'),
  main_pane_size: z.number().min(20).max(80).default(60),
  main_pane_min_width: z.number().min(40).default(120),
  agent_pane_min_width: z.number().min(20).default(40),
})

/** Orchestrator tasks system configuration. */
export const SisyphusTasksConfigSchema = z.object({
  /** Enable Orchestrator Tasks system (default: false) */
  enabled: z.boolean().default(false),
  /** Storage path for tasks (default: .opencode/tasks) */
  storage_path: z.string().default(".opencode/tasks"),
  /** Enable Claude Code path compatibility mode */
  claude_code_compat: z.boolean().default(false),
})

/** Orchestrator swarm system configuration. */
export const SisyphusSwarmConfigSchema = z.object({
  /** Enable Orchestrator Swarm system (default: false) */
  enabled: z.boolean().default(false),
  /** Storage path for teams (default: .opencode/teams) */
  storage_path: z.string().default(".opencode/teams"),
  /** UI mode: toast notifications, tmux panes, or both */
  ui_mode: z.enum(["toast", "tmux", "both"]).default("toast"),
})

/** Combined Orchestrator (tasks + swarm) configuration. */
export const SisyphusConfigSchema = z.object({
  tasks: SisyphusTasksConfigSchema.optional(),
  swarm: SisyphusSwarmConfigSchema.optional(),
})

/**
 * Coding Level Configuration (inspired by ClaudeKit)
 * Controls the verbosity and educational depth of agent responses.
 * Level 1-3: Terse (minimal explanation, code-only)
 * Level 4-6: Standard (balanced explanation)
 * Level 7-10: Educational (detailed rationale, teaching mode)
 */
export const CodingLevelSchema = z.number().min(1).max(10).default(5)

/**
 * Privacy Awareness Configuration (inspired by ClaudeKit)
 * Warns users when agents attempt to access sensitive files.
 */
export const PrivacyConfigSchema = z.object({
  /** Enable privacy awareness warnings (default: true) */
  enabled: z.boolean().default(true),
  /** File patterns to consider sensitive (glob patterns) */
  sensitive_patterns: z.array(z.string()).default([
    ".env",
    ".env.*",
    "*.key",
    "*.pem",
    "**/secrets/**",
    "**/credentials/**",
  ]),
  /** Require explicit confirmation before accessing sensitive files */
  require_confirmation: z.boolean().default(false),
})


/** SurrealDB persistent memory configuration. */
export const MemoryConfigSchema = z.object({
  /** Enable omo-memory persistent memory via SurrealDB (default: false) */
  enabled: z.boolean().default(false),
  /** SurrealDB port for managed mode (default: 18000) */
  port: z.number().default(18000),
  /** Auto-capture key decisions from chat messages (default: true) */
  auto_capture: z.boolean().default(true),
  /** Connection mode: "managed" spins up omo-surrealdb container, "external" connects to existing service */
  mode: z.enum(["managed", "external"]).default("managed"),
  /** SurrealDB RPC URL (only for mode: "external", e.g. "http://localhost:8000/rpc") */
  url: z.string().optional(),
  /** SurrealDB username (default: "root") */
  user: z.string().default("root"),
  /** SurrealDB password (only for mode: "external") */
  pass: z.string().optional(),
  /** SurrealDB namespace for data isolation (default: "omo") */
  namespace: z.string().default("omo"),
  /** SurrealDB database name (default: "memory") */
  database: z.string().default("memory"),
})

const ModelPriceSchema = z.object({
  /** Cost per million input tokens (USD) */
  input: z.number(),
  /** Cost per million output tokens (USD) */
  output: z.number(),
})

/** Cost metering and budget tracking configuration. */
export const CostMeteringConfigSchema = z.object({
  /** Enable cost metering (default: false) */
  enabled: z.boolean().default(false),
  /** Show cost summary toast when session goes idle (default: true) */
  show_idle_summary: z.boolean().default(true),
  /** Monthly budget limit in USD. Warns when exceeded (default: no limit) */
  monthly_budget_usd: z.number().optional(),
  /** Daily budget limit in USD (default: no limit) */
  daily_budget_usd: z.number().optional(),
  /** Model pricing overrides — key is model name prefix, value is USD/million tokens */
  model_pricing: z.record(z.string(), ModelPriceSchema).optional(),
  /** Default pricing for unknown models (default: { input: 3.00, output: 15.00 }) */
  default_pricing: ModelPriceSchema.optional(),
})

/** Safety guard limits and circuit breaker configuration. */
export const SafetyConfigSchema = z.object({
  /** Max todo-continuation injections per session before stopping (default: 50) */
  max_continuations: z.number().min(5).max(500).default(50),
  /** Max delegation depth to prevent A→B→C→A cascades (default: 5) */
  max_delegation_depth: z.number().min(2).max(20).default(5),
  /** Consecutive errors before circuit breaker activates (default: 3) */
  circuit_breaker_threshold: z.number().min(1).max(10).default(3),
  /** Circuit breaker backoff base in ms (default: 5000) */
  circuit_breaker_backoff_base_ms: z.number().min(1000).max(30000).default(5000),
  /** Circuit breaker max backoff in ms (default: 120000 = 2min) */
  circuit_breaker_backoff_max_ms: z.number().min(10000).max(600000).default(120000),
})

/** Root omo-cli configuration schema — validates omo-cli.json files. */
export const OmoCliConfigSchema = z.object({
  $schema: z.string().optional(),
  disabled_mcps: z.array(AnyMcpNameSchema).optional(),
  disabled_agents: z.array(BuiltinAgentNameSchema).optional(),
  disabled_skills: z.array(BuiltinSkillNameSchema).optional(),
  disabled_hooks: z.array(HookNameSchema).optional(),
  disabled_commands: z.array(BuiltinCommandNameSchema).optional(),
  agents: AgentOverridesSchema.optional(),
  categories: CategoriesConfigSchema.optional(),
  claude_code: ClaudeCodeConfigSchema.optional(),
  sisyphus_agent: SisyphusAgentConfigSchema.optional(),
  comment_checker: CommentCheckerConfigSchema.optional(),
  experimental: ExperimentalConfigSchema.optional(),
  auto_update: z.boolean().optional(),
  skills: SkillsConfigSchema.optional(),
  ralph_loop: RalphLoopConfigSchema.optional(),
  background_task: BackgroundTaskConfigSchema.optional(),
  notification: NotificationConfigSchema.optional(),
  git_master: GitMasterConfigSchema.optional(),
  browser_automation_engine: BrowserAutomationConfigSchema.optional(),
  tmux: TmuxConfigSchema.optional(),
  orchestrator: SisyphusConfigSchema.optional(),
  /** Coding level (1-10) - controls verbosity of agent responses */
  coding_level: CodingLevelSchema.optional(),
  /** Privacy awareness configuration */
  privacy: PrivacyConfigSchema.optional(),
  /** omo-memory: Persistent memory via SurrealDB v3 */
  memory: MemoryConfigSchema.optional(),
  /** Cost metering: Track token usage and estimate USD costs */
  cost_metering: CostMeteringConfigSchema.optional(),
  /** Safety guards: loop limits, delegation depth, circuit breaker */
  safety: SafetyConfigSchema.optional(),
})

// ─── Inferred Types ─────────────────────────────────────────────────────────
// TypeScript types inferred from the Zod schemas above.

/** Complete omo-cli configuration — validated against OmoCliConfigSchema. */
export type OmoCliConfig = z.infer<typeof OmoCliConfigSchema>
/** Per-agent override configuration. */
export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>
/** Map of agent names to their overrides. */
export type AgentOverrides = z.infer<typeof AgentOverridesSchema>
/** Background task concurrency and timeout settings. */
export type BackgroundTaskConfig = z.infer<typeof BackgroundTaskConfigSchema>
/** Valid agent name string literal. */
export type AgentName = z.infer<typeof AgentNameSchema>
/** Valid hook name string literal. */
export type HookName = z.infer<typeof HookNameSchema>
/** Valid built-in command name. */
export type BuiltinCommandName = z.infer<typeof BuiltinCommandNameSchema>
/** Valid built-in skill name. */
export type BuiltinSkillName = z.infer<typeof BuiltinSkillNameSchema>
/** Sisyphus agent behavior configuration. */
export type SisyphusAgentConfig = z.infer<typeof SisyphusAgentConfigSchema>
/** Comment checker configuration. */
export type CommentCheckerConfig = z.infer<typeof CommentCheckerConfigSchema>
/** Experimental feature toggles. */
export type ExperimentalConfig = z.infer<typeof ExperimentalConfigSchema>
/** Dynamic context pruning strategy configuration. */
export type DynamicContextPruningConfig = z.infer<typeof DynamicContextPruningConfigSchema>
/** Skills configuration — array or record format. */
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>
/** Individual skill definition with metadata. */
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>
/** Ralph loop iteration configuration. */
export type RalphLoopConfig = z.infer<typeof RalphLoopConfigSchema>
/** Session notification configuration. */
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>
/** Category model/tool defaults configuration. */
export type CategoryConfig = z.infer<typeof CategoryConfigSchema>
/** Map of category names to configurations. */
export type CategoriesConfig = z.infer<typeof CategoriesConfigSchema>
/** Valid built-in category name. */
export type BuiltinCategoryName = z.infer<typeof BuiltinCategoryNameSchema>
/** Git commit message configuration. */
export type GitMasterConfig = z.infer<typeof GitMasterConfigSchema>
/** Browser automation provider selection. */
export type BrowserAutomationProvider = z.infer<typeof BrowserAutomationProviderSchema>
/** Browser automation engine configuration. */
export type BrowserAutomationConfig = z.infer<typeof BrowserAutomationConfigSchema>
/** Tmux pane management configuration. */
export type TmuxConfig = z.infer<typeof TmuxConfigSchema>
/** Tmux window layout preset. */
export type TmuxLayout = z.infer<typeof TmuxLayoutSchema>
/** Orchestrator tasks system configuration. */
export type SisyphusTasksConfig = z.infer<typeof SisyphusTasksConfigSchema>
/** Orchestrator swarm system configuration. */
export type SisyphusSwarmConfig = z.infer<typeof SisyphusSwarmConfigSchema>
/** Orchestrator (tasks + swarm) configuration. */
export type SisyphusConfig = z.infer<typeof SisyphusConfigSchema>
/** Coding verbosity level (1-10). */
export type CodingLevel = z.infer<typeof CodingLevelSchema>
/** Privacy awareness configuration. */
export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>
/** SurrealDB persistent memory configuration. */
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>
/** Cost metering and budget tracking configuration. */
export type CostMeteringConfig = z.infer<typeof CostMeteringConfigSchema>
/** Safety guard limits and circuit breaker configuration. */
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>

export { AnyMcpNameSchema, type AnyMcpName, McpNameSchema, type McpName } from "../mcp/types"
