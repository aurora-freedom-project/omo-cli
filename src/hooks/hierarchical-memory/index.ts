/**
 * Hierarchical Memory — AutoGPT/PentAGI-inspired 3-layer memory system.
 *
 * Learned from:
 * - AutoGPT (175K⭐): Short-term → Long-term → Procedural memory hierarchy
 * - PentAGI (14K⭐): Graphiti-based episodic memory with semantic relations
 *
 * Memory layers:
 * 1. **Episodic** — Session-specific experiences (tool calls, outcomes)
 *    Ephemeral: cleared when session ends.
 *
 * 2. **Semantic** — Learned concepts and facts that persist across sessions
 *    Distilled from successful episodic memories.
 *    Example: "This project uses vitest, not jest" or "Auth module is in src/auth/"
 *
 * 3. **Procedural** — Reusable action patterns that worked before
 *    Extracted from repeated successful trajectories.
 *    Example: "To add a new hook: create dir, write index.ts, write test, register in hooks/index.ts"
 *
 * The hierarchy enables smarter recall: procedural knowledge is most valuable
 * (directly reusable), then semantic (contextual), then episodic (specific).
 *
 * @see Phase 7.2 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type MemoryLayer = "episodic" | "semantic" | "procedural"

export interface MemoryEntry {
    /** Unique entry ID. */
    id: string
    /** Memory layer. */
    layer: MemoryLayer
    /** Content/description of the memory. */
    content: string
    /** Tags for search. */
    tags: string[]
    /** When this memory was created. */
    createdAt: number
    /** Last time this memory was recalled (for decay/refresh). */
    lastRecalledAt: number
    /** Number of times recalled (higher = more valuable). */
    recallCount: number
    /** Confidence score (0-1). */
    confidence: number
    /** Source session(s) that created this memory. */
    sourceSessions: string[]
    /** Project context. */
    project: string
}

export interface EpisodicEntry extends MemoryEntry {
    layer: "episodic"
    /** Session this episode belongs to. */
    sessionId: string
    /** Tool calls that were part of this episode. */
    toolCalls: string[]
    /** Outcome of the episode. */
    outcome: "success" | "failure" | "partial"
}

export interface SemanticEntry extends MemoryEntry {
    layer: "semantic"
    /** Category of this concept. */
    category: "fact" | "convention" | "architecture" | "dependency" | "gotcha"
    /** How many episodic memories support this concept. */
    supportCount: number
}

export interface ProceduralEntry extends MemoryEntry {
    layer: "procedural"
    /** Steps of the procedure. */
    steps: string[]
    /** Success rate (0-1) based on past executions. */
    successRate: number
    /** Number of times this procedure was executed. */
    executionCount: number
}

export interface RecallResult {
    /** Top recalled memories, sorted by relevance. */
    memories: MemoryEntry[]
    /** Breakdown by layer. */
    byLayer: Record<MemoryLayer, MemoryEntry[]>
    /** Formatted context string for injection. */
    contextBlock: string
}

