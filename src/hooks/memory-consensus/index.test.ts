import { describe, it, expect, beforeEach } from "vitest"
import {
    requiresConsensus, textSimilarity, getAgentAccuracy, updateAgentAccuracy,
    createProposal, submitVote, detectCollusion, evaluateConsensus,
    getSessionProposals, clearAll, createMemoryConsensusHook,
} from "./index"

describe("Memory Consensus", () => {
    beforeEach(() => { clearAll() })

    describe("requiresConsensus", () => {
        it("requires consensus for security keys", () => {
            expect(requiresConsensus("security.finding.xss")).toBe(true)
        })
        it("requires consensus for vulnerability keys", () => {
            expect(requiresConsensus("vulnerability.cve-2024-1234")).toBe(true)
        })
        it("does not require for general keys", () => {
            expect(requiresConsensus("user.preference.theme")).toBe(false)
        })
        it("respects disabled config", () => {
            expect(requiresConsensus("security.test", { enabled: false })).toBe(false)
        })
    })

    describe("textSimilarity", () => {
        it("returns 1 for identical strings", () => {
            expect(textSimilarity("hello world", "hello world")).toBe(1)
        })
        it("returns 0 for completely different", () => {
            expect(textSimilarity("alpha beta", "gamma delta")).toBe(0)
        })
        it("returns partial for overlap", () => {
            const sim = textSimilarity("port 80 is open", "port 443 is open")
            expect(sim).toBeGreaterThan(0)
            expect(sim).toBeLessThan(1)
        })
    })

    describe("agentAccuracy", () => {
        it("starts at 0.5", () => {
            expect(getAgentAccuracy("new_agent")).toBe(0.5)
        })
        it("tracks accuracy", () => {
            updateAgentAccuracy("agent1", true)
            updateAgentAccuracy("agent1", true)
            updateAgentAccuracy("agent1", false)
            expect(getAgentAccuracy("agent1")).toBeCloseTo(2/3, 2)
        })
    })

    describe("proposal lifecycle", () => {
        it("creates a proposal", () => {
            const p = createProposal("s1", "security.finding", "XSS found", "analyzer")
            expect(p.id.length).toBe(16)
            expect(p.requiresQuorum).toBe(true)
        })

        it("accepts votes", () => {
            const p = createProposal("s1", "security.finding", "value", "analyzer")
            expect(submitVote(p.id, "reviewer1", "approve", 0.9)).toBe(true)
            expect(submitVote(p.id, "reviewer2", "approve", 0.8)).toBe(true)
        })

        it("prevents duplicate votes", () => {
            const p = createProposal("s1", "security.finding", "value", "analyzer")
            submitVote(p.id, "reviewer1", "approve", 0.9)
            expect(submitVote(p.id, "reviewer1", "approve", 0.9)).toBe(false)
        })
    })

    describe("evaluateConsensus", () => {
        it("approves with quorum", () => {
            const p = createProposal("s1", "security.finding", "value", "analyzer")
            submitVote(p.id, "reviewer1", "approve", 0.9, "looks correct")
            submitVote(p.id, "reviewer2", "approve", 0.8, "verified independently")

            const result = evaluateConsensus(p.id)
            expect(result.approved).toBe(true)
            expect(result.quorumMet).toBe(true)
            expect(result.approveVotes).toBe(2)
        })

        it("rejects without quorum", () => {
            const p = createProposal("s1", "security.finding", "value", "analyzer")
            submitVote(p.id, "reviewer1", "approve", 0.9)
            submitVote(p.id, "reviewer2", "reject", 0.9)

            const result = evaluateConsensus(p.id, { quorumSize: 2 })
            expect(result.approved).toBe(false)
        })

        it("rejects with low confidence", () => {
            const p = createProposal("s1", "security.finding", "value", "analyzer")
            submitVote(p.id, "reviewer1", "approve", 0.3)
            submitVote(p.id, "reviewer2", "approve", 0.2)

            const result = evaluateConsensus(p.id, { minConfidence: 0.6 })
            expect(result.approved).toBe(false)
        })

        it("blocks on collusion", () => {
            const p = createProposal("s1", "security.finding", "value", "analyzer")
            submitVote(p.id, "reviewer1", "approve", 0.9, "this is exactly correct and verified")
            submitVote(p.id, "reviewer2", "approve", 0.9, "this is exactly correct and verified")

            const result = evaluateConsensus(p.id)
            expect(result.collusionDetected).toBe(true)
            expect(result.approved).toBe(false)
        })

        it("handles nonexistent proposal", () => {
            const result = evaluateConsensus("nonexistent")
            expect(result.approved).toBe(false)
            expect(result.totalVotes).toBe(0)
        })
    })

    describe("detectCollusion", () => {
        it("detects identical reasons", () => {
            const votes = [
                { proposalId: "p1", votingAgent: "a1", vote: "approve" as const, confidence: 0.9, reason: "this finding is valid and confirmed", timestamp: 1 },
                { proposalId: "p1", votingAgent: "a2", vote: "approve" as const, confidence: 0.9, reason: "this finding is valid and confirmed", timestamp: 2 },
            ]
            expect(detectCollusion(votes).detected).toBe(true)
        })

        it("does not flag different reasons", () => {
            const votes = [
                { proposalId: "p1", votingAgent: "a1", vote: "approve" as const, confidence: 0.9, reason: "port scan results look correct", timestamp: 1 },
                { proposalId: "p1", votingAgent: "a2", vote: "approve" as const, confidence: 0.8, reason: "verified through network analysis", timestamp: 2 },
            ]
            expect(detectCollusion(votes).detected).toBe(false)
        })
    })

    describe("session management", () => {
        it("filters proposals by session", () => {
            createProposal("s1", "security.a", "v1", "agent1")
            createProposal("s2", "security.b", "v2", "agent2")
            expect(getSessionProposals("s1").length).toBe(1)
            expect(getSessionProposals("s2").length).toBe(1)
        })
    })

    describe("createMemoryConsensusHook", () => {
        it("returns hook when enabled", () => {
            const hook = createMemoryConsensusHook()
            expect(hook).not.toBeNull()
        })
        it("returns null when disabled", () => {
            expect(createMemoryConsensusHook({ enabled: false })).toBeNull()
        })
    })
})
