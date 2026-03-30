/**
 * Memory Consensus — Quorum-based memory writes with collusion detection.
 *
 * Inspired by RuFlo multi-agent consensus patterns:
 * - N-of-M agents must agree before persisting to memory
 * - Collusion detection: flags identical outputs from independent agents
 * - Confidence scoring: weight by agent role and past accuracy
 * - Audit trail: all votes recorded for forensics
 *
 * Use case: When multiple agents analyze the same target, their findings
 * must reach consensus before being stored as "ground truth" in memory.
 * This prevents a single compromised/hallucinating agent from polluting
 * the knowledge base.
 *
 * @see RuFlo patterns: multi-agent consensus, Byzantine fault tolerance
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

const HOOK_NAME = "memory-consensus"

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConsensusProposal {
    id: string
    /** The memory key to write. */
    memoryKey: string
    /** The proposed value to write. */
    proposedValue: string
    /** Agent proposing the write. */
    proposingAgent: string
    /** Session context. */
    sessionID: string
    /** Timestamp. */
    timestamp: number
    /** Whether this requires quorum. */
    requiresQuorum: boolean
}

export interface ConsensusVote {
    proposalId: string
    votingAgent: string
    vote: "approve" | "reject" | "abstain"
    confidence: number // 0-1
    reason?: string
    timestamp: number
}

export interface ConsensusResult {
    proposalId: string
    approved: boolean
    totalVotes: number
    approveVotes: number
    rejectVotes: number
    abstainVotes: number
    quorumMet: boolean
    collusionDetected: boolean
    collusionDetails?: string
    finalConfidence: number
}

export interface ConsensusConfig {
    enabled: boolean
    /** Minimum number of agents for quorum (N). */
    quorumSize: number
    /** Total agents that must vote (M). */
    totalVoters: number
    /** Minimum confidence for approval (0-1). */
    minConfidence: number
    /** Enable collusion detection. */
    collusionDetection: boolean
    /** Similarity threshold for collusion (0-1). */
    collusionThreshold: number
    /** Memory keys that require consensus (regex patterns). */
    protectedKeys: RegExp[]
    /** Maximum time to wait for votes (ms). */
    voteTimeoutMs: number
}

export type ProposalStatus = "pending" | "approved" | "rejected" | "expired" | "collusion_blocked"

interface ProposalRecord {
    proposal: ConsensusProposal
    votes: ConsensusVote[]
    status: ProposalStatus
    result?: ConsensusResult
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ConsensusConfig = {
    enabled: true,
    quorumSize: 2,
    totalVoters: 3,
    minConfidence: 0.6,
    collusionDetection: true,
    collusionThreshold: 0.95,
    protectedKeys: [
        /^security\./,
        /^findings\./,
        /^vulnerability\./,
        /^credential\./,
    ],
    voteTimeoutMs: 60_000,
}

// ── State ──────────────────────────────────────────────────────────────────

const proposals = new Map<string, ProposalRecord>()
const agentAccuracy = new Map<string, { correct: number; total: number }>()

// ── Utility ────────────────────────────────────────────────────────────────

/**
 * Check if a memory key requires consensus.
 */
export function requiresConsensus(
    memoryKey: string,
    config?: Partial<ConsensusConfig>,
): boolean {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    if (!cfg.enabled) return false
    return cfg.protectedKeys.some(pattern => pattern.test(memoryKey))
}

/**
 * Compute text similarity for collusion detection.
 */
export function textSimilarity(a: string, b: string): number {
    if (a === b) return 1
    if (!a || !b) return 0

    const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2))
    const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2))

    if (wordsA.size === 0 && wordsB.size === 0) return 1
    if (wordsA.size === 0 || wordsB.size === 0) return 0

    let intersection = 0
    for (const word of wordsA) {
        if (wordsB.has(word)) intersection++
    }

    return (2 * intersection) / (wordsA.size + wordsB.size)
}

/**
 * Get agent's historical accuracy (for confidence weighting).
 */
export function getAgentAccuracy(agentName: string): number {
    const stats = agentAccuracy.get(agentName)
    if (!stats || stats.total === 0) return 0.5 // Default to neutral
    return stats.correct / stats.total
}

/**
 * Update agent accuracy after outcome is known.
 */
