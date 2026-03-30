/**
 * Multi-Search Aggregation — PentAGI-inspired search engine aggregation.
 *
 * Learned from PentAGI (vxcontrol, ⭐14K): Single-source web search is
 * limited. By combining multiple search sources, deduplicating results,
 * and ranking by cross-source agreement, recall and relevance improve dramatically.
 *
 * Supported sources:
 * - web_query (default, always available)
 * - DuckDuckGo HTML (no API key)
 * - Any custom source via the provider interface
 *
 * Features:
 * - Cross-source result merging with URL-based dedup
 * - Confidence scoring: results found by multiple sources rank higher
 * - Rate limiting per source to avoid bans
 * - Graceful fallback: if one source fails, others still contribute
 *
 * @see Phase 7.1 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface SearchResult {
    /** Page title. */
    title: string
    /** Canonical URL. */
    url: string
    /** Snippet/description. */
    snippet: string
    /** Source that found this result. */
    source: string
    /** Relevance score from the source (0-1). */
    sourceScore: number
}

export interface AggregatedResult {
    /** Page title (from highest-scoring source). */
    title: string
    /** Canonical URL (normalized). */
    url: string
    /** Best snippet. */
    snippet: string
    /** Number of sources that returned this URL. */
    sourceCount: number
    /** Names of sources that found this. */
    sources: string[]
    /** Aggregated relevance score (boosted by cross-source agreement). */
    aggregatedScore: number
}

export interface SearchSource {
    /** Source name. */
    name: string
    /** Search function — returns results for a query. */
    search: (query: string, maxResults: number) => Promise<SearchResult[]>
    /** Whether this source is available (health check). */
    isAvailable: () => Promise<boolean>
    /** Rate limit: minimum ms between calls. */
    rateLimitMs: number
}

export interface AggregationMetrics {
    /** Total searches performed. */
    totalSearches: number
    /** Results per source. */
    resultsBySource: Record<string, number>
    /** Total deduplicated results returned. */
    totalDeduped: number
    /** Average source count per result (cross-source agreement). */
    avgSourceAgreement: number
    /** Source failures. */
    failures: Record<string, number>
}

// ── URL Normalization ──────────────────────────────────────────────────────

/**
 * Normalize a URL for dedup comparison.
 * Removes trailing slashes, fragments, and some tracking params.
 */
export function normalizeUrl(url: string): string {
    try {
        const parsed = new URL(url)
        // Remove common tracking params
        const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref", "fbclid", "gclid"]
        for (const param of trackingParams) {
            parsed.searchParams.delete(param)
        }
        // Remove fragment
        parsed.hash = ""
        // Normalize trailing slash
        let path = parsed.pathname
        if (path.length > 1 && path.endsWith("/")) {
            path = path.slice(0, -1)
        }
        parsed.pathname = path
        return parsed.toString()
    } catch {
        return url.toLowerCase().trim()
    }
}

// ── Aggregation Engine ─────────────────────────────────────────────────────

/**
 * Cross-source agreement boost formula.
 *
 * A result found by N sources gets a boost:
 *   boostedScore = baseScore × (1 + 0.3 × (N - 1))
 *
 * So a result found by 3 sources gets 1.6× the base score.
 */
export function computeAggregatedScore(
    baseScore: number,
    sourceCount: number,
): number {
    const boost = 1 + 0.3 * (sourceCount - 1)
    return Math.min(1.0, baseScore * boost)
}

/**
 * Merge results from multiple sources.
 *
 * 1. Normalize URLs for dedup
 * 2. Group by normalized URL
 * 3. For each group, pick best title/snippet and sum scores
 * 4. Sort by aggregated score descending
 */
export function mergeResults(
    allResults: SearchResult[],
    maxResults: number = 10,
): AggregatedResult[] {
    // Group by normalized URL
    const urlGroups = new Map<string, SearchResult[]>()

    for (const result of allResults) {
        const normalizedUrl = normalizeUrl(result.url)
        if (!urlGroups.has(normalizedUrl)) {
            urlGroups.set(normalizedUrl, [])
        }
        urlGroups.get(normalizedUrl)!.push(result)
    }

    // Build aggregated results
    const aggregated: AggregatedResult[] = []

    for (const [_, results] of urlGroups) {
        // Pick the result with the highest source score for title/snippet
        const best = results.reduce((a, b) => a.sourceScore >= b.sourceScore ? a : b)
        const sourceCount = new Set(results.map(r => r.source)).size
        const sources = [...new Set(results.map(r => r.source))]
        const avgSourceScore = results.reduce((sum, r) => sum + r.sourceScore, 0) / results.length

        aggregated.push({
            title: best.title,
            url: best.url,
            snippet: best.snippet,
            sourceCount,
            sources,
            aggregatedScore: computeAggregatedScore(avgSourceScore, sourceCount),
        })
    }

    // Sort by aggregated score descending, then by source count
    return aggregated
        .sort((a, b) => {
            if (Math.abs(b.aggregatedScore - a.aggregatedScore) > 0.01) {
                return b.aggregatedScore - a.aggregatedScore
            }
            return b.sourceCount - a.sourceCount
        })
        .slice(0, maxResults)
}

