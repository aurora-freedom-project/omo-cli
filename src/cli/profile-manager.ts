/**
 * @module cli/profile-manager
 * 
 * Manages configuration profiles for the omo-cli. A profile is a distinct configuration
 * environment (e.g., standard, cheap, enterprise) stored as an `omo-cli.json` file.
 * This module allows listing available profiles, applying an active profile, and 
 * tracking the currently selected profile.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { Effect } from "effect"
import { parseJsonc, getOpenCodeConfigPaths } from "../shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents metadata about an available configuration profile.
 */
export interface ProfileInfo {
    /** The name of the profile (corresponds to its directory name). */
    name: string
    /** The absolute file path to the profile's `omo-cli.json` file. */
    path: string
    /** 
     * A human-readable, quick summary of the profile derived from its loaded agent models,
     * providing a glanceable description of its primary capabilities (e.g., "Claude + OpenAI").
     */
    summary: string
}

interface OmoConfig {
    agents?: Record<string, { model: string; variant?: string; stream?: boolean }>
    categories?: Record<string, { model: string; variant?: string; stream?: boolean }>
    background_task?: { defaultConcurrency: number }
    memory?: { enabled?: boolean }
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Resolve the profiles/ directory inside the project repo. */
function getProfilesDir(): string {
    // Walk up from this file's compiled location to find the project root
    // The file is at: src/cli/profile-manager.ts → dist might vary
    // Use a reliable marker: package.json
    let dir = __dirname
    for (let i = 0; i < 10; i++) {
        if (existsSync(join(dir, "package.json"))) {
            return join(dir, "profiles")
        }
        dir = dirname(dir)
    }
    // Fallback: relative from process.cwd()
    return join(process.cwd(), "profiles")
}

/** Get path to the active-profile marker file */
function getActiveProfilePath(): string {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "~"
    return join(home, ".config", "opencode", "active-profile")
}

/** Get the omo-cli.json destination path */
function getOmoConfigPath(): string {
    const paths = getOpenCodeConfigPaths({ binary: "opencode", version: null })
    return paths.omoConfig
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * Scans the local `profiles/` directory and returns all available profiles.
 * 
 * Each valid profile is a subfolder containing an `omo-cli.json` file.
 * The function parses each profile to extract a summary and ignores malformed configs.
 * 
 * @returns {ProfileInfo[]} An array of discovered profiles, sorted alphabetically by name.
 */
export function listProfiles(): ProfileInfo[] {
    const profilesDir = getProfilesDir()

    if (!existsSync(profilesDir)) {
        return []
    }

    const entries = readdirSync(profilesDir, { withFileTypes: true })
    const profiles: ProfileInfo[] = []

    for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const configPath = join(profilesDir, entry.name, "omo-cli.json")
        if (!existsSync(configPath)) continue

        const parsed = Effect.runSync(
            Effect.try({
                try: () => {
                    const content = readFileSync(configPath, "utf-8")
                    const config = parseJsonc<OmoConfig>(content)
                    const summary = deriveProfileSummary(config)
                    return { name: entry.name, path: configPath, summary } as ProfileInfo
                },
                catch: () => "skip" as const,
            }).pipe(Effect.catchAll(() => Effect.succeed(null)))
        )
        if (parsed) profiles.push(parsed)
    }

    // Sort alphabetically
    profiles.sort((a, b) => a.name.localeCompare(b.name))

    return profiles
}

/**
 * Applies a given profile by copying its configuration to the global OpenCode config path.
 * 
 * This effectively updates the user's active `omo-cli.json` and updates the active profile marker.
 * 
 * @param {string} name - The name of the profile to apply.
 * @returns {{ success: boolean; path: string; error?: string }} The result of the application attempt.
 */
export function applyProfile(name: string): { success: boolean; path: string; error?: string } {
    const profilesDir = getProfilesDir()
    const sourcePath = join(profilesDir, name, "omo-cli.json")

    if (!existsSync(sourcePath)) {
        return { success: false, path: "", error: `Profile '${name}' not found at ${sourcePath}` }
    }

    const destPath = getOmoConfigPath()

    return Effect.runSync(
        Effect.try({
            try: () => {
                // Ensure destination directory exists
                const destDir = dirname(destPath)
                if (!existsSync(destDir)) {
                    mkdirSync(destDir, { recursive: true })
                }

                copyFileSync(sourcePath, destPath)
                setActiveProfile(name)
                return { success: true, path: destPath }
            },
            catch: (err) => err,
        }).pipe(Effect.catchAll((err) => {
            const msg = err instanceof Error ? err.message : String(err)
            return Effect.succeed({ success: false, path: destPath, error: msg })
        }))
    )
}

/**
 * Sets the active profile marker file to the specified profile name.
 * This is used to persist across CLI sessions which profile is currently selected.
 * Fails silently if the marker cannot be written.
 * 
 * @param {string} name - The name of the active profile.
 */
export function setActiveProfile(name: string): void {
    const markerPath = getActiveProfilePath()
    Effect.runSync(
        Effect.try({
            try: () => {
                const dir = dirname(markerPath)
                if (!existsSync(dir)) {
                    mkdirSync(dir, { recursive: true })
                }
                writeFileSync(markerPath, name + "\n")
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.void))
    )
}

/**
 * Retrieves the currently active profile name from the marker file.
 * 
 * @returns {string | null} The active profile name, or `null` if none is set or an error occurs.
 */
export function getActiveProfile(): string | null {
    const markerPath = getActiveProfilePath()
    return Effect.runSync(
        Effect.try({
            try: () => {
                if (existsSync(markerPath)) {
                    return readFileSync(markerPath, "utf-8").trim() || null
                }
                return null
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)))
    )
}

/**
 * Gets the absolute path to the directory containing all configuration profiles.
 * Used internally, or for UI hints when creating new profiles.
 * 
 * @returns {string} The resolved absolute path to the `profiles/` directory.
 */
export function getProfilesDirectory(): string {
    return getProfilesDir()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derive a human-readable summary from the config's first agent model.
 */
function deriveProfileSummary(config: OmoConfig | null): string {
    if (!config?.agents) return "Unknown configuration"

    const models = new Set<string>()
    for (const agent of Object.values(config.agents)) {
        // Extract provider prefix (e.g., "google/antigravity-claude-opus" → "Antigravity")
        const model = agent.model
        if (model.includes("antigravity")) models.add("Antigravity")
        else if (model.startsWith("anthropic/")) models.add("Claude")
        else if (model.startsWith("google/gemini")) models.add("Gemini")
        else if (model.startsWith("ollama/")) models.add("Ollama")
        else if (model.startsWith("openai/")) models.add("OpenAI")
        else models.add(model.split("/")[0] ?? "Unknown")
    }

    const providerList = Array.from(models).join(" + ")
    const concurrency = config.background_task?.defaultConcurrency ?? "?"

    return `${providerList} | concurrency: ${concurrency}`
}

import type { ProfileSummary } from "./types"

/**
 * Derives a minimal `ProfileSummary` from a specific profile's configuration.
 * 
 * This specifically extracts the memory configuration flag used during the application
 * installation pipeline to know if auxiliary services (like omo-memory Docker via SurrealDB)
 * need to be started.
 * 
 * @param {string} name - The name of the profile to inspect.
 * @returns {ProfileSummary} A summary object containing the `enableMemory` flag.
 */
export function deriveInstallConfigFromProfile(name: string): ProfileSummary {
    const defaultResult: ProfileSummary = { enableMemory: false }

    const profilesDir = getProfilesDir()
    const configPath = join(profilesDir, name, "omo-cli.json")

    if (!existsSync(configPath)) {
        return defaultResult
    }

    return Effect.runSync(
        Effect.try({
            try: () => {
                const content = readFileSync(configPath, "utf-8")
                const config = parseJsonc<OmoConfig>(content)
                return { enableMemory: config?.memory?.enabled === true }
            },
            catch: () => "fail" as const,
        }).pipe(Effect.catchAll(() => Effect.succeed(defaultResult)))
    )
}

