/**
 * Kill Chain State Machine — MITRE ATT&CK stage tracking.
 *
 * Formalized 7-stage pipeline with state tracking for red/blue team workflows.
 * Enables auto-chaining of phases and backtracking to unexplored branches.
 *
 * Stages (Lockheed Martin Cyber Kill Chain):
 * 1. Reconnaissance → 2. Weaponization → 3. Delivery →
 * 4. Exploitation → 5. Installation → 6. Command & Control → 7. Actions on Objectives
 *
 * Sources: CAI (aliasrobotics), Raptor, Redamon, PentAGI
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type KillChainStage =
    | "reconnaissance"
    | "weaponization"
    | "delivery"
    | "exploitation"
    | "installation"
    | "command_and_control"
    | "actions_on_objectives"

export type StageStatus = "pending" | "active" | "completed" | "skipped" | "failed"

export interface StageEntry {
    stage: KillChainStage
    status: StageStatus
    findings: Finding[]
    startedAt: number | null
    completedAt: number | null
    tools: string[]
}

export interface Finding {
    id: string
    description: string
    severity: "critical" | "high" | "medium" | "low" | "info"
    evidence: string
    mitreTechnique?: string // e.g., "T1595.002"
    timestamp: number
}

export interface KillChainState {
    sessionID: string
    currentStage: KillChainStage
    stages: Record<KillChainStage, StageEntry>
    transitions: StageTransition[]
    createdAt: number
}

export interface StageTransition {
    from: KillChainStage
    to: KillChainStage
    reason: string
    timestamp: number
}

// ── Constants ──────────────────────────────────────────────────────────────

export const STAGE_ORDER: KillChainStage[] = [
    "reconnaissance",
    "weaponization",
    "delivery",
    "exploitation",
    "installation",
    "command_and_control",
    "actions_on_objectives",
]

/** Tools commonly used at each stage. */
export const STAGE_TOOLS: Record<KillChainStage, string[]> = {
    reconnaissance: ["dns_resolve", "port_check", "web_crawl", "tls_inspect", "web_query"],
    weaponization: ["pattern_scan", "skill_search", "sandbox_exec"],
    delivery: ["web_crawl", "sandbox_exec"],
    exploitation: ["sandbox_exec", "input_guard_test", "prompt_test"],
    installation: ["sandbox_exec", "write_file"],
    command_and_control: ["port_check", "dns_resolve", "sandbox_exec"],
    actions_on_objectives: ["pattern_scan", "fact_extract", "web_crawl"],
}

/** MITRE ATT&CK tactic mapping. */
export const MITRE_TACTICS: Record<KillChainStage, string> = {
    reconnaissance: "TA0043",
    weaponization: "TA0042",
    delivery: "TA0001",
    exploitation: "TA0002",
    installation: "TA0003",
    command_and_control: "TA0011",
    actions_on_objectives: "TA0040",
}

// ── State Management ───────────────────────────────────────────────────────

const sessions = new Map<string, KillChainState>()

