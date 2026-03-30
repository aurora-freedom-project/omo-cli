/**
 * Community-Based Skill Grouping — SocratiCode/GitNexus-inspired skill clustering.
 *
 * Learned from:
 * - SocratiCode: Qdrant hybrid search with AST-aware chunking for large-scale codebase intelligence
 * - GitNexus: Leiden community detection to group related skills for improved relevance
 *
 * Instead of treating the 1342+ skills as a flat list, this module clusters them
 * into topical communities using keyword co-occurrence analysis. When a skill is
 * matched, its community siblings are also surfaced — dramatically improving
 * recall for related skills that may have different names but similar purpose.
 *
 * Algorithm:
 * 1. Build a keyword co-occurrence graph from skill names + descriptions
 * 2. Apply modularity-based community detection (Louvain-inspired, simplified)
 * 3. When a skill matches, boost its community siblings in search results
 *
 * The algorithm is a simplified Louvain method adapted for in-memory TypeScript
 * execution. No external dependencies required.
 *
 * @see https://github.com/code-yeongyu/SocratiCode (AST-aware chunking)
 * @see Phase 6.2 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface SkillEntry {
    /** Unique skill name/identifier. */
    name: string
    /** Short description. */
    description: string
    /** Optional tags for clustering. */
    tags?: string[]
}

export interface SkillCommunity {
    /** Community identifier (0-based). */
    id: number
    /** Label derived from most common keywords. */
    label: string
    /** Member skill names. */
    members: string[]
    /** Top keywords that define this community. */
    keywords: string[]
}

export interface SkillGroupingResult {
    /** All detected communities. */
    communities: SkillCommunity[]
    /** Skill name → community ID mapping. */
    skillToComm: Map<string, number>
    /** Total number of skills processed. */
    totalSkills: number
    /** Number of communities detected. */
    communityCount: number
}

export interface CommunityBoost {
    /** Sibling skills in the same community. */
    siblings: string[]
    /** Community label for context. */
    communityLabel: string
    /** Community ID. */
    communityId: number
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum keyword overlap ratio to create an edge between two skills. */
const MIN_EDGE_WEIGHT = 0.2

/** Minimum community size to keep (prune tiny communities). */
const MIN_COMMUNITY_SIZE = 2

/** Maximum number of siblings to return in a community boost. */
const MAX_SIBLINGS = 8

/** Maximum keywords used to label a community. */
const MAX_COMMUNITY_KEYWORDS = 5

/** Stop words to exclude from keyword extraction. */
const STOP_WORDS = new Set([
    "the", "a", "an", "is", "are", "to", "in", "for", "on", "with", "at", "by",
    "from", "of", "and", "or", "not", "this", "that", "it", "be", "do", "have",
    "will", "can", "use", "using", "based", "tool", "agent", "skill", "system",
    "code", "file", "data", "test", "create", "build", "make", "set", "get",
])

// ── Keyword Extraction (pure) ──────────────────────────────────────────────

/**
 * Extract meaningful keywords from a skill's name and description.
 */
export function extractKeywords(skill: SkillEntry): string[] {
    const text = `${skill.name.replace(/[-_]/g, " ")} ${skill.description}`.toLowerCase()
    const words = text
        .split(/[^a-z0-9]+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w))

    // Deduplicate while preserving order
    const seen = new Set<string>()
    const unique: string[] = []
    for (const w of words) {
        if (!seen.has(w)) {
            seen.add(w)
            unique.push(w)
        }
    }

    // Also include any explicit tags
    if (skill.tags) {
        for (const tag of skill.tags) {
            const t = tag.toLowerCase().trim()
            if (t.length > 2 && !seen.has(t)) {
                seen.add(t)
                unique.push(t)
            }
        }
    }

    return unique.slice(0, 20) // cap at 20 keywords
}

// ── Jaccard Similarity (pure) ──────────────────────────────────────────────

/**
 * Compute Jaccard similarity between two keyword sets.
 */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 && setB.size === 0) return 0

    let intersection = 0
    for (const w of setA) {
        if (setB.has(w)) intersection++
    }

    const union = setA.size + setB.size - intersection
    return union > 0 ? intersection / union : 0
}

// ── Community Detection (simplified Louvain) ───────────────────────────────

/**
 * Assign communities using a greedy modularity optimization.
 *
 * This is a simplified version of the Louvain algorithm:
 * 1. Start with each node in its own community
 * 2. For each node, try moving it to the community of its strongest neighbor
 * 3. Repeat until no beneficial moves remain
 *
 * The simplification avoids the full modularity calculation and instead
 * uses direct edge weight comparison — sufficient for skill clustering
 * where communities are relatively clear-cut.
 */
