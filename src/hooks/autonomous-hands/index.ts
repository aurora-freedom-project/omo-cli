/**
 * Autonomous Capability Packages ("Hands") — OpenFang-inspired.
 *
 * Learned from:
 * - OpenFang (15.8K⭐): "Hands" — self-contained autonomous capability packages
 *   that run on schedules, 24/7, without prompting.
 *
 * A "Hand" is an autonomous task package that bundles:
 * - Manifest (HAND.toml equivalent) — metadata, schedule, permissions
 * - System prompt — what the agent does
 * - Tools — which tools the agent can use
 * - Guardrails — what the agent CANNOT do
 * - Approval gates — actions requiring human approval
 *
 * Example Hands:
 * - SecurityScan: Runs nightly, scans code for vulnerabilities
 * - DependencyAudit: Weekly, checks for outdated/vulnerable packages
 * - CodeQualityReview: After each commit, reviews for anti-patterns
 * - DocumentationCheck: Daily, ensures docs match implementation
 *
 * @see Phase 8.3 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type HandTrigger =
    | { type: "cron"; expression: string }          // Time-based (e.g., "0 6 * * *")
    | { type: "event"; eventName: string }          // Event-driven (e.g., "post_commit")
    | { type: "interval"; intervalMs: number }      // Periodic (e.g., every 30 minutes)
    | { type: "manual" }                            // Only runs when explicitly triggered

export type HandStatus =
    | "idle"
    | "scheduled"
    | "running"
    | "completed"
    | "failed"
    | "awaiting_approval"
    | "disabled"

export type ApprovalAction =
    | "file_delete"
    | "file_write_sensitive"
    | "network_request"
    | "shell_command"
    | "git_push"
    | "deploy"

export interface HandManifest {
    /** Unique hand ID (kebab-case). */
    id: string
    /** Display name. */
    name: string
    /** Short description. */
    description: string
    /** Version. */
    version: string
    /** Author. */
    author: string
    /** Trigger configuration. */
    trigger: HandTrigger
    /** Tools this hand is allowed to use. */
    allowedTools: string[]
    /** Actions requiring human approval. */
    approvalRequired: ApprovalAction[]
    /** Maximum execution time (ms). */
    maxExecutionMs: number
    /** Maximum output tokens. */
    maxOutputTokens: number
    /** System prompt for the agent. */
    systemPrompt: string
    /** Guardrail patterns (forbidden patterns in output). */
    guardrails: string[]
    /** Tags for categorization. */
    tags: string[]
    /** Whether this hand is enabled. */
    enabled: boolean
}

export interface HandExecution {
    /** Execution ID. */
    executionId: string
    /** Hand ID. */
    handId: string
    /** Start time. */
    startedAt: number
    /** End time (0 if still running). */
    completedAt: number
    /** Duration in ms. */
    durationMs: number
    /** Final status. */
    status: "completed" | "failed" | "timed_out" | "cancelled"
    /** Output/results. */
    output: string
    /** Errors if any. */
    errors: string[]
    /** Approval requests that were generated. */
    approvalRequests: ApprovalRequest[]
}

export interface ApprovalRequest {
    /** Request ID. */
    id: string
    /** Action type. */
    action: ApprovalAction
    /** Description of what the agent wants to do. */
    description: string
    /** Status. */
    status: "pending" | "approved" | "rejected"
    /** When the request was created. */
    createdAt: number
}

