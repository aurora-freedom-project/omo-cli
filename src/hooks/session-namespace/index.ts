/**
 * Session Namespace Isolation — Per-session policies, resource quotas, cross-session protection.
 *
 * Inspired by Capsule (projectcapsule):
 * - TenantSpec: owners, resourceQuotas, networkPolicies, additionalRoleBindings
 * - Webhook-based policy enforcement: validate BEFORE allowing resource creation
 *
 * Applied to agent sessions:
 * - Each session has a policy defining allowed tools, resource limits, network access
 * - Pre-execution validation (like Capsule webhooks)
 * - Cross-session state isolation
 * - Resource quota enforcement: max tool calls, max output size, max duration
 *
 * @see Capsule: api/v1beta2/tenant_types.go — TenantSpec
 * @see Capsule: pkg/webhook/ — admission webhook validation
 */

import { log } from "../../shared/logger"

const HOOK_NAME = "session-namespace"

// ── Types ──────────────────────────────────────────────────────────────────

export interface SessionPolicy {
    /** Session identifier. */
    sessionID: string
    /** Display name. */
    name: string
    /** Tools allowed in this session (empty = allow all). */
    toolAllowlist: string[]
    /** Tools blocked in this session. */
    toolBlocklist: string[]
    /** Maximum tool calls per session. */
    maxToolCalls: number
    /** Maximum total output size in bytes. */
    maxOutputSize: number
    /** Maximum session duration in ms. */
    maxDurationMs: number
    /** Maximum concurrent tool executions. */
    maxConcurrent: number
    /** Network policy: allow external requests? */
    networkPolicy: NetworkPolicy
    /** File system policy. */
    fsPolicy: FileSystemPolicy
    /** Priority level (higher = more privileged). */
    priorityLevel: number
    /** Creator of this session. */
    owner: string
    /** When the session was created. */
    createdAt: number
}

export interface NetworkPolicy {
    /** Allow outbound HTTP requests. */
    allowOutbound: boolean
    /** Allowed domains (empty = allow all if outbound enabled). */
    allowedDomains: string[]
    /** Blocked domains. */
    blockedDomains: string[]
    /** Allow DNS resolution. */
    allowDNS: boolean
}

export interface FileSystemPolicy {
    /** Allowed read paths (glob patterns). */
    readPaths: string[]
    /** Allowed write paths (glob patterns). */
    writePaths: string[]
    /** Blocked paths (always denied). */
    blockedPaths: string[]
    /** Maximum file size for writes (bytes). */
    maxWriteSize: number
}

export interface PolicyValidationResult {
    allowed: boolean
    reason?: string
    policyId: string
    violatedConstraint?: string
}

export interface SessionUsage {
    toolCalls: number
    totalOutputSize: number
    startTime: number
    activeConcurrent: number
    toolCallsByName: Map<string, number>
}

export interface NamespaceConfig {
    enabled: boolean
    /** Default policy for sessions without explicit policy. */
    defaultPolicy: Omit<SessionPolicy, "sessionID" | "name" | "owner" | "createdAt">
    /** Whether to enforce policies or just log violations. */
    enforceMode: boolean
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_POLICY: Omit<SessionPolicy, "sessionID" | "name" | "owner" | "createdAt"> = {
    toolAllowlist: [],
    toolBlocklist: ["sandbox_exec"],
    maxToolCalls: 200,
    maxOutputSize: 10_000_000, // 10MB
    maxDurationMs: 3600_000,   // 1 hour
    maxConcurrent: 5,
    networkPolicy: {
        allowOutbound: true,
        allowedDomains: [],
        blockedDomains: ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254"],
        allowDNS: true,
    },
    fsPolicy: {
        readPaths: ["**/*"],
        writePaths: ["**/*"],
        blockedPaths: ["/etc/shadow", "/etc/passwd", "/root/.ssh/*", "**/node_modules/**/.git"],
        maxWriteSize: 5_000_000, // 5MB
    },
    priorityLevel: 1,
}

const DEFAULT_CONFIG: NamespaceConfig = {
    enabled: true,
    defaultPolicy: DEFAULT_POLICY,
    enforceMode: true,
}

// ── State ──────────────────────────────────────────────────────────────────

const sessionPolicies = new Map<string, SessionPolicy>()
const sessionUsage = new Map<string, SessionUsage>()

// ── Policy Management ──────────────────────────────────────────────────────

/**
 * Create a session policy.
 */
export function createSessionPolicy(
    sessionID: string,
    name: string,
    owner: string,
    overrides?: Partial<Omit<SessionPolicy, "sessionID" | "name" | "owner" | "createdAt">>,
    config?: Partial<NamespaceConfig>,
): SessionPolicy {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const policy: SessionPolicy = {
        ...cfg.defaultPolicy,
        ...overrides,
        sessionID,
        name,
        owner,
        createdAt: Date.now(),
    }

    sessionPolicies.set(sessionID, policy)

    // Initialize usage tracking
    sessionUsage.set(sessionID, {
        toolCalls: 0,
        totalOutputSize: 0,
        startTime: Date.now(),
        activeConcurrent: 0,
        toolCallsByName: new Map(),
    })

    log(`[${HOOK_NAME}] Session policy created`, {
        sessionID,
        name,
        owner,
        maxToolCalls: policy.maxToolCalls,
        maxOutputSize: policy.maxOutputSize,
    })

    return policy
}

/**
 * Get session policy (returns default if none set).
 */
export function getSessionPolicy(
    sessionID: string,
    config?: Partial<NamespaceConfig>,
): SessionPolicy {
    const existing = sessionPolicies.get(sessionID)
    if (existing) return existing

    const cfg = { ...DEFAULT_CONFIG, ...config }
    return {
        ...cfg.defaultPolicy,
        sessionID,
        name: "default",
        owner: "system",
        createdAt: Date.now(),
    }
}

/**
 * Get session usage stats.
 */
export function getSessionUsage(sessionID: string): SessionUsage {
    let usage = sessionUsage.get(sessionID)
    if (!usage) {
        usage = {
            toolCalls: 0,
            totalOutputSize: 0,
            startTime: Date.now(),
            activeConcurrent: 0,
            toolCallsByName: new Map(),
        }
        sessionUsage.set(sessionID, usage)
    }
    return usage
}

// ── Validation (Webhook-like) ──────────────────────────────────────────────

/**
 * Validate a tool call against session policy.
 * Called BEFORE tool execution (like a Capsule admission webhook).
 */
export function validateToolCall(
    sessionID: string,
    toolName: string,
    args: Record<string, unknown>,
    config?: Partial<NamespaceConfig>,
): PolicyValidationResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    if (!cfg.enabled) return { allowed: true, policyId: sessionID }

