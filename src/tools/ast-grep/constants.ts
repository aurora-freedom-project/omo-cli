import { createRequire } from "module"
import { dirname, join } from "path"
import { existsSync, statSync } from "fs"
import { Effect } from "effect"
import { getCachedBinaryPath } from "./downloader"

type Platform = "darwin" | "linux" | "win32" | "unsupported"

function isValidBinary(filePath: string): boolean {
  return Effect.runSync(
    Effect.try({
      try: () => statSync(filePath).size > 10000,
      catch: () => false as never
    }).pipe(Effect.catchAll(() => Effect.succeed(false)))
  )
}

function getPlatformPackageName(): string | null {
  const platform = process.platform as Platform
  const arch = process.arch

  const platformMap: Record<string, string> = {
    "darwin-arm64": "@ast-grep/cli-darwin-arm64",
    "darwin-x64": "@ast-grep/cli-darwin-x64",
    "linux-arm64": "@ast-grep/cli-linux-arm64-gnu",
    "linux-x64": "@ast-grep/cli-linux-x64-gnu",
    "win32-x64": "@ast-grep/cli-win32-x64-msvc",
    "win32-arm64": "@ast-grep/cli-win32-arm64-msvc",
    "win32-ia32": "@ast-grep/cli-win32-ia32-msvc",
  }

  return platformMap[`${platform}-${arch}`] ?? null
}

/**
 * Resolves the ast-grep (sg) CLI binary path synchronously.
 * Checks cached binary, npm packages, platform packages, and Homebrew paths.
 * @returns Absolute path to the sg binary, or null if not found
 */
