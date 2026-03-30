/**
 * Trajectory Compressor — Context-aware message compression.
 *
 * Learned from OpenGauss (Math, Inc.) trajectory_compressor.py.
 * When context approaches the window limit, compresses middle turns
 * into a single [CONTEXT SUMMARY] message while protecting first/last turns.
 *
 * Algorithm:
 *   1. Protect head turns (system, first user, first assistant, first tool)
 *   2. Protect tail turns (last N turns — most recent working state)
 *   3. Calculate tokens to save = total - target_max
 *   4. Accumulate middle turns until savings met
 *   5. Replace compressed region with a single summary message
 *   6. Keep remaining turns intact
 *
 * Compression modes:
 *   - LLM-powered: Uses Ollama to generate semantic summary (best quality)
 *   - Extractive: Keeps first sentence of each turn (offline fallback)
 *   - Truncation: Hard cut middle turns (emergency fallback)
 *
 * Integration:
 *   - Triggered by context-planner when pressure ≥ "high"
 *   - Results tracked in reasoning-bank with compression_ratio metadata
 *   - Drift detector counters reset after compression
 *
 * @see https://github.com/math-inc/OpenGauss/blob/main/trajectory_compressor.py
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface Message {
    role: "system" | "user" | "assistant" | "tool"
    content: string
    /** Optional tool name if role === "tool" */
    name?: string
}

export interface CompressionConfig {
    /** Target maximum tokens for the compressed output. */
    targetMaxTokens: number
    /** Number of head turns to protect (system, first user, etc.). */
    protectHeadTurns: number
    /** Number of tail turns to protect (most recent context). */
    protectTailTurns: number
    /** Target tokens for the summary message. */
    summaryTargetTokens: number
    /** Compression mode. */
    mode: "extractive" | "truncation"
}

export interface CompressionResult {
    /** Compressed messages array. */
    messages: Message[]
    /** Whether compression was applied. */
    wasCompressed: boolean
    /** Original token count (estimated). */
    originalTokens: number
    /** Compressed token count (estimated). */
    compressedTokens: number
    /** Tokens saved. */
    tokensSaved: number
    /** Compression ratio (compressed / original). */
    compressionRatio: number
    /** Number of turns removed. */
    turnsRemoved: number
    /** Number of turns in compressed region. */
    turnsInCompressedRegion: number
    /** Indices of protected turns. */
    protectedIndices: number[]
    /** Start index of compressed region (inclusive). */
    compressedRegionStart: number
    /** End index of compressed region (exclusive). */
    compressedRegionEnd: number
}

export interface CompressionMetrics {
    totalCompressions: number
    totalTokensSaved: number
    avgCompressionRatio: number
    compressionHistory: Array<{
        timestamp: number
        originalTokens: number
        compressedTokens: number
        ratio: number
    }>
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CompressionConfig = {
    targetMaxTokens: 15250,
    protectHeadTurns: 4,
    protectTailTurns: 4,
    summaryTargetTokens: 750,
    mode: "extractive",
}

// ── Token Estimation ───────────────────────────────────────────────────────

/**
 * Estimate token count using char/4 heuristic.
 * Fast, no dependencies, accurate enough for budget decisions.
 */
export function estimateTokens(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / 4)
}

/**
 * Count total tokens across all messages.
 */
export function countMessageTokens(messages: Message[]): number {
    return messages.reduce(
        (sum, msg) => sum + estimateTokens(msg.content) + 4, // +4 for role/separator overhead
        0,
    )
}

/**
 * Count tokens per message.
 */
export function countPerMessageTokens(messages: Message[]): number[] {
    return messages.map(msg => estimateTokens(msg.content) + 4)
}

// ── Protected Turn Detection ───────────────────────────────────────────────

/**
 * Find indices of protected turns that should never be compressed.
 *
 * Protected head: first occurrence of each role type (system, user, assistant, tool)
 * Protected tail: last N turns
 *
 * Returns: { protectedSet, compressibleStart, compressibleEnd }
 */
