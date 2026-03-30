/**
 * Agent Handoff Protocol — Context-preserving agent-to-agent control transfer.
 *
 * Inspired by CAI (aliasrobotics) ToolRunHandoff pattern:
 * - Agents can transfer control to a more suitable specialist
 * - Full context (reasoning chain, findings, state) is preserved
 * - Cycle detection prevents infinite handoff loops
 * - Rollback mechanism if handoff target fails
 *
 * Unlike omo-cli's existing `delegate_task` (which creates new sessions),
 * handoffs preserve the conversation context and allow the target agent
 * to continue where the source agent left off.
 *
 * @see CAI: src/cai/sdk/agents/_run_impl.py — ToolRunHandoff
 * @see CAI: src/cai/agents/factory.py — agent specialization registry
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

const HOOK_NAME = "agent-handoff"

// ── Types ──────────────────────────────────────────────────────────────────

export interface HandoffRequest {
    /** Unique ID for this handoff. */
    id: string
    /** Source agent initiating the handoff. */
    sourceAgent: string
    /** Target agent to receive control. */
    targetAgent: string
    /** Reason for the handoff. */
    reason: string
    /** Context snapshot to transfer. */
    context: HandoffContext
    /** Timestamp of request. */
    timestamp: number
    /** Priority level (higher = more urgent). */
    priority: number
}

export interface HandoffContext {
    /** Conversation/reasoning history (compressed). */
    reasoningChain: string[]
    /** Key findings discovered so far. */
    findings: HandoffFinding[]
    /** Current task description. */
    currentTask: string
    /** Tools already tried (with outcomes). */
    toolHistory: Array<{ tool: string; success: boolean; summary: string }>
    /** Environment state (e.g., current directory, open files). */
    environmentState: Record<string, unknown>
    /** Custom metadata. */
    metadata: Record<string, unknown>
}

export interface HandoffFinding {
    type: string
    description: string
    severity: "critical" | "high" | "medium" | "low" | "info"
    data: Record<string, unknown>
}

export interface HandoffResult {
    /** Whether the handoff was accepted by the target. */
    accepted: boolean
    /** ID of the handoff. */
    handoffId: string
    /** Source agent. */
    sourceAgent: string
    /** Target agent. */
    targetAgent: string
    /** If rejected, why. */
    rejectionReason?: string
    /** If accepted, any response from target. */
    response?: string
    /** Duration of the handoff process (ms). */
    durationMs: number
}

export interface HandoffConfig {
    /** Enable/disable handoffs. */
    enabled: boolean
    /** Maximum chain length (prevents infinite handoffs). */
    maxChainLength: number
    /** Maximum context size in chars for transfer. */
    maxContextSize: number
    /** Allowed handoff routes (source -> target[]), empty = allow all. */
    allowedRoutes: Map<string, string[]>
    /** Timeout for handoff acceptance (ms). */
    timeoutMs: number
    /** Whether to auto-rollback on failure. */
    autoRollback: boolean
    /** Maximum number of active handoffs per session. */
    maxActivePerSession: number
}

export type HandoffStatus = "pending" | "accepted" | "rejected" | "completed" | "failed" | "rolled_back"

