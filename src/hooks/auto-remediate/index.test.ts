/**
 * Automated Remediation Pipeline — Tests (v2)
 *
 * Covers:
 * - v1: Remediation suggestion generation, plans, auto-grouping, strategies, stats, hook factory
 * - v2: Triage scoring, patch suggestion generation, PR body generation, pipeline mode
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    remediate,
    createPlan,
    autoGroup,
    getSuggestion,
    getPlan,
    hasStrategy,
    listCategories,
    getStats,
    resetAll,
    configure,
    createAutoRemediateHook,
    DEFAULT_STRATEGIES,
    // v2: Triage
    triageFinding,
    triageFindings,
    getTriageScore,
    getTriageStats,
    // v2: Patch
    generatePatchSuggestion,
    getPatchSuggestion,
    // v2: PR
    generatePRBody,
    getPipelineMode,
    CWE_MAP,
    type Finding,
    type TriageScore,
} from "./index"

const makeFinding = (overrides?: Partial<Finding>): Finding => ({
    id: `f-${Math.random().toString(36).slice(2, 8)}`,
    category: "sql_injection",
    severity: "high",
    title: "SQL Injection in login",
    description: "User input concatenated into SQL query",
    filePath: "src/auth.ts",
    lineNumber: 42,
    evidence: "const query = `SELECT * FROM users WHERE name='${input}'`",
    ...overrides,
})

describe("Automated Remediation Pipeline", () => {
    beforeEach(() => {
        resetAll()
    })

    // ── Remediation Generation ──────────────────────────────────────────

    describe("remediate", () => {
        it("generates suggestions for known category", () => {
            const finding = makeFinding({ category: "sql_injection" })
            const sugs = remediate(finding)
            expect(sugs.length).toBeGreaterThan(0)
            expect(sugs[0].category).toBe("sql_injection")
        })

        it("generates multiple strategies", () => {
            const finding = makeFinding({ category: "sql_injection" })
            const sugs = remediate(finding)
            expect(sugs.length).toBeGreaterThanOrEqual(2)
            const strategies = sugs.map(s => s.strategy)
            expect(strategies).toContain("parameterized_query")
        })

        it("respects maxSuggestionsPerFinding", () => {
            configure({ maxSuggestionsPerFinding: 1 })
            const finding = makeFinding({ category: "sql_injection" })
            const sugs = remediate(finding)
            expect(sugs.length).toBe(1)
        })

        it("generates generic suggestion for unknown category", () => {
            configure({ minConfidence: 0.1 })
            const finding = makeFinding({ category: "unknown_vuln" })
            const sugs = remediate(finding)
            expect(sugs.length).toBe(1)
            expect(sugs[0].strategy).toBe("manual_review")
            expect(sugs[0].requiresReview).toBe(true)
        })

        it("returns empty when disabled", () => {
            configure({ enabled: false })
            const sugs = remediate(makeFinding())
            expect(sugs.length).toBe(0)
        })

        it("filters by minConfidence", () => {
            configure({ minConfidence: 0.99 })
            const finding = makeFinding({ category: "sql_injection" })
            const sugs = remediate(finding)
            expect(sugs.length).toBe(0) // 0.85 < 0.99
        })

        it("stores suggestions for later retrieval", () => {
            const finding = makeFinding()
            const sugs = remediate(finding)
            const retrieved = getSuggestion(sugs[0].id)
            expect(retrieved).toBeDefined()
            expect(retrieved!.findingId).toBe(finding.id)
        })

        it("handles path_traversal category", () => {
            const finding = makeFinding({ category: "path_traversal" })
            const sugs = remediate(finding)
            expect(sugs.length).toBeGreaterThan(0)
            expect(sugs[0].confidence).toBe(0.90)
        })

        it("handles hardcoded_secret with high confidence", () => {
            const finding = makeFinding({ category: "hardcoded_secret" })
            const sugs = remediate(finding)
            expect(sugs[0].confidence).toBe(0.95)
            expect(sugs[0].requiresReview).toBe(false) // 0.95 >= 0.9
        })
    })

    // ── Plans ───────────────────────────────────────────────────────────

    describe("createPlan", () => {
        it("creates plan from findings", () => {
            const findings = [makeFinding(), makeFinding({ category: "xss" })]
            const plan = createPlan(findings)
            expect(plan.findings.length).toBe(2)
            expect(plan.suggestions.length).toBeGreaterThan(0)
        })

        it("sets priority from highest severity", () => {
            const findings = [
                makeFinding({ severity: "low" }),
                makeFinding({ severity: "critical" }),
            ]
            const plan = createPlan(findings)
            expect(plan.priority).toBe("critical")
        })

        it("estimates effort by finding count", () => {
            const small = createPlan([makeFinding()])
            expect(small.estimatedEffort).toBe("small")

            const medium = createPlan(Array.from({ length: 4 }, () => makeFinding()))
            expect(medium.estimatedEffort).toBe("medium")

            const large = createPlan(Array.from({ length: 8 }, () => makeFinding()))
            expect(large.estimatedEffort).toBe("large")
        })

        it("stores plan for retrieval", () => {
            const plan = createPlan([makeFinding()])
            expect(getPlan(plan.id)).toBeDefined()
        })
    })

    // ── Auto-Grouping ───────────────────────────────────────────────────

    describe("autoGroup", () => {
        it("groups findings by category", () => {
            const findings = [
                makeFinding({ category: "sql_injection" }),
                makeFinding({ category: "sql_injection" }),
                makeFinding({ category: "xss" }),
            ]
            const plans = autoGroup(findings)
            expect(plans.length).toBe(2) // 2 categories
        })

        it("creates separate plans per category", () => {
            const findings = [
                makeFinding({ category: "sql_injection" }),
                makeFinding({ category: "xss" }),
                makeFinding({ category: "path_traversal" }),
            ]
            const plans = autoGroup(findings)
            expect(plans.length).toBe(3)
        })
    })

    // ── Strategy Database ───────────────────────────────────────────────

    describe("strategies", () => {
        it("has strategies for common categories", () => {
            expect(hasStrategy("sql_injection")).toBe(true)
            expect(hasStrategy("xss")).toBe(true)
            expect(hasStrategy("path_traversal")).toBe(true)
            expect(hasStrategy("command_injection")).toBe(true)
        })

        it("lists all supported categories", () => {
            const cats = listCategories()
            expect(cats.length).toBeGreaterThanOrEqual(6)
        })

        it("returns false for unknown category", () => {
            expect(hasStrategy("imaginary_vuln")).toBe(false)
        })

        it("has at least 8 default strategies", () => {
            expect(DEFAULT_STRATEGIES.length).toBeGreaterThanOrEqual(8)
        })
    })

    // ── Stats ───────────────────────────────────────────────────────────

    describe("getStats", () => {
        it("returns empty stats initially", () => {
            const s = getStats()
            expect(s.totalFindings).toBe(0)
            expect(s.totalSuggestions).toBe(0)
        })

        it("tracks findings and suggestions", () => {
            remediate(makeFinding({ category: "sql_injection" }))
            remediate(makeFinding({ category: "xss" }))
            const s = getStats()
            expect(s.totalFindings).toBe(2)
            expect(s.totalSuggestions).toBeGreaterThan(0)
        })

        it("calculates coverage rate", () => {
            remediate(makeFinding({ category: "sql_injection" }))
            const s = getStats()
            expect(s.coverageRate).toBeGreaterThan(0)
        })

        it("tracks suggestions by category", () => {
            remediate(makeFinding({ category: "sql_injection" }))
            remediate(makeFinding({ category: "xss" }))
            const s = getStats()
            expect(s.suggestionsByCategory["sql_injection"]).toBeGreaterThan(0)
            expect(s.suggestionsByCategory["xss"]).toBeGreaterThan(0)
        })

        it("includes triage stats", () => {
            const s = getStats()
            expect(s.triageStats).toBeDefined()
            expect(s.triageStats.totalTriaged).toBe(0)
        })
    })

    // ── Hook Factory ────────────────────────────────────────────────────

    describe("createAutoRemediateHook", () => {
        it("returns hook when enabled", () => {
            const hook = createAutoRemediateHook()
            expect(hook).not.toBeNull()
            expect(hook!["finding.new"]).toBeDefined()
            expect(hook!["session.end"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            expect(createAutoRemediateHook({ enabled: false })).toBeNull()
        })

        it("finding.new triggers remediation", async () => {
            resetAll()
            const hook = createAutoRemediateHook()!
            await hook["finding.new"]({ finding: makeFinding() })
            expect(getStats().totalSuggestions).toBeGreaterThan(0)
        })
    })

    // ══════════════════════════════════════════════════════════════════════
    // v2: Triage Engine
    // ══════════════════════════════════════════════════════════════════════

    describe("triageFinding", () => {
        it("calculates priority score", () => {
            const finding = makeFinding({ severity: "critical", category: "sql_injection" })
            const score = triageFinding(finding)
            // critical = 10 impact, sql_injection = 9 exploitability, 7 detection
            // (10 * 9) / 7 = 12.86
            expect(score.priorityScore).toBeGreaterThan(10)
            expect(score.impact).toBe(10)
            expect(score.exploitability).toBe(9)
        })

        it("assigns P0-NOW for critical/highly-exploitable findings", () => {
            const finding = makeFinding({ severity: "critical", category: "hardcoded_secret" })
            const score = triageFinding(finding)
            // critical = 10, hardcoded_secret exploitability = 10, detection = 9
            // (10 * 10) / 9 = 11.11
            expect(score.urgency).toBe("P1-TODAY")
        })

        it("assigns P3-BACKLOG for low severity", () => {
            const finding = makeFinding({ severity: "low", category: "weak_crypto" })
            const score = triageFinding(finding)
            // low = 2, weak_crypto exploitability = 4, detection = 5
            // (2 * 4) / 5 = 1.6
            expect(score.urgency).toBe("P3-BACKLOG")
        })

        it("stores triage score for retrieval", () => {
            const finding = makeFinding()
            triageFinding(finding)
            expect(getTriageScore(finding.id)).toBeDefined()
        })

        it("uses safe defaults for unknown categories", () => {
            const finding = makeFinding({ category: "unknown_category" })
            const score = triageFinding(finding)
            // defaults: impact from severity, exploitability = 5, detection = 5
            expect(score.exploitability).toBe(5)
            expect(score.detectionTime).toBe(5)
        })
    })

    describe("triageFindings", () => {
        it("sorts findings by priority score descending", () => {
            const findings = [
                makeFinding({ severity: "low", category: "weak_crypto" }),
                makeFinding({ severity: "critical", category: "sql_injection" }),
                makeFinding({ severity: "medium", category: "xss" }),
            ]
            const scores = triageFindings(findings)
            expect(scores[0].priorityScore).toBeGreaterThan(scores[1].priorityScore)
            expect(scores[1].priorityScore).toBeGreaterThan(scores[2].priorityScore)
        })

        it("assigns sequential ranks", () => {
            const findings = [
                makeFinding({ severity: "low" }),
                makeFinding({ severity: "high" }),
                makeFinding({ severity: "critical" }),
            ]
            const scores = triageFindings(findings)
            expect(scores[0].rank).toBe(1)
            expect(scores[1].rank).toBe(2)
            expect(scores[2].rank).toBe(3)
        })

        it("handles empty array", () => {
            const scores = triageFindings([])
            expect(scores.length).toBe(0)
        })

        it("handles single finding", () => {
            const scores = triageFindings([makeFinding()])
            expect(scores.length).toBe(1)
            expect(scores[0].rank).toBe(1)
        })
    })

    describe("getTriageStats", () => {
        it("returns empty stats initially", () => {
            const stats = getTriageStats()
            expect(stats.totalTriaged).toBe(0)
            expect(stats.avgPriorityScore).toBe(0)
        })

        it("aggregates stats after triaging", () => {
            triageFindings([
                makeFinding({ severity: "critical", category: "sql_injection" }),
                makeFinding({ severity: "low", category: "weak_crypto" }),
            ])
            const stats = getTriageStats()
            expect(stats.totalTriaged).toBe(2)
            expect(stats.avgPriorityScore).toBeGreaterThan(0)
            expect(stats.highestScore).toBeGreaterThan(0)
            expect(Object.keys(stats.byUrgency).length).toBeGreaterThan(0)
        })
    })

    // ══════════════════════════════════════════════════════════════════════
    // v2: Patch Suggestion Generator
    // ══════════════════════════════════════════════════════════════════════

    describe("generatePatchSuggestion", () => {
        it("generates patch for known category", () => {
            const finding = makeFinding({ category: "sql_injection" })
            const patch = generatePatchSuggestion(finding, "const q = `SELECT * FROM users WHERE name='${input}'`")
            expect(patch).not.toBeNull()
            expect(patch!.filePath).toBe("src/auth.ts")
            expect(patch!.diffBlock).toContain("---")
            expect(patch!.diffBlock).toContain("+++")
            expect(patch!.explanation).toContain("parameterized_query")
        })

        it("returns null for unknown category", () => {
            const finding = makeFinding({ category: "unknown_category" })
            const patch = generatePatchSuggestion(finding, "some code")
            expect(patch).toBeNull()
        })

        it("includes CWE ID when available", () => {
            const finding = makeFinding({ category: "sql_injection" })
            const patch = generatePatchSuggestion(finding, "vulnerable code")
            expect(patch!.cweId).toBe("CWE-89")
        })

        it("stores patch for retrieval", () => {
            const finding = makeFinding({ category: "xss" })
            generatePatchSuggestion(finding, "innerHTML = input")
            expect(getPatchSuggestion(finding.id)).toBeDefined()
        })

        it("handles missing filePath gracefully", () => {
            const finding = makeFinding({ category: "xss", filePath: undefined, lineNumber: undefined })
            const patch = generatePatchSuggestion(finding, "code")
            expect(patch!.filePath).toBe("unknown")
        })
    })

    // ══════════════════════════════════════════════════════════════════════
    // v2: PR Body Generator
    // ══════════════════════════════════════════════════════════════════════

    describe("generatePRBody", () => {
        it("generates structured PR body", () => {
            const plan = createPlan([makeFinding()])
            const pr = generatePRBody(plan)
            expect(pr.title).toContain("fix(security)")
            expect(pr.body).toContain("🛡️ Security Remediation")
            expect(pr.body).toContain("Remediation Strategies")
            expect(pr.branch).toMatch(/^fix\/security-/)
            expect(pr.labels).toContain("security")
            expect(pr.labels).toContain("auto-remediate")
        })

        it("includes CWE references", () => {
            const plan = createPlan([makeFinding({ category: "sql_injection" })])
            const pr = generatePRBody(plan)
            expect(pr.body).toContain("CWE-89")
            expect(pr.body).toContain("cwe.mitre.org")
        })

        it("generates singular title for single finding", () => {
            const plan = createPlan([makeFinding({ title: "SQL Injection in login" })])
            const pr = generatePRBody(plan)
            expect(pr.title).toBe("fix(security): SQL Injection in login")
        })

        it("generates plural title for multiple findings", () => {
            const plan = createPlan([
                makeFinding({ severity: "high" }),
                makeFinding({ severity: "high", category: "xss" }),
            ])
            const pr = generatePRBody(plan)
            expect(pr.title).toContain("Remediate 2")
            expect(pr.title).toContain("high-severity")
        })

        it("includes severity badges", () => {
            const plan = createPlan([makeFinding({ severity: "critical" })])
            const pr = generatePRBody(plan)
            expect(pr.body).toContain("🔴")
            expect(pr.body).toContain("CRITICAL")
        })

        it("includes patch diffs when available", () => {
            const finding = makeFinding({ category: "xss" })
            generatePatchSuggestion(finding, "innerHTML = userInput")
            const plan = createPlan([finding])
            const pr = generatePRBody(plan)
            expect(pr.body).toContain("```diff")
        })

        it("includes pipeline mode", () => {
            const plan = createPlan([makeFinding()])
            const pr = generatePRBody(plan)
            expect(pr.body).toContain("Pipeline mode: `review`")
        })
    })

    // ══════════════════════════════════════════════════════════════════════
    // v2: Pipeline Mode
    // ══════════════════════════════════════════════════════════════════════

    describe("pipeline mode", () => {
        it("defaults to review mode", () => {
            expect(getPipelineMode()).toBe("review")
        })

        it("can be set to auto mode", () => {
            configure({ pipelineMode: "auto" })
            expect(getPipelineMode()).toBe("auto")
        })

        it("resets to review on resetAll", () => {
            configure({ pipelineMode: "auto" })
            resetAll()
            expect(getPipelineMode()).toBe("review")
        })
    })

    // ══════════════════════════════════════════════════════════════════════
    // v2: CWE Mapping
    // ══════════════════════════════════════════════════════════════════════

    describe("CWE_MAP", () => {
        it("maps common vulnerability categories to CWE IDs", () => {
            expect(CWE_MAP["sql_injection"]).toBe("CWE-89")
            expect(CWE_MAP["xss"]).toBe("CWE-79")
            expect(CWE_MAP["path_traversal"]).toBe("CWE-22")
            expect(CWE_MAP["command_injection"]).toBe("CWE-78")
            expect(CWE_MAP["ssrf"]).toBe("CWE-918")
            expect(CWE_MAP["hardcoded_secret"]).toBe("CWE-798")
        })

        it("has at least 8 CWE mappings", () => {
            expect(Object.keys(CWE_MAP).length).toBeGreaterThanOrEqual(8)
        })
    })
})
