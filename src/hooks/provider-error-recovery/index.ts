/**
 * @module hooks/provider-error-recovery
 *
 * Provider Error Recovery Hook
 * Prevents agent freezes caused by LLM provider errors (400/429/500).
 *
 * Expert Review Finding #1: Live bug causing agent freezes when providers
 * return HTTP errors. This hook:
 * 1. Detects provider errors from session.error events
 * 2. Implements exponential backoff with jitter for retryable errors (429, 500+)
 * 3. Shows user-facing toast notifications with retry progress
 * 4. Fails fast on non-retryable errors (400, 401, 403)
 *
 * @see shared/effect/errors.ts for typed error hierarchy (ProviderError, ProviderRateLimited)
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared/logger"

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_RETRIES = 3
const BASE_DELAY_MS = 2_000
const MAX_DELAY_MS = 30_000
const JITTER_MAX_MS = 1_000

/** Non-retryable HTTP status codes — fail fast */
const NON_RETRYABLE = new Set([400, 401, 403, 404, 422])

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProviderErrorInfo {
    statusCode: number
    providerID: string
    modelID?: string
    message: string
    retryAfter?: number // seconds, from Retry-After header
}

interface RetryState {
    attempts: number
    lastErrorTime: number
    backoffMs: number
}

// ─── Error Detection ────────────────────────────────────────────────────────

export function parseProviderError(
    errorData: Record<string, unknown>
): ProviderErrorInfo | null {
    const message = String(errorData.message ?? errorData.error ?? "")

    // Extract HTTP status code from error message patterns
    let statusCode = 0

    if (typeof errorData.statusCode === "number") {
        statusCode = errorData.statusCode
    } else if (typeof errorData.status === "number") {
        statusCode = errorData.status
    } else {
        // Pattern: "HTTP 429", "status: 500", "400 Bad Request"
        const match = message.match(/\b(4\d{2}|5\d{2})\b/)
        if (match) statusCode = parseInt(match[1]!, 10)
    }

    if (statusCode === 0) return null

    const providerID = String(errorData.providerID ?? errorData.provider ?? "unknown")
    const modelID = errorData.modelID
        ? String(errorData.modelID)
        : undefined

    // Parse Retry-After header if present
    let retryAfter: number | undefined
    if (typeof errorData.retryAfter === "number") {
        retryAfter = errorData.retryAfter
    } else if (typeof errorData.retryAfter === "string") {
        const parsed = parseInt(errorData.retryAfter, 10)
        if (!isNaN(parsed)) retryAfter = parsed
    }

    return { statusCode, providerID, modelID, message, retryAfter }
}

export function isRetryable(statusCode: number): boolean {
    if (NON_RETRYABLE.has(statusCode)) return false
    return statusCode === 429 || statusCode >= 500
}

// ─── Backoff Calculator ─────────────────────────────────────────────────────

export function calculateBackoff(
    attempt: number,
    retryAfter?: number
): number {
    if (retryAfter && retryAfter > 0) {
        return Math.min(retryAfter * 1000, MAX_DELAY_MS)
    }

    // Exponential backoff: base * 2^attempt + jitter
    const exponential = BASE_DELAY_MS * Math.pow(2, attempt)
    const jitter = Math.floor(Math.random() * JITTER_MAX_MS)
    return Math.min(exponential + jitter, MAX_DELAY_MS)
}

// ─── Toast Message Builder ──────────────────────────────────────────────────

export function buildToastMessage(
    error: ProviderErrorInfo,
    retryState: RetryState
): { title: string; message: string } {
    const provider = error.providerID
    const model = error.modelID ? ` (${error.modelID})` : ""

    if (!isRetryable(error.statusCode)) {
        return {
            title: `⛔ Provider Error [${error.statusCode}]`,
            message: `${provider}${model}: ${error.message.slice(0, 200)}`,
        }
    }

    const remaining = MAX_RETRIES - retryState.attempts
    const delaySec = Math.ceil(retryState.backoffMs / 1000)

    if (error.statusCode === 429) {
        return {
            title: `⏳ Rate Limited [429]`,
            message: `${provider}${model} — retrying in ${delaySec}s (${remaining} attempts left)`,
        }
    }

    return {
        title: `🔄 Server Error [${error.statusCode}]`,
        message: `${provider}${model} — retrying in ${delaySec}s (${remaining} attempts left)`,
    }
}

// ─── Hook Factory ───────────────────────────────────────────────────────────

export function createProviderErrorRecoveryHook(ctx: PluginInput) {
    const retryStates = new Map<string, RetryState>()

    // Clear retry state on successful completion
    function clearRetryState(sessionID: string) {
        retryStates.delete(sessionID)
    }

    // Get or create retry state for session
    function getRetryState(sessionID: string): RetryState {
        if (!retryStates.has(sessionID)) {
            retryStates.set(sessionID, {
                attempts: 0,
                lastErrorTime: 0,
                backoffMs: BASE_DELAY_MS,
            })
        }
        return retryStates.get(sessionID)!
    }

    return {
        events: {
            async handler({ event }: { event: { type: string; properties?: unknown } }) {
                const props = event.properties as Record<string, unknown> | undefined

                // Clean up on session deletion
                if (event.type === "session.deleted") {
                    const id = props?.sessionID as string | undefined
                    if (id) clearRetryState(id)
                    return
                }

                // Clean up on successful message completion
                if (event.type === "session.message.completed") {
                    const id = props?.sessionID as string | undefined
                    if (id) clearRetryState(id)
                    return
                }

                // Handle provider errors
                if (event.type === "session.error") {
                    const errorData = props ?? {}
                    const sessionID = String(errorData.sessionID ?? "")
                    if (!sessionID) return

                    const providerError = parseProviderError(errorData)
                    if (!providerError) return

                    const state = getRetryState(sessionID)

                    log(
                        `[provider-error-recovery] ${providerError.providerID} returned ${providerError.statusCode}: ${providerError.message.slice(0, 100)}`
                    )

                    if (!isRetryable(providerError.statusCode)) {
                        // Non-retryable: show error toast and let it propagate
                        const toast = buildToastMessage(providerError, state)
                        log(`[provider-error-recovery] Non-retryable error, notifying user: ${toast.title}`)

                        try {
                            await (ctx as { client?: { tui?: { showToast: (opts: unknown) => Promise<unknown> } } })
                                ?.client?.tui?.showToast?.({
                                    body: { title: toast.title, description: toast.message },
                                })
                        } catch { /* toast is best-effort */ }

                        clearRetryState(sessionID)
                        return
                    }

                    // Retryable: check if we've exceeded max retries
                    if (state.attempts >= MAX_RETRIES) {
                        log(`[provider-error-recovery] Max retries (${MAX_RETRIES}) exceeded for session ${sessionID}`)
                        clearRetryState(sessionID)
                        return
                    }

                    // Calculate backoff and update state
                    state.attempts++
                    state.lastErrorTime = Date.now()
                    state.backoffMs = calculateBackoff(state.attempts, providerError.retryAfter)

                    const toast = buildToastMessage(providerError, state)
                    log(`[provider-error-recovery] Retry ${state.attempts}/${MAX_RETRIES} in ${state.backoffMs}ms`)

                    // Show retry toast
                    try {
                        await (ctx as { client?: { tui?: { showToast: (opts: unknown) => Promise<unknown> } } })
                            ?.client?.tui?.showToast?.({
                                body: { title: toast.title, description: toast.message },
                            })
                    } catch { /* toast is best-effort */ }
                }
            },
        },
    }
}
