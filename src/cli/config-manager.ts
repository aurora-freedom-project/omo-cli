import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { Effect } from "effect"
import {
  parseJsonc,
  getOpenCodeConfigPaths,
  type OpenCodeBinaryType,
  type OpenCodeConfigPaths,
} from "../shared"
import type { ConfigMergeResult, DetectedConfig } from "./types"

const OPENCODE_BINARIES = ["opencode", "opencode-desktop"] as const

interface ConfigContext {
  binary: OpenCodeBinaryType
  version: string | null
  paths: OpenCodeConfigPaths
}

let configContext: ConfigContext | null = null

/** Initialize the config context with the detected OpenCode binary and version. */
export function initConfigContext(binary: OpenCodeBinaryType, version: string | null): void {
  const paths = getOpenCodeConfigPaths({ binary, version })
  configContext = { binary, version, paths }
}

/** Get the current config context, initializing with defaults if needed. */
export function getConfigContext(): ConfigContext {
  if (!configContext) {
    const paths = getOpenCodeConfigPaths({ binary: "opencode", version: null })
    configContext = { binary: "opencode", version: null, paths }
  }
  return configContext
}

/** Reset the config context to uninitialized state (used in tests). */
export function resetConfigContext(): void {
  configContext = null
}

function getConfigDir(): string {
  return getConfigContext().paths.configDir
}

function getConfigJson(): string {
  return getConfigContext().paths.configJson
}

function getConfigJsonc(): string {
  return getConfigContext().paths.configJsonc
}

function getPackageJson(): string {
  return getConfigContext().paths.packageJson
}

function getOmoConfig(): string {
  return getConfigContext().paths.omoConfig
}

const BUN_INSTALL_TIMEOUT_SECONDS = 60
const BUN_INSTALL_TIMEOUT_MS = BUN_INSTALL_TIMEOUT_SECONDS * 1000

interface NodeError extends Error {
  code?: string
}

function isPermissionError(err: unknown): boolean {
  const nodeErr = err as NodeError
  return nodeErr?.code === "EACCES" || nodeErr?.code === "EPERM"
}

function isFileNotFoundError(err: unknown): boolean {
  const nodeErr = err as NodeError
  return nodeErr?.code === "ENOENT"
}

function formatErrorWithSuggestion(err: unknown, context: string): string {
  if (isPermissionError(err)) {
    return `Permission denied: Cannot ${context}. Try running with elevated permissions or check file ownership.`
  }

  if (isFileNotFoundError(err)) {
    return `File not found while trying to ${context}. The file may have been deleted or moved.`
  }

  if (err instanceof SyntaxError) {
    return `JSON syntax error while trying to ${context}: ${err.message}. Check for missing commas, brackets, or invalid characters.`
  }

  const message = err instanceof Error ? err.message : String(err)

  if (message.includes("ENOSPC")) {
    return `Disk full: Cannot ${context}. Free up disk space and try again.`
  }

  if (message.includes("EROFS")) {
    return `Read-only filesystem: Cannot ${context}. Check if the filesystem is mounted read-only.`
  }

  return `Failed to ${context}: ${message}`
}

/** Fetch the latest published version of an npm package. */
export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`)
        if (!res.ok) return null
        const data = await res.json() as { version: string }
        return data.version
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
}

interface NpmDistTags {
  latest?: string
  beta?: string
  next?: string
  [tag: string]: string | undefined
}

const NPM_FETCH_TIMEOUT_MS = 5000

/** Fetch all dist-tags (latest, beta, next) for an npm package. */
export async function fetchNpmDistTags(packageName: string): Promise<NpmDistTags | null> {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const res = await fetch(`https://registry.npmjs.org/-/package/${packageName}/dist-tags`, {
          signal: AbortSignal.timeout(NPM_FETCH_TIMEOUT_MS),
        })
        if (!res.ok) return null
        const data = await res.json() as NpmDistTags
        return data
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
}

const PACKAGE_NAME = "omo-cli"

const PRIORITIZED_TAGS = ["latest", "beta", "next"] as const

/** Resolve the plugin name with the matching dist-tag or version suffix. */
export async function getPluginNameWithVersion(currentVersion: string): Promise<string> {
  const distTags = await fetchNpmDistTags(PACKAGE_NAME)

  if (distTags) {
    const allTags = new Set([...PRIORITIZED_TAGS, ...Object.keys(distTags)])
    for (const tag of allTags) {
      if (distTags[tag] === currentVersion) {
        return `${PACKAGE_NAME}@${tag}`
      }
    }
  }

  return `${PACKAGE_NAME}@${currentVersion}`
}