    const policy = getSessionPolicy(sessionID, cfg)
    const usage = getSessionUsage(sessionID)

    // 1. Tool allowlist check
    if (policy.toolAllowlist.length > 0 && !policy.toolAllowlist.includes(toolName)) {
        return {
            allowed: !cfg.enforceMode,
            reason: `Tool '${toolName}' not in session allowlist`,
            policyId: sessionID,
            violatedConstraint: "toolAllowlist",
        }
    }

    // 2. Tool blocklist check
    if (policy.toolBlocklist.includes(toolName)) {
        return {
            allowed: !cfg.enforceMode,
            reason: `Tool '${toolName}' is blocked in this session`,
            policyId: sessionID,
            violatedConstraint: "toolBlocklist",
        }
    }

    // 3. Max tool calls check
    if (usage.toolCalls >= policy.maxToolCalls) {
        return {
            allowed: !cfg.enforceMode,
            reason: `Session exceeded max tool calls (${policy.maxToolCalls})`,
            policyId: sessionID,
            violatedConstraint: "maxToolCalls",
        }
    }

    // 4. Max output size check
    if (usage.totalOutputSize >= policy.maxOutputSize) {
        return {
            allowed: !cfg.enforceMode,
            reason: `Session exceeded max output size (${policy.maxOutputSize} bytes)`,
            policyId: sessionID,
            violatedConstraint: "maxOutputSize",
        }
    }

    // 5. Session duration check
    const elapsed = Date.now() - usage.startTime
    if (elapsed >= policy.maxDurationMs) {
        return {
            allowed: !cfg.enforceMode,
            reason: `Session exceeded max duration (${policy.maxDurationMs / 1000}s)`,
            policyId: sessionID,
            violatedConstraint: "maxDurationMs",
        }
    }

    // 6. Concurrent execution check
    if (usage.activeConcurrent >= policy.maxConcurrent) {
        return {
            allowed: !cfg.enforceMode,
            reason: `Session exceeded max concurrent tools (${policy.maxConcurrent})`,
            policyId: sessionID,
            violatedConstraint: "maxConcurrent",
        }
    }

    // 7. Network policy check
    if (isNetworkTool(toolName)) {
        const networkResult = validateNetworkAccess(toolName, args, policy.networkPolicy)
        if (!networkResult.allowed) {
            return {
                ...networkResult,
                allowed: !cfg.enforceMode ? true : networkResult.allowed,
                policyId: sessionID,
            }
        }
    }

    // 8. File system policy check
    if (isFileTool(toolName)) {
        const fsResult = validateFileAccess(toolName, args, policy.fsPolicy)
        if (!fsResult.allowed) {
            return {
                ...fsResult,
                allowed: !cfg.enforceMode ? true : fsResult.allowed,
                policyId: sessionID,
            }
        }
    }

    return { allowed: true, policyId: sessionID }
}

/**
 * Record tool execution (update usage).
 */
