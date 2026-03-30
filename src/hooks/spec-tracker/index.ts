/**
 * Spec Artifact Tracker — SpecKit-inspired specification lifecycle tracking.
 *
 * Learned from SpecKit (GitHub, ⭐83K): Specification-Driven Development treats specs
 * as first-class, executable artifacts. This module tracks the lifecycle of spec
 * documents through phases:
 *   Constitution → Specification → Plan → Tasks → Implementation → Validation
 *
 * It detects "spec drift" — when implementation diverges from the approved plan —
 * by comparing task completion status against the original specification.
 *
 * Integration:
 * - Reads spec artifacts from `.agent/specs/` directory
 * - Monitors `implementation_plan.md` and task files for drift
 * - Reports drift metrics to the Context Planner for routing decisions
 *
 * @see https://github.com/github/spec-kit
 * @see Phase 6.4 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type SpecPhase =
    | "constitution"   // Governing principles
    | "specification"  // What to build (requirements)
    | "plan"           // How to build it (design)
    | "tasks"          // Actionable task breakdown
    | "implementation" // Code being written
    | "validation"     // Tests and verification

export interface SpecArtifact {
    /** Artifact identifier (e.g., filename). */
    id: string
    /** Current lifecycle phase. */
    phase: SpecPhase
    /** Human-readable title. */
    title: string
    /** Creation timestamp. */
    createdAt: number
    /** Last modified timestamp. */
    updatedAt: number
    /** Content hash for change detection. */
    contentHash: string
    /** Key requirements extracted from the spec. */
    requirements: string[]
    /** Task completion ratio (for tasks/implementation phases). */
    completionRatio?: number
}

export interface SpecDrift {
    /** Artifact that drifted. */
    artifactId: string
    /** Type of drift detected. */
    type: "missing_requirement" | "unplanned_change" | "stale_spec" | "phase_skip"
    /** Description of the drift. */
    description: string
    /** Severity: how much this matters. */
    severity: "low" | "medium" | "high"
    /** Detected at timestamp. */
    detectedAt: number
}

export interface SpecTrackerState {
    /** All tracked artifacts. */
    artifacts: Map<string, SpecArtifact>
    /** Detected drifts. */
    drifts: SpecDrift[]
    /** Current phase of the overall project. */
    currentPhase: SpecPhase
    /** Phase transition history. */
    phaseHistory: Array<{ phase: SpecPhase; timestamp: number }>
}

