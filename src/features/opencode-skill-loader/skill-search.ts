/**
 * BM25 Skill Search Engine
 *
 * Ranks skills by relevance to a user prompt using the Okapi BM25 algorithm.
 * Inspired by OmniUltraAgent_Kit's search module, adapted for omo-cli's
 * LoadedSkill type and lazy-loaded content.
 *
 * Search fields (weighted):
 * - skill.name (×2 boost)
 * - skill.definition.description (×1.5 boost)
 * - skill.definition.template (×1 — full SKILL.md body)
 *
 * Usage:
 *   const results = searchSkills("build a REST API", mergedSkills, 3);
 *   // → [{ skill, score: 0.82 }, { skill, score: 0.65 }, ...]
 */

import type { LoadedSkill } from "./types"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BM25Config {
    readonly k1: number  // Term frequency saturation (default: 1.2)
    readonly b: number   // Length normalization (default: 0.75)
}

export interface SkillSearchResult {
    readonly skill: LoadedSkill
    readonly score: number
}

const DEFAULT_BM25_CONFIG: BM25Config = { k1: 1.2, b: 0.75 }

// Minimum score threshold for results to be considered relevant
const MIN_SCORE_THRESHOLD = 0.1

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

/**
 * Tokenize text into lowercase tokens, stripping punctuation.
 * Filters out tokens shorter than 2 characters and common stop words.
 */
const STOP_WORDS = new Set([
    "the", "is", "at", "of", "on", "and", "or", "to", "in", "for",
    "with", "this", "that", "from", "by", "an", "be", "as", "are",
    "was", "were", "been", "use", "when", "you", "your", "can",
])

export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

// ---------------------------------------------------------------------------
// BM25 Core
// ---------------------------------------------------------------------------

/**
 * Calculate Inverse Document Frequency for a term.
 * IDF(t) = ln((N - n + 0.5) / (n + 0.5) + 1)
 */
export function calculateIDF(term: string, documents: string[][]): number {
    const N = documents.length
    const n = documents.filter((doc) => doc.includes(term)).length
    return Math.log((N - n + 0.5) / (n + 0.5) + 1)
}

/**
 * Calculate BM25 score for a query against a single document.
 */
export function calculateBM25(
    queryTokens: string[],
    documentTokens: string[],
    idfMap: Map<string, number>,
    avgdl: number,
    config: BM25Config = DEFAULT_BM25_CONFIG,
): number {
    const dl = documentTokens.length
    if (dl === 0) return 0

    // Build term frequency map for document
    const termFreqs = new Map<string, number>()
    for (const token of documentTokens) {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1)
    }

    let score = 0
    for (const term of queryTokens) {
        const idf = idfMap.get(term) || 0
        const f = termFreqs.get(term) || 0
        if (f === 0) continue

        const numerator = f * (config.k1 + 1)
        const denominator = f + config.k1 * (1 - config.b + config.b * (dl / avgdl))
        score += idf * (numerator / denominator)
    }

    return score
}

// ---------------------------------------------------------------------------
// Skill Document Builder
// ---------------------------------------------------------------------------

/**
 * Build a searchable text corpus from a LoadedSkill.
 * Applies field-level boosting by repeating important fields.
 */
function buildSkillDocument(skill: LoadedSkill): string {
    const parts: string[] = []

    // Name: 2x boost (repeat for emphasis)
    const name = skill.name.replace(/[-_]/g, " ")
    parts.push(name, name)

    // Description: 1.5x boost
    const desc = skill.definition.description ?? ""
    if (desc) {
        parts.push(desc)
        // Half-boost: add description words again
        parts.push(...desc.split(/\s+/).slice(0, 20))
    }

    // Template (SKILL.md body): 1x — take first 500 chars to avoid oversized docs
    const template = skill.definition.template ?? ""
    if (template) {
        parts.push(template.slice(0, 500))
    }

    return parts.join(" ")
}

// ---------------------------------------------------------------------------
// Main Search Function
// ---------------------------------------------------------------------------

/**
 * Search skills using BM25 ranking.
 *
 * @param query - User prompt or search text
 * @param skills - Array of loaded skills to search against
 * @param limit - Maximum number of results (default: 5)
 * @param config - BM25 tuning parameters
 * @returns Ranked skill results with scores, filtered by MIN_SCORE_THRESHOLD
 */
export function searchSkills(
    query: string,
    skills: LoadedSkill[],
    limit = 5,
    config: BM25Config = DEFAULT_BM25_CONFIG,
): SkillSearchResult[] {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0 || skills.length === 0) return []

    // Tokenize all skill documents
    const documents = skills.map((skill) => tokenize(buildSkillDocument(skill)))

    const N = documents.length
    if (N === 0) return []

    // Average document length
    const avgdl = documents.reduce((sum, doc) => sum + doc.length, 0) / N

    // Pre-compute IDF for all query terms
    const idfMap = new Map<string, number>()
    for (const term of queryTokens) {
        idfMap.set(term, calculateIDF(term, documents))
    }

    // Score each skill
    const results: SkillSearchResult[] = skills.map((skill, i) => ({
        skill,
        score: calculateBM25(queryTokens, documents[i], idfMap, avgdl, config),
    }))

    return results
        .filter((r) => r.score > MIN_SCORE_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
}

/**
 * Quick check: does the query have any potential skill matches?
 * Faster than full searchSkills() for guard checks.
 */
export function hasSkillMatches(
    query: string,
    skills: LoadedSkill[],
    threshold = MIN_SCORE_THRESHOLD,
): boolean {
    const results = searchSkills(query, skills, 1)
    return results.length > 0 && results[0].score > threshold
}