export interface HandMetrics {
    /** Total hands registered. */
    totalHands: number
    /** Active (enabled) hands. */
    activeHands: number
    /** Total executions. */
    totalExecutions: number
    /** Successful executions. */
    successfulExecutions: number
    /** Failed executions. */
    failedExecutions: number
    /** Average execution time (ms). */
    avgExecutionMs: number
    /** Total approval requests. */
    totalApprovalRequests: number
    /** Approval rate. */
    approvalRate: number
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Default max execution time: 5 minutes. */
const DEFAULT_MAX_EXECUTION_MS = 5 * 60 * 1000

/** Default max output tokens. */
const DEFAULT_MAX_OUTPUT_TOKENS = 4096

// ── Cron Parser (simple) ───────────────────────────────────────────────────

/**
 * Parse a simple cron expression and check if it matches a given time.
 *
 * Supports: minute hour day_of_month month day_of_week
 * Wildcards (*) and specific values only (no ranges or steps).
 */
export function cronMatchesTime(expression: string, date: Date): boolean {
    const parts = expression.trim().split(/\s+/)
    if (parts.length !== 5) return false

    const [minuteExpr, hourExpr, dayExpr, monthExpr, dowExpr] = parts
    const minute = date.getMinutes()
    const hour = date.getHours()
    const day = date.getDate()
    const month = date.getMonth() + 1
    const dow = date.getDay()

    return (
        matchesCronPart(minuteExpr, minute) &&
        matchesCronPart(hourExpr, hour) &&
        matchesCronPart(dayExpr, day) &&
        matchesCronPart(monthExpr, month) &&
        matchesCronPart(dowExpr, dow)
    )
}

function matchesCronPart(expr: string, value: number): boolean {
    if (expr === "*") return true
    // Support comma-separated values
    const values = expr.split(",").map(v => parseInt(v, 10))
    return values.includes(value)
}

// ── Manifest Validation ────────────────────────────────────────────────────

/**
 * Validate a Hand manifest.
 */
export function validateManifest(manifest: Partial<HandManifest>): {
    valid: boolean
    errors: string[]
} {
    const errors: string[] = []

    if (!manifest.id || !/^[a-z0-9-]+$/.test(manifest.id)) {
        errors.push("id must be kebab-case (lowercase, hyphens only)")
    }
    if (!manifest.name || manifest.name.length < 3) {
        errors.push("name must be at least 3 characters")
    }
    if (!manifest.description) {
        errors.push("description is required")
    }
    if (!manifest.trigger) {
        errors.push("trigger is required")
    }
    if (!manifest.systemPrompt || manifest.systemPrompt.length < 10) {
        errors.push("systemPrompt must be at least 10 characters")
    }
    if (manifest.maxExecutionMs !== undefined && manifest.maxExecutionMs < 1000) {
        errors.push("maxExecutionMs must be at least 1000 (1 second)")
    }
    if (manifest.allowedTools && manifest.allowedTools.length === 0) {
        errors.push("allowedTools cannot be empty — hand needs at least one tool")
    }

    return { valid: errors.length === 0, errors }
}

// ── Hand Scheduler ─────────────────────────────────────────────────────────

/**
 * Create a Hand Scheduler that manages autonomous capability packages.
 */
export function createHandScheduler() {
    const hands = new Map<string, HandManifest>()
    const executions: HandExecution[] = []
    const pendingApprovals = new Map<string, ApprovalRequest>()
    let executionCounter = 0

    const metrics: HandMetrics = {
        totalHands: 0,
        activeHands: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        avgExecutionMs: 0,
        totalApprovalRequests: 0,
        approvalRate: 0,
    }

    /**
     * Register a new Hand.
     */
    function registerHand(manifest: HandManifest): { success: boolean; errors: string[] } {
        const validation = validateManifest(manifest)
        if (!validation.valid) {
            return { success: false, errors: validation.errors }
        }

        hands.set(manifest.id, {
            ...manifest,
            maxExecutionMs: manifest.maxExecutionMs || DEFAULT_MAX_EXECUTION_MS,
            maxOutputTokens: manifest.maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS,
        })

        updateHandCounts()
        log("[hands] Registered", { id: manifest.id, trigger: manifest.trigger.type })
        return { success: true, errors: [] }
    }

    /**
     * Unregister a Hand.
     */
    function unregisterHand(handId: string): boolean {
        const removed = hands.delete(handId)
        if (removed) updateHandCounts()
        return removed
    }

    /**
     * Enable/disable a Hand.
     */
    function setEnabled(handId: string, enabled: boolean): boolean {
        const hand = hands.get(handId)
        if (!hand) return false
        hand.enabled = enabled
        updateHandCounts()
        return true
    }

    /**
     * Check which hands should run now (based on trigger).
     */
    function getScheduledHands(now: Date = new Date()): HandManifest[] {
        const ready: HandManifest[] = []

        for (const hand of hands.values()) {
            if (!hand.enabled) continue

            switch (hand.trigger.type) {
                case "cron":
                    if (cronMatchesTime(hand.trigger.expression, now)) {
                        ready.push(hand)
                    }
                    break
                case "event":
                    // Events are triggered externally — not scheduled
                    break
                case "interval":
                    // Check if enough time has passed since last execution
                    const lastExec = getLastExecution(hand.id)
                    if (!lastExec || (now.getTime() - lastExec.completedAt) >= hand.trigger.intervalMs) {
                        ready.push(hand)
                    }
                    break
                case "manual":
                    break
            }
        }

        return ready
    }

    /**
     * Trigger a specific Hand by event name.
     */
    function triggerByEvent(eventName: string): HandManifest[] {
        return [...hands.values()].filter(
            h => h.enabled && h.trigger.type === "event" && h.trigger.eventName === eventName,
        )
    }

    /**
     * Record a completed execution.
     */
    function recordExecution(execution: HandExecution): void {
        executions.push(execution)
        metrics.totalExecutions++

        if (execution.status === "completed") {
            metrics.successfulExecutions++
        } else {
            metrics.failedExecutions++
        }

        // Update average execution time
        const durations = executions.map(e => e.durationMs)
        metrics.avgExecutionMs = durations.reduce((a, b) => a + b, 0) / durations.length

        // Track approval requests
        for (const req of execution.approvalRequests) {
            metrics.totalApprovalRequests++
            pendingApprovals.set(req.id, req)
        }

        // Update approval rate
        const allApprovals = executions.flatMap(e => e.approvalRequests)
        const approved = allApprovals.filter(a => a.status === "approved").length
        metrics.approvalRate = allApprovals.length > 0 ? approved / allApprovals.length : 0

        log("[hands] Execution recorded", {
            handId: execution.handId,
            status: execution.status,
            durationMs: execution.durationMs,
        })
    }

    /**
     * Start a hand execution (returns an execution builder).
     */
    function startExecution(handId: string): {
        executionId: string
        complete: (output: string, status: HandExecution["status"], errors?: string[]) => HandExecution
        requestApproval: (action: ApprovalAction, description: string) => ApprovalRequest
    } {
        const hand = hands.get(handId)
        if (!hand) throw new Error(`Hand not found: ${handId}`)

        const executionId = `exec_${++executionCounter}_${Date.now().toString(36)}`
        const startedAt = Date.now()
        const approvalRequests: ApprovalRequest[] = []

        return {
            executionId,
            complete(output: string, status: HandExecution["status"], errors: string[] = []): HandExecution {
                const execution: HandExecution = {
                    executionId,
                    handId,
                    startedAt,
                    completedAt: Date.now(),
                    durationMs: Date.now() - startedAt,
                    status,
                    output: output.slice(0, hand.maxOutputTokens * 4), // rough char limit
                    errors,
                    approvalRequests,
                }
                recordExecution(execution)
                return execution
            },
            requestApproval(action: ApprovalAction, description: string): ApprovalRequest {
                const req: ApprovalRequest = {
                    id: `apr_${executionId}_${approvalRequests.length}`,
                    action,
                    description,
                    status: "pending",
                    createdAt: Date.now(),
                }
                approvalRequests.push(req)
                return req
            },
        }
    }

    /**
     * Approve or reject a pending approval request.
     */
    function resolveApproval(requestId: string, approved: boolean): boolean {
        const req = pendingApprovals.get(requestId)
        if (!req) return false
        req.status = approved ? "approved" : "rejected"
        pendingApprovals.delete(requestId)
        return true
    }

    /**
     * Check if a hand action requires approval.
     */
    function requiresApproval(handId: string, action: ApprovalAction): boolean {
        const hand = hands.get(handId)
        if (!hand) return true // Default to requiring approval
        return hand.approvalRequired.includes(action)
    }

    /**
     * Check hand guardrails against output.
     */
    function checkGuardrails(handId: string, output: string): {
        passed: boolean
        violations: string[]
    } {
        const hand = hands.get(handId)
        if (!hand) return { passed: true, violations: [] }

        const violations: string[] = []
        for (const pattern of hand.guardrails) {
            try {
                const regex = new RegExp(pattern, "gi")
                if (regex.test(output)) {
                    violations.push(`Guardrail violation: pattern "${pattern}" matched in output`)
                }
            } catch {
                // Invalid regex — skip
            }
        }

        return { passed: violations.length === 0, violations }
    }

    /**
     * Get last execution for a hand.
     */
    function getLastExecution(handId: string): HandExecution | null {
        for (let i = executions.length - 1; i >= 0; i--) {
            if (executions[i].handId === handId) return executions[i]
        }
        return null
    }

    /**
     * Get execution history for a hand.
     */
    function getExecutionHistory(handId: string): HandExecution[] {
        return executions.filter(e => e.handId === handId)
    }

    /**
     * Get a hand by ID.
     */
    function getHand(handId: string): HandManifest | undefined {
        return hands.get(handId)
    }

    /**
     * List all registered hands.
     */
    function listHands(): HandManifest[] {
        return [...hands.values()]
    }

    /**
     * Get pending approval requests.
     */
    function getPendingApprovals(): ApprovalRequest[] {
        return [...pendingApprovals.values()]
    }

    /**
     * Get metrics.
     */
    function getMetrics(): HandMetrics {
        return { ...metrics }
    }

    /**
     * Reset all state (for testing).
     */
    function reset(): void {
        hands.clear()
        executions.length = 0
        pendingApprovals.clear()
        executionCounter = 0
        metrics.totalHands = 0
        metrics.activeHands = 0
        metrics.totalExecutions = 0
        metrics.successfulExecutions = 0
        metrics.failedExecutions = 0
        metrics.avgExecutionMs = 0
        metrics.totalApprovalRequests = 0
        metrics.approvalRate = 0
    }

    function updateHandCounts(): void {
        metrics.totalHands = hands.size
        metrics.activeHands = [...hands.values()].filter(h => h.enabled).length
    }

    return {
        registerHand,
        unregisterHand,
        setEnabled,
        getScheduledHands,
        triggerByEvent,
        recordExecution,
        startExecution,
        resolveApproval,
        requiresApproval,
        checkGuardrails,
        getLastExecution,
        getExecutionHistory,
        getHand,
        listHands,
        getPendingApprovals,
        getMetrics,
        reset,
    }
}

// ── Built-in Hand Templates ────────────────────────────────────────────────

/**
 * Built-in security scan Hand template.
 */
export function createSecurityScanHand(projectName: string): HandManifest {
    return {
        id: `security-scan-${projectName}`,
        name: `Security Scan: ${projectName}`,
        description: `Automated security vulnerability scan for ${projectName}`,
        version: "1.0.0",
        author: "omo-cli",
        trigger: { type: "cron", expression: "0 6 * * *" },  // Daily at 6 AM
        allowedTools: ["grep_search", "read_file", "pattern_scan", "list_directory"],
        approvalRequired: ["shell_command", "network_request"],
        maxExecutionMs: 10 * 60 * 1000,  // 10 minutes
        maxOutputTokens: 8192,
        systemPrompt: `You are a security auditor for ${projectName}. Scan the codebase for:
1. Hardcoded secrets (API keys, passwords, tokens)
2. SQL injection vulnerabilities
3. XSS vulnerabilities
4. Insecure dependencies
5. Code injection risks
Report findings with severity, file location, and remediation advice.`,
        guardrails: [
            "rm\\s+-rf",           // No destructive commands
            "curl.*\\|.*bash",     // No pipe-to-bash
            "eval\\(",             // No eval
        ],
        tags: ["security", "automated", "daily"],
        enabled: true,
    }
}

/**
 * Built-in dependency audit Hand template.
 */
export function createDependencyAuditHand(projectName: string): HandManifest {
    return {
        id: `dependency-audit-${projectName}`,
        name: `Dependency Audit: ${projectName}`,
        description: `Weekly dependency vulnerability and freshness check for ${projectName}`,
        version: "1.0.0",
        author: "omo-cli",
        trigger: { type: "cron", expression: "0 8 * * 1" },  // Monday at 8 AM
        allowedTools: ["read_file", "grep_search", "list_directory"],
        approvalRequired: ["shell_command"],
        maxExecutionMs: 5 * 60 * 1000,
        maxOutputTokens: 4096,
        systemPrompt: `You are a dependency auditor for ${projectName}. Check:
1. Read package.json / Cargo.toml / requirements.txt
2. Identify outdated major dependencies
3. Check for known CVEs in dependencies
4. Suggest version updates with breaking change notes`,
        guardrails: ["npm install", "cargo update", "pip install"],  // Read-only — no installs
        tags: ["dependencies", "automated", "weekly"],
        enabled: true,
    }
}

export { DEFAULT_MAX_EXECUTION_MS, DEFAULT_MAX_OUTPUT_TOKENS }
