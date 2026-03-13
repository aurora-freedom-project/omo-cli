import { existsSync } from "fs"
import { join } from "path"
import type { ClaudeHookEvent } from "./types"
import { log } from "../../shared/logger"
import { getOpenCodeConfigDir } from "../../shared"
import { Effect } from "effect"

export interface DisabledHooksConfig {
  Stop?: string[]
  PreToolUse?: string[]
  PostToolUse?: string[]
  UserPromptSubmit?: string[]
  PreCompact?: string[]
}

export interface PluginExtendedConfig {
  disabledHooks?: DisabledHooksConfig
}

const USER_CONFIG_PATH = join(getOpenCodeConfigDir({ binary: "opencode" }), "opencode-cc-plugin.json")

function getProjectConfigPath(): string {
  return join(process.cwd(), ".opencode", "opencode-cc-plugin.json")
}

/**
 * Effect variant: loads config from a JSON file path.
 */
export const loadConfigFromPathEffect = (path: string): Effect.Effect<PluginExtendedConfig | null, never> =>
  Effect.gen(function* () {
    if (!existsSync(path)) return null
    return yield* Effect.tryPromise({
      try: async () => {
        const content = await Bun.file(path).text()
        return JSON.parse(content) as PluginExtendedConfig
      },
      catch: (error) => {
        log("Failed to load config", { path, error })
        return null as never
      }
    }).pipe(Effect.catchAll(() => Effect.succeed(null)))
  })

async function loadConfigFromPath(path: string): Promise<PluginExtendedConfig | null> {
  if (!existsSync(path)) return null
  return Effect.runPromise(loadConfigFromPathEffect(path))
}

function mergeDisabledHooks(
  base: DisabledHooksConfig | undefined,
  override: DisabledHooksConfig | undefined
): DisabledHooksConfig {
  if (!override) return base ?? {}
  if (!base) return override

  return {
    Stop: override.Stop ?? base.Stop,
    PreToolUse: override.PreToolUse ?? base.PreToolUse,
    PostToolUse: override.PostToolUse ?? base.PostToolUse,
    UserPromptSubmit: override.UserPromptSubmit ?? base.UserPromptSubmit,
    PreCompact: override.PreCompact ?? base.PreCompact,
  }
}

// Cache for loadPluginExtendedConfig (same pattern: mtime-based invalidation)
const _extConfigCache: {
  result: PluginExtendedConfig | null
  mtimes: Map<string, number>
} = { result: null, mtimes: new Map() }

function getExtFileMtime(path: string): number {
  try {
    return existsSync(path) ? require("fs").statSync(path).mtimeMs : 0
  } catch {
    return 0
  }
}

export async function loadPluginExtendedConfig(): Promise<PluginExtendedConfig> {
  const paths = [USER_CONFIG_PATH, getProjectConfigPath()]

  // Check mtime cache
  let cacheValid = _extConfigCache.result !== null
  if (cacheValid) {
    for (const p of paths) {
      if (getExtFileMtime(p) !== (_extConfigCache.mtimes.get(p) ?? 0)) {
        cacheValid = false
        break
      }
    }
  }
  if (cacheValid) return _extConfigCache.result!

  const userConfig = await loadConfigFromPath(USER_CONFIG_PATH)
  const projectConfig = await loadConfigFromPath(getProjectConfigPath())

  // Update mtime cache
  for (const p of paths) {
    _extConfigCache.mtimes.set(p, getExtFileMtime(p))
  }

  const merged: PluginExtendedConfig = {
    disabledHooks: mergeDisabledHooks(
      userConfig?.disabledHooks,
      projectConfig?.disabledHooks
    ),
  }

  if (userConfig || projectConfig) {
    log("Plugin extended config loaded", {
      userConfigExists: userConfig !== null,
      projectConfigExists: projectConfig !== null,
      mergedDisabledHooks: merged.disabledHooks,
    })
  }

  _extConfigCache.result = merged
  return merged
}

const regexCache = new Map<string, RegExp>()

/**
 * Effect variant: compiles a RegExp pattern, falling back to escaped literal on invalid pattern.
 */
export const getRegexEffect = (pattern: string): Effect.Effect<RegExp, never> =>
  Effect.sync(() => {
    let regex = regexCache.get(pattern)
    if (regex) return regex
    try {
      regex = new RegExp(pattern)
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    }
    regexCache.set(pattern, regex)
    return regex
  })

export function isHookCommandDisabled(
  eventType: ClaudeHookEvent,
  command: string,
  config: PluginExtendedConfig | null
): boolean {
  if (!config?.disabledHooks) return false

  const patterns = config.disabledHooks[eventType]
  if (!patterns || patterns.length === 0) return false

  return patterns.some((pattern) => {
    const regex = Effect.runSync(getRegexEffect(pattern))
    return regex.test(command)
  })
}
