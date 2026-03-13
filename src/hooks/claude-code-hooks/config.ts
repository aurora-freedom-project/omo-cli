import { join } from "path"
import { existsSync } from "fs"
import { getClaudeConfigDir } from "../../shared"
import type { ClaudeHooksConfig, HookMatcher, HookCommand } from "./types"

interface RawHookMatcher {
  matcher?: string
  pattern?: string
  hooks: HookCommand[]
}

interface RawClaudeHooksConfig {
  PreToolUse?: RawHookMatcher[]
  PostToolUse?: RawHookMatcher[]
  UserPromptSubmit?: RawHookMatcher[]
  Stop?: RawHookMatcher[]
  PreCompact?: RawHookMatcher[]
}

function normalizeHookMatcher(raw: RawHookMatcher): HookMatcher {
  return {
    matcher: raw.matcher ?? raw.pattern ?? "*",
    hooks: raw.hooks,
  }
}

function normalizeHooksConfig(raw: RawClaudeHooksConfig): ClaudeHooksConfig {
  const result: ClaudeHooksConfig = {}
  const eventTypes: (keyof RawClaudeHooksConfig)[] = [
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "Stop",
    "PreCompact",
  ]

  for (const eventType of eventTypes) {
    if (raw[eventType]) {
      result[eventType] = raw[eventType].map(normalizeHookMatcher)
    }
  }

  return result
}

export function getClaudeSettingsPaths(customPath?: string): string[] {
  const claudeConfigDir = getClaudeConfigDir()
  const paths = [
    join(claudeConfigDir, "settings.json"),
    join(process.cwd(), ".claude", "settings.json"),
    join(process.cwd(), ".claude", "settings.local.json"),
  ]

  if (customPath && existsSync(customPath)) {
    paths.unshift(customPath)
  }

  return paths
}

function mergeHooksConfig(
  base: ClaudeHooksConfig,
  override: ClaudeHooksConfig
): ClaudeHooksConfig {
  const result: ClaudeHooksConfig = { ...base }
  const eventTypes: (keyof ClaudeHooksConfig)[] = [
    "PreToolUse",
    "PostToolUse",
    "UserPromptSubmit",
    "Stop",
    "PreCompact",
  ]
  for (const eventType of eventTypes) {
    if (override[eventType]) {
      result[eventType] = [...(base[eventType] || []), ...override[eventType]]
    }
  }
  return result
}

// In-memory cache with mtime-based invalidation.
// Previously: Bun.file().text() + JSON.parse() on EVERY tool.execute.before/after.
// Now: stat() to check mtime, only re-read if changed.
const _configCache: {
  result: ClaudeHooksConfig | null
  mtimes: Map<string, number>
} = { result: null, mtimes: new Map() }

function getFileMtime(path: string): number {
  try {
    return existsSync(path) ? require("fs").statSync(path).mtimeMs : 0
  } catch {
    return 0
  }
}

export async function loadClaudeHooksConfig(
  customSettingsPath?: string
): Promise<ClaudeHooksConfig | null> {
  const paths = getClaudeSettingsPaths(customSettingsPath)

  // Check if any file has changed since last cache
  let cacheValid = _configCache.result !== null
  if (cacheValid) {
    for (const p of paths) {
      const currentMtime = getFileMtime(p)
      const cachedMtime = _configCache.mtimes.get(p) ?? 0
      if (currentMtime !== cachedMtime) {
        cacheValid = false
        break
      }
    }
  }

  if (cacheValid) return _configCache.result

  let mergedConfig: ClaudeHooksConfig = {}

  for (const settingsPath of paths) {
    _configCache.mtimes.set(settingsPath, getFileMtime(settingsPath))
    if (existsSync(settingsPath)) {
      try {
        const content = await Bun.file(settingsPath).text()
        const settings = JSON.parse(content) as { hooks?: RawClaudeHooksConfig }
        if (settings.hooks) {
          const normalizedHooks = normalizeHooksConfig(settings.hooks)
          mergedConfig = mergeHooksConfig(mergedConfig, normalizedHooks)
        }
      } catch {
        continue
      }
    }
  }

  _configCache.result = Object.keys(mergedConfig).length > 0 ? mergedConfig : null
  return _configCache.result
}
