/**
 * Stream-Chain — Passes upstream task outputs to downstream tasks.
 *
 * Ported from Omni's stream_chain module. When a delegate_task or
 * background agent completes, its output summary is captured and
 * injected into the next agent's system prompt for context continuity.
 *
 * Features:
 * - Captures delegate_task tool outputs (truncated to 4096 chars)
 * - Stores per-session chain of task results
 * - Provides retrieval API for downstream context injection
 * - Auto-cleans when sessions are deleted
 *
 * @see OmniUltraAgent_Kit/src/agents/stream_chain.rs
 */

import { log } from "../../shared/logger"

/** Maximum characters of upstream output to pass downstream. */
const MAX_CHAIN_CHARS = 4096

/** Maximum number of chain entries per session. */
const MAX_CHAIN_ENTRIES = 10

// ── Types ──────────────────────────────────────────────────────────────────

interface ChainEntry {
    taskId: string
    tool: string
    summary: string
    timestamp: number
}

interface SessionChain {
    entries: ChainEntry[]
}

// ── State ──────────────────────────────────────────────────────────────────

const chains = new Map<string, SessionChain>()

function getChain(sessionID: string): SessionChain {
    let chain = chains.get(sessionID)
    if (!chain) {
        chain = { entries: [] }
        chains.set(sessionID, chain)
    }
    return chain
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the upstream context for injection into a downstream task.
 * Returns a formatted string of previous task outputs.
 */
export function getUpstreamContext(sessionID: string): string | null {
    const chain = chains.get(sessionID)
    if (!chain || chain.entries.length === 0) return null

    const contextParts = chain.entries.map((entry, i) => {
        return `[Upstream Task ${i + 1}: ${entry.tool}]\n${entry.summary}`
    })

    const context = contextParts.join("\n\n---\n\n")
    if (context.length > MAX_CHAIN_CHARS) {
        return context.slice(0, MAX_CHAIN_CHARS) + "\n[... truncated]"
    }
    return context
}

/**
 * Get the number of chain entries for a session.
 */
export function getChainLength(sessionID: string): number {
    return chains.get(sessionID)?.entries.length ?? 0
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Create the Stream-Chain hook.
 *
 * Monitors tool.execute.after for delegate_task and background agent outputs.
 * Captures their results and stores them for downstream context injection.
 */
export function createStreamChainHook() {
    /** Tools whose outputs should be captured for stream-chaining. */
    const CHAIN_TOOLS = new Set([
        "delegate_task",
        "call_omo_agent",
        "background_output",
    ])

    return {
        "tool.execute.after": async (
            input: {
                sessionID: string
                tool: string
                args: Record<string, unknown>
            },
            output: { result?: string; output?: string; title?: string }
        ): Promise<void> => {
            // Only capture from delegation/agent tools
            if (!CHAIN_TOOLS.has(input.tool)) return

            const resultText = output.result || output.output || ""
            if (resultText.length < 20) return // Skip trivial outputs

            const chain = getChain(input.sessionID)

            // Truncate and store
            const summary = resultText.length > MAX_CHAIN_CHARS
                ? resultText.slice(0, MAX_CHAIN_CHARS) + "\n[... truncated]"
                : resultText

            chain.entries.push({
                taskId: String(input.args.task_id || input.args.id || chain.entries.length + 1),
                tool: input.tool,
                summary,
                timestamp: Date.now(),
            })

            // Keep bounded
            if (chain.entries.length > MAX_CHAIN_ENTRIES) {
                chain.entries = chain.entries.slice(-MAX_CHAIN_ENTRIES)
            }

            log("[stream-chain] Captured upstream output", {
                sessionID: input.sessionID,
                tool: input.tool,
                summaryLength: summary.length,
                chainLength: chain.entries.length,
            })
        },

        "event": async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
            const props = event.properties as Record<string, unknown> | undefined
            if (event.type === "session.deleted") {
                const sessionInfo = props?.info as { id?: string } | undefined
                if (sessionInfo?.id) {
                    chains.delete(sessionInfo.id)
                }
            }
        },
    }
}
