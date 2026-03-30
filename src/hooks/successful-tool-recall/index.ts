/**
 * Successful Tool Recall — Index what worked, recall for similar contexts.
 *
 * Inspired by PentAGI's Graphiti-based `SuccessfulToolsSearch`:
 * - After each tool execution, record {tool, args, context, outcome, success}
 * - When agent needs to choose a tool, query: "what tools worked for similar contexts?"
 * - Temporal windowing: recent successes weighted higher
 * - Integration point for `reasoning-bank` enrichment
 *
 * Unlike reasoning-bank (which records full trajectories), this module
 * specifically indexes individual tool outcomes for fast retrieval.
 *
 * @see PentAGI: backend/pkg/graph/graphiti.go — SuccessfulToolsSearch
 * @see PentAGI: backend/pkg/providers/provider/agents.go — tool success tracking
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

const HOOK_NAME = "successful-tool-recall"

// ── Types ──────────────────────────────────────────────────────────────────

export interface ToolOutcome {
    /** Unique ID for this outcome record. */
    id: string
    /** Tool name that was executed. */
    tool: string
    /** Compressed representation of key arguments. */
    argsFingerprint: string
    /** Context keywords when this tool was called. */
    contextKeywords: string[]
    /** Whether the tool execution was considered successful. */
    success: boolean
    /** Brief description of the outcome. */
    outcomeLabel: string
    /** Duration of execution in ms. */
    durationMs: number
    /** Timestamp when this was recorded. */
    timestamp: number
    /** Weight for recall scoring (decays over time). */
    weight: number
}

export interface RecallQuery {
    /** Current context keywords to match against. */
    contextKeywords: string[]
    /** Optional: filter to specific tool names. */
    toolFilter?: string[]
    /** Maximum number of results to return (default: 5). */
    maxResults?: number
    /** Time window in ms — how far back to look (default: 7 days). */
    timeWindowMs?: number
    /** Minimum success rate to consider (default: 0.5). */
    minSuccessRate?: number
}

export interface RecallResult {
    /** Tool name. */
    tool: string
    /** Number of successful uses in this context. */
    successCount: number
    /** Number of total uses in this context. */
    totalCount: number
    /** Success rate (0-1). */
    successRate: number
    /** Weighted score (combines success rate + recency + context similarity). */
    score: number
    /** Most recent outcome. */
    lastOutcome: ToolOutcome
    /** Context overlap percentage. */
    contextOverlap: number
}

export interface RecallConfig {
    /** Enable/disable recall. */
    enabled: boolean
    /** Maximum number of outcomes to store per session (ring buffer). */
    maxOutcomesPerSession: number
    /** Maximum number of outcomes in global store. */
    maxGlobalOutcomes: number
    /** Time decay half-life in ms (default: 24h). */
    decayHalfLifeMs: number
    /** Minimum context keyword overlap to consider a match (0-1). */
    minContextOverlap: number
    /** Auto-detect success from tool output (heuristic). */
    autoDetectSuccess: boolean
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RecallConfig = {
    enabled: true,
    maxOutcomesPerSession: 200,
    maxGlobalOutcomes: 2000,
    decayHalfLifeMs: 24 * 60 * 60 * 1000, // 24 hours
    minContextOverlap: 0.2,
    autoDetectSuccess: true,
}

// ── Outcome Store ──────────────────────────────────────────────────────────

/** Global outcome store (persists across sessions). */
const globalOutcomes: ToolOutcome[] = []

/** Per-session outcome store. */
const sessionOutcomes = new Map<string, ToolOutcome[]>()

/** Current context keywords per session. */
const sessionContexts = new Map<string, Set<string>>()

// ── Utility Functions ──────────────────────────────────────────────────────

/**
 * Extract keywords from text for context matching.
 */
export function extractContextKeywords(text: string): string[] {
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "must", "shall", "can", "need", "dare",
        "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
        "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
        "this", "that", "these", "those", "it", "its", "i", "you", "he",
        "she", "we", "they", "me", "him", "her", "us", "them", "my", "your",
        "please", "make", "use", "add", "create", "update", "fix", "change",
        "let", "get", "set", "run", "see", "try", "put", "say", "go",
    ])

    return text.toLowerCase()
        .replace(/[^a-z0-9\s-_]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w))
        .filter((w, i, arr) => arr.indexOf(w) === i) // unique
        .slice(0, 20) // max 20 keywords
}

/**
 * Compute Jaccard similarity between two keyword sets.
 */
