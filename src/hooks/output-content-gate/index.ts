/**
 * Output Content Gate — Tool-level content moderation (from AutoGPT Automod).
 *
 * Unlike `output-guard` (which scans model-generated text for dangerous commands),
 * this module operates at the TOOL EXECUTION boundary:
 *
 * 1. Pre-tool:  Validates tool arguments before execution
 * 2. Post-tool: Scans tool results for sensitive data leakage
 * 3. Aggregate: After a session, can moderate all accumulated outputs
 *
 * Key difference from output-guard:
 * - output-guard: scans LLM chat responses for reverse shells, etc.
 * - output-content-gate: scans tool inputs/outputs for policy violations
 *
 * Inspired by: AutoGPT's `executor/automod/manager.py`
 *   - Pre-execution input moderation
 *   - Post-execution output moderation
 *   - fail_open mode for resilience
 *   - Per-user feature flags
 *
 * @see AutoGPT/autogpt_platform/backend/backend/executor/automod/manager.py
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

const HOOK_NAME = "output-content-gate"

// ── Types ──────────────────────────────────────────────────────────────────

export interface ContentGateConfig {
    /** Enable/disable the gate. */
    enabled: boolean
    /** If true, execution proceeds when gate errors (like AutoGPT's fail_open). */
    failOpen: boolean
    /** Maximum content size to scan (bytes). Larger content is truncated. */
    maxScanSize: number
    /** Categories to enforce. */
    enforced: ContentCategory[]
    /** Tool names that are exempt from scanning. */
    exemptTools: string[]
    /** Minimum severity to trigger action. */
    minSeverity: ContentSeverity
    /** Action to take on violation. */
    action: "log" | "warn" | "redact" | "block"
}

export type ContentCategory =
    | "dangerous_command"   // rm -rf, format, fdisk
    | "secret_leakage"     // API keys, tokens, passwords in tool output
    | "pii_exposure"       // SSN, credit cards, phone numbers
    | "path_traversal"     // ../../../etc/passwd
    | "injection"          // SQL injection, command injection in args
    | "excessive_scope"    // tool accessing too many files, wildcard operations
    | "network_exfil"      // tool sending data to external endpoints
    | "privilege_abuse"    // tool attempting sudo, root operations

export type ContentSeverity = "critical" | "high" | "medium" | "low"

export interface ContentViolation {
    id: string
    category: ContentCategory
    severity: ContentSeverity
    description: string
    evidence: string
    toolName: string
    direction: "input" | "output"
    timestamp: number
}

export interface GateResult {
    allowed: boolean
    violations: ContentViolation[]
    action: "pass" | "logged" | "warned" | "redacted" | "blocked"
    scanDurationMs: number
}

export interface SessionGateState {
    totalScanned: number
    totalViolations: number
    violationsByCategory: Map<ContentCategory, number>
    violationsBySeverity: Map<ContentSeverity, number>
    recentViolations: ContentViolation[]
    blockedTools: Set<string>
    scanDurations: number[]
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ContentGateConfig = {
    enabled: true,
    failOpen: true,
    maxScanSize: 50_000,
    enforced: [
        "dangerous_command",
        "secret_leakage",
        "pii_exposure",
        "path_traversal",
        "injection",
        "excessive_scope",
        "network_exfil",
        "privilege_abuse",
    ],
    exemptTools: ["read_file", "list_directory", "file_outline"],
    minSeverity: "low",
    action: "warn",
}

// ── Pattern Definitions ────────────────────────────────────────────────────

interface ContentPattern {
    category: ContentCategory
    severity: ContentSeverity
    direction: "input" | "output" | "both"
    pattern: RegExp
    description: string
}

const CONTENT_PATTERNS: ContentPattern[] = [
    // ── Dangerous Commands (args check) ──
    // All patterns use bounded quantifiers and avoid .* to prevent ReDoS
    {
        category: "dangerous_command",
        severity: "critical",
        direction: "input",
        pattern: /rm\s+-[rf]{1,2}\s+\/(?:\s|$)/i,
        description: "Destructive rm command targeting root",
    },
    {
        category: "dangerous_command",
        severity: "critical",
        direction: "input",
        pattern: /rm\s+-[rf]{1,2}\s+--no-preserve-root/i,
        description: "rm with --no-preserve-root flag",
    },
    {
        category: "dangerous_command",
        severity: "critical",
        direction: "input",
        pattern: /mkfs\.\w{1,10}\s+\/dev\/[sh]d/i,
        description: "Format disk command",
    },
    {
        category: "dangerous_command",
        severity: "critical",
        direction: "input",
        pattern: /dd\s+if=\S{1,50}\s+of=\/dev\/[sh]d/i,
        description: "dd write to disk device",
    },
    {
        category: "dangerous_command",
        severity: "high",
        direction: "input",
        pattern: />\s*\/dev\/(?:sda|hda|null)/i,
        description: "Redirect to device",
    },
    {
        category: "dangerous_command",
        severity: "high",
        direction: "input",
        pattern: /chmod\s+777\s+\//i,
        description: "chmod 777 on root",
    },
    {
        category: "dangerous_command",
        severity: "high",
        direction: "input",
        pattern: /kill\s+-9\s+-1/i,
        description: "Kill all processes",
    },

    // ── Secret Leakage (output check) ──
    {
        category: "secret_leakage",
        severity: "critical",
        direction: "output",
        pattern: /AKIA[0-9A-Z]{16}/g,
        description: "AWS access key detected in tool output",
    },
    {
        category: "secret_leakage",
        severity: "critical",
        direction: "output",
        pattern: /sk-[a-zA-Z0-9]{32,64}/g,
        description: "OpenAI API key detected in tool output",
    },
    {
        category: "secret_leakage",
        severity: "critical",
        direction: "output",
        pattern: /ghp_[a-zA-Z0-9]{36}/g,
        description: "GitHub token detected in tool output",
    },
    {
        category: "secret_leakage",
        severity: "high",
        direction: "output",
        pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
        description: "Private key detected in tool output",
    },
    {
        category: "secret_leakage",
        severity: "high",
        direction: "output",
        pattern: /password\s{0,3}[:=]\s{0,3}"[^"]{4,50}"/gi,
        description: "Password value in double quotes",
    },

