// Polling interval for background session status checks
/** Polling interval for background session status checks (ms). */
export const POLL_INTERVAL_BACKGROUND_MS = 2000

// Maximum idle time before session considered stale
/** Maximum idle time before a session is considered stale (10 minutes). */
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000  // 10 minutes

// Grace period for missing session before cleanup
/** Grace period for missing session before cleanup (6 seconds). */
export const SESSION_MISSING_GRACE_MS = 6000  // 6 seconds

// Session readiness polling config
/** Polling interval for checking session readiness (ms). */
export const SESSION_READY_POLL_INTERVAL_MS = 500
/** Maximum wait time for a session to become ready (10 seconds). */
export const SESSION_READY_TIMEOUT_MS = 10_000  // 10 seconds max wait
