/**
 * In-Sandbox Tool Server — API server inside Docker container (from Strix)
 *
 * Instead of direct `docker exec`, runs an HTTP API server inside the sandbox.
 * The agent communicates with tools via HTTP, enabling:
 * - Interactive terminal sessions
 * - Headless browser automation
 * - Persistent file state within the container
 * - Context isolation between concurrent agents
 *
 * Inspired by Strix's tool_server.py pattern.
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

// ── Types ────────────────────────────────────────────────────────────────────

interface SandboxInstance {
    id: string
    containerId: string
    agentId: string
    port: number
    state: "starting" | "ready" | "busy" | "stopped" | "error"
    createdAt: number
    lastHealthCheck: number
    healthCheckFailures: number
    tools: string[]           // Tools available in this sandbox
    metadata: Record<string, unknown>
}

interface ToolCallRequest {
    tool: string
    args: Record<string, unknown>
    timeout?: number
}

interface ToolCallResponse {
    success: boolean
    output?: string
    error?: string
    durationMs: number
    sandboxId: string
}

interface ContextState {
    agentId: string
    sandboxId: string
    toolStates: Map<string, unknown>  // Per-tool isolated state
    fileWrites: string[]              // Files modified in this context
    createdAt: number
}

interface SandboxConfig {
    enabled: boolean
    basePort: number                   // Starting port for allocation
    maxPortRange: number               // Port range size
    maxSandboxes: number               // Max concurrent sandboxes
    healthCheckIntervalMs: number      // Health check frequency
    maxHealthCheckFailures: number     // Failures before marking error
    startupTimeoutMs: number           // Time to wait for sandbox startup
    defaultToolTimeout: number         // Default tool call timeout
    availableTools: string[]           // Tools the sandbox server supports
}

interface SandboxStats {
    totalSandboxes: number
    activeSandboxes: number
    totalToolCalls: number
    avgResponseMs: number
    toolCallsByTool: Record<string, number>
    portAllocations: number[]
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SandboxConfig = {
    enabled: true,
    basePort: 18000,
    maxPortRange: 100,
    maxSandboxes: 5,
    healthCheckIntervalMs: 30000,      // 30 seconds
    maxHealthCheckFailures: 3,
    startupTimeoutMs: 10000,           // 10 seconds
    defaultToolTimeout: 30000,         // 30 seconds
    availableTools: [
        "terminal", "browser", "file_manager",
        "network_scanner", "process_manager",
    ],
}

// ── State ────────────────────────────────────────────────────────────────────

const sandboxes = new Map<string, SandboxInstance>()
const contexts = new Map<string, ContextState>()
const portAllocations = new Set<number>()
const toolCallLog: { tool: string; durationMs: number; success: boolean }[] = []
let config: SandboxConfig = { ...DEFAULT_CONFIG }

// ── Port Allocation ──────────────────────────────────────────────────────────

function allocatePort(): number | null {
    for (let i = 0; i < config.maxPortRange; i++) {
        const port = config.basePort + i
        if (!portAllocations.has(port)) {
            portAllocations.add(port)
            return port
        }
    }
    return null
}

function releasePort(port: number): void {
    portAllocations.delete(port)
}

// ── Sandbox Lifecycle ────────────────────────────────────────────────────────

function generateSandboxId(agentId: string): string {
    const raw = `sandbox|${agentId}|${Date.now()}|${Math.random()}`
    return createHash("sha256").update(raw).digest("hex").slice(0, 12)
}

/**
 * Create and start a new sandbox instance.
 */
function createSandbox(agentId: string, tools?: string[], metadata?: Record<string, unknown>): SandboxInstance | null {
    if (!config.enabled) return null

    // Check quota
    const active = Array.from(sandboxes.values()).filter(s => s.state !== "stopped" && s.state !== "error")
    if (active.length >= config.maxSandboxes) {
        log("[sandbox-server] Max sandboxes reached", { max: config.maxSandboxes })
        return null
    }

    // Allocate port
    const port = allocatePort()
    if (port === null) {
        log("[sandbox-server] No ports available")
        return null
    }

    const sandboxId = generateSandboxId(agentId)
    const sandbox: SandboxInstance = {
        id: sandboxId,
        containerId: `container-${sandboxId}`,
        agentId,
        port,
        state: "ready", // In real impl, would be "starting" until health check passes
        createdAt: Date.now(),
        lastHealthCheck: Date.now(),
        healthCheckFailures: 0,
        tools: tools ?? config.availableTools,
        metadata: metadata ?? {},
    }

    sandboxes.set(sandboxId, sandbox)

    // Create context isolation for this agent
    if (!contexts.has(agentId)) {
        contexts.set(agentId, {
            agentId,
            sandboxId,
            toolStates: new Map(),
            fileWrites: [],
            createdAt: Date.now(),
        })
    }

    log("[sandbox-server] Sandbox created", { sandboxId, agentId, port })
    return sandbox
}

/**
 * Execute a tool call in a sandbox.
 */
