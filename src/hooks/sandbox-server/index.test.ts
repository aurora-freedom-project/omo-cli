/**
 * In-Sandbox Tool Server — Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    createSandbox,
    executeInSandbox,
    getSandbox,
    findAgentSandbox,
    healthCheck,
    stopSandbox,
    getContext,
    getStats,
    resetAll,
    configure,
    createSandboxServerHook,
    DEFAULT_CONFIG,
} from "./index"

describe("In-Sandbox Tool Server", () => {
    beforeEach(() => {
        resetAll()
    })

    // ── Sandbox Creation ────────────────────────────────────────────────

    describe("createSandbox", () => {
        it("creates a sandbox with allocated port", () => {
            const s = createSandbox("agent-1")
            expect(s).not.toBeNull()
            expect(s!.state).toBe("ready")
            expect(s!.port).toBe(DEFAULT_CONFIG.basePort)
            expect(s!.agentId).toBe("agent-1")
        })

        it("allocates unique ports", () => {
            const s1 = createSandbox("agent-1")
            const s2 = createSandbox("agent-2")
            expect(s1!.port).not.toBe(s2!.port)
        })

        it("enforces max sandboxes", () => {
            configure({ maxSandboxes: 2 })
            createSandbox("agent-1")
            createSandbox("agent-2")
            const s3 = createSandbox("agent-3")
            expect(s3).toBeNull()
        })

        it("returns null when disabled", () => {
            configure({ enabled: false })
            expect(createSandbox("agent-1")).toBeNull()
        })

        it("returns null when no ports available", () => {
            configure({ maxPortRange: 1 })
            createSandbox("agent-1")
            expect(createSandbox("agent-2")).toBeNull()
        })

        it("accepts custom tools list", () => {
            const s = createSandbox("agent-1", ["terminal", "browser"])
            expect(s!.tools).toEqual(["terminal", "browser"])
        })

        it("creates context isolation", () => {
            createSandbox("agent-1")
            const ctx = getContext("agent-1")
            expect(ctx).toBeDefined()
            expect(ctx!.agentId).toBe("agent-1")
        })
    })

    // ── Tool Execution ──────────────────────────────────────────────────

    describe("executeInSandbox", () => {
        it("executes tool and returns output", () => {
            const s = createSandbox("agent-1")!
            const r = executeInSandbox(s.id, { tool: "terminal", args: { command: "ls" } })
            expect(r.success).toBe(true)
            expect(r.output).toContain("terminal")
            expect(r.sandboxId).toBe(s.id)
        })

        it("rejects unknown sandbox", () => {
            const r = executeInSandbox("nonexistent", { tool: "terminal", args: {} })
            expect(r.success).toBe(false)
            expect(r.error).toContain("not found")
        })

        it("rejects stopped sandbox", () => {
            const s = createSandbox("agent-1")!
            stopSandbox(s.id)
            const r = executeInSandbox(s.id, { tool: "terminal", args: {} })
            expect(r.success).toBe(false)
            expect(r.error).toContain("not ready")
        })

        it("rejects unavailable tool", () => {
            const s = createSandbox("agent-1", ["terminal"])!
            const r = executeInSandbox(s.id, { tool: "browser", args: {} })
            expect(r.success).toBe(false)
            expect(r.error).toContain("not available")
        })

        it("updates context tool state", () => {
            const s = createSandbox("agent-1")!
            executeInSandbox(s.id, { tool: "terminal", args: { command: "pwd" } })
            const ctx = getContext("agent-1")
            expect(ctx!.toolStates.has("terminal")).toBe(true)
        })

        it("logs tool call metrics", () => {
            const s = createSandbox("agent-1")!
            executeInSandbox(s.id, { tool: "terminal", args: {} })
            executeInSandbox(s.id, { tool: "browser", args: {} })
            expect(getStats().totalToolCalls).toBe(2)
        })
    })

    // ── Sandbox Lifecycle ───────────────────────────────────────────────

    describe("lifecycle", () => {
        it("stops sandbox and releases port", () => {
            const s = createSandbox("agent-1")!
            const port = s.port
            stopSandbox(s.id)
            expect(getSandbox(s.id)?.state).toBe("stopped")
            // Port should be released — new sandbox can reuse it
            const s2 = createSandbox("agent-2")
            expect(s2!.port).toBe(port)
        })

        it("health check passes for ready sandbox", () => {
            const s = createSandbox("agent-1")!
            expect(healthCheck(s.id)).toBe(true)
        })

        it("health check fails for stopped sandbox", () => {
            const s = createSandbox("agent-1")!
            stopSandbox(s.id)
            expect(healthCheck(s.id)).toBe(false)
        })

        it("health check fails for unknown sandbox", () => {
            expect(healthCheck("nonexistent")).toBe(false)
        })

        it("stop returns false for unknown sandbox", () => {
            expect(stopSandbox("nonexistent")).toBe(false)
        })

        it("cleans up context on stop", () => {
            createSandbox("agent-1")
            expect(getContext("agent-1")).toBeDefined()
            const s = findAgentSandbox("agent-1")!
            stopSandbox(s.id)
            expect(getContext("agent-1")).toBeUndefined()
        })
    })

    // ── Query Functions ─────────────────────────────────────────────────

    describe("queries", () => {
        it("findAgentSandbox finds active sandbox", () => {
            createSandbox("agent-1")
            expect(findAgentSandbox("agent-1")).toBeDefined()
        })

        it("findAgentSandbox skips stopped sandbox", () => {
            const s = createSandbox("agent-1")!
            stopSandbox(s.id)
            expect(findAgentSandbox("agent-1")).toBeUndefined()
        })

        it("getSandbox returns by ID", () => {
            const s = createSandbox("agent-1")!
            expect(getSandbox(s.id)?.agentId).toBe("agent-1")
        })
    })

    // ── Stats ───────────────────────────────────────────────────────────

    describe("getStats", () => {
        it("returns empty stats initially", () => {
            const s = getStats()
            expect(s.totalSandboxes).toBe(0)
            expect(s.totalToolCalls).toBe(0)
        })

        it("tracks tool calls by tool", () => {
            const sb = createSandbox("agent-1")!
            executeInSandbox(sb.id, { tool: "terminal", args: {} })
            executeInSandbox(sb.id, { tool: "terminal", args: {} })
            executeInSandbox(sb.id, { tool: "browser", args: {} })
            const s = getStats()
            expect(s.toolCallsByTool["terminal"]).toBe(2)
            expect(s.toolCallsByTool["browser"]).toBe(1)
        })

        it("tracks port allocations", () => {
            createSandbox("agent-1")
            createSandbox("agent-2")
            const s = getStats()
            expect(s.portAllocations.length).toBe(2)
        })
    })

    // ── Hook Factory ────────────────────────────────────────────────────

    describe("createSandboxServerHook", () => {
        it("returns hook when enabled", () => {
            const hook = createSandboxServerHook()
            expect(hook).not.toBeNull()
            expect(hook!["tool.execute.before"]).toBeDefined()
            expect(hook!["tool.execute.after"]).toBeDefined()
            expect(hook!["session.end"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            expect(createSandboxServerHook({ enabled: false })).toBeNull()
        })

        it("before handler creates sandbox for available tool", async () => {
            resetAll()
            const hook = createSandboxServerHook()!
            const ctx = { tool: "terminal", sessionID: "agent-1" }
            await hook["tool.execute.before"](ctx, {})
            expect((ctx as any).__sandboxId).toBeDefined()
        })

        it("before handler skips unavailable tool", async () => {
            resetAll()
            const hook = createSandboxServerHook()!
            const ctx = { tool: "grep_search", sessionID: "agent-1" }
            await hook["tool.execute.before"](ctx, {})
            expect((ctx as any).__sandboxId).toBeUndefined()
        })
    })

    // ── Configuration ───────────────────────────────────────────────────

    describe("configuration", () => {
        it("has sensible defaults", () => {
            expect(DEFAULT_CONFIG.basePort).toBe(18000)
            expect(DEFAULT_CONFIG.maxSandboxes).toBe(5)
            expect(DEFAULT_CONFIG.maxPortRange).toBe(100)
        })
    })
})
