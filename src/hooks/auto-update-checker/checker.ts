import * as fs from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import { Effect } from "effect"
import type { NpmDistTags, OpencodeConfig, PackageJson, UpdateCheckResult } from "./types"
import {
  PACKAGE_NAME,
  NPM_REGISTRY_URL,
  NPM_FETCH_TIMEOUT,
  INSTALLED_PACKAGE_JSON,
  USER_OPENCODE_CONFIG,
  USER_OPENCODE_CONFIG_JSONC,
  USER_CONFIG_DIR,
  getWindowsAppdataDir,
} from "./constants"
import * as os from "node:os"
import { log } from "../../shared/logger"

export function isLocalDevMode(directory: string): boolean {
  return getLocalDevPath(directory) !== null
}

function stripJsonComments(json: string): string {
  return json
    .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m))
    .replace(/,(\s*[}\]])/g, "$1")
}

function getConfigPaths(directory: string): string[] {
  const paths = [
    path.join(directory, ".opencode", "opencode.json"),
    path.join(directory, ".opencode", "opencode.jsonc"),
    USER_OPENCODE_CONFIG,
    USER_OPENCODE_CONFIG_JSONC,
  ]

  if (process.platform === "win32") {
    const crossPlatformDir = path.join(os.homedir(), ".config")
    const appdataDir = getWindowsAppdataDir()

    if (appdataDir) {
      const alternateDir = USER_CONFIG_DIR === crossPlatformDir ? appdataDir : crossPlatformDir
      const alternateConfig = path.join(alternateDir, "opencode", "opencode.json")
      const alternateConfigJsonc = path.join(alternateDir, "opencode", "opencode.jsonc")

      if (!paths.includes(alternateConfig)) {
        paths.push(alternateConfig)
      }
      if (!paths.includes(alternateConfigJsonc)) {
        paths.push(alternateConfigJsonc)
      }
    }
  }

  return paths
}