type ConfigFormat = "json" | "jsonc" | "none"

interface OpenCodeConfig {
  plugin?: string[]
  [key: string]: unknown
}

/** Detect which config format exists: .jsonc, .json, or none. */
export function detectConfigFormat(): { format: ConfigFormat; path: string } {
  const configJsonc = getConfigJsonc()
  const configJson = getConfigJson()

  if (existsSync(configJsonc)) {
    return { format: "jsonc", path: configJsonc }
  }
  if (existsSync(configJson)) {
    return { format: "json", path: configJson }
  }
  return { format: "none", path: configJson }
}

interface ParseConfigResult {
  config: OpenCodeConfig | null
  error?: string
}

function isEmptyOrWhitespace(content: string): boolean {
  return content.trim().length === 0
}

function parseConfig(path: string, _isJsonc: boolean): OpenCodeConfig | null {
  const result = parseConfigWithError(path)
  return result.config
}

function parseConfigWithError(path: string): ParseConfigResult {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const stat = statSync(path)
        if (stat.size === 0) {
          return { config: null, error: `Config file is empty: ${path}. Delete it or add valid JSON content.` } as ParseConfigResult
        }

        const content = readFileSync(path, "utf-8")

        if (isEmptyOrWhitespace(content)) {
          return { config: null, error: `Config file contains only whitespace: ${path}. Delete it or add valid JSON content.` } as ParseConfigResult
        }

        const config = parseJsonc<OpenCodeConfig>(content)

        if (config === null || config === undefined) {
          return { config: null, error: `Config file parsed to null/undefined: ${path}. Ensure it contains valid JSON.` } as ParseConfigResult
        }

        if (typeof config !== "object" || Array.isArray(config)) {
          return { config: null, error: `Config file must contain a JSON object, not ${Array.isArray(config) ? "an array" : typeof config}: ${path}` } as ParseConfigResult
        }

        return { config } as ParseConfigResult
      },
      catch: (err) => err,
    }).pipe(Effect.catchAll((err) => Effect.succeed({ config: null, error: formatErrorWithSuggestion(err, `parse config file ${path}`) } as ParseConfigResult)))
  )
}

function ensureConfigDir(): void {
  const configDir = getConfigDir()
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
}

/** Add the omo-cli plugin entry to the OpenCode config file (creates if needed). */
export async function addPluginToOpenCodeConfig(currentVersion: string): Promise<ConfigMergeResult> {
  const ensureResult = Effect.runSync(
    Effect.try({
      try: () => { ensureConfigDir(); return true },
      catch: (err) => err,
    }).pipe(Effect.catchAll((err) => Effect.succeed({ error: formatErrorWithSuggestion(err, "create config directory") })))
  )
  if (typeof ensureResult === "object" && "error" in ensureResult) {
    return { success: false, configPath: getConfigDir(), error: ensureResult.error }
  }

  const { format, path } = detectConfigFormat()
  const pluginEntry = await getPluginNameWithVersion(currentVersion)

  return Effect.runSync(
    Effect.try({
      try: () => {
        if (format === "none") {
          const config: OpenCodeConfig = { plugin: [pluginEntry] }
          writeFileSync(path, JSON.stringify(config, null, 2) + "\n")
          return { success: true, configPath: path } as ConfigMergeResult
        }

        const parseResult = parseConfigWithError(path)
        if (!parseResult.config) {
          return { success: false, configPath: path, error: parseResult.error ?? "Failed to parse config file" } as ConfigMergeResult
        }

        const config = parseResult.config
        const plugins = config.plugin ?? []
        const existingIndex = plugins.findIndex((p) => p === PACKAGE_NAME || p.startsWith(`${PACKAGE_NAME}@`))

        if (existingIndex !== -1) {
          if (plugins[existingIndex] === pluginEntry) {
            return { success: true, configPath: path } as ConfigMergeResult
          }
          plugins[existingIndex] = pluginEntry
        } else {
          plugins.push(pluginEntry)
        }

        config.plugin = plugins

        if (format === "jsonc") {
          const content = readFileSync(path, "utf-8")
          const pluginArrayRegex = /"plugin"\s*:\s*\[[\s\S]*?\]/
          const match = content.match(pluginArrayRegex)

          if (match) {
            const formattedPlugins = plugins.map((p) => `"${p}"`).join(",\n    ")
            const newContent = content.replace(pluginArrayRegex, `"plugin": [\n    ${formattedPlugins}\n  ]`)
            writeFileSync(path, newContent)
          } else {
            const newContent = content.replace(/^(\s*\{)/, `$1\n  "plugin": ["${pluginEntry}"],`)
            writeFileSync(path, newContent)
          }
        } else {
          writeFileSync(path, JSON.stringify(config, null, 2) + "\n")
        }

        return { success: true, configPath: path } as ConfigMergeResult
      },
      catch: (err) => err,
    }).pipe(Effect.catchAll((err) => Effect.succeed({ success: false, configPath: path, error: formatErrorWithSuggestion(err, "update opencode config") } as ConfigMergeResult)))
  )
}



interface OpenCodeBinaryResult {
  binary: OpenCodeBinaryType
  version: string
}

async function findOpenCodeBinaryWithVersion(): Promise<OpenCodeBinaryResult | null> {
  for (const binary of OPENCODE_BINARIES) {
    const result = await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const proc = Bun.spawn([binary, "--version"], {
            stdout: "pipe",
            stderr: "pipe",
          })
          const output = await new Response(proc.stdout).text()
          await proc.exited
          if (proc.exitCode === 0) {
            const version = output.trim()
            initConfigContext(binary, version)
            return { binary, version } as OpenCodeBinaryResult
          }
          return null
        },
        catch: () => "fail" as const,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    )
    if (result) return result
  }
  return null
}

