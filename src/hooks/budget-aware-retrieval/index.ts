/**
 * Budget-Aware Iterative Retrieval — FastCode-inspired 5-factor decision engine.
 *
 * Learned from FastCode (HKUDS, ⭐2.1K): Instead of blindly retrieving code context,
 * this hook evaluates 5 factors BEFORE each retrieval iteration:
 *   1. Confidence — are we confident enough to stop?
 *   2. Query Complexity — complex queries deserve more iterations
 *   3. Codebase Size — larger codebases need more exploration
 *   4. Resource Cost — track cumulative token cost per session
 *   5. Iteration Count — diminishing returns past N iterations
 *
 * The hook wraps RAG Enricher to make retrieval adaptive: it may request
 * 1 broad search initially, then follow up with targeted searches based
 * on graph neighbors found in the first pass ("2-stage smart search").
 *
 * Key innovation: Value-First Selection — prioritize high-impact, low-cost
 * snippets first (like choosing ripest fruit at best price).
 *
 * @see https://github.com/HKUDS/FastCode
 * @see Phase 6.1 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"
import type { QueryMetadata } from "../query-preprocessor/index"
import type { ContextPressure } from "../context-planner/index"

// ── Types ──────────────────────────────────────────────────────────────────

export interface RetrievalFactor {
    /** Current confidence level (0.0 = no confidence, 1.0 = fully confident). */
    confidence: number
    /** Query complexity score from QueryPreprocessor. */
    complexity: "trivial" | "simple" | "moderate" | "complex"
    /** Estimated codebase size category. */
    codebaseSize: "small" | "medium" | "large" | "xlarge"
    /** Cumulative token cost for this session's retrievals. */
    cumulativeCost: number
    /** Current iteration number (0-based). */
    iteration: number
}

export interface RetrievalDecision {
    /** Whether to proceed with retrieval. */
    shouldRetrieve: boolean
    /** Maximum snippets to retrieve this iteration. */
    maxSnippets: number
    /** Whether to use graph expansion (2nd stage). */
    useGraphExpansion: boolean
    /** Reason for the decision. */
    reason: string
    /** Computed value score (0-1, higher = more retrieval value). */
    valueScore: number
}

export interface RetrievalSession {
    /** Session identifier. */
    sessionId: string
    /** Number of retrieval iterations performed. */
    iterations: number
    /** Total tokens consumed by retrievals. */
    totalTokensUsed: number
    /** Running confidence level. */
    confidence: number
    /** Snippets retrieved so far (by name for dedup). */
    retrievedNames: Set<string>
    /** History of decisions for debugging. */
    decisionHistory: RetrievalDecision[]
}

export interface RetrievalMetrics {
    /** Total sessions managed. */
    sessionsTracked: number
    /** Total retrieval iterations across all sessions. */
    totalIterations: number
    /** Total tokens consumed across all sessions. */
    totalTokensConsumed: number
    /** Average value score across all decisions. */
    avgValueScore: number
    /** Number of early stops (confidence threshold met). */
    earlyStops: number
    /** Number of budget stops (cost threshold exceeded). */
    budgetStops: number
}

// ── Configuration ──────────────────────────────────────────────────────────

/** Maximum iterations before forced stop. */
const MAX_ITERATIONS = 4

/** Confidence threshold to stop early. */
const CONFIDENCE_THRESHOLD = 0.85

/** Maximum token budget per session for retrievals. */
const MAX_SESSION_TOKENS = 8000

/** Complexity multiplier: complex queries get more iterations. */
const COMPLEXITY_WEIGHTS: Record<RetrievalFactor["complexity"], number> = {
    trivial: 0.3,   // rarely needs retrieval at all
    simple: 0.5,    // 1 iteration usually enough
    moderate: 0.75, // 2-3 iterations
    complex: 1.0,   // full iteration budget
}

/** Codebase size multiplier: larger codebases benefit more from retrieval. */
const CODEBASE_SIZE_WEIGHTS: Record<RetrievalFactor["codebaseSize"], number> = {
    small: 0.4,     // < 100 files: agent likely knows the codebase
    medium: 0.7,    // 100-500 files
    large: 0.9,     // 500-2000 files
    xlarge: 1.0,    // 2000+ files: max retrieval benefit
}

/** Diminishing returns curve: iteration → value multiplier. */
const ITERATION_DECAY = [1.0, 0.7, 0.4, 0.2, 0.1]

// ── Decision Engine (pure function) ────────────────────────────────────────

/**
 * Compute retrieval value score using the 5-factor model.
 *
 * The formula is:
 *   valueScore = (1 - confidence) × complexityWeight × sizeWeight × iterationDecay × costFactor
 *
 * Each factor contributes multiplicatively:
 * - Low confidence → higher value (agent needs help)
 * - Complex queries → higher value (more context needed)
 * - Large codebases → higher value (harder to navigate without RAG)
 * - Early iterations → higher value (diminishing returns)
 * - Low cumulative cost → higher value (budget available)
 */
