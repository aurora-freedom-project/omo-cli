/**
 * Tests for Experiment Loop hook.
 *
 * Validates the autoresearch-inspired iterative experiment pattern:
 * - Keep/discard decisions based on CVSS score delta
 * - Stop conditions (max experiments, consecutive discards, crashes)
 * - Statistics and reporting
 * - TSV results formatting
 */

import { describe, it, expect } from "vitest"
import { createExperimentLoop, type ExperimentStatus } from "./index"

// ── Factory ────────────────────────────────────────────────────────────────

function makeLoop(opts?: Parameters<typeof createExperimentLoop>[0]) {
    return createExperimentLoop({
        maxExperiments: 10,
        improvementThreshold: 0.1,
        maxConsecutiveDiscards: 3,
        maxConsecutiveCrashes: 2,
        baseline: 0,
        ...opts,
    })
}

// ── Basic Lifecycle ────────────────────────────────────────────────────────

describe("createExperimentLoop", () => {
    it("should create an active loop with default state", () => {
        const loop = makeLoop()
        const state = loop.getState()

        expect(state.active).toBe(true)
        expect(state.results).toHaveLength(0)
        expect(state.bestScore).toBe(0)
        expect(state.stopReason).toBeNull()
    })

    it("should accept a baseline score", () => {
        const loop = makeLoop({ baseline: 5.0 })
        expect(loop.getState().bestScore).toBe(5.0)
    })

    it("should accept a start stage", () => {
        const loop = makeLoop({ startStage: "exploitation" })
        expect(loop.getState().currentStage).toBe("exploitation")
    })
})

// ── Keep/Discard Logic ─────────────────────────────────────────────────────

describe("recordExperiment — keep/discard", () => {
    it("should KEEP when CVSS improves above threshold", () => {
        const loop = makeLoop({ baseline: 5.0, improvementThreshold: 0.1 })

        const result = loop.recordExperiment({
            killChainStage: "exploitation",
            cvssScore: 5.5,
            description: "Found SQLi in login form",
        })

        expect(result.status).toBe("keep")
        expect(result.delta).toBeCloseTo(0.5, 1)
        expect(loop.getState().bestScore).toBe(5.5)
    })

    it("should DISCARD when CVSS does not improve enough", () => {
        const loop = makeLoop({ baseline: 5.0, improvementThreshold: 0.5 })

        const result = loop.recordExperiment({
            killChainStage: "exploitation",
            cvssScore: 5.3,
            description: "Tried XSS — minor finding",
        })

        expect(result.status).toBe("discard")
        expect(loop.getState().bestScore).toBe(5.0) // unchanged
    })

    it("should DISCARD when score decreases", () => {
        const loop = makeLoop({ baseline: 7.0 })

        const result = loop.recordExperiment({
            killChainStage: "exploitation",
            cvssScore: 6.5,
            description: "False positive",
        })

        expect(result.status).toBe("discard")
        expect(result.delta).toBeCloseTo(-0.5, 1)
    })

    it("should honor explicit crash status", () => {
        const loop = makeLoop()

        const result = loop.recordExperiment({
            killChainStage: "delivery",
            cvssScore: 0,
            description: "Sandbox timeout",
            status: "crash",
        })

        expect(result.status).toBe("crash")
    })

    it("should honor explicit status override", () => {
        const loop = makeLoop({ baseline: 5.0 })

        const result = loop.recordExperiment({
            killChainStage: "exploitation",
            cvssScore: 5.5,
            description: "Manual keep",
            status: "discard", // Override: force discard despite improvement
        })

        expect(result.status).toBe("discard")
    })

    it("should update bestScore only on keep", () => {
        const loop = makeLoop({ baseline: 3.0 })

        loop.recordExperiment({
            killChainStage: "reconnaissance",
            cvssScore: 5.0,
            description: "First finding",
        })
        expect(loop.getState().bestScore).toBe(5.0)

        loop.recordExperiment({
            killChainStage: "reconnaissance",
            cvssScore: 4.0,
            description: "Regression",
        })
        expect(loop.getState().bestScore).toBe(5.0) // Still 5.0

        loop.recordExperiment({
            killChainStage: "weaponization",
            cvssScore: 7.0,
            description: "Major find",
        })
        expect(loop.getState().bestScore).toBe(7.0)
    })
})

// ── Stop Conditions ────────────────────────────────────────────────────────