/** Check if any OpenCode binary (opencode, opencode-desktop) is installed. */
export async function isOpenCodeInstalled(): Promise<boolean> {
  const result = await findOpenCodeBinaryWithVersion()
  return result !== null
}

/** Get the installed OpenCode version string, or null if not found. */
export async function getOpenCodeVersion(): Promise<string | null> {
  const result = await findOpenCodeBinaryWithVersion()
  return result?.version ?? null
}


/** Result of running `bun install` in the config directory. */
export interface BunInstallResult {
  success: boolean
  timedOut?: boolean
  error?: string
}

/** Run `bun install` in the config directory. Returns true on success. */
export async function runBunInstall(): Promise<boolean> {
  const result = await runBunInstallWithDetails()
  return result.success
}

/** Run `bun install` with detailed result including timeout detection. */
export async function runBunInstallWithDetails(): Promise<BunInstallResult> {
  return Effect.runPromise(
    Effect.tryPromise({
      try: async () => {
        const proc = Bun.spawn(["bun", "install"], {
          cwd: getConfigDir(),
          stdout: "pipe",
          stderr: "pipe",
        })

        const timeoutPromise = new Promise<"timeout">((resolve) =>
          setTimeout(() => resolve("timeout"), BUN_INSTALL_TIMEOUT_MS)
        )

        const exitPromise = proc.exited.then(() => "completed" as const)

        const result = await Promise.race([exitPromise, timeoutPromise])

        if (result === "timeout") {
          try {
            proc.kill()
          } catch {
            /* intentionally empty */
          }
          return {
            success: false,
            timedOut: true,
            error: `bun install timed out after ${BUN_INSTALL_TIMEOUT_SECONDS} seconds. Try running manually: cd ~/.config/opencode && bun i`,
          } as BunInstallResult
        }

        if (proc.exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text()
          return {
            success: false,
            error: stderr.trim() || `bun install failed with exit code ${proc.exitCode}`,
          } as BunInstallResult
        }

        return { success: true } as BunInstallResult
      },
      catch: (err) => err,
    }).pipe(Effect.catchAll((err) => {
      const message = err instanceof Error ? err.message : String(err)
      return Effect.succeed({
        success: false,
        error: `bun install failed: ${message}. Is bun installed? Try: curl -fsSL https://bun.sh/install | bash`,
      } as BunInstallResult)
    }))
  )
}



/** Detect whether omo-cli is currently installed in the OpenCode config. */
export function detectCurrentConfig(): DetectedConfig {
  const result: DetectedConfig = { isInstalled: false }

  const { format, path } = detectConfigFormat()
  if (format === "none") return result

  const parseResult = parseConfigWithError(path)
  if (!parseResult.config) return result

  const plugins = parseResult.config.plugin ?? []
  result.isInstalled = plugins.some((p) => p.startsWith("omo-cli"))

  return result
}
