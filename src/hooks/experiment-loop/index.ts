/**
 * Experiment Loop — Autonomous iterative security testing.
 *
 * Learned from Karpathy's autoresearch pattern:
 *   LOOP FOREVER: Hypothesize → Execute → Score → Keep/Discard
 *
 * Maps autoresearch concepts to omo-cli security testing:
 *   - train.py (modified code)    → target system / attack payload
 *   - val_bpb (metric)            → CVSS score from cvss-scoring
 *   - program.md (skill)          → Kill Chain stage instructions
 *   - results.tsv (log)           → ExperimentResult[] in ReasoningBank
 *   - git branch (isolation)      → Git worktree isolation
 *   - Keep/Discard                → Kill Chain advance/backtrack
 *
 * Usage:
 *   const loop = createExperimentLoop({ baseline: null, maxExperiments: 20 })
 *   loop.recordExperiment({ ... })
 *   const shouldContinue = loop.shouldContinue()
 *   const table = loop.formatResultsTable()
 *
 * @see https://github.com/karpathy/autoresearch
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type ExperimentStatus = "keep" | "discard" | "crash"

export interface ExperimentResult {
    /** Unique experiment ID (auto-generated). */
    experimentId: string
    /** Kill Chain stage where this experiment ran (e.g. "weaponization"). */
    killChainStage: string
    /** CVSS score achieved by this experiment. */
    cvssScore: number
    /** CVSS score of the previous best (for delta calculation). */
    previousBestScore: number
    /** Delta improvement (cvssScore - previousBestScore). */
    delta: number
    /** Whether this experiment was kept or discarded. */
    status: ExperimentStatus
    /** Short description of what was tried. */
    description: string
    /** MITRE ATT&CK technique ID (e.g. "T1059"). */
    mitreTechnique?: string
    /** Duration in ms. */
    durationMs?: number
    /** Timestamp. */
    timestamp: number
}

export interface ExperimentLoopConfig {
    /** Maximum experiments before stopping (default: 20). */
    maxExperiments: number
    /** Minimum CVSS delta to consider an improvement (default: 0.1). */
    improvementThreshold: number
    /** Maximum consecutive discards before trying a different approach (default: 5). */
    maxConsecutiveDiscards: number
    /** Maximum consecutive crashes before aborting (default: 3). */
    maxConsecutiveCrashes: number
}

export interface ExperimentLoopState {
    /** All experiment results. */
    results: ExperimentResult[]
    /** Current best CVSS score. */
    bestScore: number
    /** Current Kill Chain stage. */
    currentStage: string
    /** Number of consecutive discards. */
    consecutiveDiscards: number
    /** Number of consecutive crashes. */
    consecutiveCrashes: number
    /** Whether the loop is still active. */
    active: boolean
    /** Reason for stopping (if stopped). */
    stopReason: string | null
}

