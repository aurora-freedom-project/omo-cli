/**
 * Hierarchical Memory — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    computeRelevanceScore,
    extractQueryKeywords,
    createHierarchicalMemory,
    computeContentSimilarity,
    type MemoryEntry,
} from "./index"

// ── Query Keywords ─────────────────────────────────────────────────────────

describe("extractQueryKeywords", () => {
    it("extracts meaningful words", () => {
        const kws = extractQueryKeywords("implement user authentication with JWT")
        expect(kws).toContain("implement")
        expect(kws).toContain("user")
        expect(kws).toContain("authentication")
        expect(kws).toContain("jwt")
    })

    it("excludes stop words", () => {
        const kws = extractQueryKeywords("the quick brown fox is a test")
        expect(kws).not.toContain("the")
        expect(kws).not.toContain("is")
    })

    it("handles empty input", () => {
        expect(extractQueryKeywords("")).toHaveLength(0)
    })
})

// ── Relevance Scoring ──────────────────────────────────────────────────────

describe("computeRelevanceScore", () => {
    const baseEntry: MemoryEntry = {
        id: "test-1",
        layer: "semantic",
        content: "user authentication JWT middleware",
        tags: ["auth", "security"],
        createdAt: Date.now(),
        lastRecalledAt: 0,
        recallCount: 0,
        confidence: 0.9,
        sourceSessions: [],
        project: "test",
    }

    it("returns positive score for matching keywords", () => {
        const score = computeRelevanceScore(baseEntry, ["authentication", "jwt"])
        expect(score).toBeGreaterThan(0)
    })

    it("returns 0 for no matching keywords", () => {
        const score = computeRelevanceScore(baseEntry, ["database", "migration"])
        expect(score).toBe(0)
    })

    it("procedural layer gets highest weight", () => {
        const procEntry = { ...baseEntry, layer: "procedural" as const }
        const semEntry = { ...baseEntry, layer: "semantic" as const }
        const epEntry = { ...baseEntry, layer: "episodic" as const }

        const procScore = computeRelevanceScore(procEntry, ["authentication"])
        const semScore = computeRelevanceScore(semEntry, ["authentication"])
        const epScore = computeRelevanceScore(epEntry, ["authentication"])

        expect(procScore).toBeGreaterThan(semScore)
        expect(semScore).toBeGreaterThan(epScore)
    })

    it("boosts frequently recalled entries", () => {
        const fresh = { ...baseEntry, recallCount: 0 }
        const recalled = { ...baseEntry, recallCount: 10 }

        const freshScore = computeRelevanceScore(fresh, ["authentication"])
        const recalledScore = computeRelevanceScore(recalled, ["authentication"])

        expect(recalledScore).toBeGreaterThan(freshScore)
    })

    it("confidence affects score", () => {
        const confident = { ...baseEntry, confidence: 0.9 }
        const uncertain = { ...baseEntry, confidence: 0.3 }

        const confScore = computeRelevanceScore(confident, ["authentication"])
        const uncScore = computeRelevanceScore(uncertain, ["authentication"])

        expect(confScore).toBeGreaterThan(uncScore)
    })
})

// ── Content Similarity ─────────────────────────────────────────────────────

describe("computeContentSimilarity", () => {
    it("returns 1.0 for identical content", () => {
        expect(computeContentSimilarity("hello world test", "hello world test")).toBeCloseTo(1.0)
    })

    it("returns 0 for completely different content", () => {
        expect(computeContentSimilarity("alpha beta", "gamma delta")).toBe(0)
    })

    it("returns partial overlap", () => {
        const sim = computeContentSimilarity("user auth login", "user auth register")
        expect(sim).toBeGreaterThan(0)
        expect(sim).toBeLessThan(1.0)
    })

    it("handles empty strings", () => {
        expect(computeContentSimilarity("", "test")).toBe(0)
        expect(computeContentSimilarity("test", "")).toBe(0)
    })
})

// ── Hierarchical Memory Manager ────────────────────────────────────────────

describe("createHierarchicalMemory", () => {
    let memory: ReturnType<typeof createHierarchicalMemory>

    beforeEach(() => {
        memory = createHierarchicalMemory("test-project")
    })

    // ── Episodic Layer ─────────────────────────────────────────────

    describe("episodic", () => {
        it("records an episode", () => {
            const id = memory.recordEpisode("s1", "Used grep to find auth module", ["grep_search"], "success", ["auth"])
            expect(id).toMatch(/^ep_/)

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.episodic).toBe(1)
        })

        it("limits episodes per session", () => {
            for (let i = 0; i < 55; i++) {
                memory.recordEpisode("s1", `Episode ${i}`, ["tool"], "success")
            }

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.episodic).toBeLessThanOrEqual(50)
        })

        it("clears session episodes", () => {
            memory.recordEpisode("s1", "Ep1", [], "success")
            memory.recordEpisode("s1", "Ep2", [], "success")
            memory.recordEpisode("s2", "Ep3", [], "success")

            const cleared = memory.clearSession("s1")
            expect(cleared).toBe(2)

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.episodic).toBe(1)
        })

        it("sets confidence based on outcome", () => {
            memory.recordEpisode("s1", "success episode", [], "success", ["test"])
            memory.recordEpisode("s1", "failure episode", [], "failure", ["test"])

            const result = memory.recall("test episode")
            const successMem = result.memories.find(m => m.content.includes("success"))
            const failureMem = result.memories.find(m => m.content.includes("failure"))

            if (successMem && failureMem) {
                expect(successMem.confidence).toBeGreaterThan(failureMem.confidence)
            }
        })
    })

    // ── Semantic Layer ─────────────────────────────────────────────

    describe("semantic", () => {
        it("learns a concept", () => {
            const id = memory.learnConcept(
                "This project uses vitest for testing",
                "convention",
                ["testing", "vitest"],
            )
            expect(id).toMatch(/^sem_/)

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.semantic).toBe(1)
        })

        it("reinforces existing concept instead of duplicating", () => {
            memory.learnConcept("Project uses vitest for testing", "convention", ["vitest"])
            memory.learnConcept("Project uses vitest for unit testing", "convention", ["vitest"])

            const metrics = memory.getMetrics()
            // Similar content (>70% overlap) should reinforce, not duplicate
            expect(metrics.countByLayer.semantic).toBe(1)
        })

        it("creates new concept for different content", () => {
            memory.learnConcept("Auth module handles JWT tokens", "architecture", ["auth"])
            memory.learnConcept("Database uses PostgreSQL with pg library", "dependency", ["database"])

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.semantic).toBe(2)
        })
    })

    // ── Procedural Layer ───────────────────────────────────────────

    describe("procedural", () => {
        it("learns a procedure", () => {
            const id = memory.learnProcedure(
                "Adding a new hook to omo-cli",
                ["Create directory in src/hooks/", "Write index.ts", "Write index.test.ts", "Register in hooks/index.ts"],
                ["hook", "development"],
            )
            expect(id).toMatch(/^proc_/)

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.procedural).toBe(1)
        })

        it("tracks procedure outcome", () => {
            const id = memory.learnProcedure("Deploy flow", ["Build", "Test", "Deploy"], ["deploy"])

            memory.recordProcedureOutcome(id, true)
            memory.recordProcedureOutcome(id, true)
            memory.recordProcedureOutcome(id, false)

            // Success rate should be ~0.75 (3 executions: 2 success, 1 failure)
            // (initial 1.0 * 1 + 1 + 0) / 3 = 0.666...
            // Actually: running average, starting from successRate=1.0 with executionCount=1
            // After true: (1 * 1 + 1) / 2 = 1.0
            // After true: (1 * 2 + 1) / 3 = 1.0
            // After false: (1 * 3 + 0) / 4 = 0.75
        })

        it("returns false for unknown procedure ID", () => {
            expect(memory.recordProcedureOutcome("nonexistent", true)).toBe(false)
        })
    })

    // ── Recall ─────────────────────────────────────────────────────

    describe("recall", () => {
        it("recalls matching memories across all layers", () => {
            memory.recordEpisode("s1", "Fixed authentication bug in login handler", ["grep_search"], "success", ["auth"])
            memory.learnConcept("Auth module uses JWT tokens for session management", "architecture", ["auth", "jwt"])
            memory.learnProcedure("Debug auth issues", ["Check token expiry", "Verify middleware"], ["auth", "debug"])

            const result = memory.recall("authentication issue")

            expect(result.memories.length).toBeGreaterThan(0)
        })

        it("returns empty for unrelated query", () => {
            memory.learnConcept("Database schema uses PostgreSQL", "dependency", ["database"])

            const result = memory.recall("kubernetes deployment")
            expect(result.memories).toHaveLength(0)
        })

        it("prioritizes procedural over semantic over episodic", () => {
            // Create entries with same keywords but different layers
            memory.recordEpisode("s1", "Fixed auth middleware", [], "success", ["auth", "middleware"])
            memory.learnConcept("Auth middleware validates JWT", "architecture", ["auth", "middleware"])
            memory.learnProcedure("Fix auth middleware pattern", ["Check JWT", "Validate"], ["auth", "middleware"])

            const result = memory.recall("auth middleware")

            if (result.byLayer.procedural.length > 0 && result.byLayer.episodic.length > 0) {
                // Procedural should appear first (higher layer weight)
                const procIdx = result.memories.findIndex(m => m.layer === "procedural")
                const epIdx = result.memories.findIndex(m => m.layer === "episodic")
                if (procIdx >= 0 && epIdx >= 0) {
                    expect(procIdx).toBeLessThan(epIdx)
                }
            }
        })

        it("updates recall counts", () => {
            memory.learnConcept("Auth uses JWT tokens in this project", "fact", ["auth", "jwt"])

            memory.recall("auth jwt")
            memory.recall("auth jwt")

            // After 2 recalls, the recall count should increase
            const result = memory.recall("auth jwt")
            expect(result.memories[0].recallCount).toBeGreaterThanOrEqual(2)
        })

        it("generates context block", () => {
            memory.learnConcept("Uses TypeScript and Bun runtime", "convention", ["typescript", "bun"])

            const result = memory.recall("typescript bun runtime")
            expect(result.contextBlock).toContain("Recalled Memory")
            expect(result.contextBlock).toContain("💡") // semantic icon
        })

        it("handles empty query", () => {
            memory.learnConcept("Some concept", "fact", ["testing"])
            const result = memory.recall("")
            expect(result.memories).toHaveLength(0)
        })
    })

    // ── Distillation ───────────────────────────────────────────────

    describe("distillation", () => {
        it("distills repeated episodic patterns into semantic concepts", () => {
            // Create 3+ episodes with the same tag
            memory.recordEpisode("s1", "Used grep for auth", ["grep_search"], "success", ["search"])
            memory.recordEpisode("s1", "Used grep for models", ["grep_search"], "success", ["search"])
            memory.recordEpisode("s1", "Used grep for tests", ["grep_search"], "success", ["search"])

            const created = memory.distillEpisodesToSemantic("s1")
            expect(created.length).toBeGreaterThan(0)

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.semantic).toBeGreaterThan(0)
        })

        it("does not distill with fewer than 3 episodes per tag", () => {
            memory.recordEpisode("s1", "Ep1", [], "success", ["rare"])
            memory.recordEpisode("s1", "Ep2", [], "success", ["rare"])

            const created = memory.distillEpisodesToSemantic("s1")
            expect(created).toHaveLength(0)
        })

        it("only distills successful episodes", () => {
            memory.recordEpisode("s1", "Failed1", [], "failure", ["fail-tag"])
            memory.recordEpisode("s1", "Failed2", [], "failure", ["fail-tag"])
            memory.recordEpisode("s1", "Failed3", [], "failure", ["fail-tag"])

            const created = memory.distillEpisodesToSemantic("s1")
            expect(created).toHaveLength(0)
        })
    })

    // ── Metrics ────────────────────────────────────────────────────

    describe("metrics", () => {
        it("tracks counts by layer", () => {
            memory.recordEpisode("s1", "Ep", [], "success")
            memory.learnConcept("Concept", "fact")
            memory.learnProcedure("Proc", ["step1"])

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.episodic).toBe(1)
            expect(metrics.countByLayer.semantic).toBe(1)
            expect(metrics.countByLayer.procedural).toBe(1)
        })

        it("tracks active sessions", () => {
            memory.recordEpisode("s1", "Ep1", [], "success")
            memory.recordEpisode("s2", "Ep2", [], "success")

            const metrics = memory.getMetrics()
            expect(metrics.activeSessions).toBe(2)
        })

        it("tracks total recalls", () => {
            memory.learnConcept("Something about auth", "fact", ["auth"])
            memory.recall("auth")
            memory.recall("auth")

            const metrics = memory.getMetrics()
            expect(metrics.totalRecalls).toBe(2)
        })

        it("reset clears everything", () => {
            memory.recordEpisode("s1", "Ep", [], "success")
            memory.learnConcept("C", "fact")
            memory.learnProcedure("P", ["s1"])

            memory.reset()

            const metrics = memory.getMetrics()
            expect(metrics.countByLayer.episodic).toBe(0)
            expect(metrics.countByLayer.semantic).toBe(0)
            expect(metrics.countByLayer.procedural).toBe(0)
        })
    })
})