interface HandoffRecord {
    request: HandoffRequest
    status: HandoffStatus
    result?: HandoffResult
    startTime: number
    endTime?: number
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: HandoffConfig = {
    enabled: true,
    maxChainLength: 5,
    maxContextSize: 10_000,
    allowedRoutes: new Map(),
    timeoutMs: 30_000,
    autoRollback: true,
    maxActivePerSession: 3,
}

// ── State ──────────────────────────────────────────────────────────────────

/** Active handoff chains per session. */
const sessionChains = new Map<string, string[]>()

/** Handoff history per session. */
const sessionHistory = new Map<string, HandoffRecord[]>()

/** Registry of available agents and their capabilities. */
const agentRegistry = new Map<string, AgentCapability>()

export interface AgentCapability {
    name: string
    description: string
    specializations: string[]
    maxConcurrentHandoffs: number
    activeHandoffs: number
}

// ── Agent Registry ─────────────────────────────────────────────────────────

/**
 * Register an agent with its capabilities.
 */
export function registerAgent(
    name: string,
    description: string,
    specializations: string[],
    maxConcurrent: number = 3,
): void {
    agentRegistry.set(name, {
        name,
        description,
        specializations,
        maxConcurrentHandoffs: maxConcurrent,
        activeHandoffs: 0,
    })
}

/**
 * Get list of registered agents.
 */
export function getRegisteredAgents(): AgentCapability[] {
    return [...agentRegistry.values()]
}

/**
 * Find the best agent for a given specialization.
 */
export function findBestAgent(
    specialization: string,
    excludeAgents: string[] = [],
): AgentCapability | null {
    let bestAgent: AgentCapability | null = null
    let bestScore = 0

    for (const [name, agent] of agentRegistry) {
        if (excludeAgents.includes(name)) continue
        if (agent.activeHandoffs >= agent.maxConcurrentHandoffs) continue

        const hasSpec = agent.specializations.some(s =>
            s.toLowerCase().includes(specialization.toLowerCase()) ||
            specialization.toLowerCase().includes(s.toLowerCase())
        )

        if (hasSpec) {
            const availabilityScore = 1 - (agent.activeHandoffs / agent.maxConcurrentHandoffs)
            if (availabilityScore > bestScore) {
                bestScore = availabilityScore
                bestAgent = agent
            }
        }
    }

    return bestAgent
}

// ── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Validate a handoff request.
 */
export function validateHandoff(
    sessionID: string,
    request: HandoffRequest,
    config?: Partial<HandoffConfig>,
): { valid: boolean; reason?: string } {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    if (!cfg.enabled) {
        return { valid: false, reason: "Handoffs are disabled" }
    }

    // Check cycle detection
    const chain = sessionChains.get(sessionID) || []
    if (chain.includes(request.targetAgent)) {
        return {
            valid: false,
            reason: `Cycle detected: agent '${request.targetAgent}' already in handoff chain [${chain.join(" → ")}]`,
        }
    }

    // Check chain length
    if (chain.length >= cfg.maxChainLength) {
        return {
            valid: false,
            reason: `Maximum handoff chain length (${cfg.maxChainLength}) exceeded`,
        }
    }

    // Check allowed routes
    if (cfg.allowedRoutes.size > 0) {
        const allowed = cfg.allowedRoutes.get(request.sourceAgent)
        if (allowed && !allowed.includes(request.targetAgent)) {
            return {
                valid: false,
                reason: `Route '${request.sourceAgent}' → '${request.targetAgent}' is not allowed`,
            }
        }
    }

    // Check context size
    const contextStr = JSON.stringify(request.context)
    if (contextStr.length > cfg.maxContextSize) {
        return {
            valid: false,
            reason: `Context size (${contextStr.length}) exceeds maximum (${cfg.maxContextSize})`,
        }
    }

    // Check active handoffs per session
    const history = sessionHistory.get(sessionID) || []
    const activeCount = history.filter(h =>
        h.status === "pending" || h.status === "accepted"
    ).length
    if (activeCount >= cfg.maxActivePerSession) {
        return {
            valid: false,
            reason: `Maximum active handoffs per session (${cfg.maxActivePerSession}) exceeded`,
        }
    }

    // Check target agent exists in registry (if registry is used)
    if (agentRegistry.size > 0 && !agentRegistry.has(request.targetAgent)) {
        return {
            valid: false,
            reason: `Target agent '${request.targetAgent}' is not registered`,
        }
    }

    return { valid: true }
}

/**
 * Initiate a handoff from source to target agent.
 */
export function initiateHandoff(
    sessionID: string,
    sourceAgent: string,
    targetAgent: string,
    reason: string,
    context: HandoffContext,
    config?: Partial<HandoffConfig>,
): HandoffResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const startTime = Date.now()

    const request: HandoffRequest = {
        id: createHash("sha256")
            .update(`${sessionID}|${sourceAgent}|${targetAgent}|${Date.now()}`)
            .digest("hex")
            .slice(0, 16),
        sourceAgent,
        targetAgent,
        reason,
        context: compressContext(context, cfg.maxContextSize),
        timestamp: Date.now(),
        priority: 1,
    }

    // Validate
    const validation = validateHandoff(sessionID, request, cfg)
    if (!validation.valid) {
        log(`[${HOOK_NAME}] Handoff rejected`, {
            sessionID,
            sourceAgent,
            targetAgent,
            reason: validation.reason,
        })

        return {
            accepted: false,
            handoffId: request.id,
            sourceAgent,
            targetAgent,
            rejectionReason: validation.reason,
            durationMs: Date.now() - startTime,
        }
    }

    // Update chain
    const chain = sessionChains.get(sessionID) || []
    chain.push(targetAgent)
    sessionChains.set(sessionID, chain)

    // Record in history
    const record: HandoffRecord = {
        request,
        status: "accepted",
        startTime,
    }

    const history = sessionHistory.get(sessionID) || []
    history.push(record)
    sessionHistory.set(sessionID, history)

    // Update agent registry
    const targetAgentCap = agentRegistry.get(targetAgent)
    if (targetAgentCap) {
        targetAgentCap.activeHandoffs++
    }

    log(`[${HOOK_NAME}] Handoff accepted`, {
        sessionID,
        handoffId: request.id,
        sourceAgent,
        targetAgent,
        reason,
        chainLength: chain.length,
        contextKeywords: context.currentTask.slice(0, 80),
    })

