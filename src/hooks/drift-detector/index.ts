/**
 * Drift Detector + Loop Guard — Combined drift/loop detection for agents.
 *
 * Merged from:
 * - Omni's drift.rs — Task drift scoring via output similarity
 * - Omni's loop_guard.rs — 5-layer tool loop detection with graduated verdicts
 *
 * Detection layers:
 * 1. Output repetition: Jaccard similarity on consecutive tool outputs
 * 2. Tool call repetition: Same tool+args pattern tracking
 * 3. Ping-pong detection: A-B-A-B or A-B-C-A-B-C alternating patterns
 * 4. Outcome-aware detection: Same (tool+args+result) hash tracking
 * 5. Global circuit breaker: Hard cap on total tool calls per session
 * 6. Poll tool relaxation: Status-check tools get relaxed thresholds
 *
 * @see OmniUltraAgent_Kit/src/agents/drift.rs
 * @see OmniUltraAgent_Kit/src/agents/loop_guard.rs
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

const HOOK_NAME = "drift-detector"

// ── Configuration ──────────────────────────────────────────────────────────

/** Minimum number of tool calls before drift detection activates. */
const MIN_CALLS_BEFORE_CHECK = 5

/** Similarity threshold (0-1) for considering two outputs as repetitive. */
const REPETITION_THRESHOLD = 0.85

/** Maximum consecutive similar outputs before triggering drift alert. */
const MAX_CONSECUTIVE_SIMILAR = 3

/** Sliding window size for tracking recent tool calls. */
const WINDOW_SIZE = 20

/** Per-hash call count: warn threshold. */
const WARN_THRESHOLD = 3

/** Per-hash call count: block threshold. */
const BLOCK_THRESHOLD = 5

/** Global circuit breaker: max total tool calls per session. */
const GLOBAL_CIRCUIT_BREAKER = 50

/** Poll tools get thresholds × this multiplier. */
const POLL_MULTIPLIER = 3

/** Minimum repeats of a ping-pong pattern before blocking. */
const PING_PONG_MIN_REPEATS = 3

/** Outcome repetition: warn after N identical (tool+args+result). */
const OUTCOME_WARN_THRESHOLD = 2

/** Outcome repetition: block after N identical (tool+args+result). */
const OUTCOME_BLOCK_THRESHOLD = 3

// ── Types ──────────────────────────────────────────────────────────────────

interface SessionDriftState {
    recentToolCalls: Array<{ tool: string; args: string; hash: string; timestamp: number }>
    recentOutputs: string[]
    consecutiveSimilar: number
    totalToolCalls: number
    driftAlerted: boolean
    originalTaskKeywords: Set<string>
    // Loop guard state (from Omni)
    callCounts: Map<string, number>       // hash → count
    outcomeCounts: Map<string, number>    // outcome_hash → count
    blockedOutcomes: Set<string>          // call hashes blocked by outcome detection
    recentHashes: string[]               // recent call hashes for ping-pong detection
    hashToTool: Map<string, string>      // hash → tool_name (for reporting)
    warningsEmitted: Map<string, number> // hash → warning count
    blockedCalls: number
}

type LoopGuardVerdict = "allow" | "warn" | "block" | "circuit_break"

interface DriftCheckResult {
    isDrifting: boolean
    reason?: string
    severity: "none" | "warning" | "critical"
    score: number // 0-100, higher = more drift
    verdict: LoopGuardVerdict
    verdictMessage?: string
}

// ── Session State ──────────────────────────────────────────────────────────

const sessions = new Map<string, SessionDriftState>()

function getState(sessionID: string): SessionDriftState {
    let state = sessions.get(sessionID)
    if (!state) {
        state = {
            recentToolCalls: [],
            recentOutputs: [],
            consecutiveSimilar: 0,
            totalToolCalls: 0,
            driftAlerted: false,
            originalTaskKeywords: new Set(),
            callCounts: new Map(),
            outcomeCounts: new Map(),
            blockedOutcomes: new Set(),
            recentHashes: [],
            hashToTool: new Map(),
            warningsEmitted: new Map(),
            blockedCalls: 0,
        }
        sessions.set(sessionID, state)
    }
    return state
}

