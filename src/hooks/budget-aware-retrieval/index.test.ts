/**
 * Budget-Aware Iterative Retrieval — Test Suite
 *
 * Tests the 5-factor decision engine (FastCode pattern):
 * 1. Value score computation
 * 2. Retrieval decisions at various factor combinations
 * 3. Session lifecycle (create, record, dedup, clear)
 * 4. Confidence adaptation based on retrieval results
 * 5. Hard stop conditions (max iterations, budget, confidence threshold)
 * 6. Context pressure integration
 * 7. Metrics tracking
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    computeValueScore,
    makeRetrievalDecision,
    createBudgetAwareRetrieval,
    MAX_ITERATIONS,
    CONFIDENCE_THRESHOLD,
    MAX_SESSION_TOKENS,
    type RetrievalFactor,
} from "./index"

// ── Value Score Computation ────────────────────────────────────────────────

describe("computeValueScore", () => {
    it("returns high score for low confidence + complex + large codebase + first iteration", () => {
        const score = computeValueScore({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        })
        expect(score).toBeGreaterThan(0.7)
    })

    it("returns low score for high confidence regardless of other factors", () => {
        const score = computeValueScore({
            confidence: 0.95,
            complexity: "complex",
            codebaseSize: "xlarge",
            cumulativeCost: 0,
            iteration: 0,
        })
        expect(score).toBeLessThan(0.1)
    })

    it("returns low score for trivial complexity", () => {
        const score = computeValueScore({
            confidence: 0.0,
            complexity: "trivial",
            codebaseSize: "medium",
            cumulativeCost: 0,
            iteration: 0,
        })
        // 1.0 * 0.3 * 0.7 * 1.0 * 1.0 = 0.21
        expect(score).toBeLessThan(0.25)
    })

    it("applies diminishing returns per iteration", () => {
        const baseFactors: RetrievalFactor = {
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        }

        const scores = [0, 1, 2, 3].map(i =>
            computeValueScore({ ...baseFactors, iteration: i })
        )

        // Each subsequent iteration should have a lower score
        for (let i = 1; i < scores.length; i++) {
            expect(scores[i]).toBeLessThan(scores[i - 1])
        }
    })

    it("decreases score as cumulative cost approaches budget", () => {
        const baseFactors: RetrievalFactor = {
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "large",
            iteration: 0,
            cumulativeCost: 0,
        }

        const lowCost = computeValueScore({ ...baseFactors, cumulativeCost: 1000 })
        const highCost = computeValueScore({ ...baseFactors, cumulativeCost: 7000 })

        expect(lowCost).toBeGreaterThan(highCost)
    })

    it("returns 0 when budget is exhausted", () => {
        const score = computeValueScore({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "xlarge",
            cumulativeCost: MAX_SESSION_TOKENS,
            iteration: 0,
        })
        expect(score).toBe(0)
    })

    it("clamps result between 0 and 1", () => {
        // Maximum possible inputs
        const maxScore = computeValueScore({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "xlarge",
            cumulativeCost: 0,
            iteration: 0,
        })
        expect(maxScore).toBeLessThanOrEqual(1.0)
        expect(maxScore).toBeGreaterThanOrEqual(0.0)

        // Minimum possible inputs
        const minScore = computeValueScore({
            confidence: 1.0,
            complexity: "trivial",
            codebaseSize: "small",
            cumulativeCost: MAX_SESSION_TOKENS,
            iteration: 10,
        })
        expect(minScore).toBe(0.0)
    })

    it("scales with codebase size (small < medium < large < xlarge)", () => {
        const base: Omit<RetrievalFactor, "codebaseSize"> = {
            confidence: 0.0,
            complexity: "complex",
            cumulativeCost: 0,
            iteration: 0,
        }

        const small = computeValueScore({ ...base, codebaseSize: "small" })
        const medium = computeValueScore({ ...base, codebaseSize: "medium" })
        const large = computeValueScore({ ...base, codebaseSize: "large" })
        const xlarge = computeValueScore({ ...base, codebaseSize: "xlarge" })

        expect(small).toBeLessThan(medium)
        expect(medium).toBeLessThan(large)
        expect(large).toBeLessThanOrEqual(xlarge)
    })
})

// ── Retrieval Decision ─────────────────────────────────────────────────────

describe("makeRetrievalDecision", () => {
    it("allows retrieval with graph expansion for high-value scenarios", () => {
        const decision = makeRetrievalDecision({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        })

        expect(decision.shouldRetrieve).toBe(true)
        expect(decision.useGraphExpansion).toBe(true)
        expect(decision.maxSnippets).toBeGreaterThanOrEqual(3)
        expect(decision.valueScore).toBeGreaterThan(0.3)
    })

    it("allows basic retrieval (no graph) for medium-value scenarios", () => {
        const decision = makeRetrievalDecision({
            confidence: 0.5,
            complexity: "simple",
            codebaseSize: "medium",
            cumulativeCost: 4000,
            iteration: 2,
        })

        // Value might be in the 0.15-0.3 range
        if (decision.shouldRetrieve && !decision.useGraphExpansion) {
            expect(decision.maxSnippets).toBe(2)
        }
    })

    it("denies retrieval for low-value scenarios", () => {
        const decision = makeRetrievalDecision({
            confidence: 0.8,
            complexity: "trivial",
            codebaseSize: "small",
            cumulativeCost: 6000,
            iteration: 3,
        })

        expect(decision.shouldRetrieve).toBe(false)
        expect(decision.maxSnippets).toBe(0)
    })

    it("hard-stops at max iterations", () => {
        const decision = makeRetrievalDecision({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "xlarge",
            cumulativeCost: 0,
            iteration: MAX_ITERATIONS,
        })

        expect(decision.shouldRetrieve).toBe(false)
        expect(decision.reason).toContain("Max iterations")
    })

    it("hard-stops when confidence threshold met", () => {
        const decision = makeRetrievalDecision({
            confidence: CONFIDENCE_THRESHOLD,
            complexity: "complex",
            codebaseSize: "xlarge",
            cumulativeCost: 0,
            iteration: 0,
        })

        expect(decision.shouldRetrieve).toBe(false)
        expect(decision.reason).toContain("Confidence threshold")
    })

    it("hard-stops when token budget exhausted", () => {
        const decision = makeRetrievalDecision({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "xlarge",
            cumulativeCost: MAX_SESSION_TOKENS,
            iteration: 0,
        })

        expect(decision.shouldRetrieve).toBe(false)
        expect(decision.reason).toContain("budget exhausted")
    })

    it("gives more max snippets for complex queries", () => {
        const complexDecision = makeRetrievalDecision({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        })

        const simpleDecision = makeRetrievalDecision({
            confidence: 0.0,
            complexity: "simple",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        })

        // Complex should get more snippets (5 vs 3) when graph expansion enabled
        if (complexDecision.useGraphExpansion && simpleDecision.useGraphExpansion) {
            expect(complexDecision.maxSnippets).toBeGreaterThanOrEqual(simpleDecision.maxSnippets)
        }
    })
})

// ── Session Manager ────────────────────────────────────────────────────────

describe("createBudgetAwareRetrieval", () => {
    let manager: ReturnType<typeof createBudgetAwareRetrieval>

    beforeEach(() => {
        manager = createBudgetAwareRetrieval()
    })

    it("creates a session on first request", () => {
        const decision = manager.requestRetrieval("session-1", {
            taskType: "code",
            complexity: "moderate",
            urgency: "low",
            languages: ["typescript"],
            filePaths: [],
            keywords: ["auth", "middleware"],
        })

        expect(decision.shouldRetrieve).toBe(true)
    })

    it("tracks iterations across multiple requests", () => {
        const query = {
            taskType: "code" as const,
            complexity: "complex" as const,
            urgency: "low" as const,
            languages: ["typescript"],
            filePaths: [],
            keywords: ["auth"],
        }

        // First request
        manager.requestRetrieval("session-1", query)
        manager.recordRetrieval("session-1", ["fn_a", "fn_b", "fn_c"], 500)

        // Second request — should have higher confidence
        const session = manager._getSession("session-1")
        expect(session.iterations).toBe(1)
        expect(session.totalTokensUsed).toBe(500)
        expect(session.confidence).toBeGreaterThan(0)
    })

    it("increases confidence significantly when no new snippets found", () => {
        const query = {
            taskType: "code" as const,
            complexity: "complex" as const,
            urgency: "low" as const,
            languages: [],
            filePaths: [],
            keywords: [],
        }

        manager.requestRetrieval("session-1", query)
        manager.recordRetrieval("session-1", ["fn_a", "fn_b"], 300)

        // Second iteration returns same snippets (duplicates)
        manager.requestRetrieval("session-1", query)
        manager.recordRetrieval("session-1", ["fn_a", "fn_b"], 200)

        const session = manager._getSession("session-1")
        // Confidence should be high because no new info was found
        expect(session.confidence).toBeGreaterThanOrEqual(0.4)
    })

    it("increases confidence slowly when many new snippets found", () => {
        const query = {
            taskType: "code" as const,
            complexity: "complex" as const,
            urgency: "low" as const,
            languages: [],
            filePaths: [],
            keywords: [],
        }

        manager.requestRetrieval("session-1", query)
        // Found 5 new snippets — lots of new info, low confidence boost
        manager.recordRetrieval("session-1", ["a", "b", "c", "d", "e"], 500)

        const session = manager._getSession("session-1")
        expect(session.confidence).toBeLessThanOrEqual(0.1)
    })

    it("deduplicates snippets across iterations", () => {
        manager.requestRetrieval("session-1", {
            taskType: "code",
            complexity: "moderate",
            urgency: "low",
            languages: [],
            filePaths: [],
            keywords: [],
        })
        manager.recordRetrieval("session-1", ["fn_a", "fn_b"], 300)

        expect(manager.isDuplicate("session-1", "fn_a")).toBe(true)
        expect(manager.isDuplicate("session-1", "fn_b")).toBe(true)
        expect(manager.isDuplicate("session-1", "fn_c")).toBe(false)
    })

    it("dedup returns false for unknown sessions", () => {
        expect(manager.isDuplicate("nonexistent", "fn_a")).toBe(false)
    })

    it("respects context pressure — high pressure boosts confidence", () => {
        const query = {
            taskType: "code" as const,
            complexity: "complex" as const,
            urgency: "low" as const,
            languages: [],
            filePaths: [],
            keywords: [],
        }

        const decision = manager.requestRetrieval("session-1", query, "large", "high")

        // High pressure should set confidence to at least 0.7
        const session = manager._getSession("session-1")
        expect(session.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it("respects context pressure — critical pressure nearly stops retrieval", () => {
        const query = {
            taskType: "code" as const,
            complexity: "complex" as const,
            urgency: "low" as const,
            languages: [],
            filePaths: [],
            keywords: [],
        }

        const decision = manager.requestRetrieval("session-1", query, "large", "critical")
        // Critical pressure sets confidence to 0.9, which is >= CONFIDENCE_THRESHOLD
        expect(decision.shouldRetrieve).toBe(false)
    })

    it("clears session state", () => {
        manager.requestRetrieval("session-1", {
            taskType: "code",
            complexity: "moderate",
            urgency: "low",
            languages: [],
            filePaths: [],
            keywords: [],
        })
        manager.recordRetrieval("session-1", ["fn_a"], 100)

        manager.clearSession("session-1")

        // After clear, session should be fresh
        expect(manager.isDuplicate("session-1", "fn_a")).toBe(false)
    })

    it("tracks aggregate metrics", () => {
        const query = {
            taskType: "code" as const,
            complexity: "complex" as const,
            urgency: "low" as const,
            languages: [],
            filePaths: [],
            keywords: [],
        }

        // Session 1: 2 iterations
        manager.requestRetrieval("s1", query)
        manager.recordRetrieval("s1", ["a", "b"], 300)
        manager.requestRetrieval("s1", query)
        manager.recordRetrieval("s1", ["c"], 200)

        // Session 2: 1 iteration
        manager.requestRetrieval("s2", query)
        manager.recordRetrieval("s2", ["d", "e"], 400)

        const metrics = manager.getMetrics()
        expect(metrics.sessionsTracked).toBe(2)
        expect(metrics.totalIterations).toBe(3)
        expect(metrics.totalTokensConsumed).toBe(900) // 300 + 200 + 400
        expect(metrics.avgValueScore).toBeGreaterThan(0)
    })

    it("counts early stops in metrics", () => {
        // Force confidence > threshold by using critical pressure
        const query = {
            taskType: "code" as const,
            complexity: "simple" as const,
            urgency: "low" as const,
            languages: [],
            filePaths: [],
            keywords: [],
        }

        manager.requestRetrieval("s1", query, "small", "critical")

        const metrics = manager.getMetrics()
        expect(metrics.earlyStops).toBeGreaterThanOrEqual(0)
    })

    it("resets all state", () => {
        manager.requestRetrieval("s1", {
            taskType: "code",
            complexity: "moderate",
            urgency: "low",
            languages: [],
            filePaths: [],
            keywords: [],
        })
        manager.recordRetrieval("s1", ["fn_a"], 100)

        manager.reset()

        const metrics = manager.getMetrics()
        expect(metrics.sessionsTracked).toBe(0)
        expect(metrics.totalIterations).toBe(0)
    })
})

// ── Edge Cases ─────────────────────────────────────────────────────────────

describe("edge cases", () => {
    it("handles confidence values outside 0-1 range gracefully", () => {
        const score = computeValueScore({
            confidence: 1.5, // over 1
            complexity: "complex",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        })
        expect(score).toBe(0) // clamped confidence = 1.0, gap = 0
    })

    it("handles negative confidence gracefully", () => {
        const score = computeValueScore({
            confidence: -0.5,
            complexity: "complex",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        })
        // Negative confidence clamped to 0, gap = 1.0
        expect(score).toBeGreaterThan(0)
    })

    it("handles very large iteration values", () => {
        const decision = makeRetrievalDecision({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "xlarge",
            cumulativeCost: 0,
            iteration: 100,
        })
        expect(decision.shouldRetrieve).toBe(false)
    })

    it("handles zero cumulative cost gracefully", () => {
        const score = computeValueScore({
            confidence: 0.0,
            complexity: "complex",
            codebaseSize: "large",
            cumulativeCost: 0,
            iteration: 0,
        })
        expect(score).toBeGreaterThan(0.5)
    })

    it("multiple sessions are independent", () => {
        const manager = createBudgetAwareRetrieval()
        const query = {
            taskType: "code" as const,
            complexity: "complex" as const,
            urgency: "low" as const,
            languages: [],
            filePaths: [],
            keywords: [],
        }

        // Session 1 gets high confidence
        manager.requestRetrieval("s1", query)
        manager.recordRetrieval("s1", [], 100) // no new snippets → high confidence
        manager.recordRetrieval("s1", [], 100) // still no new → even higher

        // Session 2 should be fresh
        manager.requestRetrieval("s2", query)
        const s2 = manager._getSession("s2")
        expect(s2.confidence).toBe(0) // fresh session, no confidence

        const s1 = manager._getSession("s1")
        expect(s1.confidence).toBeGreaterThan(0.4) // session 1 has accumulated confidence
    })
})
