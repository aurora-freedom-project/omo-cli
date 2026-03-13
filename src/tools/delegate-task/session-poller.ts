/**
 * @module delegate-task/session-poller
 *
 * Reusable session polling logic for waiting on delegate task completion.
 * Replaces 3 duplicated polling loops from tools.ts with a single function.
 */

import type { OpencodeClient } from "./helpers"
import { getTimingConfig } from "./timing"
import { log } from "../../shared"

/** Options for polling a session until completion. */
export interface PollSessionOptions {
    /** OpenCode SDK client. */
    client: OpencodeClient
    /** Session ID to poll. */
    sessionID: string
    /** Abort signal to cancel polling. */
    abort?: AbortSignal
    /** Whether to check session status (idle detection). Default: false. */
    checkSessionStatus?: boolean
    /** Maximum polling time in ms. Uses timing config default if not specified. */
    maxTimeMs?: number
    /** Minimum stability time override (for session continuation). */
    minStabilityTimeMs?: number
    /** Stall timeout: return stalled if no new messages for this duration (ms). */
    stallTimeoutMs?: number
}

/** Result of polling a session. */
export interface PollResult {
    /** Whether polling was aborted. */
    aborted: boolean
    /** Whether polling timed out. */
    timedOut: boolean
    /** Whether the agent stalled (no activity within stall timeout). */
    stalled: boolean
}

/**
 * Poll for session completion by detecting message stability.
 *
 * Watches the message count on a session and waits until it stabilizes
 * (no new messages for `STABILITY_POLLS_REQUIRED` consecutive polls).
 * Optionally checks session status to skip polling while the session is active.
 */
export async function pollForSessionCompletion(options: PollSessionOptions): Promise<PollResult> {
    const { client, sessionID, abort, checkSessionStatus = false } = options

    const timing = getTimingConfig()
    const POLL_INTERVAL_MS = timing.POLL_INTERVAL_MS
    const MAX_POLL_TIME_MS = options.maxTimeMs ?? timing.MAX_POLL_TIME_MS
    const MIN_STABILITY_TIME_MS = options.minStabilityTimeMs ?? timing.MIN_STABILITY_TIME_MS
    const STABILITY_POLLS_REQUIRED = timing.STABILITY_POLLS_REQUIRED
    const STALL_TIMEOUT_MS = options.stallTimeoutMs ?? timing.STALL_TIMEOUT_MS

    const pollStart = Date.now()
    let lastMsgCount = 0
    let stablePolls = 0
    let pollCount = 0
    let lastActivityTime = Date.now()

    while (Date.now() - pollStart < MAX_POLL_TIME_MS) {
        if (abort?.aborted) {
            return { aborted: true, timedOut: false, stalled: false }
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
        pollCount++

        // Optionally check if the session is still actively processing
        if (checkSessionStatus) {
            const statusResult = await client.session.status()
            const allStatuses = (statusResult.data ?? {}) as Record<string, { type: string }>
            const sessionStatus = allStatuses[sessionID]

            if (pollCount % 10 === 0) {
                log("[delegate_task] Poll status", {
                    sessionID,
                    pollCount,
                    elapsed: Math.floor((Date.now() - pollStart) / 1000) + "s",
                    sessionStatus: sessionStatus?.type ?? "not_in_status",
                    stablePolls,
                    lastMsgCount,
                })
            }

            if (sessionStatus && sessionStatus.type !== "idle") {
                stablePolls = 0
                lastMsgCount = 0
                lastActivityTime = Date.now() // agent is active — reset stall timer
                continue
            }
        }

        // Stall detection: if no activity for longer than stall timeout, bail
        if (STALL_TIMEOUT_MS > 0 && Date.now() - lastActivityTime > STALL_TIMEOUT_MS) {
            log("[delegate_task] Stall detected", {
                sessionID,
                pollCount,
                stallTimeoutMs: STALL_TIMEOUT_MS,
                lastActivityAge: Math.floor((Date.now() - lastActivityTime) / 1000) + "s",
            })
            return { aborted: false, timedOut: false, stalled: true }
        }

        const elapsed = Date.now() - pollStart
        if (elapsed < MIN_STABILITY_TIME_MS) {
            continue
        }

        const messagesCheck = await client.session.messages({ path: { id: sessionID } })
        const msgs = ((messagesCheck as { data?: unknown }).data ?? messagesCheck) as Array<unknown>
        const currentMsgCount = msgs.length

        if (currentMsgCount > 0 && currentMsgCount === lastMsgCount) {
            stablePolls++
            if (stablePolls >= STABILITY_POLLS_REQUIRED) {
                if (checkSessionStatus) {
                    log("[delegate_task] Poll complete - messages stable", { sessionID, pollCount, currentMsgCount })
                }
                break
            }
        } else {
            stablePolls = 0
            if (currentMsgCount !== lastMsgCount) {
                lastActivityTime = Date.now() // message count changed — reset stall timer
            }
            lastMsgCount = currentMsgCount
        }
    }

    const timedOut = Date.now() - pollStart >= MAX_POLL_TIME_MS
    if (timedOut && checkSessionStatus) {
        log("[delegate_task] Poll timeout reached", { sessionID, pollCount, lastMsgCount, stablePolls })
    }

    return { aborted: false, timedOut, stalled: false }
}

/**
 * Fetch the last assistant message from a session.
 *
 * Returns the text content from both "text" and "reasoning" parts
 * (thinking models use "reasoning" type).
 */
export async function fetchLastAssistantMessage(
    client: OpencodeClient,
    sessionID: string
): Promise<{ text: string; found: boolean }> {
    const messagesResult = await client.session.messages({
        path: { id: sessionID },
    })

    if ((messagesResult as { error?: unknown }).error) {
        return { text: `Error fetching result: ${(messagesResult as { error: unknown }).error}\n\nSession ID: ${sessionID}`, found: false }
    }

    const messages = ((messagesResult as { data?: unknown }).data ?? messagesResult) as Array<{
        info?: { role?: string; time?: { created?: number } }
        parts?: Array<{ type?: string; text?: string }>
    }>

    const assistantMessages = messages
        .filter((m) => m.info?.role === "assistant")
        .sort((a, b) => (b.info?.time?.created ?? 0) - (a.info?.time?.created ?? 0))
    const lastMessage = assistantMessages[0]

    if (!lastMessage) {
        return { text: "", found: false }
    }

    const textParts = lastMessage?.parts?.filter((p) => p.type === "text" || p.type === "reasoning") ?? []
    const textContent = textParts.map((p) => p.text ?? "").filter(Boolean).join("\n")

    return { text: textContent, found: true }
}