    // ── PII Exposure (output check) ──
    {
        category: "pii_exposure",
        severity: "high",
        direction: "output",
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        description: "Social Security Number pattern detected",
    },
    {
        category: "pii_exposure",
        severity: "high",
        direction: "output",
        pattern: /\b4[0-9]{15}\b/g,
        description: "Visa credit card number detected",
    },

    // ── Path Traversal (input check) ──
    {
        category: "path_traversal",
        severity: "high",
        direction: "input",
        pattern: /\.\.\/\.\.\/\.\.\//g,
        description: "Deep path traversal in tool arguments",
    },
    {
        category: "path_traversal",
        severity: "critical",
        direction: "input",
        pattern: /\/etc\/(?:passwd|shadow|sudoers|ssh)/i,
        description: "Sensitive system path: /etc/",
    },
    {
        category: "path_traversal",
        severity: "critical",
        direction: "input",
        pattern: /\/root\/\.ssh/i,
        description: "Sensitive system path: /root/.ssh",
    },

    // ── Injection (input check) ──
    {
        category: "injection",
        severity: "high",
        direction: "input",
        pattern: /;\s{0,3}(?:rm|cat|wget|curl|python|bash|sh)\s/i,
        description: "Command injection via semicolon",
    },
    {
        category: "injection",
        severity: "high",
        direction: "input",
        pattern: /'\s{0,3}(?:OR|AND|UNION)\s/gi,
        description: "SQL injection pattern",
    },
    {
        category: "injection",
        severity: "high",
        direction: "input",
        pattern: /;\s{0,3}(?:DROP|DELETE|UPDATE|INSERT|ALTER)\s/gi,
        description: "SQL DDL/DML injection",
    },

    // ── Excessive Scope (input check) ──
    {
        category: "excessive_scope",
        severity: "medium",
        direction: "input",
        pattern: /find\s+\/\s+-/i,
        description: "find targeting root filesystem",
    },
    {
        category: "excessive_scope",
        severity: "medium",
        direction: "input",
        pattern: /grep\s+-[rR]\s+\/\s/i,
        description: "Recursive grep from root",
    },

    // ── Network Exfiltration (both) ──
    {
        category: "network_exfil",
        severity: "critical",
        direction: "both",
        pattern: /(?:ngrok|requestbin|webhook\.site|pipedream|burpcollaborator)/gi,
        description: "Known exfiltration endpoint referenced",
    },
    {
        category: "network_exfil",
        severity: "high",
        direction: "input",
        pattern: /(?:scp|rsync|sftp)\s+\S{1,50}@/i,
        description: "File transfer to external host",
    },

