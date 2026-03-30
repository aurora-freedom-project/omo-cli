/**
 * MCP Protocol Bridge — Expose omo-cli tools as MCP server.
 *
 * Learned from:
 * - HexStrike-AI (300⭐): 150+ tool MCP bridge for pentesting tools
 * - oh-my-openagent (44K⭐): Skill-embedded MCPs
 * - AgentScope (21.6K⭐): MCP + A2A protocol support
 *
 * The MCP (Model Context Protocol) Bridge exposes omo-cli's internal tools
 * as MCP-compatible tool definitions. This allows external agents (Cursor,
 * Claude Code, Cline, etc.) to use omo-cli tools directly.
 *
 * Architecture:
 *   External Agent (MCP Client)
 *       ↓ MCP Protocol (JSON-RPC)
 *   MCP Bridge (this module)
 *       ↓ Tool Registry
 *   omo-cli Internal Tools
 *
 * Supported MCP operations:
 * - tools/list — List all available tools
 * - tools/call — Call a specific tool
 * - resources/list — List available resources (skills, KG entities)
 * - prompts/list — List available prompt templates
 *
 * @see Phase 8.4 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export interface MCPToolDefinition {
    /** Tool name (snake_case). */
    name: string
    /** Human-readable description. */
    description: string
    /** JSON Schema for input parameters. */
    inputSchema: {
        type: "object"
        properties: Record<string, MCPPropertySchema>
        required: string[]
    }
}

export interface MCPPropertySchema {
    type: "string" | "number" | "boolean" | "array" | "object"
    description: string
    enum?: string[]
    items?: MCPPropertySchema
    default?: unknown
}

export interface MCPToolResult {
    /** Whether the tool call succeeded. */
    isError: boolean
    /** Result content. */
    content: MCPContent[]
}

export interface MCPContent {
    type: "text" | "image" | "resource"
    text?: string
    data?: string
    mimeType?: string
}

export interface MCPResource {
    /** Resource URI. */
    uri: string
    /** Human-readable name. */
    name: string
    /** Description. */
    description: string
    /** MIME type. */
    mimeType: string
}

export interface MCPPrompt {
    /** Prompt name. */
    name: string
    /** Description. */
    description: string
    /** Arguments. */
    arguments: Array<{
        name: string
        description: string
        required: boolean
    }>
}

export interface MCPRequest {
    jsonrpc: "2.0"
    id: number | string
    method: string
    params?: Record<string, unknown>
}

export interface MCPResponse {
    jsonrpc: "2.0"
    id: number | string
    result?: unknown
    error?: {
        code: number
        message: string
        data?: unknown
    }
}

export type ToolHandler = (params: Record<string, unknown>) => Promise<MCPToolResult>

