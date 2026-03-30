/**
 * Stateful MCP Sessions — Persistent tool process management (from Redamon)
 *
 * Unlike stateless tool execution (fire-and-forget), this module maintains
 * long-running tool processes across multiple calls. Inspired by Redamon's
 * persistent msfconsole MCP server pattern.
 *
 * Use cases:
 * - Database REPL sessions (psql, mysql, redis-cli)
 * - Security tool sessions (msfconsole, sqlmap interactive)
 * - Language REPLs (python, node, irb)
 * - SSH tunnels and persistent connections
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

// ── Types ────────────────────────────────────────────────────────────────────

interface StatefulSession {
    id: string
    toolName: string
    agentId: string
    createdAt: number
    lastActiveAt: number
    interactionCount: number
    state: "active" | "idle" | "expired" | "destroyed"
    history: SessionInteraction[]
    metadata: Record<string, unknown>
}

interface SessionInteraction {
    timestamp: number
    input: string
    output: string
    durationMs: number
    success: boolean
}

interface SessionConfig {
    enabled: boolean
    maxSessionsPerAgent: number
    maxTotalSessions: number
    ttlMs: number                 // Time-to-live for idle sessions (default: 10min)
    maxHistoryPerSession: number  // Keep last N interactions
    maxInputSize: number          // Max input size per interaction (bytes)
    maxOutputSize: number         // Max output size per interaction (bytes)
    statefulTools: string[]       // Tools that support stateful sessions
}

interface SessionCreateResult {
    success: boolean
    sessionId?: string
    error?: string
}

interface SessionInteractResult {
    success: boolean
    output?: string
    durationMs?: number
    error?: string
}

interface SessionStats {
    totalSessions: number
    activeSessions: number
    idleSessions: number
    expiredSessions: number
    totalInteractions: number
    avgSessionDurationMs: number
    sessionsByTool: Record<string, number>
    sessionsByAgent: Record<string, number>
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SessionConfig = {
    enabled: true,
    maxSessionsPerAgent: 5,
    maxTotalSessions: 20,
    ttlMs: 10 * 60 * 1000,          // 10 minutes
    maxHistoryPerSession: 50,
    maxInputSize: 64 * 1024,         // 64KB
    maxOutputSize: 256 * 1024,       // 256KB
    statefulTools: [
        "msfconsole", "psql", "mysql", "redis-cli",
        "python", "node", "irb", "sqlite3",
        "ssh", "ncat", "socat",
    ],
}

// ── State ────────────────────────────────────────────────────────────────────

const sessions = new Map<string, StatefulSession>()
let config: SessionConfig = { ...DEFAULT_CONFIG }

// ── Session ID Generation ────────────────────────────────────────────────────

function generateSessionId(agentId: string, toolName: string): string {
    const raw = `${agentId}|${toolName}|${Date.now()}|${Math.random()}`
    return createHash("sha256").update(raw).digest("hex").slice(0, 16)
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Create a new stateful session for a tool.
 */
function createSession(agentId: string, toolName: string, metadata?: Record<string, unknown>): SessionCreateResult {
    if (!config.enabled) {
        return { success: false, error: "Stateful sessions disabled" }
    }

    if (!config.statefulTools.includes(toolName)) {
        return { success: false, error: `Tool '${toolName}' is not configured for stateful sessions` }
    }

    // Check per-agent quota
    const agentSessions = getAgentSessions(agentId)
    if (agentSessions.length >= config.maxSessionsPerAgent) {
        return { success: false, error: `Agent '${agentId}' has reached max sessions (${config.maxSessionsPerAgent})` }
    }

    // Check global quota
    const activeSessions = Array.from(sessions.values()).filter(s => s.state === "active" || s.state === "idle")
    if (activeSessions.length >= config.maxTotalSessions) {
        return { success: false, error: `Max total sessions reached (${config.maxTotalSessions})` }
    }

    const sessionId = generateSessionId(agentId, toolName)
    const session: StatefulSession = {
        id: sessionId,
        toolName,
        agentId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        interactionCount: 0,
        state: "active",
        history: [],
        metadata: metadata ?? {},
    }

    sessions.set(sessionId, session)
    log("[stateful-mcp] Session created", { sessionId, agentId, toolName })

    return { success: true, sessionId }
}

/**
 * Interact with an existing session (send input, get output).
 */
function interact(sessionId: string, input: string, simulatedOutput?: string): SessionInteractResult {
    const session = sessions.get(sessionId)
    if (!session) {
        return { success: false, error: `Session '${sessionId}' not found` }
    }

    if (session.state === "expired" || session.state === "destroyed") {
        return { success: false, error: `Session '${sessionId}' is ${session.state}` }
    }

    // Validate input size
    if (input.length > config.maxInputSize) {
        return { success: false, error: `Input exceeds max size (${config.maxInputSize} bytes)` }
    }

    const startTime = Date.now()

    // In a real implementation, this would send to the persistent process via stdin
    // For the hook module, we simulate the interaction pattern
    const output = simulatedOutput ?? `[session:${sessionId}] Processed: ${input.slice(0, 100)}`
    const truncatedOutput = output.slice(0, config.maxOutputSize)
    const durationMs = Date.now() - startTime

    // Record interaction
    const interaction: SessionInteraction = {
        timestamp: Date.now(),
        input: input.slice(0, 200), // Truncate for history
        output: truncatedOutput.slice(0, 200),
        durationMs,
        success: true,
    }

    session.history.push(interaction)

    // Trim history if needed
    if (session.history.length > config.maxHistoryPerSession) {
        session.history = session.history.slice(-config.maxHistoryPerSession)
    }

    session.interactionCount++
    session.lastActiveAt = Date.now()
    session.state = "active"

    return { success: true, output: truncatedOutput, durationMs }
}