    // ── Privilege Abuse (input check) ──
    {
        category: "privilege_abuse",
        severity: "critical",
        direction: "input",
        pattern: /sudo\s+(?:su|bash|-[sS])/i,
        description: "Privilege escalation via sudo",
    },
    {
        category: "privilege_abuse",
        severity: "critical",
        direction: "input",
        pattern: /su\s+-\s+root/i,
        description: "Switch to root user",
    },
    {
        category: "privilege_abuse",
        severity: "high",
        direction: "input",
        pattern: /docker\s+run\s+\S{0,100}--privileged/i,
        description: "Docker privileged mode",
    },
]

// ── Session State ──────────────────────────────────────────────────────────

const sessions = new Map<string, SessionGateState>()

function getState(sessionID: string): SessionGateState {
    let state = sessions.get(sessionID)
    if (!state) {
        state = {
            totalScanned: 0,
            totalViolations: 0,
            violationsByCategory: new Map(),
            violationsBySeverity: new Map(),
            recentViolations: [],
            blockedTools: new Set(),
            scanDurations: [],
        }
        sessions.set(sessionID, state)
    }
    return state
}

// ── Core Logic ─────────────────────────────────────────────────────────────

/**
 * Scan content for policy violations.
 *
 * Pure function — takes content and direction, returns violations.
 */
export function scanContent(
    content: string,
    toolName: string,
    direction: "input" | "output",
    config?: Partial<ContentGateConfig>,
): ContentViolation[] {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    if (!cfg.enabled || !content || content.length === 0) return []
    if (cfg.exemptTools.includes(toolName)) return []

    const enforced = new Set(cfg.enforced)
    const severityOrder: Record<ContentSeverity, number> = {
        critical: 4, high: 3, medium: 2, low: 1,
    }
    const minSeverityNum = severityOrder[cfg.minSeverity]

    // Truncate for scanning
    const scanContent = content.slice(0, cfg.maxScanSize)
    const violations: ContentViolation[] = []

    for (const pat of CONTENT_PATTERNS) {
        if (!enforced.has(pat.category)) continue
        if (pat.direction !== "both" && pat.direction !== direction) continue
        if (severityOrder[pat.severity] < minSeverityNum) continue

        // Reset lastIndex for global regexes
        pat.pattern.lastIndex = 0

        if (pat.pattern.global) {
            // Global patterns: find all matches
            let match: RegExpExecArray | null
            while ((match = pat.pattern.exec(scanContent)) !== null) {
                violations.push({
                    id: createHash("sha256")
                        .update(`${toolName}|${pat.category}|${match.index}|${match[0]}`)
                        .digest("hex")
                        .slice(0, 12),
                    category: pat.category,
                    severity: pat.severity,
                    description: pat.description,
                    evidence: match[0].slice(0, 80),
                    toolName,
                    direction,
                    timestamp: Date.now(),
                })
                // Safety: prevent zero-length match infinite loop
                if (match[0].length === 0) pat.pattern.lastIndex++
            }
        } else {
            // Non-global patterns: single match check
            const match = pat.pattern.exec(scanContent)
            if (match) {
                violations.push({
                    id: createHash("sha256")
                        .update(`${toolName}|${pat.category}|${match.index}|${match[0]}`)
                        .digest("hex")
                        .slice(0, 12),
                    category: pat.category,
                    severity: pat.severity,
                    description: pat.description,
                    evidence: match[0].slice(0, 80),
                    toolName,
                    direction,
                    timestamp: Date.now(),
                })
            }
        }
    }

    return violations
}

/**
 * Evaluate gate decision based on violations and config.
 */
export function evaluateGate(
    violations: ContentViolation[],
    config?: Partial<ContentGateConfig>,
): GateResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const startTime = Date.now()

    if (violations.length === 0) {
        return {
            allowed: true,
            violations: [],
            action: "pass",
            scanDurationMs: Date.now() - startTime,
        }
    }

    const hasCritical = violations.some(v => v.severity === "critical")
    const hasHigh = violations.some(v => v.severity === "high")

    let action: GateResult["action"]
    let allowed: boolean

    switch (cfg.action) {
        case "block":
            allowed = !(hasCritical || hasHigh)
            action = allowed ? "pass" : "blocked"
            break
        case "redact":
            allowed = true
            action = "redacted"
            break
        case "warn":
            allowed = true
            action = "warned"
            break
        case "log":
        default:
            allowed = true
            action = "logged"
            break
    }

    return {
        allowed,
        violations,
        action,
        scanDurationMs: Date.now() - startTime,
    }
}

/**
 * Full gate check: scan + evaluate + update state.
 */
