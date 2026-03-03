/** Parsed error data from a token limit exceeded response. */
export interface ParsedTokenLimitError {
  currentTokens: number
  maxTokens: number
  requestId?: string
  errorType: string
  providerID?: string
  modelID?: string
  messageIndex?: number
}

/** Retry state tracking for recovery attempts. */
export interface RetryState {
  attempt: number
  lastAttemptTime: number
}

/** State tracking for truncation attempts. */
export interface TruncateState {
  truncateAttempt: number
  lastTruncatedPartId?: string
}

/** Global state for auto-compaction across all sessions. */
export interface AutoCompactState {
  pendingCompact: Set<string>
  errorDataBySession: Map<string, ParsedTokenLimitError>
  retryStateBySession: Map<string, RetryState>
  truncateStateBySession: Map<string, TruncateState>
  emptyContentAttemptBySession: Map<string, number>
  compactionInProgress: Set<string>
}

/** Configuration for retry behavior (delays, max attempts). */
export const RETRY_CONFIG = {
  maxAttempts: 2,
  initialDelayMs: 2000,
  backoffFactor: 2,
  maxDelayMs: 30000,
} as const

/** Configuration for truncation behavior (attempts, thresholds). */
export const TRUNCATE_CONFIG = {
  maxTruncateAttempts: 20,
  minOutputSizeToTruncate: 500,
  targetTokenRatio: 0.5,
  charsPerToken: 4,
} as const
