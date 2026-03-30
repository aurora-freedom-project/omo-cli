/**
 * MCP Protocol Bridge — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    createMCPBridge,
    getBuiltinToolDefinitions,
    getBuiltinResources,
    type MCPRequest,
    type MCPToolDefinition,
    type MCPToolResult,
} from "./index"

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(method: string, params?: Record<string, unknown>, id: number = 1): MCPRequest {
    return { jsonrpc: "2.0", id, method, params }
}

function makeToolDef(name: string): MCPToolDefinition {
    return {
        name,
        description: `Test tool: ${name}`,
        inputSchema: {
            type: "object",
            properties: {
                input: { type: "string", description: "Input parameter" },
            },
            required: ["input"],
        },
    }
}

async function echoHandler(params: Record<string, unknown>): Promise<MCPToolResult> {
    return {
        isError: false,
        content: [{ type: "text", text: `Echo: ${JSON.stringify(params)}` }],
    }
}

async function failingHandler(): Promise<MCPToolResult> {
    throw new Error("Tool exploded")
}

// ── MCP Bridge ─────────────────────────────────────────────────────────────

describe("createMCPBridge", () => {
    let bridge: ReturnType<typeof createMCPBridge>

    beforeEach(() => {
        bridge = createMCPBridge()
    })

    // ── Tool Registration ─────────────────────────────────────────

    it("registers a tool", () => {
        bridge.registerTool(makeToolDef("test_tool"), echoHandler)
        expect(bridge.getToolCount()).toBe(1)
        expect(bridge.getToolNames()).toContain("test_tool")
    })

    it("unregisters a tool", () => {
        bridge.registerTool(makeToolDef("test_tool"), echoHandler)
        expect(bridge.unregisterTool("test_tool")).toBe(true)
        expect(bridge.getToolCount()).toBe(0)
    })

    it("returns false for unregistering nonexistent tool", () => {
        expect(bridge.unregisterTool("nonexistent")).toBe(false)
    })

    // ── Initialize ────────────────────────────────────────────────

    it("handles initialize request", async () => {
        const response = await bridge.handleRequest(makeRequest("initialize"))
        expect(response.error).toBeUndefined()
        const result = response.result as any
        expect(result.protocolVersion).toBeDefined()
        expect(result.serverInfo.name).toBe("omo-cli")
        expect(result.capabilities.tools).toBeDefined()
    })

    // ── Tools List ────────────────────────────────────────────────

    it("lists registered tools", async () => {
        bridge.registerTool(makeToolDef("tool_a"), echoHandler)
        bridge.registerTool(makeToolDef("tool_b"), echoHandler)

        const response = await bridge.handleRequest(makeRequest("tools/list"))
        const result = response.result as any
        expect(result.tools).toHaveLength(2)
        expect(result.tools[0].name).toBe("tool_a")
    })

    it("returns empty list when no tools", async () => {
        const response = await bridge.handleRequest(makeRequest("tools/list"))
        const result = response.result as any
        expect(result.tools).toHaveLength(0)
    })

    // ── Tools Call ────────────────────────────────────────────────

    it("calls a registered tool", async () => {
        bridge.registerTool(makeToolDef("echo"), echoHandler)

        const response = await bridge.handleRequest(makeRequest("tools/call", {
            name: "echo",
            arguments: { input: "hello" },
        }))

        const result = response.result as MCPToolResult
        expect(result.isError).toBe(false)
        expect(result.content[0].text).toContain("hello")
    })

    it("returns error for unknown tool", async () => {
        const response = await bridge.handleRequest(makeRequest("tools/call", {
            name: "nonexistent",
            arguments: {},
        }))

        const result = response.result as MCPToolResult
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain("not found")
    })

    it("handles tool execution failures", async () => {
        bridge.registerTool(makeToolDef("failing"), failingHandler)

        const response = await bridge.handleRequest(makeRequest("tools/call", {
            name: "failing",
            arguments: {},
        }))

        const result = response.result as MCPToolResult
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain("exploded")
    })

    it("tracks successful calls in metrics", async () => {
        bridge.registerTool(makeToolDef("echo"), echoHandler)
        await bridge.handleRequest(makeRequest("tools/call", {
            name: "echo",
            arguments: { input: "test" },
        }))

        expect(bridge.getMetrics().successfulCalls).toBe(1)
    })

    it("tracks failed calls in metrics", async () => {
        bridge.registerTool(makeToolDef("failing"), failingHandler)
        await bridge.handleRequest(makeRequest("tools/call", {
            name: "failing",
            arguments: {},
        }))

        expect(bridge.getMetrics().failedCalls).toBe(1)
    })

    // ── Resources ─────────────────────────────────────────────────

    it("lists registered resources", async () => {
        bridge.registerResource({
            uri: "omo://test",
            name: "Test Resource",
            description: "A test resource",
            mimeType: "application/json",
        })

        const response = await bridge.handleRequest(makeRequest("resources/list"))
        const result = response.result as any
        expect(result.resources).toHaveLength(1)
        expect(result.resources[0].uri).toBe("omo://test")
    })

    // ── Prompts ───────────────────────────────────────────────────

    it("lists registered prompts", async () => {
        bridge.registerPrompt(
            {
                name: "security_scan",
                description: "Generate a security scan prompt",
                arguments: [{ name: "target", description: "Scan target", required: true }],
            },
            (args) => `Scan ${args.target} for vulnerabilities`,
        )

        const response = await bridge.handleRequest(makeRequest("prompts/list"))
        const result = response.result as any
        expect(result.prompts).toHaveLength(1)
        expect(result.prompts[0].name).toBe("security_scan")
    })

    it("gets prompt with arguments", async () => {
        bridge.registerPrompt(
            {
                name: "scan",
                description: "Scan prompt",
                arguments: [{ name: "target", description: "Target", required: true }],
            },
            (args) => `Scan ${args.target} for issues`,
        )

        const response = await bridge.handleRequest(makeRequest("prompts/get", {
            name: "scan",
            arguments: { target: "example.com" },
        }))

        const result = response.result as any
        expect(result.messages[0].content.text).toContain("example.com")
    })

    it("returns empty messages for unknown prompt", async () => {
        const response = await bridge.handleRequest(makeRequest("prompts/get", {
            name: "unknown",
        }))
        const result = response.result as any
        expect(result.messages).toHaveLength(0)
    })

    // ── Unknown Method ────────────────────────────────────────────

    it("returns method-not-found for unknown method", async () => {
        const response = await bridge.handleRequest(makeRequest("unknown/method"))
        expect(response.error).toBeDefined()
        expect(response.error!.code).toBe(-32601)
    })

    // ── Metrics ───────────────────────────────────────────────────

    it("tracks request counts by method", async () => {
        bridge.registerTool(makeToolDef("echo"), echoHandler)

        await bridge.handleRequest(makeRequest("tools/list"))
        await bridge.handleRequest(makeRequest("tools/list"))
        await bridge.handleRequest(makeRequest("tools/call", {
            name: "echo",
            arguments: {},
        }))

        const metrics = bridge.getMetrics()
        expect(metrics.totalRequests).toBe(3)
        expect(metrics.requestsByMethod["tools/list"]).toBe(2)
        expect(metrics.requestsByMethod["tools/call"]).toBe(1)
    })

    it("tracks average response time", async () => {
        await bridge.handleRequest(makeRequest("initialize"))
        expect(bridge.getMetrics().avgResponseMs).toBeGreaterThanOrEqual(0)
    })

    // ── Reset ─────────────────────────────────────────────────────

    it("resets all state", () => {
        bridge.registerTool(makeToolDef("test"), echoHandler)
        bridge.reset()
        expect(bridge.getToolCount()).toBe(0)
        expect(bridge.getMetrics().totalRequests).toBe(0)
    })
})

// ── Built-in Definitions ──────────────────────────────────────────────────

describe("built-in definitions", () => {
    it("provides valid tool definitions", () => {
        const defs = getBuiltinToolDefinitions()
        expect(defs.length).toBeGreaterThan(0)

        for (const def of defs) {
            expect(def.name).toBeTruthy()
            expect(def.description).toBeTruthy()
            expect(def.inputSchema.type).toBe("object")
        }
    })

    it("provides builtin resources", () => {
        const resources = getBuiltinResources()
        expect(resources.length).toBeGreaterThan(0)

        for (const res of resources) {
            expect(res.uri).toMatch(/^omo:\/\//)
            expect(res.name).toBeTruthy()
        }
    })

    it("includes core security tools", () => {
        const tools = getBuiltinToolDefinitions()
        const names = tools.map(t => t.name)
        expect(names).toContain("pattern_scan")
        expect(names).toContain("input_guard_test")
        expect(names).toContain("kill_chain_status")
        expect(names).toContain("cvss_score")
    })
})
