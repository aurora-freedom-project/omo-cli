import * as p from "@clack/prompts"
import color from "picocolors"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getProfilesDirectory, applyProfile } from "./profile-manager"

// ---------------------------------------------------------------------------
// Template: agent names and their default configs (from mike profile)
// ---------------------------------------------------------------------------

interface EntryDefault {
    model: string
    variant?: string
    stream?: boolean
}

const AGENT_DEFAULTS: Record<string, EntryDefault> = {
    orchestrator: { model: "google/antigravity-claude-opus-4-6-thinking", variant: "max" },
    planner: { model: "google/antigravity-claude-opus-4-6-thinking", variant: "max" },
    conductor: { model: "google/antigravity-claude-opus-4-6-thinking", variant: "max" },
    architect: { model: "google/antigravity-claude-opus-4-6-thinking", variant: "max" },
    consultant: { model: "google/antigravity-claude-sonnet-4-5-thinking", variant: "max" },
    reviewer: { model: "google/antigravity-claude-sonnet-4-5-thinking", variant: "max" },
    worker: { model: "google/antigravity-claude-sonnet-4-5-thinking", variant: "max" },
    vision: { model: "google/gemini-3-pro-image", variant: "high" },
    explorer: { model: "ollama/minimax-m2.1:cloud", stream: false },
    researcher: { model: "ollama/minimax-m2.1:cloud", stream: false },
}

const CATEGORY_DEFAULTS: Record<string, EntryDefault> = {
    frontend: { model: "google/gemini-3-pro-image", variant: "high" },
    quick: { model: "google/antigravity-gemini-3-flash", variant: "minimal" },
    "deep-reasoning": { model: "google/antigravity-claude-sonnet-4-5-thinking", variant: "max" },
    backend: { model: "ollama/minimax-m2.1:cloud", stream: false },
    docs: { model: "google/antigravity-gemini-3-flash", variant: "low" },
    complex: { model: "google/antigravity-claude-opus-4-6-thinking", variant: "max" },
    simple: { model: "ollama/minimax-m2.1:cloud", stream: false },
    creative: { model: "google/gemini-3-pro-image", variant: "max" },
}

const VARIANT_OPTIONS = ["minimal", "low", "high", "max"] as const

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

/**
 * Interactive wizard that asks for every model entry and generates a profile.
 * Returns the profile name, or null if cancelled.
 */