export interface BridgeMetrics {
    /** Total requests processed. */
    totalRequests: number
    /** Successful tool calls. */
    successfulCalls: number
    /** Failed tool calls. */
    failedCalls: number
    /** Requests by method. */
    requestsByMethod: Record<string, number>
    /** Average response time (ms). */
    avgResponseMs: number
    /** Active connections. */
    activeConnections: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const MCP_VERSION = "2024-11-05"
const SERVER_NAME = "omo-cli"
const SERVER_VERSION = "4.0.0"

// ── MCP Bridge ─────────────────────────────────────────────────────────────

/**
 * Create an MCP Protocol Bridge.
 *
 * Registers tools, resources, and prompts that can be exposed via MCP.
 */
export function createMCPBridge() {
    const tools = new Map<string, { definition: MCPToolDefinition; handler: ToolHandler }>()
    const resources = new Map<string, MCPResource>()
    const prompts = new Map<string, MCPPrompt & { template: (args: Record<string, string>) => string }>()

    const metrics: BridgeMetrics = {
        totalRequests: 0,
        successfulCalls: 0,
        failedCalls: 0,
        requestsByMethod: {},
        avgResponseMs: 0,
        activeConnections: 0,
    }

    let totalResponseMs = 0

    // ── Tool Registration ─────────────────────────────────────────────

    /**
     * Register a tool with the MCP bridge.
     */
    function registerTool(definition: MCPToolDefinition, handler: ToolHandler): void {
        tools.set(definition.name, { definition, handler })
        log("[mcp-bridge] Tool registered", { name: definition.name })
    }

    /**
     * Unregister a tool.
     */
    function unregisterTool(name: string): boolean {
        return tools.delete(name)
    }

    // ── Resource Registration ─────────────────────────────────────────

    /**
     * Register a resource.
     */
    function registerResource(resource: MCPResource): void {
        resources.set(resource.uri, resource)
    }

    // ── Prompt Registration ───────────────────────────────────────────

    /**
     * Register a prompt template.
     */
    function registerPrompt(
        prompt: MCPPrompt,
        template: (args: Record<string, string>) => string,
    ): void {
        prompts.set(prompt.name, { ...prompt, template })
    }

    // ── Request Handling ──────────────────────────────────────────────

    /**
     * Handle an MCP JSON-RPC request.
     */
    async function handleRequest(request: MCPRequest): Promise<MCPResponse> {
        const startTime = Date.now()
        metrics.totalRequests++
        metrics.requestsByMethod[request.method] =
            (metrics.requestsByMethod[request.method] ?? 0) + 1

        try {
            let result: unknown

            switch (request.method) {
                case "initialize":
                    result = handleInitialize()
                    break

                case "tools/list":
                    result = handleToolsList()
                    break

                case "tools/call":
                    result = await handleToolCall(request.params ?? {})
                    break

                case "resources/list":
                    result = handleResourcesList()
                    break

                case "prompts/list":
                    result = handlePromptsList()
                    break

                case "prompts/get":
                    result = handlePromptsGet(request.params ?? {})
                    break

                default:
                    return makeError(request.id, -32601, `Method not found: ${request.method}`)
            }

            const responseTime = Date.now() - startTime
            totalResponseMs += responseTime
            metrics.avgResponseMs = totalResponseMs / metrics.totalRequests

            return {
                jsonrpc: "2.0",
                id: request.id,
                result,
            }
        } catch (err) {
            metrics.failedCalls++
            return makeError(request.id, -32603, String(err))
        }
    }

    // ── Method Handlers ───────────────────────────────────────────────

    function handleInitialize(): object {
        return {
            protocolVersion: MCP_VERSION,
            capabilities: {
                tools: { listChanged: true },
                resources: { subscribe: false, listChanged: true },
                prompts: { listChanged: true },
            },
            serverInfo: {
                name: SERVER_NAME,
                version: SERVER_VERSION,
            },
        }
    }

    function handleToolsList(): object {
        return {
            tools: [...tools.values()].map(t => t.definition),
        }
    }

    async function handleToolCall(params: Record<string, unknown>): Promise<MCPToolResult> {
        const toolName = params.name as string
        const toolArgs = (params.arguments ?? {}) as Record<string, unknown>

        const tool = tools.get(toolName)
        if (!tool) {
            metrics.failedCalls++
            return {
                isError: true,
                content: [{ type: "text", text: `Tool not found: ${toolName}` }],
            }
        }

        try {
            const result = await tool.handler(toolArgs)
            if (!result.isError) {
                metrics.successfulCalls++
            } else {
                metrics.failedCalls++
            }

            log("[mcp-bridge] Tool called", {
                tool: toolName,
                success: !result.isError,
            })

            return result
        } catch (err) {
            metrics.failedCalls++
            return {
                isError: true,
                content: [{ type: "text", text: `Tool execution failed: ${String(err)}` }],
            }
        }
    }

    function handleResourcesList(): object {
        return {
            resources: [...resources.values()],
        }
    }

    function handlePromptsList(): object {
        return {
            prompts: [...prompts.values()].map(({ template, ...p }) => p),
        }
    }

    function handlePromptsGet(params: Record<string, unknown>): object {
        const promptName = params.name as string
        const promptArgs = (params.arguments ?? {}) as Record<string, string>

        const prompt = prompts.get(promptName)
        if (!prompt) {
            return { messages: [] }
        }

        const content = prompt.template(promptArgs)
        return {
            messages: [
                { role: "user", content: { type: "text", text: content } },
            ],
        }
    }

    // ── Utility ───────────────────────────────────────────────────────

    function makeError(id: number | string, code: number, message: string): MCPResponse {
        return {
            jsonrpc: "2.0",
            id,
            error: { code, message },
        }
    }

    /**
     * Get the number of registered tools.
     */
    function getToolCount(): number {
        return tools.size
    }

    /**
     * Get all tool names.
     */
    function getToolNames(): string[] {
        return [...tools.keys()]
    }

    /**
     * Get metrics.
     */
    function getMetrics(): BridgeMetrics {
        return { ...metrics }
    }

    /**
     * Reset all state (for testing).
     */
    function reset(): void {
        tools.clear()
        resources.clear()
        prompts.clear()
        metrics.totalRequests = 0
        metrics.successfulCalls = 0
        metrics.failedCalls = 0
        metrics.requestsByMethod = {}
        metrics.avgResponseMs = 0
        metrics.activeConnections = 0
        totalResponseMs = 0
    }

    return {
        registerTool,
        unregisterTool,
        registerResource,
        registerPrompt,
        handleRequest,
        getToolCount,
        getToolNames,
        getMetrics,
        reset,
    }
}

// ── Built-in Tool Definitions ──────────────────────────────────────────────

/**
 * Create MCP tool definitions for omo-cli's core tools.
 */
export function getBuiltinToolDefinitions(): MCPToolDefinition[] {
    return [
        {
            name: "pattern_scan",
            description: "Scan project files for security vulnerability patterns using regex",
            inputSchema: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Directory or file to scan" },
                    patterns: { type: "array", description: "Regex patterns to search for", items: { type: "string", description: "Regex pattern" } },
                    severity: { type: "string", description: "Minimum severity to report", enum: ["low", "medium", "high", "critical"] },
                },
                required: ["path"],
            },
        },
        {
            name: "input_guard_test",
            description: "Test a prompt against omo-cli's 28-pattern input guard for injection detection",
            inputSchema: {
                type: "object",
                properties: {
                    text: { type: "string", description: "Text to test against input guard" },
                    verbose: { type: "boolean", description: "Include matched pattern details", default: false },
                },
                required: ["text"],
            },
        },
        {
            name: "kill_chain_status",
            description: "Get current kill chain state (MITRE ATT&CK stage, available transitions)",
            inputSchema: {
                type: "object",
                properties: {
                    sessionId: { type: "string", description: "Session ID to check" },
                },
                required: ["sessionId"],
            },
        },
        {
            name: "cvss_score",
            description: "Calculate CVSS score for a security finding",
            inputSchema: {
                type: "object",
                properties: {
                    description: { type: "string", description: "Finding description" },
                    attackVector: { type: "string", description: "Attack vector", enum: ["network", "adjacent", "local", "physical"] },
                    attackComplexity: { type: "string", description: "Attack complexity", enum: ["low", "high"] },
                    impactConfidentiality: { type: "string", description: "CIA impact (Confidentiality)", enum: ["none", "low", "high"] },
                    impactIntegrity: { type: "string", description: "CIA impact (Integrity)", enum: ["none", "low", "high"] },
                    impactAvailability: { type: "string", description: "CIA impact (Availability)", enum: ["none", "low", "high"] },
                },
                required: ["description"],
            },
        },
        {
            name: "skill_search",
            description: "Search omo-cli's skill library (1342+ skills) by keyword",
            inputSchema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query" },
                    maxResults: { type: "number", description: "Maximum results to return", default: 5 },
                },
                required: ["query"],
            },
        },
        {
            name: "jailbreak_eval",
            description: "Evaluate text against 103-case jailbreak test suite for safety scoring",
            inputSchema: {
                type: "object",
                properties: {
                    text: { type: "string", description: "Text to evaluate" },
                    categories: { type: "array", description: "Categories to test", items: { type: "string", description: "Category" } },
                },
                required: ["text"],
            },
        },
    ]
}

/**
 * Create MCP resource definitions for omo-cli.
 */
export function getBuiltinResources(): MCPResource[] {
    return [
        {
            uri: "omo://skills",
            name: "Skill Library",
            description: "Access omo-cli's 1342+ skill library",
            mimeType: "application/json",
        },
        {
            uri: "omo://knowledge-graph",
            name: "Knowledge Graph",
            description: "Access the project knowledge graph (entities and relations)",
            mimeType: "application/json",
        },
        {
            uri: "omo://security-findings",
            name: "Security Findings",
            description: "Access security scan findings and CVSS scores",
            mimeType: "application/json",
        },
    ]
}

export { MCP_VERSION, SERVER_NAME, SERVER_VERSION }