describe("stop conditions", () => {
    it("should stop after maxExperiments", () => {
        const loop = makeLoop({ maxExperiments: 3 })

        loop.recordExperiment({ killChainStage: "recon", cvssScore: 1.0, description: "A" })
        expect(loop.shouldContinue()).toBe(true)

        loop.recordExperiment({ killChainStage: "recon", cvssScore: 2.0, description: "B" })
        expect(loop.shouldContinue()).toBe(true)

        loop.recordExperiment({ killChainStage: "recon", cvssScore: 3.0, description: "C" })
        expect(loop.shouldContinue()).toBe(false)
        expect(loop.getState().stopReason).toContain("max_experiments_reached")
    })

    it("should stop after maxConsecutiveDiscards", () => {
        const loop = makeLoop({
            baseline: 10.0,
            maxConsecutiveDiscards: 3,
            improvementThreshold: 1.0,
        })

        // 3 discards in a row (scores don't improve by threshold 1.0)
        loop.recordExperiment({ killChainStage: "recon", cvssScore: 10.0, description: "No change" })
        expect(loop.shouldContinue()).toBe(true)

        loop.recordExperiment({ killChainStage: "recon", cvssScore: 10.5, description: "Tiny" })
        expect(loop.shouldContinue()).toBe(true)

        loop.recordExperiment({ killChainStage: "recon", cvssScore: 10.2, description: "Also tiny" })
        expect(loop.shouldContinue()).toBe(false)
        expect(loop.getState().stopReason).toContain("stuck_no_improvement")
    })

    it("should reset discard counter on keep", () => {
        const loop = makeLoop({
            baseline: 0,
            maxConsecutiveDiscards: 3,
            improvementThreshold: 0.5,
        })

        // 2 discards
        loop.recordExperiment({ killChainStage: "recon", cvssScore: 0.1, description: "Tiny" })
        loop.recordExperiment({ killChainStage: "recon", cvssScore: 0.2, description: "Still tiny" })
        expect(loop.getState().consecutiveDiscards).toBe(2)

        // 1 keep (big improvement)
        loop.recordExperiment({ killChainStage: "recon", cvssScore: 5.0, description: "Big find" })
        expect(loop.getState().consecutiveDiscards).toBe(0)
        expect(loop.shouldContinue()).toBe(true)
    })

    it("should stop after maxConsecutiveCrashes", () => {
        const loop = makeLoop({ maxConsecutiveCrashes: 2 })

        loop.recordExperiment({
            killChainStage: "delivery",
            cvssScore: 0,
            description: "OOM",
            status: "crash",
        })
        expect(loop.shouldContinue()).toBe(true)

        loop.recordExperiment({
            killChainStage: "delivery",
            cvssScore: 0,
            description: "Timeout",
            status: "crash",
        })
        expect(loop.shouldContinue()).toBe(false)
        expect(loop.getState().stopReason).toContain("too_many_crashes")
    })

    it("should reset crash counter on non-crash", () => {
        const loop = makeLoop({ maxConsecutiveCrashes: 2 })

        loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 0,
            description: "Crash 1",
            status: "crash",
        })
        expect(loop.getState().consecutiveCrashes).toBe(1)

        loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 5.0,
            description: "Success",
        })
        expect(loop.getState().consecutiveCrashes).toBe(0)
    })

    it("should support manual stop", () => {
        const loop = makeLoop()
        loop.stop("user_interrupted")
        expect(loop.shouldContinue()).toBe(false)
        expect(loop.getState().stopReason).toBe("user_interrupted")
    })
})

// ── ExperimentResult Fields ────────────────────────────────────────────────

describe("ExperimentResult fields", () => {
    it("should auto-generate experiment IDs", () => {
        const loop = makeLoop()

        const r1 = loop.recordExperiment({ killChainStage: "recon", cvssScore: 1, description: "A" })
        const r2 = loop.recordExperiment({ killChainStage: "recon", cvssScore: 2, description: "B" })

        expect(r1.experimentId).toBe("exp-001")
        expect(r2.experimentId).toBe("exp-002")
    })

    it("should track previousBestScore and delta", () => {
        const loop = makeLoop({ baseline: 3.0 })

        const r1 = loop.recordExperiment({ killChainStage: "recon", cvssScore: 5.0, description: "A" })
        expect(r1.previousBestScore).toBe(3.0)
        expect(r1.delta).toBeCloseTo(2.0, 1)

        const r2 = loop.recordExperiment({ killChainStage: "recon", cvssScore: 7.0, description: "B" })
        expect(r2.previousBestScore).toBe(5.0)
        expect(r2.delta).toBeCloseTo(2.0, 1)
    })

    it("should include optional fields", () => {
        const loop = makeLoop()

        const result = loop.recordExperiment({
            killChainStage: "exploitation",
            cvssScore: 8.5,
            description: "SQL injection in admin panel",
            mitreTechnique: "T1190",
            durationMs: 12345,
        })

        expect(result.mitreTechnique).toBe("T1190")
        expect(result.durationMs).toBe(12345)
        expect(result.timestamp).toBeGreaterThan(0)
    })
})

// ── Statistics ─────────────────────────────────────────────────────────────