export function recordToolExecution(
    sessionID: string,
    toolName: string,
    outputSize: number,
): void {
    const usage = getSessionUsage(sessionID)
    usage.toolCalls++
    usage.totalOutputSize += outputSize
    usage.toolCallsByName.set(
        toolName,
        (usage.toolCallsByName.get(toolName) || 0) + 1,
    )
}

/**
 * Track concurrent execution start.
 */
export function trackConcurrentStart(sessionID: string): void {
    const usage = getSessionUsage(sessionID)
    usage.activeConcurrent++
}

/**
 * Track concurrent execution end.
 */
export function trackConcurrentEnd(sessionID: string): void {
    const usage = getSessionUsage(sessionID)
    usage.activeConcurrent = Math.max(0, usage.activeConcurrent - 1)
}

// ── Helper Functions ───────────────────────────────────────────────────────

function isNetworkTool(toolName: string): boolean {
    return ["web_crawl", "http_request", "dns_resolve", "port_check",
        "tls_inspect", "web_query", "curl"].some(t => toolName.includes(t))
}

function isFileTool(toolName: string): boolean {
    return ["read_file", "write_file", "replace_in_file", "create_file",
        "delete_file"].some(t => toolName.includes(t))
}

function validateNetworkAccess(
    _toolName: string,
    args: Record<string, unknown>,
    policy: NetworkPolicy,
): PolicyValidationResult {
    if (!policy.allowOutbound) {
        return {
            allowed: false,
            reason: "Outbound network access is disabled for this session",
            policyId: "",
            violatedConstraint: "networkPolicy.allowOutbound",
        }
    }

    // Check domain restrictions
    const url = String(args.url || args.target || args.host || "")
    if (url) {
        try {
            const hostname = new URL(url.startsWith("http") ? url : `http://${url}`).hostname

            // Check blocked domains
            if (policy.blockedDomains.some(d => hostname.includes(d))) {
                return {
                    allowed: false,
                    reason: `Domain '${hostname}' is blocked`,
                    policyId: "",
                    violatedConstraint: "networkPolicy.blockedDomains",
                }
            }

            // Check allowed domains (if specified)
            if (policy.allowedDomains.length > 0 &&
                !policy.allowedDomains.some(d => hostname.includes(d))) {
                return {
                    allowed: false,
                    reason: `Domain '${hostname}' not in allowed domains`,
                    policyId: "",
                    violatedConstraint: "networkPolicy.allowedDomains",
                }
            }
        } catch {
            // Invalid URL, allow to proceed
        }
    }

    return { allowed: true, policyId: "" }
}

function validateFileAccess(
    toolName: string,
    args: Record<string, unknown>,
    policy: FileSystemPolicy,
): PolicyValidationResult {
    const path = String(args.path || args.file || args.target_file || "")
    if (!path) return { allowed: true, policyId: "" }

    // Check blocked paths
    for (const blocked of policy.blockedPaths) {
        const pattern = blocked.replace(/\*/g, ".*")
        if (new RegExp(pattern).test(path)) {
            return {
                allowed: false,
                reason: `Path '${path}' is blocked by policy`,
                policyId: "",
                violatedConstraint: "fsPolicy.blockedPaths",
            }
        }
    }

    // Check write size
    if (toolName.includes("write") || toolName.includes("create")) {
        const content = String(args.content || args.code_content || "")
        if (content.length > policy.maxWriteSize) {
            return {
                allowed: false,
                reason: `Write size (${content.length}) exceeds max (${policy.maxWriteSize})`,
                policyId: "",
                violatedConstraint: "fsPolicy.maxWriteSize",
            }
        }
    }

    return { allowed: true, policyId: "" }
}

/**
 * Clear session data.
 */
export function clearSession(sessionID: string): void {
    sessionPolicies.delete(sessionID)
    sessionUsage.delete(sessionID)
}

/**
 * Clear all state.
 */
export function clearAll(): void {
    sessionPolicies.clear()
    sessionUsage.clear()
}

// ── Hook Creation ──────────────────────────────────────────────────────────

export function createSessionNamespaceHook(config?: Partial<NamespaceConfig>) {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    if (!cfg.enabled) return null

    return {
        "tool.execute.before": async (
            input: { sessionID: string; tool: string; args: Record<string, unknown> },
            _output: unknown,
        ): Promise<void> => {
            const result = validateToolCall(input.sessionID, input.tool, input.args, cfg)
            if (!result.allowed) {
                log(`[${HOOK_NAME}] Tool blocked by policy`, {
                    sessionID: input.sessionID,
                    tool: input.tool,
                    reason: result.reason,
                    constraint: result.violatedConstraint,
                })
            }
            trackConcurrentStart(input.sessionID)
        },

        "tool.execute.after": async (
            input: { sessionID: string; tool: string },
            output: { result?: string; output?: string },
        ): Promise<void> => {
            const outputSize = (output.result || output.output || "").length
            recordToolExecution(input.sessionID, input.tool, outputSize)
            trackConcurrentEnd(input.sessionID)
        },

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