export function detectCommunities(
    skills: SkillEntry[],
): SkillGroupingResult {
    if (skills.length === 0) {
        return {
            communities: [],
            skillToComm: new Map(),
            totalSkills: 0,
            communityCount: 0,
        }
    }

    // Step 1: Extract keywords for each skill
    const skillKeywords: Map<string, Set<string>> = new Map()
    for (const skill of skills) {
        skillKeywords.set(skill.name, new Set(extractKeywords(skill)))
    }

    // Step 2: Build adjacency list (edge weight = Jaccard similarity)
    const edges: Map<string, Map<string, number>> = new Map()
    const skillNames = skills.map(s => s.name)

    for (let i = 0; i < skillNames.length; i++) {
        const a = skillNames[i]
        const kwA = skillKeywords.get(a)!

        if (!edges.has(a)) edges.set(a, new Map())

        for (let j = i + 1; j < skillNames.length; j++) {
            const b = skillNames[j]
            const kwB = skillKeywords.get(b)!
            const sim = jaccardSimilarity(kwA, kwB)

            if (sim >= MIN_EDGE_WEIGHT) {
                if (!edges.has(b)) edges.set(b, new Map())
                edges.get(a)!.set(b, sim)
                edges.get(b)!.set(a, sim)
            }
        }
    }

    // Step 3: Initialize each skill in its own community
    const communityOf: Map<string, number> = new Map()
    let nextCommId = 0
    for (const name of skillNames) {
        communityOf.set(name, nextCommId++)
    }

    // Step 4: Greedy community merging (simplified Louvain pass)
    let changed = true
    let iterations = 0
    const maxIterations = 10

    while (changed && iterations < maxIterations) {
        changed = false
        iterations++

        for (const node of skillNames) {
            const neighbors = edges.get(node)
            if (!neighbors || neighbors.size === 0) continue

            // Find the neighbor community with strongest total connection
            const commWeights: Map<number, number> = new Map()
            for (const [neighbor, weight] of neighbors) {
                const neighborComm = communityOf.get(neighbor)!
                commWeights.set(neighborComm, (commWeights.get(neighborComm) ?? 0) + weight)
            }

            // Find best community
            let bestComm = communityOf.get(node)!
            let bestWeight = 0

            for (const [comm, weight] of commWeights) {
                if (weight > bestWeight) {
                    bestWeight = weight
                    bestComm = comm
                }
            }

            // Move if beneficial (different community with stronger connection)
            const currentComm = communityOf.get(node)!
            const currentWeight = commWeights.get(currentComm) ?? 0

            if (bestComm !== currentComm && bestWeight > currentWeight) {
                communityOf.set(node, bestComm)
                changed = true
            }
        }
    }

    // Step 5: Build community objects
    const commMembers: Map<number, string[]> = new Map()
    for (const [name, commId] of communityOf) {
        if (!commMembers.has(commId)) commMembers.set(commId, [])
        commMembers.get(commId)!.push(name)
    }

    // Re-index communities (0-based, sorted by size descending)
    const sortedComms = [...commMembers.entries()]
        .filter(([_, members]) => members.length >= MIN_COMMUNITY_SIZE)
        .sort((a, b) => b[1].length - a[1].length)

    const communities: SkillCommunity[] = []
    const skillToComm = new Map<string, number>()

    for (let i = 0; i < sortedComms.length; i++) {
        const [_, members] = sortedComms[i]

        // Extract community-level keywords (most common across members)
        const kwFreq: Map<string, number> = new Map()
        for (const member of members) {
            const kws = skillKeywords.get(member)
            if (kws) {
                for (const kw of kws) {
                    kwFreq.set(kw, (kwFreq.get(kw) ?? 0) + 1)
                }
            }
        }

        const topKeywords = [...kwFreq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_COMMUNITY_KEYWORDS)
            .map(([kw]) => kw)

        const label = topKeywords.slice(0, 3).join(" + ")

        communities.push({
            id: i,
            label,
            members,
            keywords: topKeywords,
        })

        for (const member of members) {
            skillToComm.set(member, i)
        }
    }

    // Skills not in any community (singletons) — assign to -1
    for (const name of skillNames) {
        if (!skillToComm.has(name)) {
            skillToComm.set(name, -1)
        }
    }

    log("[skill-grouping] Community detection complete", {
        totalSkills: skills.length,
        communities: communities.length,
        iterations,
        largestCommunity: communities.length > 0 ? communities[0].members.length : 0,
    })

    return {
        communities,
        skillToComm,
        totalSkills: skills.length,
        communityCount: communities.length,
    }
}

// ── Community Boosting ─────────────────────────────────────────────────────

/**
 * Create a community booster that recommends sibling skills.
 *
 * Usage:
 * 1. Call `detectCommunities()` with your skill catalog at boot time
 * 2. Create a booster with the result
 * 3. When a skill is matched, call `booster.getSiblings(skillName)` to get
 *    related skills from the same community
 */
export function createCommunityBooster(grouping: SkillGroupingResult) {
    /**
     * Get community siblings for a matched skill.
     * Returns empty result if skill has no community.
     */
    function getSiblings(skillName: string): CommunityBoost | null {
        const commId = grouping.skillToComm.get(skillName)
        if (commId === undefined || commId === -1) return null

        const community = grouping.communities.find(c => c.id === commId)
        if (!community) return null

        const siblings = community.members
            .filter(m => m !== skillName)
            .slice(0, MAX_SIBLINGS)

        if (siblings.length === 0) return null

        return {
            siblings,
            communityLabel: community.label,
            communityId: commId,
        }
    }

    /**
     * Get community information for a set of skills.
     * Returns all unique communities represented.
     */
    function getCommunitiesForSkills(skillNames: string[]): SkillCommunity[] {
        const commIds = new Set<number>()
        for (const name of skillNames) {
            const commId = grouping.skillToComm.get(name)
            if (commId !== undefined && commId >= 0) {
                commIds.add(commId)
            }
        }

        return grouping.communities.filter(c => commIds.has(c.id))
    }

    /**
     * Get the full community label for a skill.
     */
    function getCommunityLabel(skillName: string): string | null {
        const commId = grouping.skillToComm.get(skillName)
        if (commId === undefined || commId === -1) return null

        const community = grouping.communities.find(c => c.id === commId)
        return community?.label ?? null
    }

    return {
        getSiblings,
        getCommunitiesForSkills,
        getCommunityLabel,
        grouping,
    }
}