// ── Utility Functions ──────────────────────────────────────────────────────

/**
 * Jaccard similarity between two strings (word-level).
 * Returns 0-1 where 1 is identical.
 */
function jaccardSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2))

    if (wordsA.size === 0 && wordsB.size === 0) return 1
    if (wordsA.size === 0 || wordsB.size === 0) return 0

    let intersection = 0
    for (const word of wordsA) {
        if (wordsB.has(word)) intersection++
    }

    const union = wordsA.size + wordsB.size - intersection
    return union === 0 ? 0 : intersection / union
}

/**
 * Extract meaningful keywords from a task description.
 */
function extractKeywords(text: string): Set<string> {
    const stopWords = new Set([
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "must", "shall", "can", "need", "dare",
        "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
        "into", "through", "during", "before", "after", "above", "below",
        "and", "but", "or", "nor", "not", "so", "yet", "both", "either",
        "this", "that", "these", "those", "it", "its", "i", "you", "he",
        "she", "we", "they", "me", "him", "her", "us", "them", "my", "your",
        "please", "make", "use", "add", "create", "update", "fix", "change",
    ])

    return new Set(
        text.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.has(w))
            .map(w => w.replace(/[^a-z0-9]/g, ""))
            .filter(w => w.length > 3)
    )
}

/**
 * Compute SHA-256 hash of tool name + params (from Omni's loop_guard.rs).
 */
function computeHash(toolName: string, params: string): string {
    return createHash("sha256").update(`${toolName}|${params}`).digest("hex").slice(0, 16)
}

/**
 * Compute SHA-256 hash of tool name + params + result (outcome-aware).
 */
function computeOutcomeHash(toolName: string, params: string, result: string): string {
    const truncatedResult = result.slice(0, 1000)
    return createHash("sha256").update(`${toolName}|${params}|${truncatedResult}`).digest("hex").slice(0, 16)
}

/**
 * Check if a tool call looks like a polling/status-check operation.
 * These get relaxed thresholds (from Omni's loop_guard.rs).
 */
function isPollCall(toolName: string, args: Record<string, unknown>): boolean {
    const pollTools = ["bash", "shell", "interactive_bash", "run_command"]
    if (pollTools.some(t => toolName.includes(t))) {
        const cmd = String(args.command || args.cmd || "").toLowerCase()
        if (cmd.length < 50 && /(?:status|poll|wait|watch|tail|ps\s|jobs|pgrep|docker\s+ps|kubectl\s+get)/.test(cmd)) {
            return true
        }
    }
    const argsStr = JSON.stringify(args).toLowerCase()
    return argsStr.includes("status") || argsStr.includes("poll") || argsStr.includes("wait")
}

// ── Ping-Pong Detection (from Omni's loop_guard.rs) ────────────────────────

/**
 * Detect ping-pong patterns (A-B-A-B or A-B-C-A-B-C) in recent call hashes.
 */
function detectPingPong(hashes: string[], hashToTool: Map<string, string>): string | null {
    const len = hashes.length

    // Check pattern of length 2 (A-B-A-B-A-B)
    if (len >= 6) {
        const tail = hashes.slice(-6)
        const [a, b] = [tail[0], tail[1]]
        if (a !== b && tail[2] === a && tail[3] === b && tail[4] === a && tail[5] === b) {
            const toolA = hashToTool.get(a) || "unknown"
            const toolB = hashToTool.get(b) || "unknown"
            return `Ping-pong detected: tools '${toolA}' and '${toolB}' are alternating repeatedly`
        }
    }

    // Check pattern of length 3 (A-B-C-A-B-C-A-B-C)
    if (len >= 9) {
        const tail = hashes.slice(-9)
        const [a, b, c] = [tail[0], tail[1], tail[2]]
        if (!(a === b && b === c) &&
            tail[3] === a && tail[4] === b && tail[5] === c &&
            tail[6] === a && tail[7] === b && tail[8] === c) {
            const toolA = hashToTool.get(a) || "unknown"
            const toolB = hashToTool.get(b) || "unknown"
            const toolC = hashToTool.get(c) || "unknown"
            return `Ping-pong detected: tools '${toolA}', '${toolB}', '${toolC}' are cycling repeatedly`
        }
    }

    return null
}