export interface HierarchicalMemoryMetrics {
    /** Total memories per layer. */
    countByLayer: Record<MemoryLayer, number>
    /** Total recall operations. */
    totalRecalls: number
    /** Average confidence per layer. */
    avgConfidenceByLayer: Record<MemoryLayer, number>
    /** Active sessions (with episodic memory). */
    activeSessions: number
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Recall priority weights per layer. */
const LAYER_WEIGHTS: Record<MemoryLayer, number> = {
    procedural: 1.0,   // Most valuable — directly reusable
    semantic: 0.8,     // Contextual knowledge
    episodic: 0.5,     // Specific but possibly stale
}

/** Maximum entries per recall operation. */
const MAX_RECALL_ENTRIES = 10

/** Minimum confidence to include in recall. */
const MIN_CONFIDENCE = 0.3

/** Boost per recall (memories that are recalled more are more valuable). */
const RECALL_BOOST = 0.02

/** Maximum episodic entries per session (prevents memory bloat). */
const MAX_EPISODIC_PER_SESSION = 50

// ── Scoring (pure) ─────────────────────────────────────────────────────────

/**
 * Compute relevance score for a memory entry against a query.
 *
 * Formula: keywordOverlap × layerWeight × (1 + recallBoost) × confidenceWeight
 */
export function computeRelevanceScore(
    entry: MemoryEntry,
    queryKeywords: string[],
): number {
    // Keyword overlap (simple bag-of-words)
    const entryWords = new Set(
        `${entry.content} ${entry.tags.join(" ")}`.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    )
    const queryWords = queryKeywords.map(w => w.toLowerCase())

    let overlapCount = 0
    for (const qw of queryWords) {
        if (entryWords.has(qw)) overlapCount++
    }

    const overlap = queryWords.length > 0 ? overlapCount / queryWords.length : 0
    if (overlap === 0) return 0

    // Layer weight
    const layerWeight = LAYER_WEIGHTS[entry.layer]

    // Recall boost (frequently recalled = more valuable)
    const recallBoost = 1 + (entry.recallCount * RECALL_BOOST)

    // Confidence weight
    const confidenceWeight = Math.max(0.1, entry.confidence)

    return overlap * layerWeight * recallBoost * confidenceWeight
}

/**
 * Extract keywords from text for matching.
 */
export function extractQueryKeywords(text: string): string[] {
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "to", "in", "for", "on", "with", "at",
        "by", "from", "of", "and", "or", "not", "this", "that", "it", "do",
        "have", "will", "can", "please", "need", "want",
    ])

    return text.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w))
        .map(w => w.replace(/[^a-z0-9_-]/g, ""))
        .filter(w => w.length > 2)
}

// ── Hierarchical Memory Manager ────────────────────────────────────────────

/**
 * Create a Hierarchical Memory manager.
 */
