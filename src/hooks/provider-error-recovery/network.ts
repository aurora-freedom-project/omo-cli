/**
 * @module hooks/provider-error-recovery/network
 *
 * Network and streaming error detection utilities.
 * Identifies transient network failures and mid-stream disconnects
 * that cause agent freezes when left unhandled.
 */

import { NETWORK_ERROR_CODES, STREAMING_ERROR_PATTERNS } from "./types"

// ─── Network Error Detection ────────────────────────────────────────────────

/**
 * Extract network error code from error data.
 * Handles both structured error objects and raw error messages.
 *
 * @param errorData - Raw error data from session.error event
 * @returns Network error code (e.g., "ECONNRESET") or null
 */
export function extractNetworkErrorCode(
    errorData: Record<string, unknown>
): string | null {
    // Direct code property (Node.js/Bun style)
    if (typeof errorData.code === "string" && NETWORK_ERROR_CODES.has(errorData.code)) {
        return errorData.code
    }

    // Nested in cause chain
    const cause = errorData.cause as Record<string, unknown> | undefined
    if (cause && typeof cause.code === "string" && NETWORK_ERROR_CODES.has(cause.code)) {
        return cause.code
    }

    // Pattern match in error message
    const message = String(errorData.message ?? errorData.error ?? "")
    for (const code of NETWORK_ERROR_CODES) {
        if (message.includes(code)) {
            return code
        }
    }

    return null
}

/**
 * Check if an error is a network-level failure (no HTTP status involved).
 *
 * @param errorData - Raw error data from session.error event
 * @returns True if this is a network error that should be retried
 */
export function isNetworkError(errorData: Record<string, unknown>): boolean {
    return extractNetworkErrorCode(errorData) !== null
}

// ─── Streaming Error Detection ──────────────────────────────────────────────

/**
 * Check if an error indicates a mid-stream disconnect or SSE failure.
 *
 * @param errorData - Raw error data from session.error event
 * @returns True if this looks like a streaming/SSE disconnect
 */
export function isStreamingError(errorData: Record<string, unknown>): boolean {
    const message = String(errorData.message ?? errorData.error ?? "")

    for (const pattern of STREAMING_ERROR_PATTERNS) {
        if (pattern.test(message)) {
            return true
        }
    }

    // Check for specific streaming-related error types
    const errorType = String(errorData.type ?? errorData.name ?? "")
    if (
        errorType === "AbortError" ||
        errorType === "ReadableStreamError" ||
        errorType === "SSEError"
    ) {
        return true
    }

    return false
}

/**
 * Get a human-readable description of the network/streaming error.
 *
 * @param errorData - Raw error data
 * @returns Description string for toast/log messages
 */
export function describeNetworkError(
    errorData: Record<string, unknown>
): string {
    const networkCode = extractNetworkErrorCode(errorData)
    if (networkCode) {
        switch (networkCode) {
            case "ECONNRESET":
                return "Connection reset by provider"
            case "ETIMEDOUT":
                return "Connection timed out"
            case "ENOTFOUND":
                return "Provider hostname not found (DNS failure)"
            case "EPIPE":
                return "Broken pipe — connection dropped"
            case "EHOSTUNREACH":
                return "Provider host unreachable"
            case "ECONNREFUSED":
                return "Connection refused by provider"
            case "ENETUNREACH":
                return "Network unreachable"
            case "EAI_AGAIN":
                return "DNS lookup timed out"
            default:
                return `Network error: ${networkCode}`
        }
    }

    if (isStreamingError(errorData)) {
        return "Streaming response disconnected mid-transfer"
    }

    return "Unknown network error"
}