function createEmptyStages(): Record<KillChainStage, StageEntry> {
    const stages = {} as Record<KillChainStage, StageEntry>
    for (const stage of STAGE_ORDER) {
        stages[stage] = {
            stage,
            status: "pending",
            findings: [],
            startedAt: null,
            completedAt: null,
            tools: STAGE_TOOLS[stage],
        }
    }
    return stages
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize a kill chain session. Returns the initial state.
 */
export function initKillChain(sessionID: string): KillChainState {
    const state: KillChainState = {
        sessionID,
        currentStage: "reconnaissance",
        stages: createEmptyStages(),
        transitions: [],
        createdAt: Date.now(),
    }
    state.stages.reconnaissance.status = "active"
    state.stages.reconnaissance.startedAt = Date.now()
    sessions.set(sessionID, state)
    log("[kill-chain] Initialized", { sessionID })
    return state
}

/**
 * Get the current kill chain state, or null if not initialized.
 */
export function getKillChainState(sessionID: string): KillChainState | null {
    return sessions.get(sessionID) ?? null
}

/**
 * Get the current active stage.
 */
export function getCurrentStage(sessionID: string): KillChainStage | null {
    return sessions.get(sessionID)?.currentStage ?? null
}

/**
 * Advance to the next stage in the kill chain.
 * Returns the new stage, or null if already at the final stage.
 */
export function advanceStage(
    sessionID: string,
    reason: string = "stage completed",
): KillChainStage | null {
    const state = sessions.get(sessionID)
    if (!state) return null

    const currentIdx = STAGE_ORDER.indexOf(state.currentStage)
    if (currentIdx >= STAGE_ORDER.length - 1) return null // Already at final stage

    // Complete current stage
    const currentEntry = state.stages[state.currentStage]
    currentEntry.status = "completed"
    currentEntry.completedAt = Date.now()

    // Advance to next
    const nextStage = STAGE_ORDER[currentIdx + 1]
    state.currentStage = nextStage
    state.stages[nextStage].status = "active"
    state.stages[nextStage].startedAt = Date.now()

    state.transitions.push({
        from: STAGE_ORDER[currentIdx],
        to: nextStage,
        reason,
        timestamp: Date.now(),
    })

    log("[kill-chain] Advanced", { sessionID, from: STAGE_ORDER[currentIdx], to: nextStage, reason })
    return nextStage
}

/**
 * Jump to a specific stage (for backtracking or skipping).
 */
export function jumpToStage(
    sessionID: string,
    target: KillChainStage,
    reason: string,
): boolean {
    const state = sessions.get(sessionID)
    if (!state) return false

    const from = state.currentStage
    state.currentStage = target
    state.stages[target].status = "active"
    state.stages[target].startedAt = Date.now()

    // Mark skipped stages
    const fromIdx = STAGE_ORDER.indexOf(from)
    const toIdx = STAGE_ORDER.indexOf(target)
    if (toIdx > fromIdx) {
        for (let i = fromIdx; i < toIdx; i++) {
            if (state.stages[STAGE_ORDER[i]].status === "active") {
                state.stages[STAGE_ORDER[i]].status = "skipped"
            }
        }
    }

    state.transitions.push({ from, to: target, reason, timestamp: Date.now() })
    log("[kill-chain] Jumped", { sessionID, from, to: target, reason })
    return true
}

/**
 * Mark the current stage as failed.
 */
export function failStage(sessionID: string, reason: string): boolean {
    const state = sessions.get(sessionID)
    if (!state) return false

    state.stages[state.currentStage].status = "failed"
    state.stages[state.currentStage].completedAt = Date.now()
    log("[kill-chain] Stage failed", { sessionID, stage: state.currentStage, reason })
    return true
}

/**
 * Add a finding to the current stage.
 */
export function addFinding(
    sessionID: string,
    finding: Omit<Finding, "id" | "timestamp">,
): string | null {
    const state = sessions.get(sessionID)
    if (!state) return null

    const id = `F-${state.currentStage.slice(0, 4).toUpperCase()}-${Date.now().toString(36)}`
    const entry: Finding = {
        ...finding,
        id,
        timestamp: Date.now(),
    }

    state.stages[state.currentStage].findings.push(entry)
    log("[kill-chain] Finding added", { sessionID, stage: state.currentStage, id, severity: finding.severity })
    return id
}

/**
 * Get all findings across all stages.
 */
export function getAllFindings(sessionID: string): Finding[] {
    const state = sessions.get(sessionID)
    if (!state) return []

    return STAGE_ORDER.flatMap(stage => state.stages[stage].findings)
}

/**
 * Get suggested tools for the current stage.
 */
export function getSuggestedTools(sessionID: string): string[] {
    const state = sessions.get(sessionID)
    if (!state) return []
    return STAGE_TOOLS[state.currentStage] || []
}

/**
 * Calculate overall progress as a percentage.
 */
export function getProgress(sessionID: string): number {
    const state = sessions.get(sessionID)
    if (!state) return 0

    const completed = STAGE_ORDER.filter(
        s => state.stages[s].status === "completed" || state.stages[s].status === "skipped",
    ).length

    return Math.round((completed / STAGE_ORDER.length) * 100)
}

/**
 * Format kill chain status for display.
 */
export function formatKillChainStatus(sessionID: string): string | null {
    const state = sessions.get(sessionID)
    if (!state) return null

    const lines: string[] = [
        `Kill Chain [${state.sessionID}] — Progress: ${getProgress(sessionID)}%`,
        "",
    ]

    for (const stage of STAGE_ORDER) {
        const entry = state.stages[stage]
        const icon = entry.status === "completed" ? "✅"
            : entry.status === "active" ? "🔵"
            : entry.status === "failed" ? "❌"
            : entry.status === "skipped" ? "⏭️"
            : "⬜"

        const findingCount = entry.findings.length > 0 ? ` [${entry.findings.length} findings]` : ""
        const mitre = MITRE_TACTICS[stage]
        lines.push(`  ${icon} ${stage} (${mitre})${findingCount}`)
    }

    if (state.transitions.length > 0) {
        lines.push("", "Transitions:")
        for (const t of state.transitions.slice(-5)) {
            lines.push(`  ${t.from} → ${t.to}: ${t.reason}`)
        }
    }

    return lines.join("\n")
}

/**
 * Reset/destroy kill chain state for a session.
 */
export function resetKillChain(sessionID: string): void {
    sessions.delete(sessionID)
}