// ── Search Aggregator ──────────────────────────────────────────────────────

/**
 * Create a Multi-Search Aggregator.
 */
export function createSearchAggregator(sources: SearchSource[]) {
    const lastCallTime = new Map<string, number>()
    const metrics: AggregationMetrics = {
        totalSearches: 0,
        resultsBySource: {},
        totalDeduped: 0,
        avgSourceAgreement: 0,
        failures: {},
    }

    /**
     * Check if a source is rate-limited.
     */
    function isRateLimited(source: SearchSource): boolean {
        const lastCall = lastCallTime.get(source.name)
        if (!lastCall) return false
        return Date.now() - lastCall < source.rateLimitMs
    }

    /**
     * Search across all available sources and aggregate results.
     */
    async function search(
        query: string,
        options?: {
            maxResultsPerSource?: number
            maxTotalResults?: number
            timeout?: number
        },
    ): Promise<AggregatedResult[]> {
        const maxPerSource = options?.maxResultsPerSource ?? 5
        const maxTotal = options?.maxTotalResults ?? 10
        const timeout = options?.timeout ?? 5000

        metrics.totalSearches++

        // Query all non-rate-limited sources in parallel
        const searchPromises = sources
            .filter(source => !isRateLimited(source))
            .map(async (source): Promise<SearchResult[]> => {
                try {
                    const available = await source.isAvailable()
                    if (!available) {
                        log("[multi-search] Source unavailable", { source: source.name })
                        return []
                    }

                    // Race with timeout
                    const results = await Promise.race([
                        source.search(query, maxPerSource),
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error("Search timeout")), timeout)
                        ),
                    ])

                    // Update rate limit
                    lastCallTime.set(source.name, Date.now())

                    // Track metrics
                    metrics.resultsBySource[source.name] =
                        (metrics.resultsBySource[source.name] ?? 0) + results.length

                    log("[multi-search] Source returned", {
                        source: source.name,
                        results: results.length,
                    })

                    return results
                } catch (err) {
                    metrics.failures[source.name] =
                        (metrics.failures[source.name] ?? 0) + 1
                    log("[multi-search] Source failed", {
                        source: source.name,
                        error: String(err),
                    })
                    return []
                }
            })

        // Wait for all sources (settle — don't fail on one source)
        const settled = await Promise.allSettled(searchPromises)
        const allResults = settled
            .filter((r): r is PromiseFulfilledResult<SearchResult[]> => r.status === "fulfilled")
            .flatMap(r => r.value)

        // Merge and deduplicate
        const aggregated = mergeResults(allResults, maxTotal)
        metrics.totalDeduped += aggregated.length

        // Update average source agreement
        if (aggregated.length > 0) {
            const totalAgreement = aggregated.reduce((sum, r) => sum + r.sourceCount, 0)
            metrics.avgSourceAgreement = totalAgreement / aggregated.length
        }

        log("[multi-search] Aggregated", {
            sources: sources.length,
            rawResults: allResults.length,
            dedupedResults: aggregated.length,
        })

        return aggregated
    }

    /**
     * Get aggregation metrics.
     */
    function getMetrics(): AggregationMetrics {
        return { ...metrics }
    }

    /**
     * Reset metrics and rate limits.
     */
    function reset(): void {
        lastCallTime.clear()
        metrics.totalSearches = 0
        metrics.resultsBySource = {}
        metrics.totalDeduped = 0
        metrics.avgSourceAgreement = 0
        metrics.failures = {}
    }

    return {
        search,
        getMetrics,
        reset,
    }
}

// ── Built-in Source Factories ───────────────────────────────────────────────

/**
 * Create a mock search source (for testing).
 */
export function createMockSource(
    name: string,
    results: SearchResult[],
    available: boolean = true,
): SearchSource {
    return {
        name,
        search: async () => results,
        isAvailable: async () => available,
        rateLimitMs: 0,
    }
}