export function gateCheck(
    sessionID: string,
    toolName: string,
    content: string,
    direction: "input" | "output",
    config?: Partial<ContentGateConfig>,
): GateResult {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const state = getState(sessionID)

    try {
        const violations = scanContent(content, toolName, direction, cfg)
        const result = evaluateGate(violations, cfg)

        // Update state
        state.totalScanned++
        state.totalViolations += violations.length
        state.scanDurations.push(result.scanDurationMs)

        for (const v of violations) {
            state.violationsByCategory.set(
                v.category,
                (state.violationsByCategory.get(v.category) || 0) + 1,
            )
            state.violationsBySeverity.set(
                v.severity,
                (state.violationsBySeverity.get(v.severity) || 0) + 1,
            )
            state.recentViolations.push(v)
        }

        // Keep recent violations bounded
        if (state.recentViolations.length > 100) {
            state.recentViolations = state.recentViolations.slice(-50)
        }

        // Track blocked tools
        if (!result.allowed) {
            state.blockedTools.add(toolName)
        }

        return result
    } catch (err) {
        // fail_open: if scanning errors, allow execution
        if (cfg.failOpen) {
            log(`[${HOOK_NAME}] Gate error (failing open)`, { error: String(err) })
            return {
                allowed: true,
                violations: [],
                action: "pass",
                scanDurationMs: 0,
            }
        }
        throw err
    }
}

/**
 * Get session statistics.
 */
export function getSessionStats(sessionID: string): {
    totalScanned: number
    totalViolations: number
    violationsByCategory: Record<string, number>
    violationsBySeverity: Record<string, number>
    blockedTools: string[]
    avgScanDurationMs: number
} {
    const state = getState(sessionID)
    const avgDuration = state.scanDurations.length > 0
        ? state.scanDurations.reduce((a, b) => a + b, 0) / state.scanDurations.length
        : 0

    return {
        totalScanned: state.totalScanned,
        totalViolations: state.totalViolations,
        violationsByCategory: Object.fromEntries(state.violationsByCategory),
        violationsBySeverity: Object.fromEntries(state.violationsBySeverity),
        blockedTools: [...state.blockedTools],
        avgScanDurationMs: Math.round(avgDuration * 100) / 100,
    }
}

/**
 * Reset session state (e.g., on session end).
 */
export function resetSession(sessionID: string): void {
    sessions.delete(sessionID)
}

// ── Hook Creation ──────────────────────────────────────────────────────────

/**
 * Create the output content gate hook.
 *
 * Monitors tool.execute.before and tool.execute.after events:
 * - Before: validates tool arguments for dangerous commands, injection, path traversal
 * - After: scans tool results for secret leakage, PII, exfiltration
 */
export function createOutputContentGateHook(config?: Partial<ContentGateConfig>) {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    if (!cfg.enabled) return null

    return {
        "tool.execute.before": async (
            input: { sessionID: string; tool: string; args: Record<string, unknown> },
            _output: unknown,
        ): Promise<void> => {
            const argsStr = JSON.stringify(input.args)
            const result = gateCheck(input.sessionID, input.tool, argsStr, "input", cfg)

            if (result.violations.length > 0) {
                log(`[${HOOK_NAME}] Pre-tool violations`, {
                    tool: input.tool,
                    violations: result.violations.length,
                    action: result.action,
                    categories: [...new Set(result.violations.map(v => v.category))],
                })
            }
        },

        "tool.execute.after": async (
            input: { sessionID: string; tool: string; args: Record<string, unknown> },
            output: { result?: string; output?: string },
        ): Promise<void> => {
            const content = output.result || output.output || ""
            if (!content || content.length < 10) return

            const result = gateCheck(input.sessionID, input.tool, content, "output", cfg)

            if (result.violations.length > 0) {
                log(`[${HOOK_NAME}] Post-tool violations`, {
                    tool: input.tool,
                    violations: result.violations.length,
                    action: result.action,
                    categories: [...new Set(result.violations.map(v => v.category))],
                    severities: [...new Set(result.violations.map(v => v.severity))],
                })
            }
        },

        "event": async ({ event }: { event: { type: string; properties?: unknown } }): Promise<void> => {
            if (event.type === "session.deleted") {
                const props = event.properties as Record<string, unknown> | undefined
                const sessionInfo = props?.info as { id?: string } | undefined
                if (sessionInfo?.id) {
                    resetSession(sessionInfo.id)
                }
            }
        },
    }
}

// ── Exports for testing ────────────────────────────────────────────────────

export {
    CONTENT_PATTERNS,
    DEFAULT_CONFIG,
    getState,
    type SessionGateState as _SessionGateState,
}
