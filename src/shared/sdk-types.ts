/**
 * SDK Type Adapters
 *
 * Centralizes OpenCode SDK type re-exports and adapter types
 * to eliminate `any` at SDK boundaries.
 *
 * Why this file exists:
 * - The SDK doesn't export some types used at runtime (e.g. session.create permission field)
 * - Message/Part types are complex unions that benefit from named interfaces
 * - Prevents each file from defining its own `any` workarounds
 */

import type { PluginInput } from "@opencode-ai/plugin"

// ─── Re-exports from SDK ───────────────────────────────────────────────────

export type {
    Message,
    UserMessage,
    AssistantMessage,
    Part,
    TextPart,
    ReasoningPart,
    ToolPart,
    FilePart,
    StepStartPart,
    StepFinishPart,
} from "@opencode-ai/sdk"

export type { ToolContext, PluginInput } from "@opencode-ai/plugin"

// ─── Derived types ─────────────────────────────────────────────────────────

/** Fully-typed OpenCode client (derived from PluginInput) */
export type OpencodeClient = PluginInput["client"]

/**
 * Session create body with extended fields.
 * The SDK type (`SessionCreateData.body`) only declares `parentID` and `title`,
 * but the runtime API also accepts `permission`. This type bridges that gap.
 */
export interface SessionCreateBody {
    parentID?: string
    title?: string
    permission?: Array<{
        permission: string
        action: "allow" | "deny"
        pattern: string
    }>
}

/**
 * Flattened message shape from `session.messages()` response.
 * Each element has `info` (message metadata) and `parts` (content).
 */
export interface MessageWithParts {
    info: {
        role: "user" | "assistant" | "tool"
        time?: { created: number }
        sessionID?: string
        model?: { providerID: string; modelID: string }
    }
    parts: Array<{
        type: string
        text?: string
        thinking?: string
        content?: string | Array<{ type: string; text?: string }>
        state?: { output?: string }
        [key: string]: unknown
    }>
}

/**
 * OpenCode TUI client extension.
 * The base OpencodeClient doesn't declare the `tui` namespace,
 * but it's available at runtime when running inside TUI mode.
 */
export interface TuiClientExtension {
    tui?: {
        showToast(options: {
            body: {
                title?: string
                message: string
                variant: "info" | "success" | "warning" | "error"
                duration?: number
            }
        }): Promise<boolean>
        appendPrompt?(options: { body: { text: string } }): Promise<boolean>
        executeCommand?(options: { body: { command: string } }): Promise<boolean>
    }
}
