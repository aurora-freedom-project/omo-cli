/**
 * ReasoningBank — Pattern learning and trajectory tracking.
 *
 * Feature #18 from the 27-feature integration plan.
 * Inspired by ruflo's ReasoningBank: learns from successes/failures.
 *
 * Extends the memory system with trajectory tracking:
 *  - Records task outcomes (success/failure) with confidence scores
 *  - Retrieves similar past approaches for new tasks
 *  - Boosts retrieval weight for successful patterns
 */

import { log } from "../../shared"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TrajectoryEntry {
    readonly id: string
    readonly taskDescription: string
    readonly approach: string
    readonly outcome: "success" | "failure" | "partial"
    readonly confidence: number       // 0.0 - 1.0
    readonly tags: readonly string[]
    readonly timestamp: string
    readonly sessionId?: string
    readonly error?: string
}

export interface ReasoningMatch {
    readonly entry: TrajectoryEntry
    readonly relevance: number   // 0.0 - 1.0 (BM25 + outcome weighting)
}

// ─── In-memory trajectory store ─────────────────────────────────────────────
// In production, this should be backed by SurrealDB's `trajectory` table.
// For now, in-memory with session-scoped lifecycle.

const _trajectories: TrajectoryEntry[] = []
const MAX_TRAJECTORIES = 500

/** Record a task outcome for pattern learning. */
export function recordTrajectory(entry: Omit<TrajectoryEntry, "id" | "timestamp">): TrajectoryEntry {
    const full: TrajectoryEntry = {
        ...entry,
        id: `trj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
    }

    _trajectories.push(full)

    // Evict oldest if over capacity
    if (_trajectories.length > MAX_TRAJECTORIES) {
        _trajectories.splice(0, _trajectories.length - MAX_TRAJECTORIES)
    }

    log(`[reasoning-bank] Recorded trajectory: ${full.outcome} for "${full.taskDescription.slice(0, 60)}"`)
    return full
}

/** Find similar past trajectories using keyword matching + outcome weighting. */
export function findSimilarTrajectories(query: string, topK: number = 5): ReasoningMatch[] {
    if (_trajectories.length === 0) return []

    const queryTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2)

    const scored = _trajectories.map(entry => {
        const entryTokens = `${entry.taskDescription} ${entry.approach} ${entry.tags.join(" ")}`
            .toLowerCase().split(/\s+/)

        // BM25-like keyword matching
        let matchCount = 0
        for (const qt of queryTokens) {
            if (entryTokens.some(et => et.includes(qt))) matchCount++
        }
        const keywordScore = queryTokens.length > 0 ? matchCount / queryTokens.length : 0

        // Outcome weighting: boost successful trajectories
        const outcomeWeight = entry.outcome === "success" ? 1.2
            : entry.outcome === "partial" ? 0.8
            : 0.5  // failure (still useful — what NOT to do)

        // Confidence weighting
        const confidenceWeight = 0.5 + (entry.confidence * 0.5)

        const relevance = Math.min(1.0, keywordScore * outcomeWeight * confidenceWeight)

        return { entry, relevance }
    })

    return scored
        .filter(m => m.relevance > 0.1)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, topK)
}

/** Format trajectory matches as context for an agent. */
export function formatTrajectoryContext(matches: ReasoningMatch[]): string {
    if (matches.length === 0) return ""

    const entries = matches.map((m, i) =>
        `${i + 1}. [${m.entry.outcome.toUpperCase()}] ${m.entry.taskDescription}
   Approach: ${m.entry.approach}
   Confidence: ${(m.entry.confidence * 100).toFixed(0)}%
   Relevance: ${(m.relevance * 100).toFixed(0)}%${m.entry.error ? `\n   Error: ${m.entry.error}` : ""}`
    ).join("\n\n")

    return `\n<reasoning-bank>
## Similar Past Trajectories
${entries}
</reasoning-bank>\n`
}

/** Get trajectory statistics. */
export function getTrajectoryStats(): {
    total: number
    successes: number
    failures: number
    avgConfidence: number
} {
    const successes = _trajectories.filter(t => t.outcome === "success").length
    const failures = _trajectories.filter(t => t.outcome === "failure").length
    const avgConfidence = _trajectories.length > 0
        ? _trajectories.reduce((sum, t) => sum + t.confidence, 0) / _trajectories.length
        : 0

    return { total: _trajectories.length, successes, failures, avgConfidence }
}

/** Clear all trajectories (for testing). */
export function clearTrajectories(): void {
    _trajectories.length = 0
}
