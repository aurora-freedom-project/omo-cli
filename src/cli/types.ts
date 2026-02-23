export type SkillsMode = "bundled" | "filesystem"

export interface InstallArgs {
  tui: boolean
  profile?: string
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
  /** Skills mode: bundled (626+ pre-bundled) or filesystem (load from ~/.agents/skills/) */
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