export function computeValueScore(factors: RetrievalFactor): number {
    // Factor 1: Confidence gap (how much we DON'T know)
    const confidenceGap = 1.0 - Math.min(1.0, Math.max(0.0, factors.confidence))

    // Factor 2: Complexity weight
    const complexityWeight = COMPLEXITY_WEIGHTS[factors.complexity] ?? 0.5

    // Factor 3: Codebase size weight
    const sizeWeight = CODEBASE_SIZE_WEIGHTS[factors.codebaseSize] ?? 0.7

    // Factor 4: Iteration decay (diminishing returns)
    const iterIdx = Math.min(factors.iteration, ITERATION_DECAY.length - 1)
    const iterationDecay = ITERATION_DECAY[iterIdx]

    // Factor 5: Budget remaining (1.0 when full, 0.0 when exhausted)
    const costFactor = Math.max(0.0, 1.0 - (factors.cumulativeCost / MAX_SESSION_TOKENS))

    // Multiplicative combination — all factors must be favorable
    const rawScore = confidenceGap * complexityWeight * sizeWeight * iterationDecay * costFactor

    // Clamp to [0, 1]
    return Math.min(1.0, Math.max(0.0, rawScore))
}

/**
 * Make a retrieval decision based on the 5-factor value score.
 *
 * Decision thresholds:
 * - valueScore > 0.3 → retrieve with graph expansion
 * - valueScore > 0.15 → retrieve without graph expansion
 * - valueScore <= 0.15 → skip retrieval (not worth the cost)
 */
export function makeRetrievalDecision(factors: RetrievalFactor): RetrievalDecision {
    // Hard stops
    if (factors.iteration >= MAX_ITERATIONS) {
        return {
            shouldRetrieve: false,
            maxSnippets: 0,
            useGraphExpansion: false,
            reason: `Max iterations reached (${MAX_ITERATIONS})`,
            valueScore: 0,
        }
    }

    if (factors.confidence >= CONFIDENCE_THRESHOLD) {
        return {
            shouldRetrieve: false,
            maxSnippets: 0,
            useGraphExpansion: false,
            reason: `Confidence threshold met (${factors.confidence.toFixed(2)} ≥ ${CONFIDENCE_THRESHOLD})`,
            valueScore: 0,
        }
    }

    if (factors.cumulativeCost >= MAX_SESSION_TOKENS) {
        return {
            shouldRetrieve: false,
            maxSnippets: 0,
            useGraphExpansion: false,
            reason: `Token budget exhausted (${factors.cumulativeCost} ≥ ${MAX_SESSION_TOKENS})`,
            valueScore: 0,
        }
    }

    const valueScore = computeValueScore(factors)

    // High value: full retrieval with graph expansion (FastCode "two-stage search")
    if (valueScore > 0.3) {
        const maxSnippets = factors.complexity === "complex" ? 5 : 3
        return {
            shouldRetrieve: true,
            maxSnippets,
            useGraphExpansion: true,
            reason: `High value (${valueScore.toFixed(2)}) — full retrieval with graph expansion`,
            valueScore,
        }
    }

    // Medium value: basic retrieval without graph expansion
    if (valueScore > 0.15) {
        return {
            shouldRetrieve: true,
            maxSnippets: 2,
            useGraphExpansion: false,
            reason: `Medium value (${valueScore.toFixed(2)}) — basic retrieval only`,
            valueScore,
        }
    }

    // Low value: skip
    return {
        shouldRetrieve: false,
        maxSnippets: 0,
        useGraphExpansion: false,
        reason: `Low value (${valueScore.toFixed(2)}) — retrieval cost exceeds expected benefit`,
        valueScore,
    }
}

// ── Session Manager ────────────────────────────────────────────────────────

/**
 * Create a Budget-Aware Retrieval session manager.
 *
 * Tracks retrieval state per session and makes adaptive decisions
 * about whether to continue retrieving code context.
 */
