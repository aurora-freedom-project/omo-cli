/**
 * Finding Deduplication — Rogue/PentAGI-inspired vulnerability dedup engine.
 *
 * Learned from:
 * - Rogue: CVSS-aware dedup that prevents duplicate findings across stages
 * - PentAGI: Context-aware similarity matching for security findings
 *
 * Security assessments often produce duplicate or near-duplicate findings:
 * - Same vuln found by multiple tools (nmap + nikto both find open port)
 * - Same vuln at different endpoints (/api/v1/users, /api/v2/users)
 * - Same class of vuln with slightly different evidence
 *
 * This module deduplicates findings using:
 * 1. Exact dedup — identical description + evidence hash
 * 2. Fuzzy dedup — high content similarity (>0.7 Jaccard)
 * 3. Class dedup — same vulnerability class + same target
 *
 * When duplicates are found, the highest-severity instance is kept.
 *
 * @see Phase 7.5 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface SecurityFinding {
    /** Unique finding ID. */
    id: string
    /** Finding description. */
    description: string
    /** Severity level. */
    severity: "critical" | "high" | "medium" | "low" | "info"
    /** Evidence (e.g., response data, tool output). */
    evidence: string
    /** Target (e.g., URL, host:port, file path). */
    target: string
    /** Vulnerability class (e.g., "sqli", "xss", "open_port", "misconfiguration"). */
    vulnClass: string
    /** Source tool/stage that found this. */
    source: string
    /** MITRE technique ID if applicable. */
    mitreTechnique?: string
    /** Timestamp. */
    timestamp: number
    /** CVSS score (0-10) if available. */
    cvssScore?: number
}

export interface DedupResult {
    /** Unique findings after dedup. */
    unique: SecurityFinding[]
    /** Duplicate findings that were removed. */
    duplicates: DuplicateGroup[]
    /** Total findings before dedup. */
    beforeCount: number
    /** Total findings after dedup. */
    afterCount: number
    /** Dedup ratio (1.0 = all unique, 0.0 = all duplicates). */
    dedupRatio: number
}

export interface DuplicateGroup {
    /** The finding that was kept (canonical/best). */
    kept: SecurityFinding
    /** The findings that were removed. */
    removed: SecurityFinding[]
    /** Why these were considered duplicates. */
    reason: "exact" | "fuzzy" | "class"
    /** Similarity score for fuzzy matches. */
    similarity?: number
}

export interface DedupMetrics {
    /** Total dedup operations. */
    totalDedups: number
    /** Total findings processed. */
    totalProcessed: number
    /** Total duplicates removed. */
    totalRemoved: number
    /** Avg dedup ratio. */
    avgDedupRatio: number
    /** Breakdown by dedup reason. */
    byReason: Record<string, number>
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Severity ranking (higher = more important, keep these). */
const SEVERITY_RANK: Record<SecurityFinding["severity"], number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
}

/** Fuzzy similarity threshold for dedup. */
const FUZZY_THRESHOLD = 0.7

// ── Similarity Functions (pure) ────────────────────────────────────────────

/**
 * Simple FNV-1a hash for content comparison.
 */
export function hashFinding(finding: SecurityFinding): string {
    const content = `${finding.description}|${finding.evidence}|${finding.target}|${finding.vulnClass}`
    let hash = 0x811c9dc5
    for (let i = 0; i < content.length; i++) {
        hash ^= content.charCodeAt(i)
        hash = (hash * 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, "0")
}

/**
 * Compute word-level Jaccard similarity between two strings.
 */
export function textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    if (wordsA.size === 0 && wordsB.size === 0) return 1.0
    if (wordsA.size === 0 || wordsB.size === 0) return 0

    let intersection = 0
    for (const w of wordsA) {
        if (wordsB.has(w)) intersection++
    }

    const union = wordsA.size + wordsB.size - intersection
    return union > 0 ? intersection / union : 0
}

/**
 * Normalize target for comparison (remove ports, trailing paths).
 */
export function normalizeTarget(target: string): string {
    return target.toLowerCase().trim()
        .replace(/:\d+$/, "")       // Remove port
        .replace(/\/+$/, "")         // Remove trailing slash
        .replace(/\/api\/v\d+/, "")  // Normalize API versions
}

/**
 * Check if two findings are in the same vulnerability class + same target.
 */
export function isClassDuplicate(a: SecurityFinding, b: SecurityFinding): boolean {
    if (a.vulnClass !== b.vulnClass) return false
    return normalizeTarget(a.target) === normalizeTarget(b.target)
}

/**
 * Pick the "better" finding to keep (higher severity, then higher CVSS, then newer).
 */
export function pickBetter(a: SecurityFinding, b: SecurityFinding): SecurityFinding {
    const rankA = SEVERITY_RANK[a.severity]
    const rankB = SEVERITY_RANK[b.severity]
    if (rankA !== rankB) return rankA > rankB ? a : b
    if (a.cvssScore !== undefined && b.cvssScore !== undefined) {
        if (a.cvssScore !== b.cvssScore) return a.cvssScore > b.cvssScore ? a : b
    }
    // Prefer newer finding
    return a.timestamp >= b.timestamp ? a : b
}

// ── Dedup Engine ───────────────────────────────────────────────────────────

/**
 * Deduplicate a set of security findings.
 *
 * 3-pass dedup:
 * 1. Exact — identical hash (description + evidence + target + class)
 * 2. Fuzzy — high text similarity (>0.7) on description + evidence
 * 3. Class — same vulnerability class + same normalized target
 */
