/**
 * Successful Tool Recall — Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    extractContextKeywords,
    contextSimilarity,
    computeDecayWeight,
    autoDetectSuccess,
    recordOutcome,
    recallSuccessfulTools,
    updateSessionContext,
    getOutcomeCount,
    clearAll,
    clearSession,
    createSuccessfulToolRecallHook,
} from "./index"

describe("Successful Tool Recall", () => {
    beforeEach(() => {
        clearAll()
    })

    // ── Context Keywords ────────────────────────────────────────────────

    describe("extractContextKeywords", () => {
        it("extracts meaningful keywords", () => {
            const kws = extractContextKeywords("Find vulnerabilities in the web application login page")
            expect(kws).toContain("vulnerabilities")
            expect(kws).toContain("web")
            expect(kws).toContain("application")
            expect(kws).toContain("login")
            expect(kws).toContain("page")
        })

        it("filters stop words", () => {
            const kws = extractContextKeywords("the is are was to of in for")
            expect(kws.length).toBe(0)
        })

        it("deduplicates keywords", () => {
            const kws = extractContextKeywords("test test test different unique")
            const testCount = kws.filter(k => k === "test").length
            expect(testCount).toBe(1)
        })

        it("limits to 20 keywords", () => {
            const longText = Array.from({ length: 50 }, (_, i) => `keyword${i}`).join(" ")
            const kws = extractContextKeywords(longText)
            expect(kws.length).toBeLessThanOrEqual(20)
        })
    })

    // ── Context Similarity ──────────────────────────────────────────────

    describe("contextSimilarity", () => {
        it("returns 1 for identical sets", () => {
            expect(contextSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1)
        })

        it("returns 0 for disjoint sets", () => {
            expect(contextSimilarity(["a", "b"], ["c", "d"])).toBe(0)
        })

        it("returns partial overlap correctly", () => {
            const sim = contextSimilarity(["a", "b", "c"], ["b", "c", "d"])
            expect(sim).toBeCloseTo(0.5, 1) // 2/4
        })

        it("handles empty sets", () => {
            expect(contextSimilarity([], [])).toBe(1)
            expect(contextSimilarity(["a"], [])).toBe(0)
            expect(contextSimilarity([], ["a"])).toBe(0)
        })
    })

    // ── Time Decay ──────────────────────────────────────────────────────

    describe("computeDecayWeight", () => {
        it("returns 1 for current timestamp", () => {
            expect(computeDecayWeight(Date.now(), 86400000)).toBeCloseTo(1, 1)
        })

        it("returns 0.5 after one half-life", () => {
            const halfLife = 86400000 // 24h
            const pastTime = Date.now() - halfLife
            expect(computeDecayWeight(pastTime, halfLife)).toBeCloseTo(0.5, 1)
        })

        it("returns 0.25 after two half-lives", () => {
            const halfLife = 86400000
            const pastTime = Date.now() - halfLife * 2
            expect(computeDecayWeight(pastTime, halfLife)).toBeCloseTo(0.25, 1)
        })

        it("returns ~1 for future timestamps", () => {
            expect(computeDecayWeight(Date.now() + 1000, 86400000)).toBe(1)
        })
    })

    // ── Auto-Detect Success ─────────────────────────────────────────────

    describe("autoDetectSuccess", () => {
        it("detects success from output", () => {
            expect(autoDetectSuccess("nmap", "Scan completed successfully")).toBe(true)
        })

        it("detects failure from error", () => {
            expect(autoDetectSuccess("nmap", "Error: connection refused")).toBe(false)
        })

        it("detects failure from traceback", () => {
            expect(autoDetectSuccess("python", "Traceback (most recent call last):")).toBe(false)
        })

        it("detects failure from permission denied", () => {
            expect(autoDetectSuccess("bash", "Permission denied")).toBe(false)
        })

        it("assumes success for non-empty normal output", () => {
            expect(autoDetectSuccess("grep", "match found in line 42")).toBe(true)
        })

        it("returns false for empty output", () => {
            expect(autoDetectSuccess("bash", "")).toBe(false)
        })

        it("returns false for very short output", () => {
            expect(autoDetectSuccess("bash", "ok")).toBe(false)
        })
    })

    // ── Record Outcome ──────────────────────────────────────────────────

    describe("recordOutcome", () => {
        it("records an outcome with correct fields", () => {
            updateSessionContext("s1", "scan web application for vulnerabilities")
            const outcome = recordOutcome("s1", "nmap", { target: "example.com" }, "Ports found: 80, 443", true, 5000)

            expect(outcome.tool).toBe("nmap")
            expect(outcome.success).toBe(true)
            expect(outcome.durationMs).toBe(5000)
            expect(outcome.id.length).toBe(16)
            expect(outcome.contextKeywords.length).toBeGreaterThan(0)
        })

        it("increments global and session counts", () => {
            recordOutcome("s1", "nmap", {}, "ok output..", true, 100)
            recordOutcome("s1", "grep", {}, "found result output", true, 50)

            const counts = getOutcomeCount()
            expect(counts.global).toBe(2)
            expect(counts.sessions).toBe(1)
        })

        it("respects maxOutcomesPerSession", () => {
            for (let i = 0; i < 10; i++) {
                recordOutcome("s1", `tool${i}`, {}, `output ${i} test`, true, 10, { maxOutcomesPerSession: 5 })
            }
            // Global should have all 10, but session ring buffer capped at 5
            const counts = getOutcomeCount()
            expect(counts.global).toBe(10)
        })
    })

    // ── Recall Successful Tools ─────────────────────────────────────────

    describe("recallSuccessfulTools", () => {
        beforeEach(() => {
            // Setup: record outcomes with context
            updateSessionContext("s1", "web application security testing")

            recordOutcome("s1", "nmap", { target: "example.com" }, "Ports found: 80, 443", true, 100)
            recordOutcome("s1", "nmap", { target: "test.com" }, "Scan completed", true, 200)
            recordOutcome("s1", "sqlmap", { url: "http://example.com" }, "SQL injection found completed", true, 500)
            recordOutcome("s1", "nikto", { target: "example.com" }, "Error: connection refused", false, 100)
            recordOutcome("s1", "nikto", { target: "test.com" }, "Timeout error occurred", false, 100)
        })

        it("returns tools ranked by score", () => {
            const results = recallSuccessfulTools({
                contextKeywords: ["web", "application", "security"],
            })

            expect(results.length).toBeGreaterThan(0)
            // First result should have highest score
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
            }
        })

        it("filters out low success rate tools", () => {
            const results = recallSuccessfulTools({
                contextKeywords: ["web", "application", "security"],
                minSuccessRate: 0.5,
            })

            // nikto (0% success) should be filtered out
            expect(results.find(r => r.tool === "nikto")).toBeUndefined()
        })

        it("respects maxResults", () => {
            const results = recallSuccessfulTools({
                contextKeywords: ["web", "application", "security"],
                maxResults: 1,
            })
            expect(results.length).toBeLessThanOrEqual(1)
        })

        it("filters by tool names", () => {
            const results = recallSuccessfulTools({
                contextKeywords: ["web", "application", "security"],
                toolFilter: ["nmap"],
            })
            expect(results.every(r => r.tool === "nmap")).toBe(true)
        })

        it("returns correct success rates", () => {
            const results = recallSuccessfulTools({
                contextKeywords: ["web", "application", "security"],
            })

            const nmap = results.find(r => r.tool === "nmap")
            if (nmap) {
                expect(nmap.successRate).toBe(1.0) // 2/2
                expect(nmap.successCount).toBe(2)
            }
        })

        it("returns empty for unrelated context", () => {
            const results = recallSuccessfulTools({
                contextKeywords: ["blockchain", "cryptocurrency", "mining"],
            }, { minContextOverlap: 0.5 })
            expect(results.length).toBe(0)
        })
    })

    // ── Session Context ─────────────────────────────────────────────────

    describe("updateSessionContext", () => {
        it("accumulates keywords across calls", () => {
            updateSessionContext("s1", "web application testing")
            updateSessionContext("s1", "vulnerability scanner nmap")

            // Record an outcome to verify context was captured
            const outcome = recordOutcome("s1", "test", {}, "output..", true, 0)
            expect(outcome.contextKeywords.length).toBeGreaterThan(0)
        })
    })

    // ── Session Cleanup ─────────────────────────────────────────────────

    describe("clearSession", () => {
        it("clears session data without affecting global", () => {
            recordOutcome("s1", "nmap", {}, "result..", true, 100)
            recordOutcome("s2", "grep", {}, "found result..", true, 50)

            clearSession("s1")

            const counts = getOutcomeCount()
            expect(counts.global).toBe(2) // Global unchanged
            expect(counts.sessions).toBe(1) // Only s2 remains
        })
    })

    // ── Hook Creation ───────────────────────────────────────────────────

    describe("createSuccessfulToolRecallHook", () => {
        it("returns hook when enabled", () => {
            const hook = createSuccessfulToolRecallHook()
            expect(hook).not.toBeNull()
            expect(hook!["chat.message"]).toBeDefined()
            expect(hook!["tool.execute.after"]).toBeDefined()
            expect(hook!["event"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            const hook = createSuccessfulToolRecallHook({ enabled: false })
            expect(hook).toBeNull()
        })

        it("chat.message handler extracts context", async () => {
            const hook = createSuccessfulToolRecallHook()!
            await hook["chat.message"](
                { sessionID: "test" },
                { parts: [{ type: "text", text: "Scan the web application for SQL injection" }] },
            )
            // Context should now be set
            const outcome = recordOutcome("test", "sqlmap", {}, "result output..", true, 0)
            expect(outcome.contextKeywords.length).toBeGreaterThan(0)
        })

        it("tool.execute.after handler records outcomes", async () => {
            const hook = createSuccessfulToolRecallHook()!
            await hook["tool.execute.after"](
                { sessionID: "test", tool: "nmap", args: { target: "example.com" } },
                { result: "Scan completed successfully" },
            )
            const counts = getOutcomeCount()
            expect(counts.global).toBe(1)
        })
    })
})