export function createBudgetAwareRetrieval() {
    const sessions = new Map<string, RetrievalSession>()
    let totalEarlyStops = 0
    let totalBudgetStops = 0

    /**
     * Get or create a session for the given session ID.
     */
    function getSession(sessionId: string): RetrievalSession {
        let session = sessions.get(sessionId)
        if (!session) {
            session = {
                sessionId,
                iterations: 0,
                totalTokensUsed: 0,
                confidence: 0.0,
                retrievedNames: new Set(),
                decisionHistory: [],
            }
            sessions.set(sessionId, session)
        }
        return session
    }

    /**
     * Request a retrieval decision for the given session.
     *
     * Call this BEFORE each retrieval attempt. If `shouldRetrieve` is false,
     * skip the retrieval to save tokens.
     */
    function requestRetrieval(
        sessionId: string,
        query: QueryMetadata,
        codebaseSize?: RetrievalFactor["codebaseSize"],
        contextPressure?: ContextPressure,
    ): RetrievalDecision {
        const session = getSession(sessionId)

        // Map context pressure to additional confidence boost
        // (high pressure = less retrieval benefit because budget is tight)
        if (contextPressure === "critical") {
            session.confidence = Math.max(session.confidence, 0.9)
        } else if (contextPressure === "high") {
            session.confidence = Math.max(session.confidence, 0.7)
        }

        const factors: RetrievalFactor = {
            confidence: session.confidence,
            complexity: query.complexity,
            codebaseSize: codebaseSize ?? "medium",
            cumulativeCost: session.totalTokensUsed,
            iteration: session.iterations,
        }

        const decision = makeRetrievalDecision(factors)
        session.decisionHistory.push(decision)

        // Track stop reasons for metrics
        if (!decision.shouldRetrieve) {
            if (decision.reason.includes("Confidence")) totalEarlyStops++
            if (decision.reason.includes("budget")) totalBudgetStops++
        }

        log("[budget-aware-retrieval] Decision", {
            sessionId,
            iteration: session.iterations,
            confidence: session.confidence.toFixed(2),
            complexity: query.complexity,
            valueScore: decision.valueScore.toFixed(2),
            shouldRetrieve: decision.shouldRetrieve,
            reason: decision.reason,
        })

        return decision
    }

    /**
     * Record a completed retrieval iteration.
     *
     * Call this AFTER a successful retrieval to update the session state.
     * The confidence boost depends on how many NEW (non-duplicate) snippets were found.
     */
    function recordRetrieval(
        sessionId: string,
        snippetNames: string[],
        tokensUsed: number,
    ): void {
        const session = getSession(sessionId)

        // Count new (non-duplicate) snippets
        const newSnippets = snippetNames.filter(name => !session.retrievedNames.has(name))
        for (const name of snippetNames) {
            session.retrievedNames.add(name)
        }

        // Update session state
        session.iterations++
        session.totalTokensUsed += tokensUsed

        // Confidence boost based on new information found:
        // - Many new snippets → low confidence boost (more to explore)
        // - Few/no new snippets → high confidence boost (we've explored enough)
        if (newSnippets.length === 0) {
            // No new information → big confidence boost (diminishing returns confirmed)
            session.confidence = Math.min(1.0, session.confidence + 0.4)
        } else if (newSnippets.length <= 1) {
            session.confidence = Math.min(1.0, session.confidence + 0.25)
        } else if (newSnippets.length <= 3) {
            session.confidence = Math.min(1.0, session.confidence + 0.15)
        } else {
            // Many new snippets → there might be more, small boost
            session.confidence = Math.min(1.0, session.confidence + 0.05)
        }

        log("[budget-aware-retrieval] Recorded iteration", {
            sessionId,
            iteration: session.iterations,
            newSnippets: newSnippets.length,
            totalSnippets: session.retrievedNames.size,
            tokensUsed,
            totalTokens: session.totalTokensUsed,
            confidence: session.confidence.toFixed(2),
        })
    }

    /**
     * Check if a snippet has already been retrieved for this session (dedup).
     */
    function isDuplicate(sessionId: string, snippetName: string): boolean {
        const session = sessions.get(sessionId)
        return session?.retrievedNames.has(snippetName) ?? false
    }

    /**
     * Get the current retrieval metrics.
     */
    function getMetrics(): RetrievalMetrics {
        let totalIterations = 0
        let totalTokensConsumed = 0
        let totalValueScore = 0
        let decisionCount = 0

        for (const session of sessions.values()) {
            totalIterations += session.iterations
            totalTokensConsumed += session.totalTokensUsed
            for (const d of session.decisionHistory) {
                totalValueScore += d.valueScore
                decisionCount++
            }
        }

        return {
            sessionsTracked: sessions.size,
            totalIterations,
            totalTokensConsumed,
            avgValueScore: decisionCount > 0 ? totalValueScore / decisionCount : 0,
            earlyStops: totalEarlyStops,
            budgetStops: totalBudgetStops,
        }
    }

    /**
     * Clear a session's retrieval state.
     */
    function clearSession(sessionId: string): void {
        sessions.delete(sessionId)
    }

    /**
     * Reset all state (for testing).
     */
    function reset(): void {
        sessions.clear()
        totalEarlyStops = 0
        totalBudgetStops = 0
    }

    return {
        requestRetrieval,
        recordRetrieval,
        isDuplicate,
        getMetrics,
        clearSession,
        reset,
        // Expose getSession for testing
        _getSession: getSession,
    }
}

/** Exported for testing and re-use */
export {
    MAX_ITERATIONS,
    CONFIDENCE_THRESHOLD,
    MAX_SESSION_TOKENS,
    COMPLEXITY_WEIGHTS,
    CODEBASE_SIZE_WEIGHTS,
    ITERATION_DECAY,
}
