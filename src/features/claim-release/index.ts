/**
 * Claim/Release State Management — Exclusive resource locking.
 *
 * Feature #20 from the 27-feature integration plan.
 * Inspired by Symphony's claim/release pattern.
 *
 * Provides session-scoped exclusive access to resources:
 *  - A session can "claim" a resource (file, agent, tool)
 *  - Other sessions see it as claimed and can wait or skip
 *  - Claims are automatically released on session.deleted
 *
 * Prevents concurrent modification conflicts in multi-agent scenarios.
 */

import { log } from "../../shared"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Claim {
    readonly resourceId: string
    readonly sessionId: string
    readonly claimedAt: string
    readonly reason?: string
}

export type ClaimResult =
    | { status: "acquired"; claim: Claim }
    | { status: "blocked"; heldBy: Claim }

// ─── Store ──────────────────────────────────────────────────────────────────

const _claims = new Map<string, Claim>()

/** Try to claim an exclusive lock on a resource. */
export function claimResource(resourceId: string, sessionId: string, reason?: string): ClaimResult {
    const existing = _claims.get(resourceId)

    if (existing) {
        // Same session re-claiming is OK (idempotent)
        if (existing.sessionId === sessionId) {
            return { status: "acquired", claim: existing }
        }
        log(`[claim] Resource ${resourceId} blocked — held by session ${existing.sessionId.slice(0, 8)}`)
        return { status: "blocked", heldBy: existing }
    }

    const claim: Claim = {
        resourceId,
        sessionId,
        claimedAt: new Date().toISOString(),
        reason,
    }
    _claims.set(resourceId, claim)
    log(`[claim] Resource ${resourceId} claimed by session ${sessionId.slice(0, 8)}`)
    return { status: "acquired", claim }
}

/** Release a claim on a resource. */
export function releaseResource(resourceId: string, sessionId: string): boolean {
    const existing = _claims.get(resourceId)
    if (!existing) return false
    if (existing.sessionId !== sessionId) {
        log(`[claim] Cannot release ${resourceId} — not owned by session ${sessionId.slice(0, 8)}`)
        return false
    }
    _claims.delete(resourceId)
    log(`[claim] Resource ${resourceId} released by session ${sessionId.slice(0, 8)}`)
    return true
}

/** Check if a resource is currently claimed. */
export function isResourceClaimed(resourceId: string): Claim | undefined {
    return _claims.get(resourceId)
}

/** List all claims held by a session. */
export function getSessionClaims(sessionId: string): Claim[] {
    return Array.from(_claims.values()).filter(c => c.sessionId === sessionId)
}

/** Release all claims held by a session (used on session.deleted). */
export function releaseAllClaims(sessionId: string): number {
    let released = 0
    for (const [resourceId, claim] of _claims.entries()) {
        if (claim.sessionId === sessionId) {
            _claims.delete(resourceId)
            released++
        }
    }
    if (released > 0) {
        log(`[claim] Released ${released} claims for session ${sessionId.slice(0, 8)}`)
    }
    return released
}

/** Clear all claims (for testing). */
export function clearAllClaims(): void {
    _claims.clear()
}