export function createHierarchicalMemory(project: string) {
    const episodic = new Map<string, EpisodicEntry>()
    const semantic = new Map<string, SemanticEntry>()
    const procedural = new Map<string, ProceduralEntry>()
    let totalRecalls = 0
    let nextId = 1

    function genId(prefix: string): string {
        return `${prefix}_${nextId++}_${Date.now().toString(36)}`
    }

    // ── Episodic Layer ─────────────────────────────────────────────────

    /**
     * Record an episodic memory (session-specific experience).
     */
    function recordEpisode(
        sessionId: string,
        content: string,
        toolCalls: string[],
        outcome: EpisodicEntry["outcome"],
        tags: string[] = [],
    ): string {
        // Check session limit
        const sessionEpisodes = [...episodic.values()].filter(e => e.sessionId === sessionId)
        if (sessionEpisodes.length >= MAX_EPISODIC_PER_SESSION) {
            // Remove oldest episode for this session
            const oldest = sessionEpisodes.sort((a, b) => a.createdAt - b.createdAt)[0]
            episodic.delete(oldest.id)
        }

        const id = genId("ep")
        const entry: EpisodicEntry = {
            id,
            layer: "episodic",
            content,
            tags: ["episodic", ...tags],
            createdAt: Date.now(),
            lastRecalledAt: 0,
            recallCount: 0,
            confidence: outcome === "success" ? 0.9 : outcome === "partial" ? 0.6 : 0.3,
            sourceSessions: [sessionId],
            project,
            sessionId,
            toolCalls,
            outcome,
        }

        episodic.set(id, entry)
        log("[hierarchical-memory] Recorded episode", { id, sessionId, outcome })
        return id
    }

    // ── Semantic Layer ─────────────────────────────────────────────────

    /**
     * Store a semantic concept (learned fact that persists across sessions).
     */
    function learnConcept(
        content: string,
        category: SemanticEntry["category"],
        tags: string[] = [],
        sourceSession?: string,
    ): string {
        // Check for existing concept with similar content
        for (const [existingId, existing] of semantic) {
            const overlap = computeContentSimilarity(existing.content, content)
            if (overlap > 0.7) {
                // Update existing concept instead of creating new
                existing.supportCount++
                existing.confidence = Math.min(1.0, existing.confidence + 0.05)
                existing.lastRecalledAt = Date.now()
                if (sourceSession) existing.sourceSessions.push(sourceSession)
                log("[hierarchical-memory] Reinforced concept", { id: existingId })
                return existingId
            }
        }

        const id = genId("sem")
        const entry: SemanticEntry = {
            id,
            layer: "semantic",
            content,
            tags: ["semantic", category, ...tags],
            createdAt: Date.now(),
            lastRecalledAt: 0,
            recallCount: 0,
            confidence: 0.7,
            sourceSessions: sourceSession ? [sourceSession] : [],
            project,
            category,
            supportCount: 1,
        }

        semantic.set(id, entry)
        log("[hierarchical-memory] Learned concept", { id, category })
        return id
    }

    // ── Procedural Layer ───────────────────────────────────────────────

    /**
     * Store a procedural pattern (reusable action sequence).
     */
    function learnProcedure(
        content: string,
        steps: string[],
        tags: string[] = [],
        sourceSession?: string,
    ): string {
        const id = genId("proc")
        const entry: ProceduralEntry = {
            id,
            layer: "procedural",
            content,
            tags: ["procedural", ...tags],
            createdAt: Date.now(),
            lastRecalledAt: 0,
            recallCount: 0,
            confidence: 0.8,
            sourceSessions: sourceSession ? [sourceSession] : [],
            project,
            steps,
            successRate: 1.0,
            executionCount: 1,
        }

        procedural.set(id, entry)
        log("[hierarchical-memory] Learned procedure", { id, steps: steps.length })
        return id
    }

    /**
     * Record a procedure execution outcome (updates success rate).
     */
    function recordProcedureOutcome(id: string, succeeded: boolean): boolean {
        const proc = procedural.get(id)
        if (!proc) return false

        proc.executionCount++
        // Running average of success rate
        proc.successRate = (proc.successRate * (proc.executionCount - 1) + (succeeded ? 1 : 0)) / proc.executionCount
        proc.confidence = Math.max(0.3, proc.successRate)
        return true
    }

    // ── Recall ─────────────────────────────────────────────────────────

    /**
     * Recall memories relevant to a query.
     *
     * Searches all 3 layers, scores by relevance, and returns top results
     * with procedural > semantic > episodic prioritization.
     */
    function recall(queryText: string, maxResults: number = MAX_RECALL_ENTRIES): RecallResult {
        totalRecalls++
        const keywords = extractQueryKeywords(queryText)

        if (keywords.length === 0) {
            return { memories: [], byLayer: { episodic: [], semantic: [], procedural: [] }, contextBlock: "" }
        }

        // Score all entries
        const scored: Array<{ entry: MemoryEntry; score: number }> = []

        for (const entry of episodic.values()) {
            if (entry.confidence < MIN_CONFIDENCE) continue
            const score = computeRelevanceScore(entry, keywords)
            if (score > 0) scored.push({ entry, score })
        }

        for (const entry of semantic.values()) {
            if (entry.confidence < MIN_CONFIDENCE) continue
            const score = computeRelevanceScore(entry, keywords)
            if (score > 0) scored.push({ entry, score })
        }

        for (const entry of procedural.values()) {
            if (entry.confidence < MIN_CONFIDENCE) continue
            const score = computeRelevanceScore(entry, keywords)
            if (score > 0) scored.push({ entry, score })
        }

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score)
        const top = scored.slice(0, maxResults)

        // Update recall stats
        for (const { entry } of top) {
            entry.lastRecalledAt = Date.now()
            entry.recallCount++
        }

        // Group by layer
        const byLayer: Record<MemoryLayer, MemoryEntry[]> = {
            episodic: top.filter(s => s.entry.layer === "episodic").map(s => s.entry),
            semantic: top.filter(s => s.entry.layer === "semantic").map(s => s.entry),
            procedural: top.filter(s => s.entry.layer === "procedural").map(s => s.entry),
        }

        // Format context block
        const contextBlock = formatRecallContext(top.map(s => s.entry))

        log("[hierarchical-memory] Recall", {
            keywords: keywords.length,
            matched: top.length,
            procedural: byLayer.procedural.length,
            semantic: byLayer.semantic.length,
            episodic: byLayer.episodic.length,
        })

        return { memories: top.map(s => s.entry), byLayer, contextBlock }
    }

    // ── Distillation ───────────────────────────────────────────────────

    /**
     * Distill episodic memories into semantic concepts.
     *
     * Finds patterns in episodic memories and creates semantic entries.
     * Should be called periodically (e.g., end of session).
     */
    function distillEpisodesToSemantic(sessionId: string): string[] {
        const sessionEpisodes = [...episodic.values()]
            .filter(e => e.sessionId === sessionId && e.outcome === "success")

        const created: string[] = []

        // Group by common tags
        const tagGroups = new Map<string, EpisodicEntry[]>()
        for (const ep of sessionEpisodes) {
            for (const tag of ep.tags) {
                if (tag === "episodic") continue
                if (!tagGroups.has(tag)) tagGroups.set(tag, [])
                tagGroups.get(tag)!.push(ep)
            }
        }

        // If 3+ episodes share a tag, create a semantic concept
        for (const [tag, episodes] of tagGroups) {
            if (episodes.length >= 3) {
                const summary = `Recurring pattern (${tag}): ${episodes.map(e => e.content.slice(0, 50)).join(" | ")}`
                const id = learnConcept(summary, "convention", [tag], sessionId)
                created.push(id)
            }
        }

        log("[hierarchical-memory] Distilled", {
            sessionId,
            episodes: sessionEpisodes.length,
            conceptsCreated: created.length,
        })

        return created
    }

    // ── Session Management ─────────────────────────────────────────────

    /**
     * Clear episodic memories for a session.
     */
    function clearSession(sessionId: string): number {
        let cleared = 0
        for (const [id, entry] of episodic) {
            if (entry.sessionId === sessionId) {
                episodic.delete(id)
                cleared++
            }
        }
        return cleared
    }

    /**
     * Get metrics.
     */
    function getMetrics(): HierarchicalMemoryMetrics {
        const activeSessions = new Set<string>()
        for (const entry of episodic.values()) {
            activeSessions.add(entry.sessionId)
        }

        const avgConfidenceByLayer: Record<MemoryLayer, number> = {
            episodic: avgConfidence([...episodic.values()]),
            semantic: avgConfidence([...semantic.values()]),
            procedural: avgConfidence([...procedural.values()]),
        }

        return {
            countByLayer: {
                episodic: episodic.size,
                semantic: semantic.size,
                procedural: procedural.size,
            },
            totalRecalls,
            avgConfidenceByLayer,
            activeSessions: activeSessions.size,
        }
    }

    /**
     * Reset all memory (for testing).
     */
    function reset(): void {
        episodic.clear()
        semantic.clear()
        procedural.clear()
        totalRecalls = 0
        nextId = 1
    }

    return {
        recordEpisode,
        learnConcept,
        learnProcedure,
        recordProcedureOutcome,
        recall,
        distillEpisodesToSemantic,
        clearSession,
        getMetrics,
        reset,
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeContentSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    if (wordsA.size === 0 || wordsB.size === 0) return 0
    let overlap = 0
    for (const w of wordsA) { if (wordsB.has(w)) overlap++ }
    return overlap / Math.max(wordsA.size, wordsB.size)
}

function avgConfidence(entries: MemoryEntry[]): number {
    if (entries.length === 0) return 0
    return entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length
}

function formatRecallContext(entries: MemoryEntry[]): string {
    if (entries.length === 0) return ""
    const lines: string[] = ["--- Recalled Memory ---"]
    for (const entry of entries) {
        const icon = entry.layer === "procedural" ? "🔧" : entry.layer === "semantic" ? "💡" : "📝"
        lines.push(`${icon} [${entry.layer}] ${entry.content.slice(0, 150)}`)
    }
    return lines.join("\n")
}

export { computeContentSimilarity, formatRecallContext }