function executeInSandbox(sandboxId: string, request: ToolCallRequest): ToolCallResponse {
    const sandbox = sandboxes.get(sandboxId)
    if (!sandbox) {
        return { success: false, error: "Sandbox not found", durationMs: 0, sandboxId }
    }

    if (sandbox.state !== "ready") {
        return { success: false, error: `Sandbox not ready (state: ${sandbox.state})`, durationMs: 0, sandboxId }
    }

    if (!sandbox.tools.includes(request.tool)) {
        return { success: false, error: `Tool '${request.tool}' not available in sandbox`, durationMs: 0, sandboxId }
    }

    const startTime = Date.now()
    sandbox.state = "busy"

    // Simulate tool execution (in real impl: HTTP call to in-container server)
    const output = `[sandbox:${sandboxId}] ${request.tool}: executed with ${Object.keys(request.args).length} args`
    const durationMs = Date.now() - startTime

    sandbox.state = "ready"

    // Log tool call
    toolCallLog.push({ tool: request.tool, durationMs, success: true })

    // Update context
    const context = contexts.get(sandbox.agentId)
    if (context) {
        context.toolStates.set(request.tool, { lastCall: Date.now(), args: request.args })
    }

    return { success: true, output, durationMs, sandboxId }
}

/**
 * Get a sandbox by ID.
 */
function getSandbox(sandboxId: string): SandboxInstance | undefined {
    return sandboxes.get(sandboxId)
}

/**
 * Find sandbox for agent.
 */
function findAgentSandbox(agentId: string): SandboxInstance | undefined {
    return Array.from(sandboxes.values()).find(s =>
        s.agentId === agentId && (s.state === "ready" || s.state === "busy")
    )
}

/**
 * Perform health check on a sandbox.
 */
function healthCheck(sandboxId: string): boolean {
    const sandbox = sandboxes.get(sandboxId)
    if (!sandbox) return false

    if (sandbox.state === "stopped" || sandbox.state === "error") return false

    // Simulate health check (in real impl: HTTP GET /health)
    const healthy = true // Would be HTTP call result
    sandbox.lastHealthCheck = Date.now()

    if (!healthy) {
        sandbox.healthCheckFailures++
        if (sandbox.healthCheckFailures >= config.maxHealthCheckFailures) {
            sandbox.state = "error"
            log("[sandbox-server] Sandbox marked as error", { sandboxId })
            return false
        }
    } else {
        sandbox.healthCheckFailures = 0
    }

    return healthy
}

/**
 * Stop and cleanup a sandbox.
 */
function stopSandbox(sandboxId: string): boolean {
    const sandbox = sandboxes.get(sandboxId)
    if (!sandbox) return false

    sandbox.state = "stopped"
    releasePort(sandbox.port)

    // Clean up context
    contexts.delete(sandbox.agentId)

    log("[sandbox-server] Sandbox stopped", { sandboxId })
    return true
}

/**
 * Get context isolation for an agent.
 */
function getContext(agentId: string): ContextState | undefined {
    return contexts.get(agentId)
}

/**
 * Get aggregated stats.
 */
function getStats(): SandboxStats {
    const all = Array.from(sandboxes.values())
    const active = all.filter(s => s.state === "ready" || s.state === "busy")

    const toolCallsByTool: Record<string, number> = {}
    let totalDuration = 0

    for (const call of toolCallLog) {
        toolCallsByTool[call.tool] = (toolCallsByTool[call.tool] ?? 0) + 1
        totalDuration += call.durationMs
    }

    return {
        totalSandboxes: all.length,
        activeSandboxes: active.length,
        totalToolCalls: toolCallLog.length,
        avgResponseMs: toolCallLog.length > 0 ? totalDuration / toolCallLog.length : 0,
        toolCallsByTool,
        portAllocations: Array.from(portAllocations),
    }
}

/**
 * Reset all state.
 */
function resetAll(): void {
    sandboxes.clear()
    contexts.clear()
    portAllocations.clear()
    toolCallLog.length = 0
    config = { ...DEFAULT_CONFIG }
}

function configure(overrides: Partial<SandboxConfig>): void {
    config = { ...config, ...overrides }
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

function createSandboxServerHook(overrides?: Partial<SandboxConfig>): Record<string, Function> | null {
    if (overrides) configure(overrides)
    if (!config.enabled) return null

    return {
        "tool.execute.before": async (ctx: Record<string, unknown>) => {
            const toolName = ctx.tool as string
            const agentId = (ctx.sessionID as string) ?? "default"

            if (!config.availableTools.includes(toolName)) return

            // Find or create sandbox
            let sandbox = findAgentSandbox(agentId)
            if (!sandbox) {
                sandbox = createSandbox(agentId) ?? undefined
            }

            if (sandbox) {
                (ctx as Record<string, unknown>).__sandboxId = sandbox.id
            }
        },

        "tool.execute.after": async (ctx: Record<string, unknown>) => {
            const sandboxId = (ctx as Record<string, unknown>).__sandboxId as string | undefined
            if (!sandboxId) return

            healthCheck(sandboxId)
        },

        "session.end": async (ctx: Record<string, unknown>) => {
            const agentId = (ctx.sessionID as string) ?? "default"
            const sandbox = findAgentSandbox(agentId)
            if (sandbox) {
                stopSandbox(sandbox.id)
            }
        },
    }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
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
    type SandboxInstance,
    type SandboxConfig,
    type ToolCallRequest,
    type ToolCallResponse,
    type ContextState,
    type SandboxStats,
}
