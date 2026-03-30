/**
 * PAL Router — Progressive Agent Level routing for task escalation.
 *
 * Ported from Omni's resilience.max_escalations pattern. When a sub-agent
 * fails or gets blocked, PAL Router can escalate the task to a more capable
 * model tier. This is particularly useful for swarm execution where some
 * tasks may exceed the capability of the initial model.
 *
 * Tiers:
 * - Tier 1: Fast/cheap models (default for simple tasks)
 * - Tier 2: Mid-range models (escalated on first failure)
 * - Tier 3: Heavy models (escalated on second failure)
 *
 * @see OmniUltraAgent_Kit/src/agents/swarm.rs (StoppingReason::AgentBlocked)
 * @see OmniUltraAgent_Kit/src/core/schema.rs (max_escalations)
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type EscalationTier = 1 | 2 | 3

export interface PalRoute {
    /** Current escalation tier. */
    tier: EscalationTier
    /** Whether escalation is possible. */
    canEscalate: boolean
    /** Escalation reason (if any). */
    reason: string | null
    /** History of escalation events. */
    history: EscalationEvent[]
}

export interface EscalationEvent {
    fromTier: EscalationTier
    toTier: EscalationTier
    reason: string
    taskId: string
    timestamp: number
}

export interface PalConfig {
    /** Max escalations per session (default: 3). */
    maxEscalations: number
    /** Tier definitions: model names per tier. */
    tiers: Record<EscalationTier, string>
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: PalConfig = {
    maxEscalations: 3,
    tiers: {
        1: "fast",       // Quick tasks
        2: "standard",   // Standard tasks
        3: "heavy",      // Complex reasoning
    },
}

// ── State ──────────────────────────────────────────────────────────────────

const sessions = new Map<string, PalRoute>()

function getRoute(sessionID: string): PalRoute {
    let route = sessions.get(sessionID)
    if (!route) {
        route = {
            tier: 1,
            canEscalate: true,
            reason: null,
            history: [],
        }
        sessions.set(sessionID, route)
    }
    return route
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get the current routing tier for a session.
 */
export function getCurrentTier(sessionID: string): EscalationTier {
    return getRoute(sessionID).tier
}

/**
 * Get the model name for the current tier.
 */
export function getModelForTier(tier: EscalationTier, config?: Partial<PalConfig>): string {
    const tiers = { ...DEFAULT_CONFIG.tiers, ...config?.tiers }
    return tiers[tier] ?? tiers[1]
}

/**
 * Attempt to escalate to the next tier.
 *
 * @returns The new tier, or null if escalation limit reached.
 */
export function escalate(
    sessionID: string,
    taskId: string,
    reason: string,
    config?: Partial<PalConfig>,
): EscalationTier | null {
    const route = getRoute(sessionID)
    const maxEscalations = config?.maxEscalations ?? DEFAULT_CONFIG.maxEscalations

    // Check if we can escalate
    if (!route.canEscalate) {
        log("[pal-router] Escalation blocked — limit reached", {
            sessionID,
            currentTier: route.tier,
            history: route.history.length,
        })
        return null
    }

    if (route.tier >= 3) {
        route.canEscalate = false
        log("[pal-router] Already at max tier", { sessionID, tier: route.tier })
        return null
    }

    if (route.history.length >= maxEscalations) {
        route.canEscalate = false
        log("[pal-router] Max escalations reached", {
            sessionID,
            max: maxEscalations,
            history: route.history.length,
        })
        return null
    }

    // Escalate
    const fromTier = route.tier
    const toTier = (route.tier + 1) as EscalationTier
    route.tier = toTier
    route.reason = reason

    route.history.push({
        fromTier,
        toTier,
        reason,
        taskId,
        timestamp: Date.now(),
    })

    log("[pal-router] Escalated", {
        sessionID,
        fromTier,
        toTier,
        reason,
        taskId,
        totalEscalations: route.history.length,
    })

    return toTier
}

/**
 * Check if a task failure should trigger escalation.
 *
 * Escalation triggers:
 * - Agent blocked (tool loop, no progress)
 * - Context overflow (model can't handle the task)
 * - Explicit failure with confidence < 0.3
 */
export function shouldEscalate(
    failureReason: string,
    confidence: number = 0.5,
): boolean {
    const lowerReason = failureReason.toLowerCase()

    // Definite escalation triggers
    const escalationTriggers = [
        "blocked",
        "agent_blocked",
        "context_overflow",
        "loop_detected",
        "circuit_breaker",
        "drift_unrecoverable",
        "max_turns_exceeded",
    ]

    if (escalationTriggers.some(t => lowerReason.includes(t))) {
        return true
    }

    // Low confidence also triggers escalation
    if (confidence < 0.3) {
        return true
    }

    return false
}

/**
 * Get the full routing state for a session.
 */
export function getRouteState(sessionID: string): PalRoute {
    return { ...getRoute(sessionID) }
}

/**
 * Reset routing for a session (e.g., on session delete).
 */
export function resetRoute(sessionID: string): void {
    sessions.delete(sessionID)
}

/**
 * Format PAL routing info for display.
 */
export function formatRouteInfo(sessionID: string, config?: Partial<PalConfig>): string {
    const route = getRoute(sessionID)
    const model = getModelForTier(route.tier, config)

    const lines = [
        `PAL Routing: Tier ${route.tier} (${model})`,
        `  Escalations: ${route.history.length}/${config?.maxEscalations ?? DEFAULT_CONFIG.maxEscalations}`,
        `  Can escalate: ${route.canEscalate}`,
    ]

    if (route.history.length > 0) {
        lines.push(`  History:`)
        for (const event of route.history) {
            lines.push(`    T${event.fromTier}→T${event.toTier}: ${event.reason} (task: ${event.taskId})`)
        }
    }

    return lines.join("\n")
}
