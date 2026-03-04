/**
 * @module delegate-task/helpers
 *
 * Shared types, utilities, and configuration resolution for the delegate-task tool.
 * Extracted from tools.ts to reduce file complexity.
 */

import type { PluginInput } from "@opencode-ai/plugin"
import type { CategoryConfig, CategoriesConfig } from "../../config/schema"
import { DEFAULT_CATEGORIES, CATEGORY_PROMPT_APPENDS, PLAN_AGENT_SYSTEM_PREPEND, isPlanAgent } from "./constants"
import type { DelegateTaskArgs } from "./types"
import { resolveModel } from "../../shared"

// ─── Type Aliases ───────────────────────────────────────────────────────────

/** OpenCode SDK client type, derived from PluginInput. */
export type OpencodeClient = PluginInput["client"]

// ─── Constants ──────────────────────────────────────────────────────────────

export const WORKER_AGENT = "worker"
export const DEFAULT_MAX_DELEGATION_DEPTH = 5

// ─── Delegation Depth Tracking ──────────────────────────────────────────────

/** Track delegation depth per session: sessionID → depth (0 = top-level). */
const delegationDepth = new Map<string, number>()

/** Get the current delegation depth for a session. */
export function getDelegationDepth(sessionID: string): number {
    return delegationDepth.get(sessionID) ?? 0
}

/** Set the delegation depth for a session. */
export function setDelegationDepth(sessionID: string, depth: number): void {
    delegationDepth.set(sessionID, depth)
}

/** Clean up delegation depth tracking for a completed session. */
export function cleanupDelegationDepth(sessionID: string): void {
    delegationDepth.delete(sessionID)
}

// ─── Utility Functions ──────────────────────────────────────────────────────

/** Parse a "provider/model" string into its components. */
export function parseModelString(model: string): { providerID: string; modelID: string } | undefined {
    const parts = model.split("/")
    if (parts.length >= 2) {
        return { providerID: parts[0], modelID: parts.slice(1).join("/") }
    }
    return undefined
}

/** Format a duration between two dates as a human-readable string. */
export function formatDuration(start: Date, end?: Date): string {
    const duration = (end ?? new Date()).getTime() - start.getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
}

// ─── Error Formatting ───────────────────────────────────────────────────────

/** Context for formatting detailed error messages. */
export interface ErrorContext {
    operation: string
    args?: DelegateTaskArgs
    sessionID?: string
    agent?: string
    category?: string
}

/** Format a detailed error message with context for user-facing output. */
export function formatDetailedError(error: unknown, ctx: ErrorContext): string {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined

    const lines: string[] = [
        `${ctx.operation} failed`,
        "",
        `**Error**: ${message}`,
    ]

    if (ctx.sessionID) {
        lines.push(`**Session ID**: ${ctx.sessionID}`)
    }

    if (ctx.agent) {
        lines.push(`**Agent**: ${ctx.agent}${ctx.category ? ` (category: ${ctx.category})` : ""}`)
    }

    if (ctx.args) {
        lines.push("", "**Arguments**:")
        lines.push(`- description: "${ctx.args.description}"`)
        lines.push(`- category: ${ctx.args.category ?? "(none)"}`)
        lines.push(`- subagent_type: ${ctx.args.subagent_type ?? "(none)"}`)
        lines.push(`- run_in_background: ${ctx.args.run_in_background}`)
        lines.push(`- load_skills: [${ctx.args.load_skills?.join(", ") ?? ""}]`)
        if (ctx.args.session_id) {
            lines.push(`- session_id: ${ctx.args.session_id}`)
        }
    }

    if (stack) {
        lines.push("", "**Stack Trace**:")
        lines.push("```")
        lines.push(stack.split("\n").slice(0, 10).join("\n"))
        lines.push("```")
    }

    return lines.join("\n")
}

// ─── Tool Context ───────────────────────────────────────────────────────────

/** Extended tool context with session metadata support. */
export type ToolContextWithMetadata = {
    sessionID: string
    messageID: string
    agent: string
    abort: AbortSignal
    metadata?: (input: { title?: string; metadata?: Record<string, unknown> }) => void
}

// ─── Category Configuration ─────────────────────────────────────────────────

/** Resolve category config by merging defaults with user overrides. */
export function resolveCategoryConfig(
    categoryName: string,
    options: {
        userCategories?: CategoriesConfig
        inheritedModel?: string
        systemDefaultModel?: string
    }
): { config: CategoryConfig; promptAppend: string; model: string | undefined } | null {
    const { userCategories, inheritedModel, systemDefaultModel } = options
    const defaultConfig = DEFAULT_CATEGORIES[categoryName]
    const userConfig = userCategories?.[categoryName]
    const defaultPromptAppend = CATEGORY_PROMPT_APPENDS[categoryName] ?? ""

    if (!defaultConfig && !userConfig) {
        return null
    }

    // Model priority for categories: user override > category default > system default
    // Categories have explicit models - no inheritance from parent session
    const model = resolveModel({
        userModel: userConfig?.model,
        inheritedModel: defaultConfig?.model, // Category's built-in model takes precedence over system default
        systemDefault: systemDefaultModel,
    })
    const config: CategoryConfig = {
        ...defaultConfig,
        ...userConfig,
        model,
        variant: userConfig?.variant ?? defaultConfig?.variant,
    }

    let promptAppend = defaultPromptAppend
    if (userConfig?.prompt_append) {
        promptAppend = defaultPromptAppend
            ? defaultPromptAppend + "\n\n" + userConfig.prompt_append
            : userConfig.prompt_append
    }

    return { config, promptAppend, model }
}

// ─── Exported Interfaces ────────────────────────────────────────────────────

/** Event emitted when a sync session is created for delegation. */
export interface SyncSessionCreatedEvent {
    sessionID: string
    parentID: string
    title: string
}

/** Options for creating the delegate_task tool. */
export interface DelegateTaskToolOptions {
    manager: import("../../features/background-agent").BackgroundManager
    client: OpencodeClient
    directory: string
    userCategories?: CategoriesConfig
    gitMasterConfig?: import("../../config/schema").GitMasterConfig
    workerModel?: string
    browserProvider?: import("../../config/schema").BrowserAutomationProvider
    onSyncSessionCreated?: (event: SyncSessionCreatedEvent) => Promise<void>
    safetyConfig?: import("../../config/schema").SafetyConfig
}

/** Input for building system content injected into agent prompts. */
export interface BuildSystemContentInput {
    skillContent?: string
    categoryPromptAppend?: string
    agentName?: string
}

/** Build system content from skill content, category prompt, and agent name. */
export function buildSystemContent(input: BuildSystemContentInput): string | undefined {
    const { skillContent, categoryPromptAppend, agentName } = input

    const planAgentPrepend = isPlanAgent(agentName) ? PLAN_AGENT_SYSTEM_PREPEND : ""

    if (!skillContent && !categoryPromptAppend && !planAgentPrepend) {
        return undefined
    }

    const parts: string[] = []

    if (planAgentPrepend) {
        parts.push(planAgentPrepend)
    }

    if (skillContent) {
        parts.push(skillContent)
    }

    if (categoryPromptAppend) {
        parts.push(categoryPromptAppend)
    }

    return parts.join("\n\n") || undefined
}
