/**
 * @module hooks/provider-error-recovery/backoff
 *
 * Exponential backoff with jitter implementation.
 * Uses "full jitter" strategy for optimal retry distribution.
 */

import { Effect } from "../../shared/effect"
import type { BackoffOptions, RetryStrategy } from "./types"
import { BackoffError } from "./types"

// ─── Jitter Strategies ──────────────────────────────────────────────────────

/** Jitter strategy types */
export type JitterStrategy = "full" | "decorrelated" | "equal"

/**
 * Full jitter: random value between 0 and calculated delay
 * Best for distributed systems - spreads load evenly
 */
function fullJitter(delayMs: number, jitterMax: number): number {
    const jitter = Math.floor(Math.random() * jitterMax)
    return Math.max(0, delayMs - jitter)
}

/**
 * Decorrelated jitter: each delay is random but related to previous
 * Adapts well to varying latency conditions
 */
function decorrelatedJitter(
    baseDelayMs: number,
    maxDelayMs: number,
    previousDelay: number
): number {
    const random = Math.random() * baseDelayMs * 3
    const delay = Math.min(random, maxDelayMs)
    return Math.max(baseDelayMs, delay)
}

/**
 * Equal jitter: splits difference between min and max
 * Conservative approach, predictable delays
 */
function equalJitter(delayMs: number, jitterMax: number): number {
    const halfJitter = jitterMax / 2
    return delayMs - halfJitter + Math.floor(Math.random() * jitterMax)
}

// ─── Backoff Calculator ─────────────────────────────────────────────────────

/**
 * Calculate delay using exponential backoff with configurable jitter
 *
 * @param options - Backoff calculation options
 * @returns Delay in milliseconds
 */
export function calculateBackoff(options: BackoffOptions): number {
    const { attempt, retryAfterSeconds, strategy } = options

    // If Retry-After header provided, use it (capped at max)
    if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
        const retryAfterMs = retryAfterSeconds * 1000
        return Math.min(retryAfterMs, strategy.maxDelayMs)
    }

    // Exponential backoff: base * 2^attempt
    const exponentialDelay = strategy.baseDelayMs * Math.pow(2, attempt)

    // Apply jitter using full jitter strategy (best for distributed systems)
    const jitteredDelay = fullJitter(exponentialDelay, strategy.jitterMaxMs)

    // Cap at maximum delay
    return Math.min(jitteredDelay, strategy.maxDelayMs)
}

/**
 * Calculate backoff using Effect-TS for error handling
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param retryAfterSeconds - Optional Retry-After header value
 * @param strategy - Retry strategy configuration
 * @returns Effect that resolves to delay in milliseconds
 */
export const calculateBackoffEffect = (
    attempt: number,
    retryAfterSeconds?: number,
    strategy: RetryStrategy = {
        maxRetries: 3,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
        jitterMaxMs: 1000,
        retryableStatuses: new Set([429, 500, 502, 503, 504]),
    }
): Effect.Effect<number, BackoffError> => {
    // Validate attempt is non-negative
    if (attempt < 0) {
        return Effect.fail(
            new BackoffError({
                reason: "Attempt must be non-negative",
                attempt,
            })
        )
    }

    // Validate retryAfterSeconds if provided
    if (retryAfterSeconds !== undefined && retryAfterSeconds < 0) {
        return Effect.fail(
            new BackoffError({
                reason: "RetryAfter must be non-negative",
                attempt,
            })
        )
    }

    const delay = calculateBackoff({
        attempt,
        retryAfterSeconds,
        strategy,
    })

    return Effect.succeed(delay)
}

// ─── Backoff Sequence Generator ────────────────────────────────────────────

/**
 * Generate a sequence of backoff delays for a given number of retries
 *
 * @param maxRetries - Maximum number of retry attempts
 * @param strategy - Retry strategy configuration
 * @returns Array of delay values in milliseconds
 */
export function generateBackoffSequence(
    maxRetries: number,
    strategy: RetryStrategy
): number[] {
    const delays: number[] = []

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const delay = calculateBackoff({ attempt, strategy })
        delays.push(delay)
    }

    return delays
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Format delay for display
 *
 * @param delayMs - Delay in milliseconds
 * @returns Human-readable string (e.g., "2s", "30s")
 */
export function formatDelay(delayMs: number): string {
    if (delayMs < 1000) {
        return `${delayMs}ms`
    }
    if (delayMs < 60000) {
        return `${Math.round(delayMs / 1000)}s`
    }
    const minutes = Math.floor(delayMs / 60000)
    const seconds = Math.round((delayMs % 60000) / 1000)
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

/**
 * Calculate total delay for a sequence of retries
 *
 * @param maxRetries - Number of retry attempts
 * @param strategy - Retry strategy configuration
 * @returns Total delay in milliseconds
 */
export function calculateTotalDelay(
    maxRetries: number,
    strategy: RetryStrategy
): number {
    return generateBackoffSequence(maxRetries, strategy).reduce(
        (total, delay) => total + delay,
        0
    )
}
