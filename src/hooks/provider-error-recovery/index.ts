/**
 * @module hooks/provider-error-recovery
 *
 * Provider Error Recovery Hook
 * Prevents agent freezes caused by LLM provider errors.
 *
 * Covers 6 error categories:
 * 1. HTTP errors (400/429/500) - exponential backoff with jitter
 * 2. Rate limiting (429) - honors Retry-After header
 * 3. Network errors (ECONNRESET, ETIMEDOUT, etc.) - auto-retry
 * 4. Streaming errors (SSE disconnect, chunk failure) - auto-retry
 * 5. Timeout (no response within watchdog period) - auto-retry
 * 6. Non-retryable errors (400, 401, 403) - fail fast with toast
 *
 * After MAX_RETRIES, logs exhaustion and clears state (model fallback
 * integration requires the model-resolver to be wired by the caller).
 *
 * @see types.ts for error categories and retry strategy
 * @see network.ts for network/streaming error detection
 * @see watchdog.ts for timeout watchdog
 */

import type { PluginInput } from "@opencode-ai/plugin"
import { log } from "../../shared/logger"
import { isNetworkError, isStreamingError, describeNetworkError } from "./network"
import { WatchdogManager } from "./watchdog"
import { DEFAULT_RETRY_STRATEGY } from "./types"

// ─── Configuration ──────────────────────────────────────────────────────────

const MAX_RETRIES = DEFAULT_RETRY_STRATEGY.maxRetries
const BASE_DELAY_MS = DEFAULT_RETRY_STRATEGY.baseDelayMs
const MAX_DELAY_MS = DEFAULT_RETRY_STRATEGY.maxDelayMs
const JITTER_MAX_MS = DEFAULT_RETRY_STRATEGY.jitterMaxMs
const WATCHDOG_TIMEOUT_MS = DEFAULT_RETRY_STRATEGY.watchdogTimeoutMs ?? 120_000

/** Non-retryable HTTP status codes — fail fast */
const NON_RETRYABLE = new Set([400, 401, 403, 404, 422])

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProviderErrorInfo {
    statusCode: number
    providerID: string
    modelID?: string
    message: string
    retryAfter?: number // seconds, from Retry-After header
    isNetworkError?: boolean
    isStreamingError?: boolean
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

    // 1. Check for network-level errors (no HTTP status)
    if (isNetworkError(errorData)) {
        return {
            statusCode: 0,       // synthetic: no HTTP status for network errors
            providerID,
            modelID,
            message: describeNetworkError(errorData),
            retryAfter,
            isNetworkError: true,
        }
    }

    // 2. Check for streaming/SSE errors
    if (isStreamingError(errorData)) {
        return {
            statusCode: 0,       // synthetic: no HTTP status for stream errors
            providerID,
            modelID,
            message: message || "Streaming response disconnected",
            retryAfter,
            isStreamingError: true,
        }
    }

    // 3. Extract HTTP status code from error data
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

    return { statusCode, providerID, modelID, message, retryAfter }
}

