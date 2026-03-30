/**
 * @module hooks/provider-error-recovery/watchdog
 *
 * Timeout watchdog for detecting provider hangs.
 * If no response is received within the configured timeout,
 * the watchdog triggers recovery to prevent indefinite agent freezes.
 */

import { log } from "../../shared/logger"
import { DEFAULT_RETRY_STRATEGY } from "./types"

// ─── Types ──────────────────────────────────────────────────────────────────

/** Callback invoked when watchdog timeout fires */
export type WatchdogTimeoutCallback = (sessionID: string) => void

interface WatchdogEntry {
    timer: ReturnType<typeof setTimeout>
    startedAt: number
    sessionID: string
}

// ─── Watchdog Manager ───────────────────────────────────────────────────────

/**
 * Manages per-session timeout watchdogs.
 * Each active session gets a timer that resets on every response.
 * If the timer fires (no response within timeout), recovery is triggered.
 */
export class WatchdogManager {
    private readonly watchdogs = new Map<string, WatchdogEntry>()
    private readonly timeoutMs: number
    private readonly onTimeout: WatchdogTimeoutCallback

    constructor(
        onTimeout: WatchdogTimeoutCallback,
        timeoutMs: number = DEFAULT_RETRY_STRATEGY.watchdogTimeoutMs ?? 120_000
    ) {
        this.timeoutMs = timeoutMs
        this.onTimeout = onTimeout
    }

    /**
     * Start or reset the watchdog for a session.
     * Call this when a request is sent to the provider.
     */
    start(sessionID: string): void {
        this.stop(sessionID) // Clear existing timer

        const timer = setTimeout(() => {
            log(
                `[watchdog] Timeout after ${this.timeoutMs}ms for session ${sessionID} — triggering recovery`
            )
            this.watchdogs.delete(sessionID)
            this.onTimeout(sessionID)
        }, this.timeoutMs)

        // Unref to avoid keeping the process alive
        if (typeof timer === "object" && "unref" in timer) {
            timer.unref()
        }

        this.watchdogs.set(sessionID, {
            timer,
            startedAt: Date.now(),
            sessionID,
        })
    }

    /**
     * Reset the watchdog timer (call on each incremental response).
     * This prevents the watchdog from firing during active streaming.
     */
    reset(sessionID: string): void {
        if (this.watchdogs.has(sessionID)) {
            this.start(sessionID) // Restart the timer
        }
    }

    /**
     * Stop and remove the watchdog for a session.
     * Call when the session completes, errors out, or is deleted.
     */
    stop(sessionID: string): void {
        const entry = this.watchdogs.get(sessionID)
        if (entry) {
            clearTimeout(entry.timer)
            this.watchdogs.delete(sessionID)
        }
    }

    /**
     * Stop all watchdogs. Call during plugin cleanup.
     */
    stopAll(): void {
        for (const [sessionID] of this.watchdogs) {
            this.stop(sessionID)
        }
    }

    /**
     * Get the number of active watchdogs (useful for testing).
     */
    get activeCount(): number {
        return this.watchdogs.size
    }

    /**
     * Check if a watchdog is active for a session.
     */
    isActive(sessionID: string): boolean {
        return this.watchdogs.has(sessionID)
    }
}
