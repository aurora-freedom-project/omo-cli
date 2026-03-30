/**
 * @module hooks/provider-error-recovery/types
 *
 * Type definitions for provider error recovery.
 * Defines error categories, severity levels, and retry strategies.
 */

import { Data } from "../../shared/effect"

// ─── Error Severity ─────────────────────────────────────────────────────────

/** Severity levels for provider errors */
export enum ErrorSeverity {
    /** Transient errors that may succeed on retry (429, 5xx) */
    Transient = "transient",
    /** Permanent errors that will never succeed (400, 401, 403) */
    Permanent = "permanent",
    /** Unknown severity - requires investigation */
    Unknown = "unknown",
}

// ─── Error Category ─────────────────────────────────────────────────────────

/** Categorized error types from LLM providers */
export type ErrorCategory =
    | { _tag: "RateLimited"; retryAfterMs?: number; provider: string }
    | { _tag: "ServerError"; statusCode: number; provider: string }
    | { _tag: "BadRequest"; message: string; provider: string }
    | { _tag: "Unauthorized"; message: string; provider: string }
    | { _tag: "Forbidden"; message: string; provider: string }
    | { _tag: "NotFound"; message: string; provider: string }
    | { _tag: "ValidationError"; message: string; provider: string }
    | { _tag: "Timeout"; message: string; provider: string }
    | { _tag: "NetworkError"; message: string; provider: string }
    | { _tag: "StreamingError"; message: string; provider: string }
    | { _tag: "UnknownError"; message: string; provider: string; cause?: unknown }

// ─── Provider Error Domain Model ───────────────────────────────────────────

/** Structured provider error information */
export interface ProviderErrorInfo {
    readonly statusCode: number
    readonly providerID: string
    readonly modelID?: string
    readonly message: string
    readonly retryAfter?: number // seconds, from Retry-After header
    readonly cause?: unknown
    /** True if error was detected from a network-level failure (no HTTP status) */
    readonly isNetworkError?: boolean
    /** True if error was detected from a streaming disconnect */
    readonly isStreamingError?: boolean
}

// ─── Retry Strategy ─────────────────────────────────────────────────────────

/** Configuration for retry behavior */
export interface RetryStrategy {
    readonly maxRetries: number
    readonly baseDelayMs: number
    readonly maxDelayMs: number
    readonly jitterMaxMs: number
    readonly retryableStatuses: ReadonlySet<number>
    /** Watchdog timeout: if no response within this period, trigger recovery (ms) */
    readonly watchdogTimeoutMs?: number
}

// ─── Retry State ───────────────────────────────────────────────────────────

/** Current state of retry attempts for a session */
export interface RetryState {
    attempts: number
    lastErrorTime: number
    backoffMs: number
    readonly sessionID: string
}

// ─── Classification Result ───────────────────────────────────────────────

/** Result of error classification */
export interface ClassificationResult {
    readonly category: ErrorCategory
    readonly severity: ErrorSeverity
    readonly isRetryable: boolean
    readonly retryAfterMs?: number
}

// ─── Backoff Options ───────────────────────────────────────────────────────

/** Options for backoff calculation */
export interface BackoffOptions {
    readonly attempt: number
    readonly retryAfterSeconds?: number
    readonly strategy: RetryStrategy
}

// ─── Effect-TS Typed Errors ────────────────────────────────────────────────

/** Classification failed due to invalid input */
export class ClassificationError extends Data.TaggedError("ClassificationError")<{
    readonly reason: string
    readonly input: unknown
}> { }

/** Backoff calculation failed */
export class BackoffError extends Data.TaggedError("BackoffError")<{
    readonly reason: string
    readonly attempt: number
}> { }

// ─── Default Configuration ─────────────────────────────────────────────────

/** Default retry strategy configuration */
export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
    maxRetries: 3,
    baseDelayMs: 2_000,
    maxDelayMs: 30_000,
    jitterMaxMs: 1_000,
    retryableStatuses: new Set([429, 500, 502, 503, 504]),
    watchdogTimeoutMs: 120_000, // 2 minutes
}

/** Non-retryable HTTP status codes */
export const NON_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([400, 401, 403, 404, 422])

// ─── Network & Streaming Error Detection ────────────────────────────────────

/** Node.js/Bun network error codes that indicate transient failures */
export const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EPIPE",
    "EHOSTUNREACH",
    "ECONNREFUSED",
    "ENETUNREACH",
    "EAI_AGAIN",
])

/** Patterns indicating a streaming/SSE disconnect (case-insensitive) */
export const STREAMING_ERROR_PATTERNS: readonly RegExp[] = [
    /stream\s*(ing)?\s*(error|fail|disconnect|abort)/i,
    /chunk\s*(error|fail|corrupt)/i,
    /connection\s*(reset|closed|abort|lost)/i,
    /SSE\s*(error|disconnect|timeout)/i,
    /ReadableStream\s*(error|cancel|closed)/i,
    /premature\s*close/i,
    /incomplete\s*(response|message|chunk)/i,
    /unexpected\s*end\s*of\s*(stream|data|input)/i,
]