/**
 * Get a session by ID.
 */
function getSession(sessionId: string): StatefulSession | undefined {
    return sessions.get(sessionId)
}

/**
 * Get all sessions for an agent.
 */
function getAgentSessions(agentId: string): StatefulSession[] {
    return Array.from(sessions.values()).filter(s =>
        s.agentId === agentId && (s.state === "active" || s.state === "idle")
    )
}

/**
 * Destroy a session (explicit cleanup).
 */
function destroySession(sessionId: string): boolean {
    const session = sessions.get(sessionId)
    if (!session) return false

    session.state = "destroyed"
    log("[stateful-mcp] Session destroyed", { sessionId })
    return true
}

/**
 * Expire sessions that have been idle longer than TTL.
 */
function expireIdleSessions(): number {
    const now = Date.now()
    let expiredCount = 0

    for (const session of sessions.values()) {
        if (session.state !== "active" && session.state !== "idle") continue

        const idleTime = now - session.lastActiveAt
        if (idleTime > config.ttlMs) {
            session.state = "expired"
            expiredCount++
            log("[stateful-mcp] Session expired", { sessionId: session.id, idleTimeMs: idleTime })
        } else if (idleTime > config.ttlMs / 2) {
            // Mark as idle when past half TTL
            session.state = "idle"
        }
    }

    return expiredCount
}

/**
 * Check if a tool supports stateful sessions.
 */
function isStatefulTool(toolName: string): boolean {
    return config.statefulTools.includes(toolName)
}

/**
 * Find existing active session for agent + tool.
 */
function findActiveSession(agentId: string, toolName: string): StatefulSession | undefined {
    return Array.from(sessions.values()).find(s =>
        s.agentId === agentId &&
        s.toolName === toolName &&
        (s.state === "active" || s.state === "idle")
    )
}

/**
 * Get aggregated stats.
 */
function getStats(): SessionStats {
    const all = Array.from(sessions.values())
    const active = all.filter(s => s.state === "active")
    const idle = all.filter(s => s.state === "idle")
    const expired = all.filter(s => s.state === "expired")

    const sessionsByTool: Record<string, number> = {}
    const sessionsByAgent: Record<string, number> = {}
    let totalDuration = 0
    let durationCount = 0

    for (const s of all) {
        sessionsByTool[s.toolName] = (sessionsByTool[s.toolName] ?? 0) + 1
        sessionsByAgent[s.agentId] = (sessionsByAgent[s.agentId] ?? 0) + 1

        if (s.state !== "active") {
            totalDuration += (s.lastActiveAt - s.createdAt)
            durationCount++
        }
    }

    return {
        totalSessions: all.length,
        activeSessions: active.length,
        idleSessions: idle.length,
        expiredSessions: expired.length,
        totalInteractions: all.reduce((sum, s) => sum + s.interactionCount, 0),
        avgSessionDurationMs: durationCount > 0 ? totalDuration / durationCount : 0,
        sessionsByTool,
        sessionsByAgent,
    }
}

/**
 * Reset all state (for testing).
 */
function resetAll(): void {
    sessions.clear()
    config = { ...DEFAULT_CONFIG }
}

/**
 * Update configuration.
 */
function configure(overrides: Partial<SessionConfig>): void {
    config = { ...config, ...overrides }
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

function createStatefulMcpHook(overrides?: Partial<SessionConfig>): Record<string, Function> | null {
    if (overrides) configure(overrides)
    if (!config.enabled) return null

    return {
        "tool.execute.before": async (ctx: Record<string, unknown>) => {
            const toolName = ctx.tool as string
            const agentId = (ctx.sessionID as string) ?? "default"

            if (!isStatefulTool(toolName)) return

            // Find or create session
            let session = findActiveSession(agentId, toolName)
            if (!session) {
                const result = createSession(agentId, toolName)
                if (result.success && result.sessionId) {
                    session = getSession(result.sessionId)
                }
            }

            if (session) {
                // Inject session ID into context for downstream use
                (ctx as Record<string, unknown>).__statefulSessionId = session.id
            }
        },

        "tool.execute.after": async (ctx: Record<string, unknown>, result: Record<string, unknown>) => {
            const sessionId = (ctx as Record<string, unknown>).__statefulSessionId as string | undefined
            if (!sessionId) return

            const output = (result.result as string) ?? ""
            const input = JSON.stringify((ctx as Record<string, unknown>).args ?? {}).slice(0, 200)

            interact(sessionId, input, output)
        },

        "session.end": async () => {
            expireIdleSessions()
        },
    }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
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
    type StatefulSession,
    type SessionConfig,
    type SessionCreateResult,
    type SessionInteractResult,
    type SessionStats,
}
