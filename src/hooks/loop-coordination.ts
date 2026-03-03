/**
 * Central coordination lock for all session.idle hooks.
 *
 * Prevents multiple hooks from simultaneously injecting continuation prompts,
 * and blocks injection during compaction or other recovery operations.
 *
 * Hooks that MUST check before injecting:
 * - ralph-loop
 * - todo-continuation-enforcer
 * - navigator (conductor)
 * - claude-code Stop hook
 *
 * Hooks that signal active state:
 * - ralph-loop → markRalphLoopActive()
 * - auto-compact → markCompactionActive()
 * - any injector → acquireInjectionLock() / releaseInjectionLock()
 */

/** Sessions with active ralph-loop */
const activeLoopSessions = new Set<string>()

/** Sessions currently undergoing compaction/summarize */
const compactionSessions = new Set<string>()

/** Sessions with compaction cooldown (just finished compacting) */
const compactionCooldownSessions = new Map<string, number>()

/** Per-session injection lock: only one hook can inject at a time */
const injectionLocks = new Map<string, string>()  // sessionID → hookName

/** Cooldown period after compaction completes (ms) */
const COMPACTION_COOLDOWN_MS = 10_000

// --- Ralph Loop ---

/** Marks a session as having an active ralph-loop. */
export function markRalphLoopActive(sessionID: string): void {
    activeLoopSessions.add(sessionID)
}

/** Clears the ralph-loop active flag for a session. */
export function clearRalphLoopActive(sessionID: string): void {
    activeLoopSessions.delete(sessionID)
}

/** Checks if ralph-loop is currently active for a session. */
export function isRalphLoopActive(sessionID: string): boolean {
    return activeLoopSessions.has(sessionID)
}

// --- Compaction ---

/** Marks a session as undergoing compaction/summarization. */
export function markCompactionActive(sessionID: string): void {
    compactionSessions.add(sessionID)
    // Clear any stale cooldown
    compactionCooldownSessions.delete(sessionID)
}

/** Clears compaction flag and starts cooldown period. */
export function clearCompactionActive(sessionID: string): void {
    compactionSessions.delete(sessionID)
    // Start cooldown — hooks should still wait before injecting
    compactionCooldownSessions.set(sessionID, Date.now())
}

/** Checks if a session is currently undergoing compaction. */
export function isCompactionActive(sessionID: string): boolean {
    return compactionSessions.has(sessionID)
}

/**
 * Check if session is in post-compaction cooldown.
 * Returns true if compaction finished less than COMPACTION_COOLDOWN_MS ago.
 */
export function isCompactionCooldown(sessionID: string): boolean {
    const finishedAt = compactionCooldownSessions.get(sessionID)
    if (!finishedAt) return false
    if (Date.now() - finishedAt > COMPACTION_COOLDOWN_MS) {
        compactionCooldownSessions.delete(sessionID)
        return false
    }
    return true
}

// --- Injection Lock (cross-hook mutex) ---

/**
 * Try to acquire injection lock for a session.
 * Returns true if lock acquired, false if another hook already holds it.
 */
export function acquireInjectionLock(sessionID: string, hookName: string): boolean {
    const currentHolder = injectionLocks.get(sessionID)
    if (currentHolder && currentHolder !== hookName) {
        return false  // Another hook is already injecting
    }
    injectionLocks.set(sessionID, hookName)
    return true
}

/** Releases the injection lock if held by the specified hook. */
export function releaseInjectionLock(sessionID: string, hookName: string): void {
    if (injectionLocks.get(sessionID) === hookName) {
        injectionLocks.delete(sessionID)
    }
}

// --- Unified Guard ---

/**
 * Master guard: should this hook inject a continuation for this session?
 * Returns { allowed: false, reason } if blocked, { allowed: true } if safe.
 */
export function canInject(sessionID: string, hookName: string): { allowed: boolean; reason?: string } {
    if (isCompactionActive(sessionID)) {
        return { allowed: false, reason: "compaction in progress" }
    }
    if (isCompactionCooldown(sessionID)) {
        return { allowed: false, reason: "compaction cooldown" }
    }
    if (hookName !== "ralph-loop" && isRalphLoopActive(sessionID)) {
        return { allowed: false, reason: "ralph-loop is active" }
    }
    if (!acquireInjectionLock(sessionID, hookName)) {
        return { allowed: false, reason: `injection lock held by ${injectionLocks.get(sessionID)}` }
    }
    return { allowed: true }
}

// --- Cleanup ---

/** Cleans up all coordination state for a session. */
export function cleanupSession(sessionID: string): void {
    activeLoopSessions.delete(sessionID)
    compactionSessions.delete(sessionID)
    compactionCooldownSessions.delete(sessionID)
    injectionLocks.delete(sessionID)
}
