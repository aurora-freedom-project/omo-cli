/**
 * Stateful MCP Sessions — Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    createSession,
    interact,
    getSession,
    getAgentSessions,
    destroySession,
    expireIdleSessions,
    isStatefulTool,
    findActiveSession,
    getStats,
    resetAll,
    configure,
    createStatefulMcpHook,
    DEFAULT_CONFIG,
} from "./index"

describe("Stateful MCP Sessions", () => {
    beforeEach(() => {
        resetAll()
    })

    // ── Session Creation ────────────────────────────────────────────────

    describe("createSession", () => {
        it("creates a session for a stateful tool", () => {
            const r = createSession("agent-1", "psql")
            expect(r.success).toBe(true)
            expect(r.sessionId).toBeDefined()
            expect(r.sessionId!.length).toBe(16)
        })

        it("rejects non-stateful tools", () => {
            const r = createSession("agent-1", "grep_search")
            expect(r.success).toBe(false)
            expect(r.error).toContain("not configured")
        })

        it("rejects when disabled", () => {
            configure({ enabled: false })
            const r = createSession("agent-1", "psql")
            expect(r.success).toBe(false)
            expect(r.error).toContain("disabled")
        })

        it("enforces per-agent quota", () => {
            configure({ maxSessionsPerAgent: 2 })
            createSession("agent-1", "psql")
            createSession("agent-1", "mysql")
            const r = createSession("agent-1", "redis-cli")
            expect(r.success).toBe(false)
            expect(r.error).toContain("max sessions")
        })

        it("enforces global quota", () => {
            configure({ maxTotalSessions: 2 })
            createSession("agent-1", "psql")
            createSession("agent-2", "mysql")
            const r = createSession("agent-3", "redis-cli")
            expect(r.success).toBe(false)
            expect(r.error).toContain("Max total")
        })

        it("stores metadata", () => {
            const r = createSession("agent-1", "psql", { database: "testdb" })
            expect(r.success).toBe(true)
            const s = getSession(r.sessionId!)
            expect(s?.metadata).toEqual({ database: "testdb" })
        })
    })

    // ── Session Interaction ─────────────────────────────────────────────

    describe("interact", () => {
        it("processes input and returns output", () => {
            const { sessionId } = createSession("agent-1", "psql")
            const r = interact(sessionId!, "SELECT 1;", "1")
            expect(r.success).toBe(true)
            expect(r.output).toBe("1")
            expect(r.durationMs).toBeGreaterThanOrEqual(0)
        })

        it("rejects unknown session", () => {
            const r = interact("nonexistent", "test")
            expect(r.success).toBe(false)
            expect(r.error).toContain("not found")
        })

        it("rejects expired session", () => {
            const { sessionId } = createSession("agent-1", "psql")
            destroySession(sessionId!)
            const r = interact(sessionId!, "test")
            expect(r.success).toBe(false)
            expect(r.error).toContain("destroyed")
        })

        it("rejects oversized input", () => {
            configure({ maxInputSize: 10 })
            const { sessionId } = createSession("agent-1", "psql")
            const r = interact(sessionId!, "A".repeat(20))
            expect(r.success).toBe(false)
            expect(r.error).toContain("max size")
        })

        it("truncates oversized output", () => {
            configure({ maxOutputSize: 10 })
            const { sessionId } = createSession("agent-1", "psql")
            const r = interact(sessionId!, "query", "A".repeat(100))
            expect(r.success).toBe(true)
            expect(r.output!.length).toBe(10)
        })

        it("increments interaction count", () => {
            const { sessionId } = createSession("agent-1", "psql")
            interact(sessionId!, "q1", "r1")
            interact(sessionId!, "q2", "r2")
            interact(sessionId!, "q3", "r3")
            const s = getSession(sessionId!)
            expect(s?.interactionCount).toBe(3)
        })

        it("trims history when exceeding max", () => {
            configure({ maxHistoryPerSession: 3 })
            const { sessionId } = createSession("agent-1", "psql")
            for (let i = 0; i < 5; i++) {
                interact(sessionId!, `q${i}`, `r${i}`)
            }
            const s = getSession(sessionId!)
            expect(s?.history.length).toBe(3)
        })

        it("updates lastActiveAt", () => {
            const { sessionId } = createSession("agent-1", "psql")
            const s1 = getSession(sessionId!)
            const before = s1!.lastActiveAt
            interact(sessionId!, "test", "ok")
            const s2 = getSession(sessionId!)
            expect(s2!.lastActiveAt).toBeGreaterThanOrEqual(before)
        })
    })

    // ── Session Lifecycle ───────────────────────────────────────────────

    describe("lifecycle", () => {
        it("destroys a session", () => {
            const { sessionId } = createSession("agent-1", "psql")
            expect(destroySession(sessionId!)).toBe(true)
            expect(getSession(sessionId!)?.state).toBe("destroyed")
        })

        it("returns false for unknown destroy", () => {
            expect(destroySession("nonexistent")).toBe(false)
        })

        it("expires idle sessions", () => {
            configure({ ttlMs: 1 }) // 1ms TTL
            const { sessionId } = createSession("agent-1", "psql")
            // Force the session to be old
            const s = getSession(sessionId!)!
            s.lastActiveAt = Date.now() - 100
            const expired = expireIdleSessions()
            expect(expired).toBe(1)
            expect(getSession(sessionId!)?.state).toBe("expired")
        })

        it("marks sessions as idle at half TTL", () => {
            configure({ ttlMs: 1000 })
            const { sessionId } = createSession("agent-1", "psql")
            const s = getSession(sessionId!)!
            s.lastActiveAt = Date.now() - 600 // past half TTL
            expireIdleSessions()
            expect(getSession(sessionId!)?.state).toBe("idle")
        })

        it("does not expire active sessions within TTL", () => {
            configure({ ttlMs: 60000 })
            createSession("agent-1", "psql")
            const expired = expireIdleSessions()
            expect(expired).toBe(0)
        })
    })

    // ── Query Functions ─────────────────────────────────────────────────

    describe("queries", () => {
        it("getAgentSessions returns only agent's active sessions", () => {
            createSession("agent-1", "psql")
            createSession("agent-1", "mysql")
            createSession("agent-2", "redis-cli")
            expect(getAgentSessions("agent-1").length).toBe(2)
            expect(getAgentSessions("agent-2").length).toBe(1)
        })

        it("isStatefulTool checks configured tools", () => {
            expect(isStatefulTool("psql")).toBe(true)
            expect(isStatefulTool("grep_search")).toBe(false)
        })

        it("findActiveSession finds existing session", () => {
            createSession("agent-1", "psql")
            const found = findActiveSession("agent-1", "psql")
            expect(found).toBeDefined()
            expect(found!.toolName).toBe("psql")
        })

        it("findActiveSession returns undefined when none exist", () => {
            expect(findActiveSession("agent-1", "psql")).toBeUndefined()
        })

        it("findActiveSession excludes destroyed sessions", () => {
            const { sessionId } = createSession("agent-1", "psql")
            destroySession(sessionId!)
            expect(findActiveSession("agent-1", "psql")).toBeUndefined()
        })
    })

    // ── Stats ───────────────────────────────────────────────────────────

    describe("getStats", () => {
        it("returns empty stats initially", () => {
            const s = getStats()
            expect(s.totalSessions).toBe(0)
            expect(s.activeSessions).toBe(0)
        })

        it("tracks sessions by tool and agent", () => {
            createSession("agent-1", "psql")
            createSession("agent-1", "mysql")
            createSession("agent-2", "psql")
            const s = getStats()
            expect(s.totalSessions).toBe(3)
            expect(s.activeSessions).toBe(3)
            expect(s.sessionsByTool["psql"]).toBe(2)
            expect(s.sessionsByAgent["agent-1"]).toBe(2)
        })

        it("counts total interactions", () => {
            const { sessionId } = createSession("agent-1", "psql")
            interact(sessionId!, "q1", "r1")
            interact(sessionId!, "q2", "r2")
            expect(getStats().totalInteractions).toBe(2)
        })
    })

    // ── Hook Factory ────────────────────────────────────────────────────

    describe("createStatefulMcpHook", () => {
        it("returns hook when enabled", () => {
            const hook = createStatefulMcpHook()
            expect(hook).not.toBeNull()
            expect(hook!["tool.execute.before"]).toBeDefined()
            expect(hook!["tool.execute.after"]).toBeDefined()
            expect(hook!["session.end"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            expect(createStatefulMcpHook({ enabled: false })).toBeNull()
        })

        it("before handler creates session for stateful tool", async () => {
            resetAll()
            const hook = createStatefulMcpHook()!
            const ctx = { tool: "psql", sessionID: "test-agent", args: { command: "SELECT 1" } }
            await hook["tool.execute.before"](ctx, {})
            expect((ctx as any).__statefulSessionId).toBeDefined()
        })

        it("before handler skips non-stateful tool", async () => {
            resetAll()
            const hook = createStatefulMcpHook()!
            const ctx = { tool: "grep_search", sessionID: "test-agent", args: {} }
            await hook["tool.execute.before"](ctx, {})
            expect((ctx as any).__statefulSessionId).toBeUndefined()
        })

        it("after handler records interaction", async () => {
            resetAll()
            const hook = createStatefulMcpHook()!
            const ctx: Record<string, unknown> = { tool: "psql", sessionID: "test-agent", args: { command: "SELECT 1" } }
            await hook["tool.execute.before"](ctx, {})
            await hook["tool.execute.after"](ctx, { result: "1 row returned" })
            const sessionId = ctx.__statefulSessionId as string
            const s = getSession(sessionId)
            expect(s?.interactionCount).toBe(1)
        })
    })

    // ── Configuration ───────────────────────────────────────────────────

    describe("configuration", () => {
        it("has sensible defaults", () => {
            expect(DEFAULT_CONFIG.ttlMs).toBe(600000) // 10 min
            expect(DEFAULT_CONFIG.maxSessionsPerAgent).toBe(5)
            expect(DEFAULT_CONFIG.maxTotalSessions).toBe(20)
            expect(DEFAULT_CONFIG.statefulTools.length).toBeGreaterThan(5)
        })

        it("configure updates settings", () => {
            configure({ maxSessionsPerAgent: 1 })
            createSession("agent-1", "psql")
            const r = createSession("agent-1", "mysql")
            expect(r.success).toBe(false)
        })
    })
})
