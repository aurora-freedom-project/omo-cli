export interface InstallArgs {
  tui: boolean
  profile?: string
  skipAuth?: boolean
}


export interface ProfileSummary {
  providers: Set<string>
  hasClaudeOpus: boolean
  enableMemory: boolean
}

export interface ConfigMergeResult {
  success: boolean
  configPath: string
  error?: string
}

export interface DetectedConfig {
  isInstalled: boolean
  providers?: Set<string>
}
