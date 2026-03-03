import { execSync } from "child_process"
import { Effect } from "effect"

/**
 * Minimum OpenCode version required for this plugin.
 * This plugin only supports OpenCode 1.1.1+ which uses the permission system.
 */
export const MINIMUM_OPENCODE_VERSION = "1.1.1"

/**
 * OpenCode version that introduced native AGENTS.md injection.
 * PR #10678 merged on Jan 26, 2026 - OpenCode now dynamically resolves
 * AGENTS.md files from subdirectories as the agent explores them.
 * When this version is detected, the directory-agents-injector hook
 * is auto-disabled to prevent duplicate AGENTS.md loading.
 */
export const OPENCODE_NATIVE_AGENTS_INJECTION_VERSION = "1.1.37"

/**
 * OpenCode version that introduced native skill tool.
 * When this version is detected, the plugin's skill tool is not registered
 * to avoid overriding the native skill discovery. Plugin proactive hooks
 * (keyword-detector, category-skill-reminder, BM25 routing) remain active.
 */
export const OPENCODE_NATIVE_SKILLS_VERSION = "1.0.190"

const _versionCache = (() => {
  let state: { resolved: boolean; value: string | null } = { resolved: false, value: null }
  return {
    get: () => state,
    set: (v: string | null) => { state = { resolved: true, value: v } },
    reset: () => { state = { resolved: false, value: null } },
  }
})()

/**
 * Parse a semver string into an array of numeric parts.
 * Strips leading `v` and pre-release suffixes before parsing.
 */
export function parseVersion(version: string): number[] {
  const cleaned = version.replace(/^v/, "").split("-")[0]
  return cleaned.split(".").map((n) => parseInt(n, 10) || 0)
}

/**
 * Compare two semver strings.
 * @returns `-1` if a < b, `0` if equal, `1` if a > b.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const partsA = parseVersion(a)
  const partsB = parseVersion(b)
  const maxLen = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < maxLen; i++) {
    const numA = partsA[i] ?? 0
    const numB = partsB[i] ?? 0
    if (numA < numB) return -1
    if (numA > numB) return 1
  }
  return 0
}

/** Returns true if version `a` is greater than or equal to version `b`. */
export function isVersionGte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0
}

/** Returns true if version `a` is less than version `b`. */
export function isVersionLt(a: string, b: string): boolean {
  return compareVersions(a, b) < 0
}

/** Detect and cache the installed OpenCode version by running `opencode --version`. */
export function getOpenCodeVersion(): string | null {
  const cache = _versionCache.get()
  if (cache.resolved) {
    return cache.value
  }

  return Effect.runSync(
    Effect.try({
      try: () => {
        const result = execSync("opencode --version", {
          encoding: "utf-8",
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        }).trim()

        const versionMatch = result.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/)
        const version = versionMatch?.[1] ?? null
        _versionCache.set(version)
        return version
      },
      catch: () => "fail" as const,
    }).pipe(Effect.catchAll(() => {
      _versionCache.set(null)
      return Effect.succeed(null)
    }))
  )
}

/** Check if the installed OpenCode version meets a minimum requirement. Returns true if unknown. */
export function isOpenCodeVersionAtLeast(version: string): boolean {
  const current = getOpenCodeVersion()
  if (!current) return true
  return isVersionGte(current, version)
}

/** Reset the cached version so the next call to {@link getOpenCodeVersion} re-detects. */
export function resetVersionCache(): void {
  _versionCache.reset()
}

/** Override the cached version for testing purposes. */
export function setVersionCache(version: string | null): void {
  _versionCache.set(version)
}
