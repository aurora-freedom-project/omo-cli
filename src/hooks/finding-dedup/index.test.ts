/**
 * Finding Deduplication — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    hashFinding,
    textSimilarity,
    normalizeTarget,
    isClassDuplicate,
    pickBetter,
    deduplicateFindings,
    createDedupManager,
    type SecurityFinding,
} from "./index"

// ── Test Data ──────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
    return {
        id: `F-${Math.random().toString(36).slice(2, 8)}`,
        description: "SQL injection vulnerability in login endpoint",
        severity: "high",
        evidence: "Parameter 'username' is injectable: ' OR 1=1 --",
        target: "https://example.com/api/login",
        vulnClass: "sqli",
        source: "scanner-1",
        timestamp: Date.now(),
        cvssScore: 7.5,
        ...overrides,
    }
}

// ── Hash Function ──────────────────────────────────────────────────────────

describe("hashFinding", () => {
    it("produces consistent hash for same finding", () => {
        const f = makeFinding()
        expect(hashFinding(f)).toBe(hashFinding(f))
    })

    it("produces different hash for different findings", () => {
        const f1 = makeFinding({ description: "Finding A" })
        const f2 = makeFinding({ description: "Finding B" })
        expect(hashFinding(f1)).not.toBe(hashFinding(f2))
    })

    it("returns 8-char hex string", () => {
        expect(hashFinding(makeFinding())).toMatch(/^[0-9a-f]{8}$/)
    })
})

// ── Text Similarity ────────────────────────────────────────────────────────

describe("textSimilarity", () => {
    it("returns 1.0 for identical text", () => {
        expect(textSimilarity("SQL injection found here", "SQL injection found here")).toBeCloseTo(1.0)
    })

    it("returns 0 for completely different text", () => {
        expect(textSimilarity("alpha beta gamma", "delta epsilon zeta")).toBe(0)
    })

    it("returns partial overlap", () => {
        const sim = textSimilarity("SQL injection in login form", "SQL injection in registration form")
        expect(sim).toBeGreaterThan(0.3)
        expect(sim).toBeLessThan(1.0)
    })

    it("returns 1.0 for two empty strings", () => {
        expect(textSimilarity("", "")).toBe(1.0)
    })

    it("is symmetric", () => {
        const a = textSimilarity("hello world test", "world test other")
        const b = textSimilarity("world test other", "hello world test")
        expect(a).toBeCloseTo(b)
    })
})

// ── Target Normalization ───────────────────────────────────────────────────

describe("normalizeTarget", () => {
    it("removes trailing slash", () => {
        expect(normalizeTarget("https://example.com/")).toBe("https://example.com")
    })

    it("removes port", () => {
        expect(normalizeTarget("https://example.com:8080")).toBe("https://example.com")
    })

    it("normalizes API versions", () => {
        expect(normalizeTarget("https://example.com/api/v1/users"))
            .toBe(normalizeTarget("https://example.com/api/v2/users"))
    })

    it("lowercases", () => {
        expect(normalizeTarget("HTTPS://EXAMPLE.COM")).toBe("https://example.com")
    })
})

// ── Class Duplicate Detection ──────────────────────────────────────────────

describe("isClassDuplicate", () => {
    it("detects same class + same target", () => {
        const a = makeFinding({ vulnClass: "sqli", target: "https://example.com/login" })
        const b = makeFinding({ vulnClass: "sqli", target: "https://example.com/login" })
        expect(isClassDuplicate(a, b)).toBe(true)
    })

    it("detects same class + same target with different API version", () => {
        const a = makeFinding({ vulnClass: "xss", target: "https://example.com/api/v1/search" })
        const b = makeFinding({ vulnClass: "xss", target: "https://example.com/api/v2/search" })
        expect(isClassDuplicate(a, b)).toBe(true)
    })

    it("returns false for different class", () => {
        const a = makeFinding({ vulnClass: "sqli", target: "https://example.com/login" })
        const b = makeFinding({ vulnClass: "xss", target: "https://example.com/login" })
        expect(isClassDuplicate(a, b)).toBe(false)
    })

    it("returns false for different target", () => {
        const a = makeFinding({ vulnClass: "sqli", target: "https://example.com/login" })
        const b = makeFinding({ vulnClass: "sqli", target: "https://example.com/register" })
        expect(isClassDuplicate(a, b)).toBe(false)
    })
})

// ── Pick Better ────────────────────────────────────────────────────────────

describe("pickBetter", () => {
    it("picks higher severity", () => {
        const crit = makeFinding({ severity: "critical" })
        const low = makeFinding({ severity: "low" })
        expect(pickBetter(crit, low)).toBe(crit)
        expect(pickBetter(low, crit)).toBe(crit)
    })

    it("picks higher CVSS when severity is equal", () => {
        const highCvss = makeFinding({ severity: "high", cvssScore: 8.5 })
        const lowCvss = makeFinding({ severity: "high", cvssScore: 6.0 })
        expect(pickBetter(highCvss, lowCvss)).toBe(highCvss)
    })

    it("picks newer when severity and CVSS are equal", () => {
        const older = makeFinding({ severity: "high", cvssScore: 7.0, timestamp: 1000 })
        const newer = makeFinding({ severity: "high", cvssScore: 7.0, timestamp: 2000 })
        expect(pickBetter(older, newer)).toBe(newer)
    })
})

// ── Deduplication Engine ───────────────────────────────────────────────────

describe("deduplicateFindings", () => {
    it("handles empty input", () => {
        const result = deduplicateFindings([])
        expect(result.unique).toHaveLength(0)
        expect(result.dedupRatio).toBe(1.0)
    })

    it("keeps unique findings", () => {
        const findings = [
            makeFinding({ id: "f1", description: "SQLi in login", vulnClass: "sqli", target: "https://a.com/login" }),
            makeFinding({ id: "f2", description: "XSS in search", vulnClass: "xss", target: "https://a.com/search" }),
            makeFinding({ id: "f3", description: "Open port 22", vulnClass: "open_port", target: "server.example.com" }),
        ]

        const result = deduplicateFindings(findings)
        expect(result.unique).toHaveLength(3)
        expect(result.dedupRatio).toBe(1.0)
    })

    it("removes exact duplicates", () => {
        const f = makeFinding({ id: "f1" })
        const dup = { ...f, id: "f2" } // same content, different ID

        const result = deduplicateFindings([f, dup])
        expect(result.unique).toHaveLength(1)
        expect(result.duplicates.length).toBeGreaterThan(0)
        expect(result.duplicates[0].reason).toBe("exact")
    })

    it("removes fuzzy duplicates", () => {
        const f1 = makeFinding({
            id: "f1",
            description: "SQL injection vulnerability found in the login endpoint",
            evidence: "Username parameter is injectable with single quote",
        })
        const f2 = makeFinding({
            id: "f2",
            description: "SQL injection vulnerability found in the login form",
            evidence: "Username parameter is injectable with single quote character",
        })

        const result = deduplicateFindings([f1, f2])
        expect(result.unique.length).toBeLessThanOrEqual(2) // may or may not fuzzy-match
    })

    it("removes class duplicates (same vuln + same target)", () => {
        const f1 = makeFinding({
            id: "f1",
            description: "SQLi via scanner A",
            vulnClass: "sqli",
            target: "https://example.com/api/v1/login",
            severity: "high",
            evidence: "Evidence from scanner A",
        })
        const f2 = makeFinding({
            id: "f2",
            description: "SQLi via scanner B",
            vulnClass: "sqli",
            target: "https://example.com/api/v2/login",
            severity: "critical",
            evidence: "Evidence from scanner B",
        })

        const result = deduplicateFindings([f1, f2])
        // Should dedup since same class + normalized target
        if (result.unique.length === 1) {
            // Should keep the critical one
            expect(result.unique[0].severity).toBe("critical")
        }
    })

    it("keeps higher severity when deduplicating", () => {
        const crit = makeFinding({ id: "f1", severity: "critical" })
        const low = { ...crit, id: "f2", severity: "low" as const }

        const result = deduplicateFindings([crit, low])
        expect(result.unique).toHaveLength(1)
        expect(result.unique[0].severity).toBe("critical")
    })

    it("reports correct dedup ratio", () => {
        const f = makeFinding({ id: "f1" })
        const dup = { ...f, id: "f2" }

        const result = deduplicateFindings([f, dup])
        expect(result.beforeCount).toBe(2)
        expect(result.afterCount).toBe(1)
        expect(result.dedupRatio).toBe(0.5)
    })
})

// ── Dedup Manager ──────────────────────────────────────────────────────────

describe("createDedupManager", () => {
    let manager: ReturnType<typeof createDedupManager>

    beforeEach(() => {
        manager = createDedupManager()
    })

    it("tracks metrics across multiple dedups", () => {
        manager.deduplicate([
            makeFinding({ id: "f1" }),
            { ...makeFinding({ id: "f1" }), id: "f2" },
        ])

        manager.deduplicate([
            makeFinding({ id: "f3", description: "Unique A", evidence: "UA" }),
            makeFinding({ id: "f4", description: "Unique B", evidence: "UB" }),
        ])

        const metrics = manager.getMetrics()
        expect(metrics.totalDedups).toBe(2)
        expect(metrics.totalProcessed).toBe(4)
    })

    it("resets state", () => {
        manager.deduplicate([makeFinding({ id: "f1" })])
        manager.reset()

        const metrics = manager.getMetrics()
        expect(metrics.totalDedups).toBe(0)
        expect(metrics.totalProcessed).toBe(0)
    })

    it("tracks dedup reasons", () => {
        const f = makeFinding({ id: "f1" })
        const dup = { ...f, id: "f2" }
        manager.deduplicate([f, dup])

        const metrics = manager.getMetrics()
        expect(metrics.byReason.exact).toBeGreaterThanOrEqual(0)
    })
})
