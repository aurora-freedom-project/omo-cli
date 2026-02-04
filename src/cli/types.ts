export type ClaudeSubscription = "no" | "yes" | "max20"
export type BooleanArg = "no" | "yes"
export type PresetName = "mike-full" | "claude-only" | "free"
export type SkillsMode = "bundled" | "filesystem"

export interface InstallArgs {
  tui: boolean
  preset?: PresetName
  claude?: ClaudeSubscription
  openai?: BooleanArg
  gemini?: BooleanArg
  copilot?: BooleanArg
  opencodeZen?: BooleanArg
  zaiCodingPlan?: BooleanArg
  skipAuth?: boolean
  skillsMode?: SkillsMode
}

export interface InstallConfig {
  hasClaude: boolean
  isMax20: boolean
  hasOpenAI: boolean
  hasGemini: boolean
  hasCopilot: boolean
  hasOpencodeZen: boolean
  hasZaiCodingPlan: boolean
  /** If true, use fixed Antigravity config instead of dynamic fallback */
  useFixedAntigravityConfig?: boolean
  /** Skills mode: bundled (615 pre-bundled) or filesystem (load from ~/.agent/skills/) */
  skillsMode?: SkillsMode
}

export interface ConfigMergeResult {
  success: boolean
  configPath: string
  error?: string
}

export interface DetectedConfig {
  isInstalled: boolean
  hasClaude: boolean
  isMax20: boolean
  hasOpenAI: boolean
  hasGemini: boolean
  hasCopilot: boolean
  hasOpencodeZen: boolean
  hasZaiCodingPlan: boolean
}
