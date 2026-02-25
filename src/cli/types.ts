export interface InstallArgs {
  tui: boolean
  profile?: string
  skipAuth?: boolean
}


export interface InstallConfig {
  hasClaude: boolean
  isMax20: boolean
  hasOpenAI: boolean
  hasGemini: boolean
  hasCopilot: boolean
  hasOpencodeZen: boolean
  hasZaiCodingPlan: boolean
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