export function getLocalDevPath(directory: string): string | null {
  for (const configPath of getConfigPaths(directory)) {
    const localResult = Effect.runSync(
      Effect.try({
        try: () => {
          if (!fs.existsSync(configPath)) return null
          const content = fs.readFileSync(configPath, "utf-8")
          const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig
          const plugins = config.plugin ?? []

          for (const entry of plugins) {
            if (entry.startsWith("file://") && entry.includes(PACKAGE_NAME)) {
              return Effect.runSync(
                Effect.try({
                  try: () => fileURLToPath(entry),
                  catch: () => "fail" as const,
                }).pipe(Effect.catchAll(() => Effect.succeed(entry.replace("file://", ""))))
              )
            }
          }
          return null
        },
        catch: () => "fail" as const,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    )
    if (localResult) return localResult
  }

  return null
}

function findPackageJsonUp(startPath: string): string | null {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const stat = fs.statSync(startPath)
        let dir = stat.isDirectory() ? startPath : path.dirname(startPath)

        for (let i = 0; i < 10; i++) {
          const pkgPath = path.join(dir, "package.json")
          if (fs.existsSync(pkgPath)) {
            const parsed = Effect.runSync(
              Effect.try({
                try: () => {
                  const content = fs.readFileSync(pkgPath, "utf-8")
                  const pkg = JSON.parse(content) as PackageJson
                  if (pkg.name === PACKAGE_NAME) return pkgPath
                  return null
                },
                catch: () => "skip" as const,
              }).pipe(Effect.catchAll(() => Effect.succeed(null)))
            )
            if (parsed) return parsed
          }
          const parent = path.dirname(dir)
          if (parent === dir) break
          dir = parent
        }
        return null
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
}

export function getLocalDevVersion(directory: string): string | null {
  const localPath = getLocalDevPath(directory)
  if (!localPath) return null

  return Effect.runSync(
    Effect.try({
      try: () => {
        const pkgPath = findPackageJsonUp(localPath)
        if (!pkgPath) return null
        const content = fs.readFileSync(pkgPath, "utf-8")
        const pkg = JSON.parse(content) as PackageJson
        return pkg.version ?? null
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
}

export interface PluginEntryInfo {
  entry: string
  isPinned: boolean
  pinnedVersion: string | null
  configPath: string
}

export function findPluginEntry(directory: string): PluginEntryInfo | null {
  for (const configPath of getConfigPaths(directory)) {
    const entryResult = Effect.runSync(
      Effect.try({
        try: () => {
          if (!fs.existsSync(configPath)) return null
          const content = fs.readFileSync(configPath, "utf-8")
          const config = JSON.parse(stripJsonComments(content)) as OpencodeConfig
          const plugins = config.plugin ?? []

          for (const entry of plugins) {
            if (entry === PACKAGE_NAME) {
              return { entry, isPinned: false, pinnedVersion: null, configPath } as PluginEntryInfo
            }
            if (entry.startsWith(`${PACKAGE_NAME}@`)) {
              const pinnedVersion = entry.slice(PACKAGE_NAME.length + 1)
              const isPinned = pinnedVersion !== "latest"
              return { entry, isPinned, pinnedVersion: isPinned ? pinnedVersion : null, configPath } as PluginEntryInfo
            }
          }
          return null
        },
        catch: () => "fail" as const,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    )
    if (entryResult) return entryResult
  }

  return null
}

export function getCachedVersion(): string | null {
  const v1 = Effect.runSync(
    Effect.try({
      try: () => {
        if (fs.existsSync(INSTALLED_PACKAGE_JSON)) {
          const content = fs.readFileSync(INSTALLED_PACKAGE_JSON, "utf-8")
          const pkg = JSON.parse(content) as PackageJson
          if (pkg.version) return pkg.version
        }
        return null
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  )
  if (v1) return v1

  const v2 = Effect.runSync(
    Effect.try({
      try: () => {
        const currentDir = path.dirname(fileURLToPath(import.meta.url))
        const pkgPath = findPackageJsonUp(currentDir)
        if (pkgPath) {
          const content = fs.readFileSync(pkgPath, "utf-8")
          const pkg = JSON.parse(content) as PackageJson
          if (pkg.version) return pkg.version
        }
        return null
      },
      catch: (err) => err,
    }).pipe(Effect.catchAll((err) => {
      log("[auto-update-checker] Failed to resolve version from current directory:", err)
      return Effect.succeed(null)
    }))
  )
  if (v2) return v2

  // Fallback for compiled binaries (npm global install)
  // process.execPath points to the actual binary location
  const v3 = Effect.runSync(
    Effect.try({
      try: () => {
        const execDir = path.dirname(fs.realpathSync(process.execPath))
        const pkgPath = findPackageJsonUp(execDir)
        if (pkgPath) {
          const content = fs.readFileSync(pkgPath, "utf-8")
          const pkg = JSON.parse(content) as PackageJson
          if (pkg.version) return pkg.version
        }
        return null
      },
      catch: (err) => err,
    }).pipe(Effect.catchAll((err) => {
      log("[auto-update-checker] Failed to resolve version from execPath:", err)
      return Effect.succeed(null)
    }))
  )
  if (v3) return v3

  return null
}

/**
 * Updates a pinned version entry in the config file.
 * Only replaces within the "plugin" array to avoid unintended edits.
 * Preserves JSONC comments and formatting via string replacement.
 */
export function updatePinnedVersion(configPath: string, oldEntry: string, newVersion: string): boolean {
  return Effect.runSync(
    Effect.try({
      try: () => {
        const content = fs.readFileSync(configPath, "utf-8")
        const newEntry = `${PACKAGE_NAME}@${newVersion}`

        const pluginMatch = content.match(/"plugin"\s*:\s*\[/)
        if (!pluginMatch || pluginMatch.index === undefined) {
          log(`[auto-update-checker] No "plugin" array found in ${configPath}`)
          return false
        }

        const startIdx = pluginMatch.index + pluginMatch[0].length
        let bracketCount = 1
        let endIdx = startIdx

        for (let i = startIdx; i < content.length && bracketCount > 0; i++) {
          if (content[i] === "[") bracketCount++
          else if (content[i] === "]") bracketCount--
          endIdx = i
        }

        const before = content.slice(0, startIdx)
        const pluginArrayContent = content.slice(startIdx, endIdx)
        const after = content.slice(endIdx)

        const escapedOldEntry = oldEntry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(`["']${escapedOldEntry}["']`)

        if (!regex.test(pluginArrayContent)) {
          log(`[auto-update-checker] Entry "${oldEntry}" not found in plugin array of ${configPath}`)
          return false
        }

        const updatedPluginArray = pluginArrayContent.replace(regex, `"${newEntry}"`)
        const updatedContent = before + updatedPluginArray + after

        if (updatedContent === content) {
          log(`[auto-update-checker] No changes made to ${configPath}`)
          return false
        }

        fs.writeFileSync(configPath, updatedContent, "utf-8")
        log(`[auto-update-checker] Updated ${configPath}: ${oldEntry} → ${newEntry}`)
        return true
      },
      catch: (err) => err,
    }).pipe(Effect.catchAll((err) => {
      log(`[auto-update-checker] Failed to update config file ${configPath}:`, err)
      return Effect.succeed(false)
    }))
  )
}

export async function getLatestVersion(channel: string = "latest"): Promise<string | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), NPM_FETCH_TIMEOUT)

  try {
    return await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(NPM_REGISTRY_URL, {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          })

          if (!response.ok) return null

          const data = (await response.json()) as NpmDistTags
          return data[channel] ?? data.latest ?? null
        },
        catch: () => "fail" as const,
      }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function checkForUpdate(directory: string): Promise<UpdateCheckResult> {
  if (isLocalDevMode(directory)) {
    log("[auto-update-checker] Local dev mode detected, skipping update check")
    return { needsUpdate: false, currentVersion: null, latestVersion: null, isLocalDev: true, isPinned: false }
  }

  const pluginInfo = findPluginEntry(directory)
  if (!pluginInfo) {
    log("[auto-update-checker] Plugin not found in config")
    return { needsUpdate: false, currentVersion: null, latestVersion: null, isLocalDev: false, isPinned: false }
  }

  const currentVersion = getCachedVersion() ?? pluginInfo.pinnedVersion
  if (!currentVersion) {
    log("[auto-update-checker] No cached version found")
    return { needsUpdate: false, currentVersion: null, latestVersion: null, isLocalDev: false, isPinned: false }
  }

  const { extractChannel } = await import("./index")
  const channel = extractChannel(pluginInfo.pinnedVersion ?? currentVersion)
  const latestVersion = await getLatestVersion(channel)
  if (!latestVersion) {
    log("[auto-update-checker] Failed to fetch latest version for channel:", channel)
    return { needsUpdate: false, currentVersion, latestVersion: null, isLocalDev: false, isPinned: pluginInfo.isPinned }
  }

  const needsUpdate = currentVersion !== latestVersion
  log(`[auto-update-checker] Current: ${currentVersion}, Latest (${channel}): ${latestVersion}, NeedsUpdate: ${needsUpdate}`)
  return { needsUpdate, currentVersion, latestVersion, isLocalDev: false, isPinned: pluginInfo.isPinned }
}