export function updateAgentAccuracy(agentName: string, wasCorrect: boolean): void {
    let stats = agentAccuracy.get(agentName)
    if (!stats) {
        stats = { correct: 0, total: 0 }
        agentAccuracy.set(agentName, stats)
    }
    stats.total++
    if (wasCorrect) stats.correct++
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Create a new consensus proposal.
 */
export function createProposal(
    sessionID: string,
    memoryKey: string,
    proposedValue: string,
    proposingAgent: string,
    config?: Partial<ConsensusConfig>,
): ConsensusProposal {
    const proposal: ConsensusProposal = {
        id: createHash("sha256")
            .update(`${sessionID}|${memoryKey}|${Date.now()}|${Math.random()}`)
            .digest("hex")
            .slice(0, 16),
        memoryKey,
        proposedValue,
        proposingAgent,
        sessionID,
        timestamp: Date.now(),
        requiresQuorum: requiresConsensus(memoryKey, config),
    }

    proposals.set(proposal.id, {
        proposal,
        votes: [],
        status: "pending",
    })

    log(`[${HOOK_NAME}] Proposal created`, {
        id: proposal.id,
        memoryKey,
        proposingAgent,
        requiresQuorum: proposal.requiresQuorum,
    })

    return proposal
}

/**
 * Submit a vote on a proposal.
 */
export function submitVote(
    proposalId: string,
    votingAgent: string,
    vote: "approve" | "reject" | "abstain",
    confidence: number,
    reason?: string,
): boolean {
    const record = proposals.get(proposalId)
    if (!record || record.status !== "pending") return false

    // Prevent duplicate votes
    if (record.votes.some(v => v.votingAgent === votingAgent)) return false

    // Weight confidence by agent accuracy
    const accuracy = getAgentAccuracy(votingAgent)
    const weightedConfidence = confidence * (0.5 + 0.5 * accuracy)

    record.votes.push({
        proposalId,
        votingAgent,
        vote,
        confidence: Math.min(1, weightedConfidence),
        reason,
        timestamp: Date.now(),
    })

    return true
}

/**
 * Detect collusion among voters.
 */
export function detectCollusion(
    votes: ConsensusVote[],
    config?: Partial<ConsensusConfig>,
): { detected: boolean; details?: string } {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    if (!cfg.collusionDetection) return { detected: false }

    // Check for suspiciously identical reasons
    const approveReasons = votes
        .filter(v => v.vote === "approve" && v.reason)
        .map(v => v.reason!)

    for (let i = 0; i < approveReasons.length; i++) {
        for (let j = i + 1; j < approveReasons.length; j++) {
            const sim = textSimilarity(approveReasons[i], approveReasons[j])
            if (sim >= cfg.collusionThreshold) {
                const agents = votes
                    .filter(v => v.vote === "approve" && v.reason)
                    .map(v => v.votingAgent)
                return {
                    detected: true,
                    details: `Suspiciously similar reasons from agents: ${agents.join(", ")} (similarity: ${Math.round(sim * 100)}%)`,
                }
            }
        }
    }

    // Check for identical confidence scores (unlikely in real scenarios)
    const confidences = votes.filter(v => v.vote === "approve").map(v => v.confidence)
    if (confidences.length >= 3) {
        const allSame = confidences.every(c => c === confidences[0])
        if (allSame) {
            return {
                detected: true,
                details: `All ${confidences.length} approve votes have identical confidence (${confidences[0]})`,
            }
        }
    }

    return { detected: false }
}

/**
 * Evaluate consensus on a proposal.
 */
export function evaluateConsensus(
    proposalId: string,
    config?: Partial<ConsensusConfig>,
): ConsensusResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const record = proposals.get(proposalId)

    if (!record) {
        return {
            proposalId,
            approved: false,
            totalVotes: 0,
            approveVotes: 0,
            rejectVotes: 0,
            abstainVotes: 0,
            quorumMet: false,
            collusionDetected: false,
            finalConfidence: 0,
        }
    }

    const votes = record.votes
    const approveVotes = votes.filter(v => v.vote === "approve").length
    const rejectVotes = votes.filter(v => v.vote === "reject").length
    const abstainVotes = votes.filter(v => v.vote === "abstain").length
    const totalVotes = votes.length

    const quorumMet = approveVotes >= cfg.quorumSize

    // Check collusion
    const collusion = detectCollusion(votes, cfg)

    // Calculate weighted confidence
    const approveConfidences = votes
        .filter(v => v.vote === "approve")
        .map(v => v.confidence)
    const avgConfidence = approveConfidences.length > 0
        ? approveConfidences.reduce((a, b) => a + b, 0) / approveConfidences.length
        : 0

    const approved = quorumMet
        && avgConfidence >= cfg.minConfidence
        && !collusion.detected
        && rejectVotes < approveVotes

    // Update proposal status
    record.status = collusion.detected ? "collusion_blocked"
        : approved ? "approved"
        : "rejected"

    const result: ConsensusResult = {
        proposalId,
        approved,
        totalVotes,
        approveVotes,
        rejectVotes,
        abstainVotes,
        quorumMet,
        collusionDetected: collusion.detected,
        collusionDetails: collusion.details,
        finalConfidence: avgConfidence,
    }

    record.result = result

    log(`[${HOOK_NAME}] Consensus evaluated`, {
        proposalId,
        approved,
        votes: `${approveVotes}/${rejectVotes}/${abstainVotes}`,
        quorumMet,
        collusion: collusion.detected,
        confidence: avgConfidence,
    })

    return result
}

/**
 * Get all proposals for a session.
 */
export function getSessionProposals(sessionID: string): ProposalRecord[] {
    return [...proposals.values()].filter(p => p.proposal.sessionID === sessionID)
}

/**
 * Clear session data.
 */
export function clearSession(sessionID: string): void {
    for (const [id, record] of proposals) {
        if (record.proposal.sessionID === sessionID) {
            proposals.delete(id)
        }
    }
}

/**
 * Clear all state.
 */
export function clearAll(): void {
    proposals.clear()
    agentAccuracy.clear()
}

// ── Hook Creation ──────────────────────────────────────────────────────────

export function createMemoryConsensusHook(config?: Partial<ConsensusConfig>) {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    if (!cfg.enabled) return null

    return {
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
