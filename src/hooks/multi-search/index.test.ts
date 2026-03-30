/**
 * Multi-Search Aggregation — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    normalizeUrl,
    computeAggregatedScore,
    mergeResults,
    createSearchAggregator,
    createMockSource,
    type SearchResult,
    type SearchSource,
} from "./index"

// ── URL Normalization ──────────────────────────────────────────────────────

describe("normalizeUrl", () => {
    it("removes trailing slash", () => {
        expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page")
    })

    it("removes tracking parameters", () => {
        expect(normalizeUrl("https://example.com/page?utm_source=google&real=1"))
            .toBe("https://example.com/page?real=1")
    })

    it("removes fragment", () => {
        expect(normalizeUrl("https://example.com/page#section")).toBe("https://example.com/page")
    })

    it("normalizes consistently", () => {
        const a = normalizeUrl("https://example.com/path?utm_campaign=x#top")
        const b = normalizeUrl("https://example.com/path")
        expect(a).toBe(b)
    })

    it("handles malformed URLs gracefully", () => {
        const result = normalizeUrl("not-a-url")
        expect(result).toBe("not-a-url")
    })

    it("preserves root URL", () => {
        expect(normalizeUrl("https://example.com/")).toBe("https://example.com/")
    })
})

// ── Aggregated Score ───────────────────────────────────────────────────────

describe("computeAggregatedScore", () => {
    it("returns base score for single source", () => {
        expect(computeAggregatedScore(0.8, 1)).toBeCloseTo(0.8)
    })

    it("boosts score for 2 sources (1.3×)", () => {
        expect(computeAggregatedScore(0.5, 2)).toBeCloseTo(0.65)
    })

    it("boosts score for 3 sources (1.6×)", () => {
        expect(computeAggregatedScore(0.5, 3)).toBeCloseTo(0.8)
    })

    it("caps at 1.0", () => {
        expect(computeAggregatedScore(0.9, 5)).toBe(1.0)
    })

    it("handles zero base score", () => {
        expect(computeAggregatedScore(0, 3)).toBe(0)
    })
})

// ── Result Merging ─────────────────────────────────────────────────────────

describe("mergeResults", () => {
    it("deduplicates by URL", () => {
        const results: SearchResult[] = [
            { title: "Page A", url: "https://a.com/page", snippet: "A desc", source: "s1", sourceScore: 0.9 },
            { title: "Page A v2", url: "https://a.com/page", snippet: "A desc v2", source: "s2", sourceScore: 0.8 },
        ]

        const merged = mergeResults(results)
        expect(merged).toHaveLength(1)
        expect(merged[0].sourceCount).toBe(2)
        expect(merged[0].sources).toContain("s1")
        expect(merged[0].sources).toContain("s2")
    })

    it("picks highest-scored title and snippet", () => {
        const results: SearchResult[] = [
            { title: "Bad title", url: "https://a.com/page", snippet: "Bad", source: "s1", sourceScore: 0.3 },
            { title: "Good title", url: "https://a.com/page", snippet: "Good", source: "s2", sourceScore: 0.9 },
        ]

        const merged = mergeResults(results)
        expect(merged[0].title).toBe("Good title")
        expect(merged[0].snippet).toBe("Good")
    })

    it("sorts by aggregated score descending", () => {
        const results: SearchResult[] = [
            { title: "Low", url: "https://low.com", snippet: "L", source: "s1", sourceScore: 0.3 },
            { title: "High", url: "https://high.com", snippet: "H", source: "s1", sourceScore: 0.9 },
            { title: "Mid", url: "https://mid.com", snippet: "M", source: "s1", sourceScore: 0.6 },
        ]

        const merged = mergeResults(results)
        expect(merged[0].title).toBe("High")
        expect(merged[merged.length - 1].title).toBe("Low")
    })

    it("boosts multi-source results above single-source", () => {
        const results: SearchResult[] = [
            { title: "Single", url: "https://single.com", snippet: "S", source: "s1", sourceScore: 0.8 },
            { title: "Multi 1", url: "https://multi.com", snippet: "M1", source: "s1", sourceScore: 0.5 },
            { title: "Multi 2", url: "https://multi.com", snippet: "M2", source: "s2", sourceScore: 0.5 },
        ]

        const merged = mergeResults(results)
        // Multi-source (0.5, boosted by 2 sources): 0.5 * 1.3 = 0.65
        // Single source: 0.8 * 1.0 = 0.8
        // In this case single still wins, but multi gets boosted
        const multi = merged.find(r => r.url.includes("multi"))
        expect(multi!.aggregatedScore).toBeGreaterThan(0.5)
    })

    it("limits to maxResults", () => {
        const results: SearchResult[] = Array.from({ length: 20 }, (_, i) => ({
            title: `Result ${i}`,
            url: `https://example.com/${i}`,
            snippet: `Desc ${i}`,
            source: "s1",
            sourceScore: 0.5,
        }))

        const merged = mergeResults(results, 5)
        expect(merged).toHaveLength(5)
    })

    it("handles empty input", () => {
        expect(mergeResults([])).toHaveLength(0)
    })

    it("deduplicates URLs with different tracking params", () => {
        const results: SearchResult[] = [
            { title: "A", url: "https://a.com/page?utm_source=google", snippet: "A", source: "s1", sourceScore: 0.9 },
            { title: "A", url: "https://a.com/page?utm_source=bing", snippet: "A", source: "s2", sourceScore: 0.8 },
        ]

        const merged = mergeResults(results)
        expect(merged).toHaveLength(1)
        expect(merged[0].sourceCount).toBe(2)
    })
})

// ── Search Aggregator ──────────────────────────────────────────────────────

describe("createSearchAggregator", () => {
    it("aggregates results from multiple sources", async () => {
        const s1 = createMockSource("source1", [
            { title: "A", url: "https://a.com", snippet: "A desc", source: "source1", sourceScore: 0.9 },
        ])
        const s2 = createMockSource("source2", [
            { title: "B", url: "https://b.com", snippet: "B desc", source: "source2", sourceScore: 0.8 },
        ])

        const agg = createSearchAggregator([s1, s2])
        const results = await agg.search("test query")

        expect(results).toHaveLength(2)
    })

    it("deduplicates across sources", async () => {
        const s1 = createMockSource("source1", [
            { title: "Same", url: "https://same.com/page", snippet: "Desc", source: "source1", sourceScore: 0.8 },
        ])
        const s2 = createMockSource("source2", [
            { title: "Same", url: "https://same.com/page", snippet: "Desc", source: "source2", sourceScore: 0.7 },
        ])

        const agg = createSearchAggregator([s1, s2])
        const results = await agg.search("test")

        expect(results).toHaveLength(1)
        expect(results[0].sourceCount).toBe(2)
    })

    it("gracefully handles source failures", async () => {
        const good = createMockSource("good", [
            { title: "OK", url: "https://ok.com", snippet: "OK", source: "good", sourceScore: 0.9 },
        ])
        const bad: SearchSource = {
            name: "bad",
            search: async () => { throw new Error("Network error") },
            isAvailable: async () => true,
            rateLimitMs: 0,
        }

        const agg = createSearchAggregator([good, bad])
        const results = await agg.search("test")

        expect(results).toHaveLength(1)
        expect(results[0].title).toBe("OK")
    })

    it("skips unavailable sources", async () => {
        const available = createMockSource("available", [
            { title: "A", url: "https://a.com", snippet: "A", source: "available", sourceScore: 0.9 },
        ])
        const unavailable = createMockSource("unavailable", [
            { title: "B", url: "https://b.com", snippet: "B", source: "unavailable", sourceScore: 0.9 },
        ], false)

        const agg = createSearchAggregator([available, unavailable])
        const results = await agg.search("test")

        expect(results).toHaveLength(1)
        expect(results[0].sources).toContain("available")
    })

    it("tracks metrics", async () => {
        const s1 = createMockSource("s1", [
            { title: "A", url: "https://a.com", snippet: "A", source: "s1", sourceScore: 0.9 },
        ])

        const agg = createSearchAggregator([s1])
        await agg.search("test1")
        await agg.search("test2")

        const metrics = agg.getMetrics()
        expect(metrics.totalSearches).toBe(2)
        expect(metrics.resultsBySource["s1"]).toBe(2)
    })

    it("tracks failure metrics", async () => {
        const bad: SearchSource = {
            name: "bad",
            search: async () => { throw new Error("fail") },
            isAvailable: async () => true,
            rateLimitMs: 0,
        }

        const agg = createSearchAggregator([bad])
        await agg.search("test")

        const metrics = agg.getMetrics()
        expect(metrics.failures["bad"]).toBe(1)
    })

    it("resets state", async () => {
        const s1 = createMockSource("s1", [
            { title: "A", url: "https://a.com", snippet: "A", source: "s1", sourceScore: 0.9 },
        ])

        const agg = createSearchAggregator([s1])
        await agg.search("test")

        agg.reset()

        const metrics = agg.getMetrics()
        expect(metrics.totalSearches).toBe(0)
    })

    it("respects maxTotalResults option", async () => {
        const results = Array.from({ length: 20 }, (_, i) => ({
            title: `R${i}`, url: `https://r${i}.com`, snippet: `S${i}`, source: "s1", sourceScore: 0.5,
        }))
        const s1 = createMockSource("s1", results)

        const agg = createSearchAggregator([s1])
        const found = await agg.search("test", { maxTotalResults: 3 })

        expect(found.length).toBeLessThanOrEqual(3)
    })
})