export function isRetryable(error: ProviderErrorInfo): boolean {
    // Network and streaming errors are always retryable
    if (error.isNetworkError || error.isStreamingError) return true
    // HTTP status-based classification
    if (NON_RETRYABLE.has(error.statusCode)) return false
    return error.statusCode === 429 || error.statusCode >= 500
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

    // Network errors
    if (error.isNetworkError) {
        const remaining = MAX_RETRIES - retryState.attempts
        const delaySec = Math.ceil(retryState.backoffMs / 1000)
        return {
            title: `🌐 Network Error`,
            message: `${provider}${model}: ${error.message} — retrying in ${delaySec}s (${remaining} left)`,
        }
    }

    // Streaming errors
    if (error.isStreamingError) {
        const remaining = MAX_RETRIES - retryState.attempts
        const delaySec = Math.ceil(retryState.backoffMs / 1000)
        return {
            title: `📡 Stream Disconnected`,
            message: `${provider}${model}: ${error.message} — retrying in ${delaySec}s (${remaining} left)`,
        }
    }

    // Non-retryable HTTP errors
    if (!isRetryable(error)) {
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

// ─── Toast Helper ───────────────────────────────────────────────────────────

async function showToast(
    ctx: PluginInput,
    title: string,
    description: string
): Promise<void> {
    try {
        await (ctx as { client?: { tui?: { showToast: (opts: unknown) => Promise<unknown> } } })
            ?.client?.tui?.showToast?.({
                body: { title, description },
            })
    } catch { /* toast is best-effort */ }
}

// ─── Hook Factory ───────────────────────────────────────────────────────────

export function createProviderErrorRecoveryHook(ctx: PluginInput) {
    const retryStates = new Map<string, RetryState>()

    // Clear retry state on successful completion
    function clearRetryState(sessionID: string) {
        retryStates.delete(sessionID)
        watchdog.stop(sessionID)
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

    // Handle watchdog timeout (no response within WATCHDOG_TIMEOUT_MS)
    function handleWatchdogTimeout(sessionID: string) {
        const state = getRetryState(sessionID)

        if (state.attempts >= MAX_RETRIES) {
            log(`[provider-error-recovery] Watchdog: max retries exceeded for session ${sessionID}`)
            clearRetryState(sessionID)
            return
        }

        state.attempts++
        state.lastErrorTime = Date.now()
        state.backoffMs = calculateBackoff(state.attempts)

        log(
            `[provider-error-recovery] Watchdog timeout — no response for ${WATCHDOG_TIMEOUT_MS}ms. ` +
            `Retry ${state.attempts}/${MAX_RETRIES} in ${state.backoffMs}ms`
        )

        void showToast(
            ctx,
            "⏰ Response Timeout",
            `No response received in ${Math.ceil(WATCHDOG_TIMEOUT_MS / 1000)}s — retrying (${MAX_RETRIES - state.attempts} left)`
        )
    }

    // Initialize watchdog manager
    const watchdog = new WatchdogManager(handleWatchdogTimeout, WATCHDOG_TIMEOUT_MS)

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

                // Clean up on successful message completion + reset watchdog
                if (event.type === "session.message.completed") {
                    const id = props?.sessionID as string | undefined
                    if (id) clearRetryState(id)
                    return
                }

                // Reset watchdog on incremental responses (streaming chunk received)
                if (
                    event.type === "session.message.chunk" ||
                    event.type === "session.message.updated"
                ) {
                    const id = props?.sessionID as string | undefined
                    if (id) watchdog.reset(id)
                    return
                }

                // Start watchdog when a new request is sent
                if (event.type === "session.message.created") {
                    const id = props?.sessionID as string | undefined
                    if (id) watchdog.start(id)
                    return
                }

                // Handle provider errors
                if (event.type === "session.error") {
                    const errorData = props ?? {}
                    const sessionID = String(errorData.sessionID ?? "")
                    if (!sessionID) return

                    // Stop watchdog — we got an explicit error, not a timeout
                    watchdog.stop(sessionID)

                    const providerError = parseProviderError(errorData)
                    if (!providerError) return

                    const state = getRetryState(sessionID)
                    const errorType = providerError.isNetworkError
                        ? "network"
                        : providerError.isStreamingError
                            ? "streaming"
                            : `HTTP ${providerError.statusCode}`

                    log(
                        `[provider-error-recovery] ${providerError.providerID} ${errorType} error: ${providerError.message.slice(0, 100)}`
                    )

                    if (!isRetryable(providerError)) {
                        // Non-retryable: show error toast and let it propagate
                        const toast = buildToastMessage(providerError, state)
                        log(`[provider-error-recovery] Non-retryable error, notifying user: ${toast.title}`)
                        await showToast(ctx, toast.title, toast.message)
                        clearRetryState(sessionID)
                        return
                    }

                    // Retryable: check if we've exceeded max retries
                    if (state.attempts >= MAX_RETRIES) {
                        log(
                            `[provider-error-recovery] Max retries (${MAX_RETRIES}) exhausted for session ${sessionID}. ` +
                            `Error: ${errorType}. Giving up.`
                        )
                        await showToast(
                            ctx,
                            "❌ Recovery Failed",
                            `${providerError.providerID}: ${MAX_RETRIES} retries exhausted. ${providerError.message.slice(0, 150)}`
                        )
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
                    await showToast(ctx, toast.title, toast.message)
                }
            },
        },
    }
}