export function contextSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 1
    if (a.length === 0 || b.length === 0) return 0

    const setA = new Set(a)
    const setB = new Set(b)
    let intersection = 0

    for (const item of setA) {
        if (setB.has(item)) intersection++
    }

    const union = setA.size + setB.size - intersection
    return union === 0 ? 0 : intersection / union
}

/**
 * Compute time-decay weight for a past outcome.
 */
export function computeDecayWeight(outcomeTimestamp: number, halfLifeMs: number): number {
    const age = Date.now() - outcomeTimestamp
    if (age <= 0) return 1
    return Math.pow(0.5, age / halfLifeMs)
}

/**
 * Auto-detect whether a tool execution was successful based on output heuristics.
 */
export function autoDetectSuccess(
    toolName: string,
    output: string,
    _exitCode?: number,
): boolean {
    if (!output || output.length === 0) return false

    const normalizedOutput = output.toLowerCase()

    // Explicit failure indicators
    const failurePatterns = [
        /error:/i, /failed:/i, /exception/i, /traceback/i,
        /command not found/i, /permission denied/i, /no such file/i,
        /timeout/i, /ENOENT/i, /EACCES/i, /refused/i,
        /exit code [1-9]/i, /non-zero exit/i,
    ]

    for (const pat of failurePatterns) {
        if (pat.test(output)) return false
    }

    // Explicit success indicators
    const successPatterns = [
        /success/i, /completed/i, /found \d+/i, /created/i,
        /updated/i, /written/i, /saved/i, /done/i,
    ]

    for (const pat of successPatterns) {
        if (pat.test(output)) return true
    }

    // If output has meaningful content and no errors, assume success
    return output.length > 10
}

/**
 * Create a fingerprint of tool arguments (for deduplication).
 */