/**
 * Count consecutive repeats of a 2-element or 3-element pattern at the tail.
 */
function countPingPongRepeats(hashes: string[]): number {
    const len = hashes.length

    // Check pattern of length 2
    if (len >= 4) {
        const a = hashes[len - 2]
        const b = hashes[len - 1]
        if (a !== b) {
            let repeats = 0
            let i = len
            while (i >= 2) {
                i -= 2
                if (hashes[i] === a && hashes[i + 1] === b) repeats++
                else break
            }
            if (repeats >= 2) return repeats
        }
    }

    // Check pattern of length 3
    if (len >= 6) {
        const a = hashes[len - 3]
        const b = hashes[len - 2]
        const c = hashes[len - 1]
        if (!(a === b && b === c)) {
            let repeats = 0
            let i = len
            while (i >= 3) {
                i -= 3
                if (hashes[i] === a && hashes[i + 1] === b && hashes[i + 2] === c) repeats++
                else break
            }
            if (repeats >= 2) return repeats
        }
    }

    return 0
}

// ── Loop Guard Check (from Omni's loop_guard.rs) ───────────────────────────

/**
 * 5-layer loop guard check. Returns verdict and message.
 * Runs BEFORE the drift score check.
 */
function loopGuardCheck(
    state: SessionDriftState,
    toolName: string,
    argsStr: string,
    args: Record<string, unknown>,
): { verdict: LoopGuardVerdict; message?: string } {
    const hash = computeHash(toolName, argsStr)
    state.hashToTool.set(hash, toolName)

    // Track recent hashes for ping-pong
    state.recentHashes.push(hash)
    if (state.recentHashes.length > WINDOW_SIZE) {
        state.recentHashes = state.recentHashes.slice(-WINDOW_SIZE)
    }

    // Layer 5: Global circuit breaker
    if (state.totalToolCalls > GLOBAL_CIRCUIT_BREAKER) {
        state.blockedCalls++
        return {
            verdict: "circuit_break",
            message: `Circuit breaker: exceeded ${GLOBAL_CIRCUIT_BREAKER} total tool calls. Agent appears stuck.`,
        }
    }

    // Layer 2: Outcome-blocked check
    if (state.blockedOutcomes.has(hash)) {
        state.blockedCalls++
        return {
            verdict: "block",
            message: `Blocked: '${toolName}' returns identical results repeatedly. Try a different approach.`,
        }
    }

    // Layer 1: Per-hash counting
    const count = (state.callCounts.get(hash) || 0) + 1
    state.callCounts.set(hash, count)

    // Layer 4: Poll tool relaxation
    const isPoll = isPollCall(toolName, args)
    const multiplier = isPoll ? POLL_MULTIPLIER : 1
    const effectiveWarn = WARN_THRESHOLD * multiplier
    const effectiveBlock = BLOCK_THRESHOLD * multiplier

    if (count >= effectiveBlock) {
        state.blockedCalls++
        return {
            verdict: "block",
            message: `Blocked: '${toolName}' called ${count} times with identical parameters. Try different parameters.`,
        }
    }

    if (count >= effectiveWarn) {
        const warnCount = (state.warningsEmitted.get(hash) || 0) + 1
        state.warningsEmitted.set(hash, warnCount)
        if (warnCount > 3) {
            state.blockedCalls++
            return {
                verdict: "block",
                message: `Blocked: '${toolName}' called ${count} times (warnings exhausted). Try a different approach.`,
            }
        }
        return {
            verdict: "warn",
            message: `Warning: '${toolName}' called ${count} times with identical parameters.`,
        }
    }

    // Layer 3: Ping-pong detection
    const pingPongMsg = detectPingPong(state.recentHashes, state.hashToTool)
    if (pingPongMsg) {
        const repeats = countPingPongRepeats(state.recentHashes)
        if (repeats >= PING_PONG_MIN_REPEATS) {
            state.blockedCalls++
            return { verdict: "block", message: pingPongMsg }
        }
        return { verdict: "warn", message: pingPongMsg }
    }

    return { verdict: "allow" }
}