export interface SpecTrackerMetrics {
    /** Number of tracked artifacts. */
    artifactCount: number
    /** Number of active drifts. */
    driftCount: number
    /** Drift by severity. */
    driftBySeverity: Record<string, number>
    /** Current phase. */
    currentPhase: SpecPhase
    /** Overall health score (0-1, lower = more drift). */
    healthScore: number
    /** Task completion ratio (if in tasks/implementation phase). */
    completionRatio: number | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const PHASE_ORDER: SpecPhase[] = [
    "constitution", "specification", "plan", "tasks", "implementation", "validation",
]

/** Hash function (simple FNV-1a for content change detection). */
export function hashContent(content: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < content.length; i++) {
        hash ^= content.charCodeAt(i)
        hash = (hash * 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, "0")
}

// ── Requirement Extraction (pure) ──────────────────────────────────────────

/**
 * Extract requirements from spec content.
 *
 * Looks for:
 * - Checklist items: `- [ ] requirement` or `- [x] requirement`
 * - MUST/SHALL/SHOULD statements
 * - Numbered items in specification sections
 */
export function extractRequirements(content: string): string[] {
    const requirements: string[] = []
    const lines = content.split("\n")

    for (const line of lines) {
        const trimmed = line.trim()

        // Checklist items
        const checkMatch = trimmed.match(/^-\s*\[[ x/]\]\s*(.+)/)
        if (checkMatch) {
            requirements.push(checkMatch[1].trim())
            continue
        }

        // MUST/SHALL/SHOULD statements
        if (/\b(?:MUST|SHALL|SHOULD|REQUIRED)\b/.test(trimmed) && trimmed.length > 10) {
            requirements.push(trimmed.slice(0, 200))
            continue
        }

        // Numbered requirements (e.g., "1. The system shall...")
        const numberedMatch = trimmed.match(/^\d+\.\s+(.{10,})/)
        if (numberedMatch && /\b(?:must|shall|should|will|need|require)\b/i.test(numberedMatch[1])) {
            requirements.push(numberedMatch[1].trim().slice(0, 200))
        }
    }

    return requirements
}

/**
 * Parse task completion from content.
 *
 * Counts `- [x]` (done) vs `- [ ]` (pending) items.
 */
export function parseTaskCompletion(content: string): { done: number; total: number; ratio: number } {
    const lines = content.split("\n")
    let done = 0
    let total = 0

    for (const line of lines) {
        const trimmed = line.trim()

        if (/^-\s*\[x\]/i.test(trimmed)) {
            done++
            total++
        } else if (/^-\s*\[[ /]\]/.test(trimmed)) {
            total++
        }
    }

    return {
        done,
        total,
        ratio: total > 0 ? done / total : 0,
    }
}

// ── Spec Tracker ───────────────────────────────────────────────────────────

/**
 * Create a Spec Artifact Tracker instance.
 */
export function createSpecTracker() {
    const state: SpecTrackerState = {
        artifacts: new Map(),
        drifts: [],
        currentPhase: "constitution",
        phaseHistory: [{ phase: "constitution", timestamp: Date.now() }],
    }

    /**
     * Register or update a spec artifact.
     */
    function trackArtifact(
        id: string,
        phase: SpecPhase,
        title: string,
        content: string,
    ): SpecArtifact {
        const now = Date.now()
        const contentHash = hashContent(content)
        const requirements = extractRequirements(content)

        const existing = state.artifacts.get(id)
        const isUpdate = existing !== undefined

        // Detect stale spec: phase has advanced but old spec hasn't been updated
        if (isUpdate && existing.contentHash !== contentHash) {
            const currentPhaseIdx = PHASE_ORDER.indexOf(state.currentPhase)
            const artifactPhaseIdx = PHASE_ORDER.indexOf(phase)

            if (artifactPhaseIdx < currentPhaseIdx - 1) {
                state.drifts.push({
                    artifactId: id,
                    type: "stale_spec",
                    description: `Artifact "${title}" in phase "${phase}" modified while project is in phase "${state.currentPhase}"`,
                    severity: "medium",
                    detectedAt: now,
                })
            }
        }

        // Parse task completion if applicable
        let completionRatio: number | undefined
        if (phase === "tasks" || phase === "implementation") {
            const { ratio } = parseTaskCompletion(content)
            completionRatio = ratio
        }

        const artifact: SpecArtifact = {
            id,
            phase,
            title,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            contentHash,
            requirements,
            completionRatio,
        }

        state.artifacts.set(id, artifact)

        // Auto-advance phase
        const phaseIdx = PHASE_ORDER.indexOf(phase)
        const currentIdx = PHASE_ORDER.indexOf(state.currentPhase)
        if (phaseIdx > currentIdx) {
            // Check for skipped phases
            if (phaseIdx > currentIdx + 1) {
                const skippedPhases = PHASE_ORDER.slice(currentIdx + 1, phaseIdx)
                for (const skipped of skippedPhases) {
                    state.drifts.push({
                        artifactId: id,
                        type: "phase_skip",
                        description: `Phase "${skipped}" was skipped (jumped from "${state.currentPhase}" to "${phase}")`,
                        severity: "high",
                        detectedAt: now,
                    })
                }
            }

            state.currentPhase = phase
            state.phaseHistory.push({ phase, timestamp: now })
        }

        log("[spec-tracker] Artifact tracked", {
            id,
            phase,
            isUpdate,
            requirements: requirements.length,
            completionRatio,
        })

        return artifact
    }

    /**
     * Check for requirement coverage drift.
     *
     * Compares requirements in spec artifacts against tasks/implementation artifacts.
     */
    function checkRequirementCoverage(): SpecDrift[] {
        const newDrifts: SpecDrift[] = []
        const now = Date.now()

        // Collect all requirements from spec/plan phases
        const specRequirements: string[] = []
        for (const artifact of state.artifacts.values()) {
            if (artifact.phase === "specification" || artifact.phase === "plan") {
                specRequirements.push(...artifact.requirements)
            }
        }

        // Collect all tasks from task phase
        const taskRequirements: string[] = []
        for (const artifact of state.artifacts.values()) {
            if (artifact.phase === "tasks") {
                taskRequirements.push(...artifact.requirements)
            }
        }

        // Simple keyword-based check: each spec requirement should have a matching task
        for (const specReq of specRequirements) {
            const specKeywords = specReq.toLowerCase().split(/\s+/).filter(w => w.length > 3)
            const hasMatch = taskRequirements.some(taskReq => {
                const taskKeywords = taskReq.toLowerCase().split(/\s+/).filter(w => w.length > 3)
                const overlap = specKeywords.filter(k => taskKeywords.includes(k))
                return overlap.length >= Math.min(2, specKeywords.length * 0.3)
            })

            if (!hasMatch && specKeywords.length > 2) {
                const drift: SpecDrift = {
                    artifactId: "coverage-check",
                    type: "missing_requirement",
                    description: `Requirement "${specReq.slice(0, 80)}..." has no matching task`,
                    severity: "medium",
                    detectedAt: now,
                }
                newDrifts.push(drift)
                state.drifts.push(drift)
            }
        }

        return newDrifts
    }

    /**
     * Get tracker metrics.
     */
    function getMetrics(): SpecTrackerMetrics {
        const driftBySeverity: Record<string, number> = { low: 0, medium: 0, high: 0 }
        for (const drift of state.drifts) {
            driftBySeverity[drift.severity]++
        }

        // Health score: 1.0 = no drift, 0.0 = critical drift
        const driftPenalty = (driftBySeverity.high ?? 0) * 0.3
            + (driftBySeverity.medium ?? 0) * 0.15
            + (driftBySeverity.low ?? 0) * 0.05
        const healthScore = Math.max(0, 1.0 - driftPenalty)

        // Find task completion
        let completionRatio: number | null = null
        for (const artifact of state.artifacts.values()) {
            if (artifact.completionRatio !== undefined) {
                completionRatio = artifact.completionRatio
            }
        }

        return {
            artifactCount: state.artifacts.size,
            driftCount: state.drifts.length,
            driftBySeverity,
            currentPhase: state.currentPhase,
            healthScore,
            completionRatio,
        }
    }

    /**
     * Get all tracked artifacts.
     */
    function getArtifacts(): SpecArtifact[] {
        return [...state.artifacts.values()]
    }

    /**
     * Get all detected drifts.
     */
    function getDrifts(): SpecDrift[] {
        return [...state.drifts]
    }

    /**
     * Clear all drifts (after addressing them).
     */
    function clearDrifts(): void {
        state.drifts = []
    }

    /**
     * Reset tracker (for testing).
     */
    function reset(): void {
        state.artifacts.clear()
        state.drifts = []
        state.currentPhase = "constitution"
        state.phaseHistory = [{ phase: "constitution", timestamp: Date.now() }]
    }

    return {
        trackArtifact,
        checkRequirementCoverage,
        getMetrics,
        getArtifacts,
        getDrifts,
        clearDrifts,
        reset,
    }
}