export function deduplicateFindings(findings: SecurityFinding[]): DedupResult {
    if (findings.length === 0) {
        return {
            unique: [],
            duplicates: [],
            beforeCount: 0,
            afterCount: 0,
            dedupRatio: 1.0,
        }
    }

    const duplicates: DuplicateGroup[] = []
    let remaining = [...findings]

    // Pass 1: Exact hash dedup
    const hashGroups = new Map<string, SecurityFinding[]>()
    for (const f of remaining) {
        const h = hashFinding(f)
        if (!hashGroups.has(h)) hashGroups.set(h, [])
        hashGroups.get(h)!.push(f)
    }

    remaining = []
    for (const [_, group] of hashGroups) {
        if (group.length === 1) {
            remaining.push(group[0])
        } else {
            // Sort by severity, keep best
            const sorted = group.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
            const kept = sorted[0]
            remaining.push(kept)
            duplicates.push({
                kept,
                removed: sorted.slice(1),
                reason: "exact",
            })
        }
    }

    // Pass 2: Fuzzy dedup (O(n²) — acceptable for security findings which are typically <500)
    const fuzzyRemaining: SecurityFinding[] = []
    const used = new Set<string>()

    for (let i = 0; i < remaining.length; i++) {
        if (used.has(remaining[i].id)) continue

        let canonical = remaining[i]
        const removed: SecurityFinding[] = []

        for (let j = i + 1; j < remaining.length; j++) {
            if (used.has(remaining[j].id)) continue

            const descSim = textSimilarity(canonical.description, remaining[j].description)
            const evidenceSim = textSimilarity(canonical.evidence, remaining[j].evidence)
            const avgSim = (descSim * 0.6) + (evidenceSim * 0.4)

            if (avgSim >= FUZZY_THRESHOLD) {
                const better = pickBetter(canonical, remaining[j])
                const worse = better === canonical ? remaining[j] : canonical

                if (better !== canonical) {
                    removed.push(canonical)
                    canonical = better
                } else {
                    removed.push(worse)
                }

                used.add(worse.id)
            }
        }

        if (removed.length > 0) {
            duplicates.push({
                kept: canonical,
                removed,
                reason: "fuzzy",
                similarity: FUZZY_THRESHOLD,
            })
        }

        fuzzyRemaining.push(canonical)
        used.add(canonical.id)
    }

    // Pass 3: Class dedup
    const classRemaining: SecurityFinding[] = []
    const classUsed = new Set<string>()

    for (let i = 0; i < fuzzyRemaining.length; i++) {
        if (classUsed.has(fuzzyRemaining[i].id)) continue

        let canonical = fuzzyRemaining[i]
        const removed: SecurityFinding[] = []

        for (let j = i + 1; j < fuzzyRemaining.length; j++) {
            if (classUsed.has(fuzzyRemaining[j].id)) continue

            if (isClassDuplicate(canonical, fuzzyRemaining[j])) {
                const better = pickBetter(canonical, fuzzyRemaining[j])
                const worse = better === canonical ? fuzzyRemaining[j] : canonical

                if (better !== canonical) {
                    removed.push(canonical)
                    canonical = better
                } else {
                    removed.push(worse)
                }

                classUsed.add(worse.id)
            }
        }

        if (removed.length > 0) {
            duplicates.push({
                kept: canonical,
                removed,
                reason: "class",
            })
        }

        classRemaining.push(canonical)
        classUsed.add(canonical.id)
    }

    const afterCount = classRemaining.length
    const beforeCount = findings.length

    log("[finding-dedup] Dedup complete", {
        before: beforeCount,
        after: afterCount,
        removed: beforeCount - afterCount,
        exactDupes: duplicates.filter(d => d.reason === "exact").length,
        fuzzyDupes: duplicates.filter(d => d.reason === "fuzzy").length,
        classDupes: duplicates.filter(d => d.reason === "class").length,
    })

    return {
        unique: classRemaining,
        duplicates,
        beforeCount,
        afterCount,
        dedupRatio: beforeCount > 0 ? afterCount / beforeCount : 1.0,
    }
}

// ── Dedup Manager ──────────────────────────────────────────────────────────

/**
 * Create a finding deduplication manager with metrics tracking.
 */
export function createDedupManager() {
    const metrics: DedupMetrics = {
        totalDedups: 0,
        totalProcessed: 0,
        totalRemoved: 0,
        avgDedupRatio: 0,
        byReason: { exact: 0, fuzzy: 0, class: 0 },
    }
    const ratios: number[] = []

    function deduplicate(findings: SecurityFinding[]): DedupResult {
        const result = deduplicateFindings(findings)

        metrics.totalDedups++
        metrics.totalProcessed += result.beforeCount
        metrics.totalRemoved += (result.beforeCount - result.afterCount)

        for (const dup of result.duplicates) {
            metrics.byReason[dup.reason] = (metrics.byReason[dup.reason] ?? 0) + dup.removed.length
        }

        ratios.push(result.dedupRatio)
        metrics.avgDedupRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length

        return result
    }

    function getMetrics(): DedupMetrics {
        return { ...metrics }
    }

    function reset(): void {
        metrics.totalDedups = 0
        metrics.totalProcessed = 0
        metrics.totalRemoved = 0
        metrics.avgDedupRatio = 0
        metrics.byReason = { exact: 0, fuzzy: 0, class: 0 }
        ratios.length = 0
    }

    return { deduplicate, getMetrics, reset }
}