/**
 * Record tool outcome for outcome-aware loop detection.
 * Call AFTER tool execution with the result.
 */
function recordOutcome(
    state: SessionDriftState,
    toolName: string,
    argsStr: string,
    result: string,
): string | null {
    const outcomeHash = computeOutcomeHash(toolName, argsStr, result)
    const callHash = computeHash(toolName, argsStr)

    const count = (state.outcomeCounts.get(outcomeHash) || 0) + 1
    state.outcomeCounts.set(outcomeHash, count)

    if (count >= OUTCOME_BLOCK_THRESHOLD) {
        state.blockedOutcomes.add(callHash)
        return `Tool '${toolName}' is returning identical results — approach isn't working.`
    }

    if (count >= OUTCOME_WARN_THRESHOLD) {
        return `Tool '${toolName}' is returning identical results — consider a different approach.`
    }

    return null
}

// ── Drift Score Check ──────────────────────────────────────────────────────

/**
 * Check for drift in the current session (combines drift scoring + loop guard).
 */
function checkDrift(state: SessionDriftState): DriftCheckResult {
    if (state.totalToolCalls < MIN_CALLS_BEFORE_CHECK) {
        return { isDrifting: false, severity: "none", score: 0, verdict: "allow" }
    }

    let score = 0
    const reasons: string[] = []

    // 1. Output repetition detection
    if (state.consecutiveSimilar >= MAX_CONSECUTIVE_SIMILAR) {
        score += 40
        reasons.push(`${state.consecutiveSimilar} consecutive similar outputs`)
    }

    // 2. Tool call repetition (unique signatures in window)
    const recent = state.recentToolCalls.slice(-WINDOW_SIZE)
    const toolCallSignatures = recent.map(tc => `${tc.tool}:${tc.args.slice(0, 50)}`)
    const uniqueSignatures = new Set(toolCallSignatures)
    if (recent.length >= 5 && uniqueSignatures.size <= 2) {
        score += 30
        reasons.push(`Only ${uniqueSignatures.size} unique tool patterns in last ${recent.length} calls`)
    }

    // 3. Excessive tool calls without visible progress
    if (state.totalToolCalls > 15 && state.recentOutputs.length > 3) {
        const lastThree = state.recentOutputs.slice(-3)
        const allSimilar = lastThree.every((output, i) => {
            if (i === 0) return true
            return jaccardSimilarity(output, lastThree[i - 1]) > REPETITION_THRESHOLD
        })
        if (allSimilar) {
            score += 30
            reasons.push("Last 3 outputs are nearly identical")
        }
    }

    // 4. Ping-pong pattern adds to score
    if (detectPingPong(state.recentHashes, state.hashToTool)) {
        score += 25
        reasons.push("Ping-pong pattern detected in tool calls")
    }

    // 5. High blocked calls ratio
    if (state.blockedCalls > 3) {
        score += 20
        reasons.push(`${state.blockedCalls} tool calls were blocked`)
    }

    const severity = score >= 60 ? "critical" : score >= 30 ? "warning" : "none"
    const isDrifting = score >= 30

    return {
        isDrifting,
        reason: reasons.length > 0 ? reasons.join("; ") : undefined,
        severity,
        score,
        verdict: score >= 60 ? "block" : score >= 30 ? "warn" : "allow",
        verdictMessage: reasons.length > 0 ? reasons.join("; ") : undefined,
    }
}

// ── Hook Creation ──────────────────────────────────────────────────────────

/**
 * Create the drift detector + loop guard hook.
 *
 * Monitors tool.execute.after events to detect:
 * - Output repetition (Jaccard similarity)
 * - Tool call loops (per-hash counting, ping-pong)
 * - Outcome repetition (same tool+args+result)
 * - Global circuit breaking (total call cap)
 * - Poll tool awareness (relaxed thresholds for status checks)
 */
