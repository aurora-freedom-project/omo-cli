/**
 * Agent Handoff Protocol — Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    registerAgent,
    getRegisteredAgents,
    findBestAgent,
    validateHandoff,
    initiateHandoff,
    completeHandoff,
    rollbackHandoff,
    getHandoffStats,
    clearAll,
    clearSession,
    createAgentHandoffHook,
    type HandoffRequest,
    type HandoffContext,
} from "./index"

function makeContext(overrides?: Partial<HandoffContext>): HandoffContext {
    return {
        reasoningChain: ["Step 1: Analyzed target", "Step 2: Found open ports"],
        findings: [
            { type: "port", description: "Port 80 open", severity: "medium", data: { port: 80 } },
        ],
        currentTask: "Scan web application for vulnerabilities",
        toolHistory: [
            { tool: "nmap", success: true, summary: "Found 3 open ports" },
        ],
        environmentState: { cwd: "/tmp/scan" },
        metadata: {},
        ...overrides,
    }
}

describe("Agent Handoff Protocol", () => {
    beforeEach(() => {
        clearAll()
    })

    // ── Agent Registry ──────────────────────────────────────────────────

    describe("agent registry", () => {
        it("registers agents with capabilities", () => {
            registerAgent("recon", "Reconnaissance agent", ["scanning", "enumeration"])
            registerAgent("exploit", "Exploitation agent", ["exploitation", "privilege_escalation"])

            const agents = getRegisteredAgents()
            expect(agents.length).toBe(2)
            expect(agents[0].name).toBe("recon")
            expect(agents[1].name).toBe("exploit")
        })

        it("findBestAgent returns matching agent", () => {
            registerAgent("recon", "Recon agent", ["scanning"])
            registerAgent("exploit", "Exploit agent", ["exploitation"])

            const best = findBestAgent("scanning")
            expect(best).not.toBeNull()
            expect(best!.name).toBe("recon")
        })

        it("findBestAgent excludes specified agents", () => {
            registerAgent("recon1", "Recon 1", ["scanning"])
            registerAgent("recon2", "Recon 2", ["scanning"])

            const best = findBestAgent("scanning", ["recon1"])
            expect(best).not.toBeNull()
            expect(best!.name).toBe("recon2")
        })

        it("findBestAgent returns null when no match", () => {
            registerAgent("recon", "Recon", ["scanning"])
            expect(findBestAgent("cryptography")).toBeNull()
        })

        it("findBestAgent considers capacity", () => {
            registerAgent("busy", "Busy agent", ["scanning"], 1)
            registerAgent("free", "Free agent", ["scanning"], 3)

            // Fill up busy agent
            initiateHandoff("s1", "user", "busy", "test", makeContext())

            const best = findBestAgent("scanning")
            expect(best).not.toBeNull()
            expect(best!.name).toBe("free")
        })
    })

    // ── Validation ──────────────────────────────────────────────────────

    describe("validateHandoff", () => {
        it("validates a normal handoff", () => {
            const request: HandoffRequest = {
                id: "test1",
                sourceAgent: "recon",
                targetAgent: "exploit",
                reason: "Found vuln, need exploitation",
                context: makeContext(),
                timestamp: Date.now(),
                priority: 1,
            }
            const result = validateHandoff("s1", request)
            expect(result.valid).toBe(true)
        })

        it("rejects when disabled", () => {
            const request: HandoffRequest = {
                id: "test2",
                sourceAgent: "recon",
                targetAgent: "exploit",
                reason: "test",
                context: makeContext(),
                timestamp: Date.now(),
                priority: 1,
            }
            const result = validateHandoff("s1", request, { enabled: false })
            expect(result.valid).toBe(false)
            expect(result.reason).toContain("disabled")
        })

        it("detects cycles", () => {
            // First handoff: recon -> exploit
            initiateHandoff("s1", "recon", "exploit", "test", makeContext())

            // Now try exploit -> recon -> exploit (cycle!)
            const request: HandoffRequest = {
                id: "test3",
                sourceAgent: "recon",
                targetAgent: "exploit", // Already in chain
                reason: "test",
                context: makeContext(),
                timestamp: Date.now(),
                priority: 1,
            }
            const result = validateHandoff("s1", request)
            expect(result.valid).toBe(false)
            expect(result.reason).toContain("Cycle")
        })

        it("enforces max chain length", () => {
            // Fill chain to max
            initiateHandoff("s1", "a", "b", "1", makeContext(), { maxChainLength: 3 })
            initiateHandoff("s1", "b", "c", "2", makeContext(), { maxChainLength: 3 })
            initiateHandoff("s1", "c", "d", "3", makeContext(), { maxChainLength: 3 })

            const request: HandoffRequest = {
                id: "test4",
                sourceAgent: "d",
                targetAgent: "e",
                reason: "test",
                context: makeContext(),
                timestamp: Date.now(),
                priority: 1,
            }
            const result = validateHandoff("s1", request, { maxChainLength: 3 })
            expect(result.valid).toBe(false)
            expect(result.reason).toContain("chain length")
        })

        it("enforces context size limits", () => {
            const bigContext = makeContext({
                reasoningChain: Array.from({ length: 100 }, (_, i) => `Step ${i}: ${"x".repeat(200)}`),
            })
            const request: HandoffRequest = {
                id: "test5",
                sourceAgent: "recon",
                targetAgent: "exploit",
                reason: "test",
                context: bigContext,
                timestamp: Date.now(),
                priority: 1,
            }
            const result = validateHandoff("s1", request, { maxContextSize: 100 })
            expect(result.valid).toBe(false)
            expect(result.reason).toContain("Context size")
        })

        it("enforces allowed routes", () => {
            const routes = new Map<string, string[]>([
                ["recon", ["exploit"]],
                ["exploit", ["post_exploit"]],
            ])
            const request: HandoffRequest = {
                id: "test6",
                sourceAgent: "recon",
                targetAgent: "post_exploit", // Not in allowed routes
                reason: "skip exploit",
                context: makeContext(),
                timestamp: Date.now(),
                priority: 1,
            }
            const result = validateHandoff("s1", request, { allowedRoutes: routes })
            expect(result.valid).toBe(false)
            expect(result.reason).toContain("not allowed")
        })

        it("rejects unregistered target when registry is used", () => {
            registerAgent("recon", "Recon", ["scanning"])
            // "exploit" is NOT registered
            const request: HandoffRequest = {
                id: "test7",
                sourceAgent: "recon",
                targetAgent: "exploit",
                reason: "test",
                context: makeContext(),
                timestamp: Date.now(),
                priority: 1,
            }
            const result = validateHandoff("s1", request)
            expect(result.valid).toBe(false)
            expect(result.reason).toContain("not registered")
        })
    })

    // ── Handoff Lifecycle ───────────────────────────────────────────────

    describe("initiateHandoff", () => {
        it("creates a successful handoff", () => {
            const result = initiateHandoff("s1", "recon", "exploit", "Found vuln", makeContext())
            expect(result.accepted).toBe(true)
            expect(result.handoffId.length).toBe(16)
            expect(result.sourceAgent).toBe("recon")
            expect(result.targetAgent).toBe("exploit")
        })

        it("returns rejection for invalid handoff", () => {
            const result = initiateHandoff("s1", "a", "b", "test", makeContext(), { enabled: false })
            expect(result.accepted).toBe(false)
            expect(result.rejectionReason).toBeDefined()
        })

        it("updates handoff stats", () => {
            initiateHandoff("s1", "recon", "exploit", "test", makeContext())
            const stats = getHandoffStats("s1")
            expect(stats.totalHandoffs).toBe(1)
            expect(stats.activeHandoffs).toBe(1)
        })
    })

    describe("completeHandoff", () => {
        it("marks handoff as completed", () => {
            const result = initiateHandoff("s1", "recon", "exploit", "test", makeContext())
            completeHandoff("s1", result.handoffId, true)

            const stats = getHandoffStats("s1")
            expect(stats.completed).toBe(1)
            expect(stats.activeHandoffs).toBe(0)
        })

        it("marks handoff as failed", () => {
            const result = initiateHandoff("s1", "recon", "exploit", "test", makeContext())
            completeHandoff("s1", result.handoffId, false)

            const stats = getHandoffStats("s1")
            expect(stats.failed).toBe(1)
        })

        it("releases agent capacity on completion", () => {
            registerAgent("exploit", "Exploit", ["exploitation"], 1)
            const result = initiateHandoff("s1", "recon", "exploit", "test", makeContext())

            const agentBefore = getRegisteredAgents().find(a => a.name === "exploit")!
            expect(agentBefore.activeHandoffs).toBe(1)

            completeHandoff("s1", result.handoffId, true)

            const agentAfter = getRegisteredAgents().find(a => a.name === "exploit")!
            expect(agentAfter.activeHandoffs).toBe(0)
        })
    })

    describe("rollbackHandoff", () => {
        it("rolls back and returns control", () => {
            const result = initiateHandoff("s1", "recon", "exploit", "test", makeContext())
            const rollbackResult = rollbackHandoff("s1", result.handoffId)

            expect(rollbackResult.accepted).toBe(true)
            expect(rollbackResult.sourceAgent).toBe("exploit") // Was target
            expect(rollbackResult.targetAgent).toBe("recon")   // Was source
        })

        it("updates stats after rollback", () => {
            const result = initiateHandoff("s1", "recon", "exploit", "test", makeContext())
            rollbackHandoff("s1", result.handoffId)

            const stats = getHandoffStats("s1")
            expect(stats.rolledBack).toBe(1)
            expect(stats.activeHandoffs).toBe(0)
        })

        it("handles missing handoff gracefully", () => {
            const result = rollbackHandoff("s1", "nonexistent")
            expect(result.accepted).toBe(false)
            expect(result.rejectionReason).toContain("not found")
        })
    })

    // ── Chain Management ────────────────────────────────────────────────

    describe("chain management", () => {
        it("builds chain correctly", () => {
            initiateHandoff("s1", "recon", "exploit", "1", makeContext())
            initiateHandoff("s1", "exploit", "post_exploit", "2", makeContext())

            const stats = getHandoffStats("s1")
            expect(stats.currentChainLength).toBe(2)
        })

        it("shrinks chain on completion", () => {
            const h1 = initiateHandoff("s1", "recon", "exploit", "1", makeContext())
            initiateHandoff("s1", "exploit", "post_exploit", "2", makeContext())

            completeHandoff("s1", h1.handoffId, true)

            const stats = getHandoffStats("s1")
            expect(stats.currentChainLength).toBe(1)
        })
    })

    // ── Session Cleanup ─────────────────────────────────────────────────

    describe("session cleanup", () => {
        it("clears session state", () => {
            initiateHandoff("s1", "recon", "exploit", "test", makeContext())
            clearSession("s1")

            const stats = getHandoffStats("s1")
            expect(stats.totalHandoffs).toBe(0)
            expect(stats.currentChainLength).toBe(0)
        })
    })

    // ── Hook Creation ───────────────────────────────────────────────────

    describe("createAgentHandoffHook", () => {
        it("returns hook when enabled", () => {
            const hook = createAgentHandoffHook()
            expect(hook).not.toBeNull()
            expect(hook!["event"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            const hook = createAgentHandoffHook({ enabled: false })
            expect(hook).toBeNull()
        })
    })
})