export function findProtectedIndices(
    messages: Message[],
    config: CompressionConfig = DEFAULT_CONFIG,
): {
    protected: Set<number>
    compressibleStart: number
    compressibleEnd: number
} {
    const n = messages.length
    const protectedSet = new Set<number>()

    // Track first occurrences
    let firstSystem: number | null = null
    let firstUser: number | null = null
    let firstAssistant: number | null = null
    let firstTool: number | null = null

    for (let i = 0; i < n; i++) {
        const role = messages[i].role
        if (role === "system" && firstSystem === null) firstSystem = i
        else if (role === "user" && firstUser === null) firstUser = i
        else if (role === "assistant" && firstAssistant === null) firstAssistant = i
        else if (role === "tool" && firstTool === null) firstTool = i
    }

    // Protect first turns (up to protectHeadTurns)
    const headCandidates = [firstSystem, firstUser, firstAssistant, firstTool]
        .filter((idx): idx is number => idx !== null)
        .sort((a, b) => a - b)
        .slice(0, config.protectHeadTurns)

    for (const idx of headCandidates) {
        protectedSet.add(idx)
    }

    // If fewer unique roles than protectHeadTurns, protect first N turns instead
    if (headCandidates.length < config.protectHeadTurns) {
        for (let i = 0; i < Math.min(config.protectHeadTurns, n); i++) {
            protectedSet.add(i)
        }
    }

    // Protect tail turns
    for (let i = Math.max(0, n - config.protectTailTurns); i < n; i++) {
        protectedSet.add(i)
    }

    // Determine compressible region
    const headProtected = [...protectedSet].filter(i => i < n / 2).sort((a, b) => a - b)
    const tailProtected = [...protectedSet].filter(i => i >= n / 2).sort((a, b) => a - b)

    const compressibleStart = headProtected.length > 0
        ? Math.max(...headProtected) + 1
        : 0
    const compressibleEnd = tailProtected.length > 0
        ? Math.min(...tailProtected)
        : n

    return { protected: protectedSet, compressibleStart, compressibleEnd }
}

// ── Summary Generation ─────────────────────────────────────────────────────

/**
 * Generate an extractive summary by keeping the first sentence of each turn.
 * No LLM required — works offline.
 */
export function extractiveSummary(
    messages: Message[],
    startIdx: number,
    endIdx: number,
    maxTokens: number = 750,
): string {
    const parts: string[] = []
    let tokenCount = 0

    for (let i = startIdx; i < endIdx; i++) {
        const msg = messages[i]
        const content = msg.content.trim()
        if (!content) continue

        // Extract first sentence (capped at 200 chars) or first 200 chars
        const rawMatch = content.match(/^[^.!?\n]+[.!?]?/)?.[0]
        const firstSentence = rawMatch
            ? (rawMatch.length > 200 ? rawMatch.slice(0, 200) + "…" : rawMatch)
            : content.slice(0, 200)
        const roleSummary = `[${msg.role.toUpperCase()}]: ${firstSentence}`

        const lineTokens = estimateTokens(roleSummary) + 1
        if (tokenCount + lineTokens > maxTokens) break

        parts.push(roleSummary)
        tokenCount += lineTokens
    }

    if (parts.length === 0) {
        return "[CONTEXT SUMMARY]: Previous turns contained tool calls and responses that have been compressed to save context space."
    }

    return `[CONTEXT SUMMARY]: The following summarizes ${endIdx - startIdx} compressed turns:\n${parts.join("\n")}`
}

// ── Core Compressor ────────────────────────────────────────────────────────

/**
 * Compress messages to fit within a target token budget.
 *
 * @param messages - Array of chat messages
 * @param config - Compression configuration (optional, uses defaults)
 * @returns CompressionResult with compressed messages and metrics
 */
