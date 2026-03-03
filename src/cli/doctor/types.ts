/** Status of a single doctor health check. */
export type CheckStatus = "pass" | "fail" | "warn" | "skip"

/** Result of running a single health check. */
export interface CheckResult {
  name: string
  status: CheckStatus
  message: string
  details?: string[]
  duration?: number
}

/** Async function that performs a health check. */
export type CheckFunction = () => Promise<CheckResult>

/** Category grouping for health checks. */
export type CheckCategory =
  | "installation"
  | "configuration"
  | "authentication"
  | "dependencies"
  | "tools"
  | "updates"

/** Definition of a single health check with metadata. */
export interface CheckDefinition {
  id: string
  name: string
  category: CheckCategory
  check: CheckFunction
  critical?: boolean
}

/** Options for running the doctor command. */
export interface DoctorOptions {
  verbose?: boolean
  json?: boolean
  category?: CheckCategory
}

/** Summary statistics from a doctor run. */
export interface DoctorSummary {
  total: number
  passed: number
  failed: number
  warnings: number
  skipped: number
  duration: number
}

/** Complete result of a doctor run. */
export interface DoctorResult {
  results: CheckResult[]
  summary: DoctorSummary
  exitCode: number
}

/** Information about the OpenCode installation. */
export interface OpenCodeInfo {
  installed: boolean
  version: string | null
  path: string | null
  binary: "opencode" | "opencode-desktop" | null
}

/** Information about plugin registration status. */
export interface PluginInfo {
  registered: boolean
  configPath: string | null
  entry: string | null
  isPinned: boolean
  pinnedVersion: string | null
}

/** Information about configuration validity. */
export interface ConfigInfo {
  exists: boolean
  path: string | null
  format: "json" | "jsonc" | null
  valid: boolean
  errors: string[]
}

/** Supported authentication provider identifiers. */
export type AuthProviderId = "anthropic" | "openai" | "google"

/** Information about an authentication provider's status. */
export interface AuthProviderInfo {
  id: AuthProviderId
  name: string
  pluginInstalled: boolean
  configured: boolean
  error?: string
}

/** Information about an external dependency's availability. */
export interface DependencyInfo {
  name: string
  required: boolean
  installed: boolean
  version: string | null
  path: string | null
  installHint?: string
}

/** Information about an LSP language server. */
export interface LspServerInfo {
  id: string
  installed: boolean
  extensions: string[]
  source: "builtin" | "config" | "plugin"
}

/** Information about an MCP server. */
export interface McpServerInfo {
  id: string
  type: "builtin" | "user"
  enabled: boolean
  valid: boolean
  error?: string
}

/** Information about version update status. */
export interface VersionCheckInfo {
  currentVersion: string | null
  latestVersion: string | null
  isUpToDate: boolean
  isLocalDev: boolean
  isPinned: boolean
}