describe("getStats", () => {
    it("should compute aggregate statistics", () => {
        const loop = makeLoop({ baseline: 0, improvementThreshold: 0.1 })

        loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 3.0,
            description: "First",
            durationMs: 1000,
        })
        loop.recordExperiment({
            killChainStage: "weaponization",
            cvssScore: 6.0,
            description: "Second",
            durationMs: 2000,
        })
        loop.recordExperiment({
            killChainStage: "weaponization",
            cvssScore: 5.5,
            description: "Regression",
            durationMs: 1500,
        })

        const stats = loop.getStats()
        expect(stats.total).toBe(3)
        expect(stats.kept).toBe(2)
        expect(stats.discarded).toBe(1)
        expect(stats.crashed).toBe(0)
        expect(stats.bestScore).toBe(6.0)
        expect(stats.totalDurationMs).toBe(4500)
        expect(stats.stagesProgressed).toContain("recon")
        expect(stats.stagesProgressed).toContain("weaponization")
    })

    it("should handle empty results", () => {
        const loop = makeLoop()
        const stats = loop.getStats()
        expect(stats.total).toBe(0)
        expect(stats.avgScore).toBe(0)
        expect(stats.avgDelta).toBe(0)
    })
})

// ── Results Table ──────────────────────────────────────────────────────────

describe("formatResultsTable", () => {
    it("should produce TSV with header", () => {
        const loop = makeLoop({ baseline: 0 })

        loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 3.0,
            description: "Port scan found open services",
            mitreTechnique: "T1046",
        })

        const table = loop.formatResultsTable()
        const lines = table.split("\n")

        expect(lines[0]).toBe("id\tstage\tcvss\tdelta\tstatus\tmitre\tdescription")
        expect(lines[1]).toContain("exp-001")
        expect(lines[1]).toContain("recon")
        expect(lines[1]).toContain("3.0")
        expect(lines[1]).toContain("keep")
        expect(lines[1]).toContain("T1046")
    })

    it("should show positive delta with + prefix", () => {
        const loop = makeLoop({ baseline: 2.0 })

        loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 5.0,
            description: "Improvement",
        })

        const table = loop.formatResultsTable()
        expect(table).toContain("+3.00")
    })

    it("should show negative delta without + prefix", () => {
        const loop = makeLoop({ baseline: 8.0 })

        loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 6.0,
            description: "Regression",
        })

        const table = loop.formatResultsTable()
        expect(table).toContain("-2.00")
    })
})

// ── Summary ────────────────────────────────────────────────────────────────

describe("formatSummary", () => {
    it("should show active state", () => {
        const loop = makeLoop()
        const summary = loop.formatSummary()
        expect(summary).toContain("active")
        expect(summary).toContain("🔄")
    })

    it("should show stopped state with reason", () => {
        const loop = makeLoop()
        loop.stop("manual_stop")
        const summary = loop.formatSummary()
        expect(summary).toContain("stopped")
        expect(summary).toContain("manual_stop")
        expect(summary).toContain("⏹️")
    })

    it("should show severity icon based on best score", () => {
        const loop = makeLoop({ baseline: 9.5 })
        const summary = loop.formatSummary()
        expect(summary).toContain("🔴") // Critical
    })

    it("should show stages progressed", () => {
        const loop = makeLoop({ baseline: 0 })
        loop.recordExperiment({ killChainStage: "recon", cvssScore: 3.0, description: "A" })
        loop.recordExperiment({ killChainStage: "exploitation", cvssScore: 7.0, description: "B" })

        const summary = loop.formatSummary()
        expect(summary).toContain("recon")
        expect(summary).toContain("exploitation")
    })
})

// ── Config ─────────────────────────────────────────────────────────────────

describe("getConfig", () => {
    it("should return merged config", () => {
        const loop = makeLoop({ maxExperiments: 50, improvementThreshold: 0.5 })
        const config = loop.getConfig()

        expect(config.maxExperiments).toBe(50)
        expect(config.improvementThreshold).toBe(0.5)
        expect(config.maxConsecutiveDiscards).toBe(3) // from our override in makeLoop
    })
})

// ── Edge Cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
    it("should handle zero baseline", () => {
        const loop = makeLoop({ baseline: 0 })

        const result = loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 0.2,
            description: "Tiny finding",
        })

        expect(result.status).toBe("keep")
        expect(result.delta).toBeCloseTo(0.2, 1)
    })

    it("should handle negative delta correctly", () => {
        const loop = makeLoop({ baseline: 10.0 })

        const result = loop.recordExperiment({
            killChainStage: "recon",
            cvssScore: 8.0,
            description: "Worse",
        })

        expect(result.delta).toBeCloseTo(-2.0, 1)
        expect(result.status).toBe("discard")
    })

    it("should continue working after stop (results still queryable)", () => {
        const loop = makeLoop()
        loop.recordExperiment({ killChainStage: "recon", cvssScore: 5.0, description: "A" })
        loop.stop("done")

        // Can still query results
        expect(loop.getResults()).toHaveLength(1)
        expect(loop.getStats().total).toBe(1)
        expect(loop.formatResultsTable()).toContain("exp-001")
    })
})