export async function runProfileWizard(): Promise<string | null> {
    p.intro(color.bgCyan(color.black(" Create New Profile ")))

    // 1. Profile name
    const name = await p.text({
        message: "Profile name:",
        placeholder: "my-setup",
        validate: (value) => {
            if (!value.trim()) return "Name is required"
            if (!/^[a-z0-9-]+$/.test(value.trim())) return "Use lowercase letters, numbers, and hyphens only"
            const profilePath = join(getProfilesDirectory(), value.trim())
            if (existsSync(profilePath)) return `Profile '${value.trim()}' already exists`
            return undefined
        },
    })

    if (p.isCancel(name)) {
        p.cancel("Cancelled.")
        return null
    }

    const profileName = (name as string).trim()

    // 2. Ask all agent models
    p.log.step(color.bold("── Agents (10) ──"))
    p.log.info(color.dim("Press Enter to accept the default (shown in parentheses).\n"))

    const agents: Record<string, Record<string, unknown>> = {}

    for (const [agentName, defaults] of Object.entries(AGENT_DEFAULTS)) {
        const model = await p.text({
            message: `${color.cyan(agentName.padEnd(20))} model:`,
            placeholder: defaults.model,
            defaultValue: defaults.model,
        })

        if (p.isCancel(model)) {
            p.cancel("Cancelled.")
            return null
        }

        const modelStr = (model as string).trim()

        // Ask variant or stream depending on model type
        if (defaults.stream !== undefined) {
            const stream = await p.select({
                message: `${" ".repeat(20)} stream:`,
                options: [
                    { value: false, label: "false", hint: "default" },
                    { value: true, label: "true" },
                ],
                initialValue: defaults.stream,
            })

            if (p.isCancel(stream)) {
                p.cancel("Cancelled.")
                return null
            }

            agents[agentName] = { model: modelStr, stream: stream as boolean }
        } else {
            const variant = await p.select({
                message: `${" ".repeat(20)} variant:`,
                options: VARIANT_OPTIONS.map((v) => ({
                    value: v,
                    label: v,
                    hint: v === defaults.variant ? "default" : undefined,
                })),
                initialValue: defaults.variant ?? "high",
            })

            if (p.isCancel(variant)) {
                p.cancel("Cancelled.")
                return null
            }

            agents[agentName] = { model: modelStr, variant: variant as string }
        }
    }

    // 3. Ask all category models
    p.log.step(color.bold("\n── Categories (8) ──"))

    const categories: Record<string, Record<string, unknown>> = {}

    for (const [categoryName, defaults] of Object.entries(CATEGORY_DEFAULTS)) {
        const model = await p.text({
            message: `${color.cyan(categoryName.padEnd(20))} model:`,
            placeholder: defaults.model,
            defaultValue: defaults.model,
        })

        if (p.isCancel(model)) {
            p.cancel("Cancelled.")
            return null
        }

        const modelStr = (model as string).trim()

        if (defaults.stream !== undefined) {
            const stream = await p.select({
                message: `${" ".repeat(20)} stream:`,
                options: [
                    { value: false, label: "false", hint: "default" },
                    { value: true, label: "true" },
                ],
                initialValue: defaults.stream,
            })

            if (p.isCancel(stream)) {
                p.cancel("Cancelled.")
                return null
            }

            categories[categoryName] = { model: modelStr, stream: stream as boolean }
        } else {
            const variant = await p.select({
                message: `${" ".repeat(20)} variant:`,
                options: VARIANT_OPTIONS.map((v) => ({
                    value: v,
                    label: v,
                    hint: v === defaults.variant ? "default" : undefined,
                })),
                initialValue: defaults.variant ?? "high",
            })

            if (p.isCancel(variant)) {
                p.cancel("Cancelled.")
                return null
            }

            categories[categoryName] = { model: modelStr, variant: variant as string }
        }
    }

    // 4. Settings
    p.log.step(color.bold("\n── Settings ──"))

    const skillsMode = await p.select({
        message: "Skills mode:",
        options: [
            { value: "bundled", label: "📦 Bundled (626+ skills pre-loaded)", hint: "recommended" },
            { value: "filesystem", label: "📁 Filesystem (load from ~/.agents/skills/)" },
        ],
        initialValue: "bundled",
    })

    if (p.isCancel(skillsMode)) {
        p.cancel("Cancelled.")
        return null
    }

    const concurrency = await p.text({
        message: "Background task concurrency:",
        placeholder: "5",
        defaultValue: "5",
        validate: (v) => {
            const n = parseInt(v, 10)
            if (isNaN(n) || n < 1 || n > 20) return "Must be a number between 1 and 20"
            return undefined
        },
    })

    if (p.isCancel(concurrency)) {
        p.cancel("Cancelled.")
        return null
    }

    // 5. Generate config
    const config = {
        $schema: "https://raw.githubusercontent.com/aurora-freedom-project/omo-cli/master/assets/omo-cli.schema.json",
        agents,
        categories,
        background_task: { defaultConcurrency: parseInt(concurrency as string, 10) },
        skills_mode: skillsMode as string,
    }

    // 6. Save to profiles/<name>/omo-cli.json
    const profileDir = join(getProfilesDirectory(), profileName)
    mkdirSync(profileDir, { recursive: true })

    const profilePath = join(profileDir, "omo-cli.json")
    writeFileSync(profilePath, JSON.stringify(config, null, 2) + "\n")

    p.log.success(`Profile saved to ${color.green(profilePath)}`)

    // 7. Apply immediately
    const shouldApply = await p.confirm({
        message: "Apply this profile now?",
        initialValue: true,
    })

    if (p.isCancel(shouldApply)) {
        p.cancel("Cancelled.")
        return profileName
    }

    if (shouldApply) {
        const result = applyProfile(profileName)
        if (result.success) {
            p.log.success(`Applied to ${color.green(result.path)}`)
        } else {
            p.log.error(`Failed to apply: ${result.error}`)
        }
    }

    p.outro(color.green(`Profile '${profileName}' created successfully!`))
    return profileName
}
