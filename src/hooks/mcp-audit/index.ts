/**
 * MCP Security Scanner — Audit MCP tool definitions (from AI-Infra-Guard)
 *
 * Static analysis of MCP tool schemas to detect injection risks:
 * - Parameter injection (unconstrained string inputs → shell/SQL)
 * - Path traversal (file path parameters without validation)
 * - SSRF (URL parameters without allowlist)
 * - Command injection (parameters passed to subprocess)
 * - Secret exposure (tool returns or logs sensitive data)
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

// ── Types ────────────────────────────────────────────────────────────────────

interface McpToolDefinition {
    name: string
    description: string
    parameters: McpParameter[]
    returnsSecret?: boolean
    executesCommand?: boolean
    accessesNetwork?: boolean
    accessesFileSystem?: boolean
}

interface McpParameter {
    name: string
    type: string              // "string" | "number" | "boolean" | "object" | "array"
    description?: string
    required?: boolean
    validation?: string       // regex or schema for validation
}

interface AuditRisk {
    id: string
    category: "parameter_injection" | "path_traversal" | "ssrf" | "command_injection" | "secret_exposure"
    severity: "critical" | "high" | "medium" | "low"
    paramName?: string
    description: string
    recommendation: string
}

interface ToolAuditResult {
    toolName: string
    risks: AuditRisk[]
    score: number             // 0-100 (100 = safest)
    grade: "A" | "B" | "C" | "D" | "F"
    auditedAt: number
}

interface AuditConfig {
    enabled: boolean
    rules: AuditRule[]
    safePatterns: string[]     // Tool name patterns that are exempt
    minScoreToPass: number
}

interface AuditRule {
    id: string
    category: AuditRisk["category"]
    check: (tool: McpToolDefinition, param: McpParameter) => boolean
    severity: AuditRisk["severity"]
    description: string
    recommendation: string
}

interface AuditStats {
    totalAudited: number
    passedCount: number
    failedCount: number
    risksByCategory: Record<string, number>
    avgScore: number
}

// ── Default Rules ────────────────────────────────────────────────────────────

const PARAMETER_INJECTION_KEYWORDS = ["command", "cmd", "exec", "run", "shell", "query", "sql", "eval"]
const PATH_KEYWORDS = ["path", "file", "directory", "dir", "folder", "filename"]
const URL_KEYWORDS = ["url", "uri", "endpoint", "host", "target", "address"]
const SECRET_KEYWORDS = ["password", "secret", "token", "key", "credential", "auth"]

const DEFAULT_RULES: AuditRule[] = [
    {
        id: "param-injection-cmd",
        category: "command_injection",
        check: (tool, param) =>
            param.type === "string" &&
            !param.validation &&
            PARAMETER_INJECTION_KEYWORDS.some(k => param.name.toLowerCase().includes(k)),
        severity: "critical",
        description: "String parameter with command-like name has no validation",
        recommendation: "Add input validation regex or allowlist for command parameters",
    },
    {
        id: "path-traversal",
        category: "path_traversal",
        check: (tool, param) =>
            param.type === "string" &&
            !param.validation &&
            PATH_KEYWORDS.some(k => param.name.toLowerCase().includes(k)),
        severity: "high",
        description: "File path parameter has no validation — vulnerable to path traversal",
        recommendation: "Add path canonicalization and validate against allowed directories",
    },
    {
        id: "ssrf-url",
        category: "ssrf",
        check: (tool, param) =>
            param.type === "string" &&
            !param.validation &&
            URL_KEYWORDS.some(k => param.name.toLowerCase().includes(k)),
        severity: "high",
        description: "URL parameter has no validation — vulnerable to SSRF",
        recommendation: "Add URL allowlist validation. Block private IP ranges and localhost",
    },
    {
        id: "secret-param",
        category: "secret_exposure",
        check: (_tool, param) =>
            SECRET_KEYWORDS.some(k => param.name.toLowerCase().includes(k)),
        severity: "medium",
        description: "Parameter name suggests it handles secrets",
        recommendation: "Ensure secrets are masked in logs and not stored in plain text",
    },
    {
        id: "cmd-exec-flag",
        category: "command_injection",
        check: (tool) => tool.executesCommand === true,
        severity: "critical",
        description: "Tool is flagged as executing system commands",
        recommendation: "Use subprocess array calls, validate all inputs, apply allowlist",
    },
    {
        id: "network-access-flag",
        category: "ssrf",
        check: (tool) => tool.accessesNetwork === true,
        severity: "medium",
        description: "Tool accesses network — verify outbound connections are controlled",
        recommendation: "Implement network policy: allowlist domains, block private ranges",
    },
    {
        id: "fs-access-flag",
        category: "path_traversal",
        check: (tool) => tool.accessesFileSystem === true,
        severity: "medium",
        description: "Tool accesses filesystem — verify path restrictions",
        recommendation: "Restrict to project directory. Block access to system paths",
    },
    {
        id: "returns-secret",
        category: "secret_exposure",
        check: (tool) => tool.returnsSecret === true,
        severity: "high",
        description: "Tool may return sensitive data in output",
        recommendation: "Mask sensitive fields in output. Apply output content gate filtering",
    },
]

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AuditConfig = {
    enabled: true,
    rules: DEFAULT_RULES,
    safePatterns: ["vitest_", "test_", "mock_"],
    minScoreToPass: 60,
}

// ── State ────────────────────────────────────────────────────────────────────

const auditResults = new Map<string, ToolAuditResult>()
let auditConfig: AuditConfig = { ...DEFAULT_CONFIG, rules: [...DEFAULT_RULES] }

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Audit a single MCP tool definition.
 */