    return {
        accepted: true,
        handoffId: request.id,
        sourceAgent,
        targetAgent,
        response: `Control transferred to '${targetAgent}'. Context: ${context.currentTask.slice(0, 100)}`,
        durationMs: Date.now() - startTime,
    }
}

/**
 * Complete a handoff (target agent finished its work).
 */
export function completeHandoff(
    sessionID: string,
    handoffId: string,
    success: boolean,
): void {
    const history = sessionHistory.get(sessionID) || []
    const record = history.find(h => h.request.id === handoffId)

    if (!record) return

    record.status = success ? "completed" : "failed"
    record.endTime = Date.now()

    // Release agent capacity
    const targetAgent = agentRegistry.get(record.request.targetAgent)
    if (targetAgent) {
        targetAgent.activeHandoffs = Math.max(0, targetAgent.activeHandoffs - 1)
    }

    // Pop from chain on completion
    const chain = sessionChains.get(sessionID) || []
    const idx = chain.indexOf(record.request.targetAgent)
    if (idx !== -1) {
        chain.splice(idx, 1)
    }

    log(`[${HOOK_NAME}] Handoff ${success ? "completed" : "failed"}`, {
        sessionID,
        handoffId,
        duration: record.endTime - record.startTime,
    })
}

/**
 * Rollback a handoff (return control to source agent).
 */
export function rollbackHandoff(
    sessionID: string,
    handoffId: string,
): HandoffResult {
    const history = sessionHistory.get(sessionID) || []
    const record = history.find(h => h.request.id === handoffId)

    if (!record) {
        return {
            accepted: false,
            handoffId,
            sourceAgent: "unknown",
            targetAgent: "unknown",
            rejectionReason: "Handoff not found",
            durationMs: 0,
        }
    }

    record.status = "rolled_back"
    record.endTime = Date.now()

    // Release agent capacity
    const targetAgent = agentRegistry.get(record.request.targetAgent)
    if (targetAgent) {
        targetAgent.activeHandoffs = Math.max(0, targetAgent.activeHandoffs - 1)
    }

    // Pop from chain
    const chain = sessionChains.get(sessionID) || []
    const idx = chain.indexOf(record.request.targetAgent)
    if (idx !== -1) {
        chain.splice(idx, 1)
    }

    log(`[${HOOK_NAME}] Handoff rolled back`, {
        sessionID,
        handoffId,
        sourceAgent: record.request.sourceAgent,
    })

    return {
        accepted: true,
        handoffId,
        sourceAgent: record.request.targetAgent,
        targetAgent: record.request.sourceAgent,
        response: "Control returned to source agent via rollback",
        durationMs: Date.now() - record.startTime,
    }
}

/**
 * Compress context to fit within size limits.
 */
function compressContext(context: HandoffContext, maxSize: number): HandoffContext {
    const contextStr = JSON.stringify(context)
    if (contextStr.length <= maxSize) return context

    // Progressively compress: trim reasoning chain first, then tool history
    const compressed = { ...context }

    // Trim reasoning chain to last N entries
    if (compressed.reasoningChain.length > 5) {
        compressed.reasoningChain = [
            `[${compressed.reasoningChain.length - 5} earlier steps compressed]`,
            ...compressed.reasoningChain.slice(-5),
        ]
    }

    // Trim tool history to last N entries
    if (compressed.toolHistory.length > 10) {
        compressed.toolHistory = compressed.toolHistory.slice(-10)
    }

    // Truncate finding data
    compressed.findings = compressed.findings.map(f => ({
        ...f,
        data: Object.keys(f.data).length > 5
            ? Object.fromEntries(Object.entries(f.data).slice(0, 5))
            : f.data,
    }))

    return compressed
}

/**
 * Get handoff statistics for a session.
 */
export function getHandoffStats(sessionID: string): {
    totalHandoffs: number
    completed: number
    failed: number
    rolledBack: number
    currentChainLength: number
    activeHandoffs: number
} {
    const history = sessionHistory.get(sessionID) || []
    const chain = sessionChains.get(sessionID) || []

    return {
        totalHandoffs: history.length,
        completed: history.filter(h => h.status === "completed").length,
        failed: history.filter(h => h.status === "failed").length,
        rolledBack: history.filter(h => h.status === "rolled_back").length,
        currentChainLength: chain.length,
        activeHandoffs: history.filter(h => h.status === "accepted" || h.status === "pending").length,
    }
}

/**
 * Clear session state.
 */
export function clearSession(sessionID: string): void {
    sessionChains.delete(sessionID)
    sessionHistory.delete(sessionID)
}

/**
 * Clear all state.
 */
export function clearAll(): void {
    sessionChains.clear()
    sessionHistory.clear()
    agentRegistry.clear()
}

// ── Hook Creation ──────────────────────────────────────────────────────────

/**
 * Create the agent handoff hook.
 */
export function createAgentHandoffHook(config?: Partial<HandoffConfig>) {
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
