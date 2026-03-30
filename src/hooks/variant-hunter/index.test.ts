/**
 * Variant Hunting Engine — Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    extractKeywords,
    jaccardSimilarity,
    createSignature,
    huntVariants,
    findVariants,
    updateVariantStatus,
    getSignature,
    getMatch,
    getMatchesForSignature,
    getStats,
    resetAll,
    configure,
    createVariantHunterHook,
    DEFAULT_CATEGORY_PATTERNS,
    type Finding,
} from "./index"

const sqliFinding: Finding = {
    id: "f-sqli-1",
    category: "sql_injection",
    title: "SQL Injection in user lookup",
    filePath: "src/auth.ts",
    lineNumber: 42,
    codeSnippet: "const result = db.query(`SELECT * FROM users WHERE name='${username}'`)",
}

const xssFinding: Finding = {
    id: "f-xss-1",
    category: "xss",
    title: "XSS in comment display",
    filePath: "src/comments.ts",
    lineNumber: 88,
    codeSnippet: "element.innerHTML = userComment",
}

const sampleCodebase = [
    { filePath: "src/auth.ts", lineNumber: 42, code: "db.query(`SELECT * FROM users WHERE name='${username}'`)" },
    { filePath: "src/products.ts", lineNumber: 15, code: "db.query(`SELECT * FROM products WHERE id=${productId}`)" },
    { filePath: "src/orders.ts", lineNumber: 30, code: "db.query(`INSERT INTO orders VALUES('${orderId}')`)" },
    { filePath: "src/utils.ts", lineNumber: 5, code: "function sanitize(input) { return input.replace(/[<>]/g, '') }" },
    { filePath: "src/comments.ts", lineNumber: 88, code: "element.innerHTML = userComment" },
    { filePath: "src/profile.ts", lineNumber: 20, code: "div.innerHTML = bio" },
]

describe("Variant Hunting Engine", () => {
    beforeEach(() => {
        resetAll()
    })

    // ── Keyword Extraction ──────────────────────────────────────────────

    describe("extractKeywords", () => {
        it("extracts meaningful tokens", () => {
            const kw = extractKeywords("const result = db.query('SELECT * FROM users')")
            expect(kw).toContain("const")
            expect(kw).toContain("result")
            expect(kw).toContain("query")
        })

        it("filters short tokens", () => {
            const kw = extractKeywords("if (x > 0) { y = 1 }")
            expect(kw.every(t => t.length >= 3)).toBe(true)
        })

        it("deduplicates tokens", () => {
            const kw = extractKeywords("query query query")
            expect(kw.filter(t => t === "query").length).toBe(1)
        })
    })

    // ── Similarity ──────────────────────────────────────────────────────

    describe("jaccardSimilarity", () => {
        it("returns 1 for identical sets", () => {
            expect(jaccardSimilarity(["a", "b", "c"], ["a", "b", "c"])).toBe(1)
        })

        it("returns 0 for disjoint sets", () => {
            expect(jaccardSimilarity(["a", "b"], ["c", "d"])).toBe(0)
        })

        it("returns correct value for partial overlap", () => {
            const sim = jaccardSimilarity(["a", "b", "c"], ["b", "c", "d"])
            expect(sim).toBeCloseTo(0.5) // intersection=2, union=4
        })

        it("returns 0 for empty sets", () => {
            expect(jaccardSimilarity([], [])).toBe(0)
        })
    })

    // ── Signature Creation ──────────────────────────────────────────────

    describe("createSignature", () => {
        it("creates signature from finding", () => {
            const sig = createSignature(sqliFinding)
            expect(sig.id).toBeDefined()
            expect(sig.findingId).toBe("f-sqli-1")
            expect(sig.category).toBe("sql_injection")
            expect(sig.keywords.length).toBeGreaterThan(0)
        })

        it("stores signature for retrieval", () => {
            const sig = createSignature(sqliFinding)
            expect(getSignature(sig.id)).toBeDefined()
        })

        it("includes category keywords", () => {
            const sig = createSignature(sqliFinding)
            expect(sig.keywords.some(k => k === "query" || k === "select")).toBe(true)
        })

        it("generates deterministic ID", () => {
            const sig1 = createSignature(sqliFinding)
            resetAll()
            const sig2 = createSignature(sqliFinding)
            expect(sig1.id).toBe(sig2.id)
        })
    })

    // ── Variant Hunting ─────────────────────────────────────────────────

    describe("huntVariants", () => {
        it("finds variants in codebase", () => {
            const sig = createSignature(sqliFinding)
            const result = huntVariants(sig, sampleCodebase, "src/auth.ts")
            expect(result.totalMatches).toBeGreaterThan(0)
        })

        it("marks original finding", () => {
            const sig = createSignature(sqliFinding)
            const result = huntVariants(sig, sampleCodebase, "src/auth.ts")
            const original = result.variants.find(v => v.isOriginal)
            expect(original).toBeDefined()
            expect(original!.status).toBe("confirmed")
        })

        it("finds new variants (not original)", () => {
            configure({ minSimilarity: 0.2 })
            const sig = createSignature(sqliFinding)
            const result = huntVariants(sig, sampleCodebase, "src/auth.ts")
            expect(result.newVariants).toBeGreaterThan(0)
        })

        it("sorts by similarity descending", () => {
            const sig = createSignature(sqliFinding)
            const result = huntVariants(sig, sampleCodebase, "src/auth.ts")
            for (let i = 1; i < result.variants.length; i++) {
                expect(result.variants[i].similarity).toBeLessThanOrEqual(
                    result.variants[i - 1].similarity
                )
            }
        })

        it("respects maxVariantsPerFinding", () => {
            configure({ maxVariantsPerFinding: 2 })
            const sig = createSignature(sqliFinding)
            const result = huntVariants(sig, sampleCodebase, "src/auth.ts")
            expect(result.variants.length).toBeLessThanOrEqual(2)
        })

        it("respects minSimilarity threshold", () => {
            configure({ minSimilarity: 0.9 })
            const sig = createSignature(sqliFinding)
            const result = huntVariants(sig, sampleCodebase, "src/auth.ts")
            for (const v of result.variants) {
                expect(v.similarity).toBeGreaterThanOrEqual(0.9)
            }
        })
    })

    // ── Full Pipeline ───────────────────────────────────────────────────

    describe("findVariants", () => {
        it("runs full pipeline", () => {
            const result = findVariants(sqliFinding, sampleCodebase)
            expect(result.signature).toBeDefined()
            expect(result.totalMatches).toBeGreaterThan(0)
        })

        it("returns empty when disabled", () => {
            configure({ enabled: false })
            const result = findVariants(sqliFinding, sampleCodebase)
            expect(result.totalMatches).toBe(0)
        })
    })

    // ── Status Updates ──────────────────────────────────────────────────

    describe("updateVariantStatus", () => {
        it("updates match status", () => {
            const result = findVariants(sqliFinding, sampleCodebase)
            const newVariant = result.variants.find(v => v.status === "new")
            if (newVariant) {
                expect(updateVariantStatus(newVariant.id, "confirmed")).toBe(true)
                expect(getMatch(newVariant.id)?.status).toBe("confirmed")
            }
        })

        it("marks false positive", () => {
            const result = findVariants(sqliFinding, sampleCodebase)
            const variant = result.variants.find(v => !v.isOriginal)
            if (variant) {
                updateVariantStatus(variant.id, "false_positive")
                expect(getMatch(variant.id)?.status).toBe("false_positive")
            }
        })

        it("returns false for unknown match", () => {
            expect(updateVariantStatus("nonexistent", "confirmed")).toBe(false)
        })
    })

    // ── Match Queries ───────────────────────────────────────────────────

    describe("getMatchesForSignature", () => {
        it("returns matches for a signature", () => {
            const result = findVariants(sqliFinding, sampleCodebase)
            const matchesForSig = getMatchesForSignature(result.signature.id)
            expect(matchesForSig.length).toBe(result.totalMatches)
        })
    })

    // ── Stats ───────────────────────────────────────────────────────────

    describe("getStats", () => {
        it("returns empty stats initially", () => {
            const s = getStats()
            expect(s.totalSignatures).toBe(0)
            expect(s.totalMatches).toBe(0)
        })

        it("tracks signatures and matches", () => {
            findVariants(sqliFinding, sampleCodebase)
            const s = getStats()
            expect(s.totalSignatures).toBe(1)
            expect(s.totalMatches).toBeGreaterThan(0)
        })

        it("tracks variants by category", () => {
            configure({ minSimilarity: 0.2 })
            findVariants(sqliFinding, sampleCodebase)
            const s = getStats()
            expect(s.variantsByCategory["sql_injection"]).toBeGreaterThan(0)
        })

        it("calculates average similarity", () => {
            findVariants(sqliFinding, sampleCodebase)
            const s = getStats()
            expect(s.avgSimilarity).toBeGreaterThan(0)
            expect(s.avgSimilarity).toBeLessThanOrEqual(1)
        })
    })

    // ── Category Patterns ───────────────────────────────────────────────

    describe("category patterns", () => {
        it("has patterns for common categories", () => {
            expect(DEFAULT_CATEGORY_PATTERNS.length).toBeGreaterThanOrEqual(6)
            const cats = DEFAULT_CATEGORY_PATTERNS.map(p => p.category)
            expect(cats).toContain("sql_injection")
            expect(cats).toContain("xss")
            expect(cats).toContain("command_injection")
        })
    })

    // ── Hook Factory ────────────────────────────────────────────────────

    describe("createVariantHunterHook", () => {
        it("returns hook when enabled", () => {
            const hook = createVariantHunterHook()
            expect(hook).not.toBeNull()
            expect(hook!["finding.new"]).toBeDefined()
            expect(hook!["session.end"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            expect(createVariantHunterHook({ enabled: false })).toBeNull()
        })

        it("finding.new creates signature", async () => {
            resetAll()
            const hook = createVariantHunterHook()!
            await hook["finding.new"]({ finding: sqliFinding })
            expect(getStats().totalSignatures).toBe(1)
        })
    })
})