function argsFingerprint(args: Record<string, unknown>): string {
    const normalized = JSON.stringify(args, Object.keys(args).sort()).slice(0, 200)
    return createHash("sha256").update(normalized).digest("hex").slice(0, 12)
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Record a tool outcome.
 */
export function recordOutcome(
    sessionID: string,
    tool: string,
    args: Record<string, unknown>,
    output: string,
    success: boolean,
    durationMs: number,
    config?: Partial<RecallConfig>,
): ToolOutcome {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    // Get current context for this session
    const contextKws = sessionContexts.get(sessionID)
    const contextKeywords = contextKws ? [...contextKws].slice(0, 10) : []

    const outcome: ToolOutcome = {
        id: createHash("sha256")
            .update(`${sessionID}|${tool}|${Date.now()}|${Math.random()}`)
            .digest("hex")
            .slice(0, 16),
        tool,
        argsFingerprint: argsFingerprint(args),
        contextKeywords,
        success,
        outcomeLabel: success ? "success" : output.slice(0, 50),
        durationMs,
        timestamp: Date.now(),
        weight: 1.0,
    }

    // Add to session store
    let sessionStore = sessionOutcomes.get(sessionID)
    if (!sessionStore) {
        sessionStore = []
        sessionOutcomes.set(sessionID, sessionStore)
    }
    sessionStore.push(outcome)
    if (sessionStore.length > cfg.maxOutcomesPerSession) {
        sessionStore.splice(0, sessionStore.length - cfg.maxOutcomesPerSession)
    }

    // Add to global store
    globalOutcomes.push(outcome)
    if (globalOutcomes.length > cfg.maxGlobalOutcomes) {
        globalOutcomes.splice(0, globalOutcomes.length - cfg.maxGlobalOutcomes)
    }

    return outcome
}

/**
 * Query for successful tools given a context.
 * Returns ranked list of tools that worked in similar contexts.
 */
export function recallSuccessfulTools(
    query: RecallQuery,
    config?: Partial<RecallConfig>,
): RecallResult[] {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const maxResults = query.maxResults ?? 5
    const timeWindowMs = query.timeWindowMs ?? 7 * 24 * 60 * 60 * 1000 // 7 days
    const minSuccessRate = query.minSuccessRate ?? 0.5
    const now = Date.now()

    // Filter outcomes by time window and tool filter
    const candidates = globalOutcomes.filter(o => {
        if (now - o.timestamp > timeWindowMs) return false
        if (query.toolFilter && !query.toolFilter.includes(o.tool)) return false
        return true
    })

    // Group by tool name
    const toolGroups = new Map<string, ToolOutcome[]>()
    for (const outcome of candidates) {
        const group = toolGroups.get(outcome.tool) || []
        group.push(outcome)
        toolGroups.set(outcome.tool, group)
    }

    // Score each tool
    const results: RecallResult[] = []
    for (const [tool, outcomes] of toolGroups) {
        const successCount = outcomes.filter(o => o.success).length
        const totalCount = outcomes.length
        const successRate = totalCount > 0 ? successCount / totalCount : 0

        if (successRate < minSuccessRate) continue

        // Context similarity: average overlap across outcomes
        const overlaps = outcomes.map(o =>
            contextSimilarity(query.contextKeywords, o.contextKeywords)
        )
        const avgOverlap = overlaps.reduce((a, b) => a + b, 0) / overlaps.length

        if (avgOverlap < cfg.minContextOverlap) continue

        // Time-decay weighted score
        const decayWeights = outcomes
            .filter(o => o.success)
            .map(o => computeDecayWeight(o.timestamp, cfg.decayHalfLifeMs))
        const avgDecay = decayWeights.length > 0
            ? decayWeights.reduce((a, b) => a + b, 0) / decayWeights.length
            : 0

        // Composite score: successRate × contextOverlap × decayWeight
        const score = successRate * avgOverlap * avgDecay

        // Find most recent outcome
        const sorted = [...outcomes].sort((a, b) => b.timestamp - a.timestamp)

        results.push({
            tool,
            successCount,
            totalCount,
            successRate,
            score,
            lastOutcome: sorted[0],
            contextOverlap: avgOverlap,
        })
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, maxResults)
}

/**
 * Update session context with new keywords.
 */
export function updateSessionContext(sessionID: string, text: string): void {
    let context = sessionContexts.get(sessionID)
    if (!context) {
        context = new Set()
        sessionContexts.set(sessionID, context)
    }

    const newKeywords = extractContextKeywords(text)
    for (const kw of newKeywords) {
        context.add(kw)
    }

    // Cap at 50 keywords per session
    if (context.size > 50) {
        const arr = [...context]
        sessionContexts.set(sessionID, new Set(arr.slice(-50)))
    }
}

/**
 * Get global outcome count (for diagnostics).
 */
export function getOutcomeCount(): { global: number; sessions: number } {
    return {
        global: globalOutcomes.length,
        sessions: sessionOutcomes.size,
    }
}

/**
 * Clear all stored outcomes.
 */
export function clearAll(): void {
    globalOutcomes.length = 0
    sessionOutcomes.clear()
    sessionContexts.clear()
}

/**
 * Clear outcomes for a specific session.
 */
export function clearSession(sessionID: string): void {
    sessionOutcomes.delete(sessionID)
    sessionContexts.delete(sessionID)
}

// ── Hook Creation ──────────────────────────────────────────────────────────

/**
 * Create the successful tool recall hook.
 *
 * Listens to:
 * - chat.message: extracts context keywords from user messages
 * - tool.execute.after: records tool outcomes
 */
export function createSuccessfulToolRecallHook(config?: Partial<RecallConfig>) {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    if (!cfg.enabled) return null

    return {
        "chat.message": async (
            input: { sessionID: string },
            output: { parts: Array<{ type: string; text?: string }> },
        ): Promise<void> => {
            const text = output.parts
                .filter(p => p.type === "text" && p.text)
                .map(p => p.text!)
                .join("\n")

            if (text && text.length > 10) {
                updateSessionContext(input.sessionID, text)
            }
        },

        "tool.execute.after": async (
            input: {
                sessionID: string
                tool: string
                args: Record<string, unknown>
                startTime?: number
            },
            output: { result?: string; output?: string },
        ): Promise<void> => {
            const outputText = output.result || output.output || ""
            const durationMs = input.startTime ? Date.now() - input.startTime : 0

            // Auto-detect success
            const success = cfg.autoDetectSuccess
                ? autoDetectSuccess(input.tool, outputText)
                : true // Default to success if auto-detect disabled

            const outcome = recordOutcome(
                input.sessionID,
                input.tool,
                input.args,
                outputText,
                success,
                durationMs,
                cfg,
            )

            if (outcome.success) {
                log(`[${HOOK_NAME}] Tool success recorded`, {
                    tool: input.tool,
                    sessionID: input.sessionID,
                    contextKeywords: outcome.contextKeywords.slice(0, 5),
                })
            }
        },

        "event": async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
            if (event.type === "session.deleted") {
                const props = event.properties as Record<string, unknown> | undefined
                const sessionInfo = props?.info as { id?: string } | undefined
                if (sessionInfo?.id) {
                    clearSession(sessionInfo.id)
                }
            }
        },
    }
}
