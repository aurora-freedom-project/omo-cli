import { existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { parseJsonc, getOpenCodeConfigPaths } from "../shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileInfo {
    name: string
    path: string
    /** Quick summary derived from the brain-tier model */
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
 * Scan the profiles/ directory and return all available profiles.
 * Each profile is a subfolder containing omo-cli.json.
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

        try {
            const content = readFileSync(configPath, "utf-8")
            const config = parseJsonc<OmoConfig>(content)
            const summary = deriveProfileSummary(config)

            profiles.push({
                name: entry.name,
                path: configPath,
                summary,
            })
        } catch {
            // Skip malformed profile configs
        }
    }

    // Sort: alphabetical but "mike" first if present
    profiles.sort((a, b) => {
        if (a.name === "mike") return -1
        if (b.name === "mike") return 1
        return a.name.localeCompare(b.name)
    })

    return profiles
}

/**
 * Apply a profile by copying its omo-cli.json to ~/.config/opencode/.
 */
export function applyProfile(name: string): { success: boolean; path: string; error?: string } {
    const profilesDir = getProfilesDir()
    const sourcePath = join(profilesDir, name, "omo-cli.json")

    if (!existsSync(sourcePath)) {
        return { success: false, path: "", error: `Profile '${name}' not found at ${sourcePath}` }
    }

    const destPath = getOmoConfigPath()

    try {
        // Ensure destination directory exists
        const destDir = dirname(destPath)
        if (!existsSync(destDir)) {
            mkdirSync(destDir, { recursive: true })
        }

        copyFileSync(sourcePath, destPath)
        setActiveProfile(name)
        return { success: true, path: destPath }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { success: false, path: destPath, error: msg }
    }
}

/**
 * Set the active profile name marker.
 */
export function setActiveProfile(name: string): void {
    const markerPath = getActiveProfilePath()
    try {
        const dir = dirname(markerPath)
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true })
        }
        writeFileSync(markerPath, name + "\n")
    } catch {
        // Silently fail — marker is non-critical
    }
}

/**
 * Get the currently active profile name, or null if none.
 */
export function getActiveProfile(): string | null {
    const markerPath = getActiveProfilePath()
    try {
        if (existsSync(markerPath)) {
            return readFileSync(markerPath, "utf-8").trim() || null
        }
    } catch {
        // Silently fail
    }
    return null
}

/**
 * Get the profiles directory path (for creating new profiles).
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
 * Derive a ProfileSummary from a specific profile's omo-cli.json.
 * Dynamically detects providers from the model strings in the profile.
 */
export function deriveInstallConfigFromProfile(name: string): ProfileSummary {
    const defaultResult: ProfileSummary = {
        providers: new Set<string>(),
        hasClaudeOpus: false,
        enableMemory: false,
    }

    const profilesDir = getProfilesDir()
    const configPath = join(profilesDir, name, "omo-cli.json")

    if (!existsSync(configPath)) {
        return defaultResult
    }

    try {
        const content = readFileSync(configPath, "utf-8")
        const config = parseJsonc<OmoConfig>(content)

        if (!config?.agents) {
            return defaultResult
        }

        const res = { ...defaultResult }
        const allModels = Object.values(config.agents).map(a => a.model)
        if (config.categories) {
            allModels.push(...Object.values(config.categories).map(c => c.model))
        }

        for (const model of allModels) {
            // Extract dynamic provider (prefix before '/')
            if (model.includes("antigravity-claude") || model.startsWith("anthropic/")) {
                res.providers.add("anthropic")
                if (model.includes("opus-4-6")) {
                    res.hasClaudeOpus = true
                }
            } else if (model.includes("antigravity-gemini") || model.startsWith("google/")) {
                res.providers.add("google")
            } else if (model.includes("/")) {
                res.providers.add(model.split("/")[0])
            } else if (model.includes("antigravity")) {
                res.providers.add("google")
            }
        }

        // Read memory config
        if (config.memory?.enabled) {
            res.enableMemory = true
        }

        return res
    } catch {
        return defaultResult
    }
}