function auditTool(tool: McpToolDefinition): ToolAuditResult {
    const risks: AuditRisk[] = []

    // Check if tool is exempt
    if (auditConfig.safePatterns.some(p => tool.name.startsWith(p))) {
        const result: ToolAuditResult = {
            toolName: tool.name,
            risks: [],
            score: 100,
            grade: "A",
            auditedAt: Date.now(),
        }
        auditResults.set(tool.name, result)
        return result
    }

    // Run each rule against each parameter
    for (const rule of auditConfig.rules) {
        // Tool-level checks (no specific parameter)
        if (rule.check(tool, { name: "", type: "string" })) {
            // Only add if it's a tool-level check (not parameter-specific)
            const isToolLevel = ["cmd-exec-flag", "network-access-flag", "fs-access-flag", "returns-secret"]
                .includes(rule.id)

            if (isToolLevel) {
                risks.push({
                    id: createHash("sha256").update(`${tool.name}|${rule.id}`).digest("hex").slice(0, 12),
                    category: rule.category,
                    severity: rule.severity,
                    description: rule.description,
                    recommendation: rule.recommendation,
                })
            }
        }

        // Parameter-level checks
        for (const param of tool.parameters) {
            if (rule.check(tool, param)) {
                const isParamRule = !["cmd-exec-flag", "network-access-flag", "fs-access-flag", "returns-secret"]
                    .includes(rule.id)

                if (isParamRule) {
                    risks.push({
                        id: createHash("sha256").update(`${tool.name}|${rule.id}|${param.name}`).digest("hex").slice(0, 12),
                        category: rule.category,
                        severity: rule.severity,
                        paramName: param.name,
                        description: rule.description,
                        recommendation: rule.recommendation,
                    })
                }
            }
        }
    }

    // Deduplicate risks by ID
    const uniqueRisks = Array.from(new Map(risks.map(r => [r.id, r])).values())

    // Calculate score
    const severityPenalty: Record<string, number> = { critical: 30, high: 20, medium: 10, low: 5 }
    const totalPenalty = uniqueRisks.reduce((sum, r) => sum + (severityPenalty[r.severity] ?? 5), 0)
    const score = Math.max(0, 100 - totalPenalty)

    // Assign grade
    const grade: ToolAuditResult["grade"] =
        score >= 90 ? "A" :
        score >= 75 ? "B" :
        score >= 60 ? "C" :
        score >= 40 ? "D" : "F"

    const result: ToolAuditResult = {
        toolName: tool.name,
        risks: uniqueRisks,
        score,
        grade,
        auditedAt: Date.now(),
    }

    auditResults.set(tool.name, result)
    log("[mcp-audit] Tool audited", { tool: tool.name, score, grade, risks: uniqueRisks.length })
    return result
}

/**
 * Audit multiple tools.
 */
function auditAll(tools: McpToolDefinition[]): ToolAuditResult[] {
    return tools.map(t => auditTool(t))
}

/**
 * Get audit result for a tool.
 */
function getAuditResult(toolName: string): ToolAuditResult | undefined {
    return auditResults.get(toolName)
}

/**
 * Check if a tool passes the minimum score.
 */
function passesAudit(toolName: string): boolean {
    const result = auditResults.get(toolName)
    if (!result) return true // Not audited → allow by default
    return result.score >= auditConfig.minScoreToPass
}

/**
 * Get all failed audits.
 */
function getFailedAudits(): ToolAuditResult[] {
    return Array.from(auditResults.values()).filter(r => r.score < auditConfig.minScoreToPass)
}

/**
 * Get stats.
 */
function getStats(): AuditStats {
    const all = Array.from(auditResults.values())
    const passed = all.filter(r => r.score >= auditConfig.minScoreToPass)
    const risksByCategory: Record<string, number> = {}

    for (const result of all) {
        for (const risk of result.risks) {
            risksByCategory[risk.category] = (risksByCategory[risk.category] ?? 0) + 1
        }
    }

    return {
        totalAudited: all.length,
        passedCount: passed.length,
        failedCount: all.length - passed.length,
        risksByCategory,
        avgScore: all.length > 0 ? all.reduce((sum, r) => sum + r.score, 0) / all.length : 0,
    }
}

function resetAll(): void {
    auditResults.clear()
    auditConfig = { ...DEFAULT_CONFIG, rules: [...DEFAULT_RULES] }
}

function configure(overrides: Partial<AuditConfig>): void {
    auditConfig = { ...auditConfig, ...overrides }
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

function createMcpAuditHook(overrides?: Partial<AuditConfig>): Record<string, Function> | null {
    if (overrides) configure(overrides)
    if (!auditConfig.enabled) return null

    return {
        "tool.register": async (ctx: Record<string, unknown>) => {
            const tool = ctx.tool as McpToolDefinition | undefined
            if (tool) {
                auditTool(tool)
            }
        },

        "tool.execute.before": async (ctx: Record<string, unknown>) => {
            const toolName = ctx.tool as string
            if (!passesAudit(toolName)) {
                log("[mcp-audit] Tool failed audit gate", { tool: toolName })
            }
        },
    }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
    auditTool,
    auditAll,
    getAuditResult,
    passesAudit,
    getFailedAudits,
    getStats,
    resetAll,
    configure,
    createMcpAuditHook,
    DEFAULT_CONFIG,
    DEFAULT_RULES,
    type McpToolDefinition,
    type McpParameter,
    type AuditRisk,
    type ToolAuditResult,
    type AuditConfig,
    type AuditStats,
}