export function findSgCliPathSync(): string | null {
  const binaryName = process.platform === "win32" ? "sg.exe" : "sg"

  const cachedPath = getCachedBinaryPath()
  if (cachedPath && isValidBinary(cachedPath)) {
    return cachedPath
  }

  const cliResult = Effect.runSync(
    Effect.try({
      try: () => {
        const require = createRequire(import.meta.url)
        const cliPkgPath = require.resolve("@ast-grep/cli/package.json")
        const cliDir = dirname(cliPkgPath)
        const sgPath = join(cliDir, binaryName)
        if (existsSync(sgPath) && isValidBinary(sgPath)) return sgPath
        return null
      },
      catch: () => null as never
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
  if (cliResult) return cliResult

  const platformPkg = getPlatformPackageName()
  if (platformPkg) {
    const platformResult = Effect.runSync(
      Effect.try({
        try: () => {
          const require = createRequire(import.meta.url)
          const pkgPath = require.resolve(`${platformPkg}/package.json`)
          const pkgDir = dirname(pkgPath)
          const astGrepName = process.platform === "win32" ? "ast-grep.exe" : "ast-grep"
          const binaryPath = join(pkgDir, astGrepName)
          if (existsSync(binaryPath) && isValidBinary(binaryPath)) return binaryPath
          return null
        },
        catch: () => null as never
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    )
    if (platformResult) return platformResult
  }

  if (process.platform === "darwin") {
    const homebrewPaths = ["/opt/homebrew/bin/sg", "/usr/local/bin/sg"]
    for (const path of homebrewPaths) {
      if (existsSync(path) && isValidBinary(path)) {
        return path
      }
    }
  }

  return null
}

const _cliPath = (() => {
  let path: string | null = null
  return {
    get: () => path,
    set: (p: string) => { path = p }
  }
})()

/**
 * Gets the ast-grep CLI path, using cached value if available.
 * Falls back to "sg" if no binary is found.
 * @returns Path to the sg binary
 */
export function getSgCliPath(): string {
  const cached = _cliPath.get()
  if (cached !== null) {
    return cached
  }

  const syncPath = findSgCliPathSync()
  if (syncPath) {
    _cliPath.set(syncPath)
    return syncPath
  }

  return "sg"
}

/** Sets the ast-grep CLI path manually (for testing or custom installs). */
export function setSgCliPath(path: string): void {
  _cliPath.set(path)
}

/** All 25 languages supported by the ast-grep CLI. */
export const CLI_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "elixir",
  "go",
  "haskell",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "nix",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "solidity",
  "swift",
  "typescript",
  "tsx",
  "yaml",
] as const

/** Languages supported by ast-grep native bindings (NAPI). */
export const NAPI_LANGUAGES = ["html", "javascript", "tsx", "css", "typescript"] as const

/** Default timeout for ast-grep CLI operations (5 minutes). */
export const DEFAULT_TIMEOUT_MS = 300_000
/** Maximum output size from ast-grep CLI (1 MB). */
export const DEFAULT_MAX_OUTPUT_BYTES = 1 * 1024 * 1024
/** Maximum number of matches to return from ast-grep searches. */
export const DEFAULT_MAX_MATCHES = 500

/** Maps language names to their file extensions for ast-grep. */
export const LANG_EXTENSIONS: Record<string, string[]> = {
  bash: [".bash", ".sh", ".zsh", ".bats"],
  c: [".c", ".h"],
  cpp: [".cpp", ".cc", ".cxx", ".hpp", ".hxx", ".h"],
  csharp: [".cs"],
  css: [".css"],
  elixir: [".ex", ".exs"],
  go: [".go"],
  haskell: [".hs", ".lhs"],
  html: [".html", ".htm"],
  java: [".java"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  json: [".json"],
  kotlin: [".kt", ".kts"],
  lua: [".lua"],
  nix: [".nix"],
  php: [".php"],
  python: [".py", ".pyi"],
  ruby: [".rb", ".rake"],
  rust: [".rs"],
  scala: [".scala", ".sc"],
  solidity: [".sol"],
  swift: [".swift"],
  typescript: [".ts", ".cts", ".mts"],
  tsx: [".tsx"],
  yaml: [".yml", ".yaml"],
}

/** Result of checking ast-grep CLI and NAPI availability. */
export interface EnvironmentCheckResult {
  cli: {
    available: boolean
    path: string
    error?: string
  }
  napi: {
    available: boolean
    error?: string
  }
}

/**
 * Check if ast-grep CLI and NAPI are available.
 * Call this at startup to provide early feedback about missing dependencies.
 */
export function checkEnvironment(): EnvironmentCheckResult {
  const cliPath = getSgCliPath()
  const result: EnvironmentCheckResult = {
    cli: {
      available: false,
      path: cliPath,
    },
    napi: {
      available: false,
    },
  }

  if (existsSync(cliPath)) {
    result.cli.available = true
  } else if (cliPath === "sg") {
    const cliAvailable = Effect.runSync(
      Effect.try({
        try: () => {
          const { spawnSync } = require("child_process")
          const whichResult = spawnSync(process.platform === "win32" ? "where" : "which", ["sg"], {
            encoding: "utf-8",
            timeout: 5000,
          })
          return whichResult.status === 0 && !!whichResult.stdout?.trim()
        },
        catch: () => false as never
      }).pipe(Effect.catchAll(() => Effect.succeed(false)))
    )
    result.cli.available = cliAvailable
    if (!cliAvailable) {
      result.cli.error = "sg binary not found in PATH"
    }
  } else {
    result.cli.error = `Binary not found: ${cliPath}`
  }

  const napiResult = Effect.runSync(
    Effect.try({
      try: () => { require("@ast-grep/napi"); return true },
      catch: (e) => ({ available: false, error: `@ast-grep/napi not installed: ${e instanceof Error ? e.message : String(e)}` }) as never
    }).pipe(Effect.catchAll((info) => Effect.succeed(info)))
  )
  if (napiResult === true) {
    result.napi.available = true
  } else if (typeof napiResult === "object") {
    result.napi.available = false
    result.napi.error = (napiResult as { error: string }).error
  }

  return result
}

/**
 * Format environment check result as user-friendly message.
 */
export function formatEnvironmentCheck(result: EnvironmentCheckResult): string {
  const lines: string[] = ["ast-grep Environment Status:", ""]

  // CLI status
  if (result.cli.available) {
    lines.push(`[OK] CLI: Available (${result.cli.path})`)
  } else {
    lines.push(`[X] CLI: Not available`)
    if (result.cli.error) {
      lines.push(`  Error: ${result.cli.error}`)
    }
    lines.push(`  Install: bun add -D @ast-grep/cli`)
  }

  // NAPI status
  if (result.napi.available) {
    lines.push(`[OK] NAPI: Available`)
  } else {
    lines.push(`[X] NAPI: Not available`)
    if (result.napi.error) {
      lines.push(`  Error: ${result.napi.error}`)
    }
    lines.push(`  Install: bun add -D @ast-grep/napi`)
  }

  lines.push("")
  lines.push(`CLI supports ${CLI_LANGUAGES.length} languages`)
  lines.push(`NAPI supports ${NAPI_LANGUAGES.length} languages: ${NAPI_LANGUAGES.join(", ")}`)

  return lines.join("\n")
}