export interface ExperimentStats {
    total: number
    kept: number
    discarded: number
    crashed: number
    bestScore: number
    avgScore: number
    avgDelta: number
    totalDurationMs: number
    stagesProgressed: string[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ExperimentLoopConfig = {
    maxExperiments: 20,
    improvementThreshold: 0.1,
    maxConsecutiveDiscards: 5,
    maxConsecutiveCrashes: 3,
}

// ── Experiment Loop ────────────────────────────────────────────────────────

/**
 * Create an experiment loop controller.
 *
 * The loop tracks experiments, decides keep/discard based on CVSS score
 * improvement, and signals when to stop trying.
 */
export function createExperimentLoop(
    options?: Partial<ExperimentLoopConfig> & {
        /** Starting CVSS score (null for first experiment = baseline). */
        baseline?: number | null
        /** Starting Kill Chain stage. */
        startStage?: string
    },
): {
    /** Record a completed experiment and get keep/discard decision. */
    recordExperiment: (input: {
        killChainStage: string
        cvssScore: number
        description: string
        status?: ExperimentStatus
        mitreTechnique?: string
        durationMs?: number
    }) => ExperimentResult
    /** Check if the loop should continue. */
    shouldContinue: () => boolean
    /** Get all results. */
    getResults: () => ExperimentResult[]
    /** Get current state. */
    getState: () => ExperimentLoopState
    /** Get aggregate statistics. */
    getStats: () => ExperimentStats
    /** Format results as a TSV table (autoresearch style). */
    formatResultsTable: () => string
    /** Format results as a human-readable summary. */
    formatSummary: () => string
    /** Manually stop the loop. */
    stop: (reason: string) => void
    /** Get the config. */
    getConfig: () => ExperimentLoopConfig
} {
    const config: ExperimentLoopConfig = { ...DEFAULT_CONFIG, ...options }
    const state: ExperimentLoopState = {
        results: [],
        bestScore: options?.baseline ?? 0,
        currentStage: options?.startStage ?? "reconnaissance",
        consecutiveDiscards: 0,
        consecutiveCrashes: 0,
        active: true,
        stopReason: null,
    }

    let experimentCounter = 0

    function recordExperiment(input: {
        killChainStage: string
        cvssScore: number
        description: string
        status?: ExperimentStatus
        mitreTechnique?: string
        durationMs?: number
    }): ExperimentResult {
        experimentCounter++
        const previousBest = state.bestScore
        const delta = Number((input.cvssScore - previousBest).toFixed(4))

        // Determine status: keep if improved, discard if not
        let status: ExperimentStatus
        if (input.status === "crash") {
            status = "crash"
        } else if (input.status) {
            status = input.status
        } else {
            status = delta >= config.improvementThreshold ? "keep" : "discard"
        }

        const result: ExperimentResult = {
            experimentId: `exp-${String(experimentCounter).padStart(3, "0")}`,
            killChainStage: input.killChainStage,
            cvssScore: input.cvssScore,
            previousBestScore: previousBest,
            delta,
            status,
            description: input.description,
            mitreTechnique: input.mitreTechnique,
            durationMs: input.durationMs,
            timestamp: Date.now(),
        }

        state.results.push(result)
        state.currentStage = input.killChainStage

        // Update counters based on status
        if (status === "keep") {
            state.bestScore = input.cvssScore
            state.consecutiveDiscards = 0
            state.consecutiveCrashes = 0
            log("[experiment-loop] KEEP", {
                id: result.experimentId,
                score: input.cvssScore,
                delta,
                stage: input.killChainStage,
            })
        } else if (status === "crash") {
            state.consecutiveCrashes++
            state.consecutiveDiscards = 0
            log("[experiment-loop] CRASH", {
                id: result.experimentId,
                description: input.description,
                consecutiveCrashes: state.consecutiveCrashes,
            })
        } else {
            state.consecutiveDiscards++
            state.consecutiveCrashes = 0
            log("[experiment-loop] DISCARD", {
                id: result.experimentId,
                score: input.cvssScore,
                delta,
                consecutiveDiscards: state.consecutiveDiscards,
            })
        }

        // Check stop conditions
        if (state.results.length >= config.maxExperiments) {
            state.active = false
            state.stopReason = `max_experiments_reached (${config.maxExperiments})`
        } else if (state.consecutiveDiscards >= config.maxConsecutiveDiscards) {
            state.active = false
            state.stopReason = `stuck_no_improvement (${config.maxConsecutiveDiscards} consecutive discards)`
        } else if (state.consecutiveCrashes >= config.maxConsecutiveCrashes) {
            state.active = false
            state.stopReason = `too_many_crashes (${config.maxConsecutiveCrashes} consecutive crashes)`
        }

        return result
    }

    function shouldContinue(): boolean {
        return state.active
    }

    function getResults(): ExperimentResult[] {
        return [...state.results]
    }

    function getState(): ExperimentLoopState {
        return { ...state, results: [...state.results] }
    }

    function getStats(): ExperimentStats {
        const kept = state.results.filter(r => r.status === "keep")
        const discarded = state.results.filter(r => r.status === "discard")
        const crashed = state.results.filter(r => r.status === "crash")
        const nonCrash = state.results.filter(r => r.status !== "crash")

        const scores = nonCrash.map(r => r.cvssScore)
        const deltas = kept.map(r => r.delta)

        const stageSet = new Set<string>()
        for (const r of kept) stageSet.add(r.killChainStage)

        return {
            total: state.results.length,
            kept: kept.length,
            discarded: discarded.length,
            crashed: crashed.length,
            bestScore: state.bestScore,
            avgScore: scores.length > 0
                ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
                : 0,
            avgDelta: deltas.length > 0
                ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(4))
                : 0,
            totalDurationMs: state.results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0),
            stagesProgressed: [...stageSet],
        }
    }

    function formatResultsTable(): string {
        const header = "id\tstage\tcvss\tdelta\tstatus\tmitre\tdescription"
        const rows = state.results.map(r =>
            [
                r.experimentId,
                r.killChainStage,
                r.cvssScore.toFixed(1),
                (r.delta >= 0 ? "+" : "") + r.delta.toFixed(2),
                r.status,
                r.mitreTechnique ?? "-",
                r.description,
            ].join("\t"),
        )
        return [header, ...rows].join("\n")
    }

    function formatSummary(): string {
        const stats = getStats()
        const statusIcon = state.active ? "🔄" : "⏹️"
        const scoreIcon = stats.bestScore >= 9.0 ? "🔴" : stats.bestScore >= 7.0 ? "🟠" : stats.bestScore >= 4.0 ? "🟡" : "🟢"

        const lines = [
            `${statusIcon} Experiment Loop ${state.active ? "(active)" : `(stopped: ${state.stopReason})`}`,
            `${scoreIcon} Best CVSS: ${stats.bestScore.toFixed(1)}`,
            `📊 Experiments: ${stats.total} total | ${stats.kept} kept | ${stats.discarded} discarded | ${stats.crashed} crashed`,
            `📈 Avg delta (kept): ${stats.avgDelta >= 0 ? "+" : ""}${stats.avgDelta.toFixed(2)}`,
        ]

        if (stats.stagesProgressed.length > 0) {
            lines.push(`🎯 Stages: ${stats.stagesProgressed.join(" → ")}`)
        }

        if (stats.totalDurationMs > 0) {
            lines.push(`⏱️ Total time: ${Math.round(stats.totalDurationMs / 1000)}s`)
        }

        return lines.join("\n")
    }

    function stop(reason: string): void {
        state.active = false
        state.stopReason = reason
        log("[experiment-loop] Stopped", { reason, experiments: state.results.length })
    }

    function getConfig(): ExperimentLoopConfig {
        return { ...config }
    }

    return {
        recordExperiment,
        shouldContinue,
        getResults,
        getState,
        getStats,
        formatResultsTable,
        formatSummary,
        stop,
        getConfig,
    }
}
