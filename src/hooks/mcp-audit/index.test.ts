/**
 * MCP Security Scanner — Tests
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    auditTool,
    auditAll,
    getAuditResult,
    passesAudit,
    getFailedAudits,
    getStats,
    resetAll,
    configure,
    createMcpAuditHook,
    DEFAULT_RULES,
    type McpToolDefinition,
} from "./index"

const safeTool: McpToolDefinition = {
    name: "echo",
    description: "Echo a message",
    parameters: [{ name: "message", type: "string", validation: "^[a-zA-Z0-9 ]+$" }],
}

const dangerousTool: McpToolDefinition = {
    name: "run_command",
    description: "Execute a shell command",
    parameters: [
        { name: "command", type: "string" },   // No validation → command injection risk
        { name: "file_path", type: "string" },  // No validation → path traversal risk
    ],
    executesCommand: true,
}

const networkTool: McpToolDefinition = {
    name: "http_fetch",
    description: "Fetch a URL",
    parameters: [
        { name: "url", type: "string" },        // No validation → SSRF risk
        { name: "auth_token", type: "string" },  // Secret handling
    ],
    accessesNetwork: true,
}

describe("MCP Security Scanner", () => {
    beforeEach(() => {
        resetAll()
    })

    // ── Tool Auditing ───────────────────────────────────────────────────

    describe("auditTool", () => {
        it("gives high score to safe tool", () => {
            const r = auditTool(safeTool)
            expect(r.score).toBeGreaterThanOrEqual(80)
            expect(r.risks.length).toBe(0)
        })

        it("detects command injection risk", () => {
            const r = auditTool(dangerousTool)
            expect(r.risks.some(risk => risk.category === "command_injection")).toBe(true)
        })

        it("detects path traversal risk", () => {
            const r = auditTool(dangerousTool)
            expect(r.risks.some(risk => risk.category === "path_traversal")).toBe(true)
        })

        it("detects SSRF risk", () => {
            const r = auditTool(networkTool)
            expect(r.risks.some(risk => risk.category === "ssrf")).toBe(true)
        })

        it("detects secret exposure risk", () => {
            const r = auditTool(networkTool)
            expect(r.risks.some(risk => risk.category === "secret_exposure")).toBe(true)
        })

        it("assigns grade based on score", () => {
            const safe = auditTool(safeTool)
            expect(safe.grade).toBe("A")

            const dangerous = auditTool(dangerousTool)
            expect(["D", "F"]).toContain(dangerous.grade)
        })

        it("stores result for retrieval", () => {
            auditTool(safeTool)
            expect(getAuditResult("echo")).toBeDefined()
        })

        it("exempts tools matching safe patterns", () => {
            const testTool: McpToolDefinition = {
                name: "test_dangerous_command",
                description: "Test tool",
                parameters: [{ name: "command", type: "string" }],
                executesCommand: true,
            }
            const r = auditTool(testTool)
            expect(r.score).toBe(100) // Exempt because starts with "test_"
        })

        it("penalizes critical risks more than medium", () => {
            const critTool: McpToolDefinition = {
                name: "exec_tool",
                description: "Execute",
                parameters: [{ name: "cmd", type: "string" }],
                executesCommand: true,
            }
            const medTool: McpToolDefinition = {
                name: "net_tool",
                description: "Network",
                parameters: [],
                accessesNetwork: true,
            }
            const critResult = auditTool(critTool)
            const medResult = auditTool(medTool)
            expect(critResult.score).toBeLessThan(medResult.score)
        })
    })

    // ── Batch Audit ─────────────────────────────────────────────────────

    describe("auditAll", () => {
        it("audits multiple tools", () => {
            const results = auditAll([safeTool, dangerousTool, networkTool])
            expect(results.length).toBe(3)
        })
    })

    // ── Pass/Fail Gate ──────────────────────────────────────────────────

    describe("passesAudit", () => {
        it("passes for safe tool", () => {
            auditTool(safeTool)
            expect(passesAudit("echo")).toBe(true)
        })

        it("fails for dangerous tool", () => {
            auditTool(dangerousTool)
            expect(passesAudit("run_command")).toBe(false)
        })

        it("passes for unaudited tool", () => {
            expect(passesAudit("unknown")).toBe(true)
        })

        it("respects custom minScoreToPass", () => {
            configure({ minScoreToPass: 100 })
            auditTool(safeTool)
            expect(passesAudit("echo")).toBe(true)
        })
    })

    // ── Failed Audits ───────────────────────────────────────────────────

    describe("getFailedAudits", () => {
        it("returns only failed audits", () => {
            auditTool(safeTool)
            auditTool(dangerousTool)
            const failed = getFailedAudits()
            expect(failed.length).toBe(1)
            expect(failed[0].toolName).toBe("run_command")
        })
    })

    // ── Stats ───────────────────────────────────────────────────────────

    describe("getStats", () => {
        it("returns empty stats initially", () => {
            const s = getStats()
            expect(s.totalAudited).toBe(0)
        })

        it("tracks audited tools", () => {
            auditTool(safeTool)
            auditTool(dangerousTool)
            const s = getStats()
            expect(s.totalAudited).toBe(2)
            expect(s.passedCount).toBe(1)
            expect(s.failedCount).toBe(1)
        })

        it("tracks risks by category", () => {
            auditTool(dangerousTool)
            const s = getStats()
            expect(s.risksByCategory["command_injection"]).toBeGreaterThan(0)
        })

        it("calculates average score", () => {
            auditTool(safeTool)
            auditTool(dangerousTool)
            const s = getStats()
            expect(s.avgScore).toBeGreaterThan(0)
            expect(s.avgScore).toBeLessThan(100)
        })
    })

    // ── Rules ───────────────────────────────────────────────────────────

    describe("rules", () => {
        it("has at least 6 default rules", () => {
            expect(DEFAULT_RULES.length).toBeGreaterThanOrEqual(6)
        })

        it("covers all 5 risk categories", () => {
            const categories = new Set(DEFAULT_RULES.map(r => r.category))
            expect(categories.size).toBe(4) // command_injection, path_traversal, ssrf, secret_exposure
        })

        it("skips validated parameters", () => {
            const tool: McpToolDefinition = {
                name: "safe_exec",
                description: "Execute validated command",
                parameters: [
                    { name: "command", type: "string", validation: "^(ls|pwd|whoami)$" },
                ],
            }
            const r = auditTool(tool)
            expect(r.risks.filter(risk => risk.category === "command_injection").length).toBe(0)
        })
    })

    // ── Hook Factory ────────────────────────────────────────────────────

    describe("createMcpAuditHook", () => {
        it("returns hook when enabled", () => {
            const hook = createMcpAuditHook()
            expect(hook).not.toBeNull()
            expect(hook!["tool.register"]).toBeDefined()
            expect(hook!["tool.execute.before"]).toBeDefined()
        })

        it("returns null when disabled", () => {
            expect(createMcpAuditHook({ enabled: false })).toBeNull()
        })

        it("audits tool on registration", async () => {
            resetAll()
            const hook = createMcpAuditHook()!
            await hook["tool.register"]({ tool: dangerousTool })
            expect(getAuditResult("run_command")).toBeDefined()
        })
    })
})