export function createDriftDetectorHook() {
    return {
        "chat.message": async (
            input: { sessionID: string },
            output: { parts: Array<{ type: string; text?: string }> }
        ): Promise<void> => {
            const text = output.parts
                .filter(p => p.type === "text" && p.text)
                .map(p => p.text!)
                .join("\n")

            if (!text || text.length < 20) return

            const state = getState(input.sessionID)

            // On first message, extract task keywords
            if (state.originalTaskKeywords.size === 0) {
                state.originalTaskKeywords = extractKeywords(text)
            }
        },

        "tool.execute.after": async (
            input: {
                sessionID: string
                tool: string
                args: Record<string, unknown>
            },
            output: { result?: string; title?: string; output?: string }
        ): Promise<void> => {
            const state = getState(input.sessionID)
            state.totalToolCalls++

            const argsStr = JSON.stringify(input.args).slice(0, 200)

            // Track tool call
            const hash = computeHash(input.tool, argsStr)
            state.recentToolCalls.push({
                tool: input.tool,
                args: argsStr,
                hash,
                timestamp: Date.now(),
            })

            // Keep window size manageable
            if (state.recentToolCalls.length > WINDOW_SIZE * 2) {
                state.recentToolCalls = state.recentToolCalls.slice(-WINDOW_SIZE)
            }

            // Run loop guard check (5-layer, from Omni)
            const loopResult = loopGuardCheck(state, input.tool, argsStr, input.args)
            if (loopResult.verdict !== "allow") {
                log(`[${HOOK_NAME}] Loop guard: ${loopResult.verdict}`, {
                    sessionID: input.sessionID,
                    tool: input.tool,
                    message: loopResult.message,
                    totalToolCalls: state.totalToolCalls,
                })
            }

            // Track output similarity + outcome-aware detection
            const outputText = (output.result || output.output || "").slice(0, 500)
            if (outputText.length > 20) {
                const lastOutput = state.recentOutputs[state.recentOutputs.length - 1]
                if (lastOutput && jaccardSimilarity(outputText, lastOutput) > REPETITION_THRESHOLD) {
                    state.consecutiveSimilar++
                } else {
                    state.consecutiveSimilar = 0
                }
                state.recentOutputs.push(outputText)
                if (state.recentOutputs.length > WINDOW_SIZE) {
                    state.recentOutputs = state.recentOutputs.slice(-WINDOW_SIZE)
                }

                // Outcome-aware detection (from Omni)
                const outcomeWarning = recordOutcome(state, input.tool, argsStr, outputText)
                if (outcomeWarning) {
                    log(`[${HOOK_NAME}] Outcome repetition: ${outcomeWarning}`, {
                        sessionID: input.sessionID,
                    })
                }
            }

            // Run combined drift check
            const result = checkDrift(state)

            if (result.isDrifting && !state.driftAlerted) {
                state.driftAlerted = true
                log(`[${HOOK_NAME}] Drift detected!`, {
                    sessionID: input.sessionID,
                    score: result.score,
                    severity: result.severity,
                    reason: result.reason,
                    verdict: result.verdict,
                    totalToolCalls: state.totalToolCalls,
                    blockedCalls: state.blockedCalls,
                })
            }

            // Reset alert after recovery
            if (!result.isDrifting && state.driftAlerted && state.consecutiveSimilar === 0) {
                state.driftAlerted = false
                log(`[${HOOK_NAME}] Agent recovered from drift`, {
                    sessionID: input.sessionID,
                })
            }
        },

        "event": async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
            const props = event.properties as Record<string, unknown> | undefined

            if (event.type === "session.deleted") {
                const sessionInfo = props?.info as { id?: string } | undefined
                if (sessionInfo?.id) {
                    sessions.delete(sessionInfo.id)
                }
            }
        },
    }
}

/** Exported for testing */
export {
    jaccardSimilarity,
    extractKeywords,
    checkDrift,
    detectPingPong,
    countPingPongRepeats,
    computeHash,
    computeOutcomeHash,
    isPollCall,
    loopGuardCheck,
    recordOutcome,
    getState,
    type SessionDriftState,
    type DriftCheckResult,
    type LoopGuardVerdict,
}