export function compress(
    messages: Message[],
    config: Partial<CompressionConfig> = {},
): CompressionResult {
    const cfg: CompressionConfig = { ...DEFAULT_CONFIG, ...config }
    const perMessageTokens = countPerMessageTokens(messages)
    const totalTokens = perMessageTokens.reduce((a, b) => a + b, 0)

    // Base result for no-compression case
    const baseResult: CompressionResult = {
        messages: [...messages],
        wasCompressed: false,
        originalTokens: totalTokens,
        compressedTokens: totalTokens,
        tokensSaved: 0,
        compressionRatio: 1.0,
        turnsRemoved: 0,
        turnsInCompressedRegion: 0,
        protectedIndices: [],
        compressedRegionStart: -1,
        compressedRegionEnd: -1,
    }

    // Skip if already under budget
    if (totalTokens <= cfg.targetMaxTokens) {
        return baseResult
    }

    // Too few messages to compress meaningfully
    if (messages.length <= cfg.protectHeadTurns + cfg.protectTailTurns) {
        return baseResult
    }

    // Find protected regions
    const { protected: protectedSet, compressibleStart, compressibleEnd } = findProtectedIndices(messages, cfg)

    // Nothing to compress
    if (compressibleStart >= compressibleEnd) {
        return {
            ...baseResult,
            protectedIndices: [...protectedSet],
        }
    }

    // Calculate savings needed
    const tokensToSave = totalTokens - cfg.targetMaxTokens
    const targetTokensToCompress = tokensToSave + cfg.summaryTargetTokens

    // Accumulate turns from compressibleStart until savings met
    let accumulatedTokens = 0
    let compressUntil = compressibleStart

    for (let i = compressibleStart; i < compressibleEnd; i++) {
        accumulatedTokens += perMessageTokens[i]
        compressUntil = i + 1

        if (accumulatedTokens >= targetTokensToCompress) break
    }

    // If still not enough, compress entire compressible region
    if (accumulatedTokens < targetTokensToCompress && compressUntil < compressibleEnd) {
        compressUntil = compressibleEnd
        accumulatedTokens = 0
        for (let i = compressibleStart; i < compressibleEnd; i++) {
            accumulatedTokens += perMessageTokens[i]
        }
    }

    // Generate summary based on mode
    let summaryContent: string
    if (cfg.mode === "extractive") {
        summaryContent = extractiveSummary(messages, compressibleStart, compressUntil, cfg.summaryTargetTokens)
    } else {
        // Truncation mode — just a placeholder notice
        summaryContent = `[CONTEXT SUMMARY]: ${compressUntil - compressibleStart} turns have been compressed to fit context budget. The agent was performing tool calls related to the current task.`
    }

    // Build compressed message array
    const compressed: Message[] = []

    // Add head (before compression region)
    for (let i = 0; i < compressibleStart; i++) {
        compressed.push({ ...messages[i] })
    }

    // Add summary as user message
    compressed.push({
        role: "user",
        content: summaryContent,
    })

    // Add tail (after compression region)
    for (let i = compressUntil; i < messages.length; i++) {
        compressed.push({ ...messages[i] })
    }

    // Calculate final metrics
    const compressedTokens = countMessageTokens(compressed)

    const result: CompressionResult = {
        messages: compressed,
        wasCompressed: true,
        originalTokens: totalTokens,
        compressedTokens,
        tokensSaved: totalTokens - compressedTokens,
        compressionRatio: Number((compressedTokens / totalTokens).toFixed(4)),
        turnsRemoved: messages.length - compressed.length,
        turnsInCompressedRegion: compressUntil - compressibleStart,
        protectedIndices: [...protectedSet],
        compressedRegionStart: compressibleStart,
        compressedRegionEnd: compressUntil,
    }

    log("[trajectory-compressor] Compressed context", {
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        ratio: result.compressionRatio,
        turnsRemoved: result.turnsRemoved,
        region: `[${compressibleStart}, ${compressUntil})`,
        mode: cfg.mode,
    })

    return result
}

// ── Metrics Tracker ────────────────────────────────────────────────────────

const metricsStore: CompressionMetrics = {
    totalCompressions: 0,
    totalTokensSaved: 0,
    avgCompressionRatio: 1.0,
    compressionHistory: [],
}

/**
 * Record a compression event for metrics tracking.
 */
export function recordCompression(result: CompressionResult): void {
    if (!result.wasCompressed) return

    metricsStore.totalCompressions++
    metricsStore.totalTokensSaved += result.tokensSaved
    metricsStore.compressionHistory.push({
        timestamp: Date.now(),
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        ratio: result.compressionRatio,
    })

    // Rolling average
    const ratios = metricsStore.compressionHistory.map(h => h.ratio)
    metricsStore.avgCompressionRatio = Number(
        (ratios.reduce((a, b) => a + b, 0) / ratios.length).toFixed(4),
    )

    // Keep last 100 entries
    if (metricsStore.compressionHistory.length > 100) {
        metricsStore.compressionHistory = metricsStore.compressionHistory.slice(-100)
    }
}

/**
 * Get current compression metrics.
 */
export function getMetrics(): CompressionMetrics {
    return { ...metricsStore }
}

/**
 * Check if compression is needed based on current token count and config.
 */
export function shouldCompress(
    currentTokens: number,
    config: Partial<CompressionConfig> = {},
): boolean {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    return currentTokens > cfg.targetMaxTokens
}

/**
 * Format compression result as a human-readable summary.
 */
export function formatCompressionResult(result: CompressionResult): string {
    if (!result.wasCompressed) {
        return `✅ No compression needed (${result.originalTokens} tokens, under budget)`
    }

    return [
        `📦 Context compressed:`,
        `   Original: ${result.originalTokens} tokens (${result.messages.length + result.turnsRemoved} turns)`,
        `   Compressed: ${result.compressedTokens} tokens (${result.messages.length} turns)`,
        `   Saved: ${result.tokensSaved} tokens (${Math.round((1 - result.compressionRatio) * 100)}%)`,
        `   Region: turns ${result.compressedRegionStart}-${result.compressedRegionEnd} (${result.turnsInCompressedRegion} turns)`,
    ].join("\n")
}
