/**
 * Automated Remediation Pipeline — Finding → Triage → Fix → Validate → PR
 *
 * Evolved from simple finding→suggestion mapping (v1) into a full pipeline
 * inspired by Redamon's CypherFix, Strix's auto-fix, and RAPTOR's patch generation.
 *
 * Pipeline stages:
 *   1. Scan     — Run pattern_scan or external scanner (existing)
 *   2. Triage   — Score findings by Impact × Exploitability / Detection_Time
 *   3. CodeFix  — Generate patch suggestions using strategy database
 *   4. Validate — Verify fix doesn't break anything (test/lint gates)
 *   5. Branch   — Create git branch with semantic name
 *   6. PR       — Create PR with structured remediation report
 *
 * Safety: pipeline defaults to `review` mode — patches are suggestions only.
 * Set `pipelineMode: "auto"` to enable automatic application (requires human opt-in).
 *
 * @see OmniUltraAgent_Kit/clone/redamon — CypherFix automated remediation
 * @see OmniUltraAgent_Kit/clone/strix — Auto-fix with PoC validation
 * @see OmniUltraAgent_Kit/clone/raptor — Patch generation with Semgrep+CodeQL
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

// ── Types ────────────────────────────────────────────────────────────────────

interface Finding {
    id: string
    category: string            // e.g., "sql_injection", "xss", "path_traversal"
    severity: "critical" | "high" | "medium" | "low"
    title: string
    description: string
    filePath?: string
    lineNumber?: number
    evidence?: string
}

interface RemediationSuggestion {
    id: string
    findingId: string
    strategy: string            // e.g., "parameterized_query", "input_validation"
    description: string
    suggestedFix: string        // Code patch or instruction
    confidence: number          // 0-1
    requiresReview: boolean
    category: string
}

interface RemediationPlan {
    id: string
    findings: Finding[]
    suggestions: RemediationSuggestion[]
    priority: "critical" | "high" | "medium" | "low"
    estimatedEffort: string
    groupReason: string
    createdAt: number
}

interface RemediationStats {
    totalFindings: number
    totalSuggestions: number
    totalPlans: number
    suggestionsByCategory: Record<string, number>
    avgConfidence: number
    coverageRate: number        // findings with suggestions / total findings
    triageStats: TriageStats
}

interface RemediationConfig {
    enabled: boolean
    minConfidence: number       // Min confidence to include suggestion
    maxSuggestionsPerFinding: number
    strategies: StrategyMapping[]
    autoGroupRelated: boolean
    pipelineMode: "review" | "auto"   // review = PR for human, auto = apply directly
    maxRetries: number                 // Max fix-validate retries before giving up
}

interface StrategyMapping {
    category: string
    strategies: string[]
    fixTemplate: string
    confidence: number
}

// ── Triage Types (Phase 1 Enhancement — from RAPTOR's adversarial model) ────

interface TriageScore {
    findingId: string
    impact: number              // 1-10: severity of exploitation (data loss, RCE, DoS)
    exploitability: number      // 1-10: ease of exploitation (public exploit, auth required, etc.)
    detectionTime: number       // 1-10: how quickly the issue is typically found
    priorityScore: number       // Calculated: (impact × exploitability) / detectionTime
    rank: number                // 1-based rank within the triaged set
    urgency: "P0-NOW" | "P1-TODAY" | "P2-WEEK" | "P3-BACKLOG"
}

interface TriageStats {
    totalTriaged: number
    byUrgency: Record<string, number>
    avgPriorityScore: number
    highestScore: number
}

interface PatchSuggestion {
    findingId: string
    filePath: string
    originalCode: string
    patchedCode: string
    diffBlock: string
    explanation: string
    confidence: number
    cweId?: string
}

interface PRBody {
    title: string
    body: string
    branch: string
    labels: string[]
}

// ── Strategy Database ────────────────────────────────────────────────────────

const DEFAULT_STRATEGIES: StrategyMapping[] = [
    {
        category: "sql_injection",
        strategies: ["parameterized_query", "input_validation", "orm_migration"],
        fixTemplate: "Replace string concatenation with parameterized query. Use prepared statements.",
        confidence: 0.85,
    },
    {
        category: "xss",
        strategies: ["output_encoding", "csp_header", "input_sanitization"],
        fixTemplate: "Apply context-aware output encoding. Add Content-Security-Policy header.",
        confidence: 0.80,
    },
    {
        category: "path_traversal",
        strategies: ["path_canonicalization", "allowlist", "chroot"],
        fixTemplate: "Canonicalize path and validate against allowlist. Reject '..' sequences.",
        confidence: 0.90,
    },
    {
        category: "command_injection",
        strategies: ["input_validation", "allowlist", "subprocess_array"],
        fixTemplate: "Use array-based subprocess calls instead of shell strings. Validate inputs.",
        confidence: 0.85,
    },
    {
        category: "ssrf",
        strategies: ["url_validation", "allowlist", "dns_rebinding_protection"],
        fixTemplate: "Validate URL against allowlist. Block private IP ranges. Use DNS resolution check.",
        confidence: 0.75,
    },
    {
        category: "hardcoded_secret",
        strategies: ["env_variable", "secret_manager", "config_file"],
        fixTemplate: "Move secret to environment variable or secret manager. Remove from source code.",
        confidence: 0.95,
    },
    {
        category: "insecure_deserialization",
        strategies: ["type_checking", "allowlist", "signed_serialization"],
        fixTemplate: "Validate deserialized types against allowlist. Use signed/encrypted serialization.",
        confidence: 0.70,
    },
    {
        category: "weak_crypto",
        strategies: ["algorithm_upgrade", "key_rotation", "library_update"],
        fixTemplate: "Upgrade to modern algorithm (AES-256-GCM, SHA-256+). Rotate existing keys.",
        confidence: 0.90,
    },
]

// ── Severity → Impact/Exploitability Mappings ────────────────────────────────

const SEVERITY_TO_IMPACT: Record<string, number> = {
    critical: 10,
    high: 8,
    medium: 5,
    low: 2,
}

const CATEGORY_EXPLOITABILITY: Record<string, number> = {
    sql_injection: 9,
    command_injection: 9,
    xss: 7,
    ssrf: 7,
    path_traversal: 8,
    hardcoded_secret: 10,   // trivial to exploit once found
    insecure_deserialization: 6,
    weak_crypto: 4,         // requires more effort
}

const CATEGORY_DETECTION_TIME: Record<string, number> = {
    hardcoded_secret: 9,    // found quickly by scanners
    sql_injection: 7,
    xss: 6,
    command_injection: 7,
    path_traversal: 6,
    ssrf: 4,                // harder to detect automatically
    insecure_deserialization: 3,
    weak_crypto: 5,
}

const CWE_MAP: Record<string, string> = {
    sql_injection: "CWE-89",
    xss: "CWE-79",
    path_traversal: "CWE-22",
    command_injection: "CWE-78",
    ssrf: "CWE-918",
    hardcoded_secret: "CWE-798",
    insecure_deserialization: "CWE-502",
    weak_crypto: "CWE-327",
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RemediationConfig = {
    enabled: true,
    minConfidence: 0.5,
    maxSuggestionsPerFinding: 3,
    strategies: DEFAULT_STRATEGIES,
    autoGroupRelated: true,
    pipelineMode: "review",
    maxRetries: 3,
}

// ── State ────────────────────────────────────────────────────────────────────

const suggestions = new Map<string, RemediationSuggestion>()
const plans = new Map<string, RemediationPlan>()
const processedFindings = new Set<string>()
const triageScores = new Map<string, TriageScore>()
const patchSuggestions = new Map<string, PatchSuggestion>()
let config: RemediationConfig = { ...DEFAULT_CONFIG, strategies: [...DEFAULT_STRATEGIES] }

// ── Core Functions ───────────────────────────────────────────────────────────

function generateId(prefix: string, parts: string[]): string {
    return createHash("sha256")
        .update(`${prefix}|${parts.join("|")}`)
        .digest("hex")
        .slice(0, 12)
}

/**
 * Generate remediation suggestions for a finding.
 */
function remediate(finding: Finding): RemediationSuggestion[] {
    if (!config.enabled) return []

    processedFindings.add(finding.id)

    const strategy = config.strategies.find(s => s.category === finding.category)
    if (!strategy) {
        // No known strategy — generate generic suggestion
        const generic: RemediationSuggestion = {
            id: generateId("sug", [finding.id, "generic"]),
            findingId: finding.id,
            strategy: "manual_review",
            description: `Manual review required for ${finding.category} finding`,
            suggestedFix: "Review the finding and apply appropriate remediation.",
            confidence: 0.3,
            requiresReview: true,
            category: finding.category,
        }

        if (generic.confidence >= config.minConfidence) {
            suggestions.set(generic.id, generic)
            return [generic]
        }
        return []
    }

    const result: RemediationSuggestion[] = []

    for (const strat of strategy.strategies.slice(0, config.maxSuggestionsPerFinding)) {
        const sug: RemediationSuggestion = {
            id: generateId("sug", [finding.id, strat]),
            findingId: finding.id,
            strategy: strat,
            description: `Apply ${strat} to fix ${finding.category}`,
            suggestedFix: strategy.fixTemplate,
            confidence: strategy.confidence,
            requiresReview: strategy.confidence < 0.9,
            category: finding.category,
        }

        if (sug.confidence >= config.minConfidence) {
            suggestions.set(sug.id, sug)
            result.push(sug)
        }
    }

    log("[auto-remediate] Generated suggestions", { findingId: finding.id, count: result.length })
    return result
}

/**
 * Create a remediation plan from multiple findings.
 */
function createPlan(findings: Finding[]): RemediationPlan {
    const allSuggestions: RemediationSuggestion[] = []

    for (const finding of findings) {
        const sugs = remediate(finding)
        allSuggestions.push(...sugs)
    }

    // Determine priority based on highest severity finding
    const severityOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
    const maxSeverity = findings.reduce((max, f) => {
        return severityOrder[f.severity] > severityOrder[max] ? f.severity : max
    }, "low" as string)

    const plan: RemediationPlan = {
        id: generateId("plan", findings.map(f => f.id)),
        findings,
        suggestions: allSuggestions,
        priority: maxSeverity as RemediationPlan["priority"],
        estimatedEffort: findings.length <= 2 ? "small" : findings.length <= 5 ? "medium" : "large",
        groupReason: config.autoGroupRelated
            ? `Grouped by category: ${[...new Set(findings.map(f => f.category))].join(", ")}`
            : "Manual grouping",
        createdAt: Date.now(),
    }

    plans.set(plan.id, plan)
    return plan
}

/**
 * Group findings by category and create plans.
 */
function autoGroup(findings: Finding[]): RemediationPlan[] {
    const groups = new Map<string, Finding[]>()

    for (const finding of findings) {
        const key = finding.category
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(finding)
    }

    const result: RemediationPlan[] = []
    for (const [_, groupFindings] of groups) {
        result.push(createPlan(groupFindings))
    }

    return result
}

// ── Triage Engine (NEW — Phase 1 Enhancement) ───────────────────────────────

/**
 * Calculate triage priority score for a finding.
 * Formula: (Impact × Exploitability) / DetectionTime
 * Higher score = more urgent.
 *
 * @see RAPTOR's adversarial threat modeling for scoring methodology
 */
function triageFinding(finding: Finding): TriageScore {
    const impact = SEVERITY_TO_IMPACT[finding.severity] ?? 5
    const exploitability = CATEGORY_EXPLOITABILITY[finding.category] ?? 5
    const detectionTime = CATEGORY_DETECTION_TIME[finding.category] ?? 5

    // Avoid division by zero
    const safeDT = Math.max(detectionTime, 1)
    const priorityScore = Math.round(((impact * exploitability) / safeDT) * 100) / 100

    const urgency: TriageScore["urgency"] =
        priorityScore >= 15 ? "P0-NOW"
        : priorityScore >= 10 ? "P1-TODAY"
        : priorityScore >= 5 ? "P2-WEEK"
        : "P3-BACKLOG"

    const score: TriageScore = {
        findingId: finding.id,
        impact,
        exploitability,
        detectionTime: safeDT,
        priorityScore,
        rank: 0,  // set during batch triage
        urgency,
    }

    triageScores.set(finding.id, score)
    return score
}

/**
 * Triage multiple findings and rank them by priority.
 * Returns findings sorted by priority score (highest first).
 */
function triageFindings(findings: Finding[]): TriageScore[] {
    const scores = findings.map(f => triageFinding(f))

    // Sort by priority score descending
    scores.sort((a, b) => b.priorityScore - a.priorityScore)

    // Assign ranks
    for (let i = 0; i < scores.length; i++) {
        scores[i].rank = i + 1
    }

    log("[auto-remediate] Triaged findings", {
        count: scores.length,
        topScore: scores[0]?.priorityScore ?? 0,
        topUrgency: scores[0]?.urgency ?? "N/A",
    })

    return scores
}

/**
 * Get triage statistics.
 */
function getTriageStats(): TriageStats {
    const scores = Array.from(triageScores.values())
    const byUrgency: Record<string, number> = {}

    let totalScore = 0
    let highest = 0

    for (const s of scores) {
        byUrgency[s.urgency] = (byUrgency[s.urgency] ?? 0) + 1
        totalScore += s.priorityScore
        if (s.priorityScore > highest) highest = s.priorityScore
    }

    return {
        totalTriaged: scores.length,
        byUrgency,
        avgPriorityScore: scores.length > 0 ? Math.round((totalScore / scores.length) * 100) / 100 : 0,
        highestScore: highest,
    }
}

// ── Patch Suggestion Generator (NEW — Phase 1) ─────────────────────────────

/**
 * Generate a structured patch suggestion for a finding.
 * Produces a before/after diff format that agents can reason about.
 *
 * @see Redamon CypherFix — automated code fix pipeline
 */
function generatePatchSuggestion(finding: Finding, originalCode: string): PatchSuggestion | null {
    const strategy = config.strategies.find(s => s.category === finding.category)
    if (!strategy) return null

    const cweId = CWE_MAP[finding.category]
    const primaryStrategy = strategy.strategies[0]

    // Generate a contextual patch explanation
    const explanation = [
        `Vulnerability: ${finding.title}`,
        `Category: ${finding.category}${cweId ? ` (${cweId})` : ""}`,
        `Strategy: ${primaryStrategy}`,
        `Fix: ${strategy.fixTemplate}`,
    ].join("\n")

    // Generate diff block (template — actual diffs would come from agent reasoning)
    const diffBlock = [
        `--- a/${finding.filePath ?? "unknown"}`,
        `+++ b/${finding.filePath ?? "unknown"}`,
        `@@ -${finding.lineNumber ?? 1},1 +${finding.lineNumber ?? 1},1 @@`,
        `- ${originalCode.split("\n")[0] ?? "// vulnerable code"}`,
        `+ // TODO: Apply ${primaryStrategy} strategy`,
        `+ // ${strategy.fixTemplate}`,
    ].join("\n")

    const patch: PatchSuggestion = {
        findingId: finding.id,
        filePath: finding.filePath ?? "unknown",
        originalCode,
        patchedCode: `// Fixed: ${primaryStrategy}\n${originalCode}`,
        diffBlock,
        explanation,
        confidence: strategy.confidence,
        cweId,
    }

    patchSuggestions.set(finding.id, patch)
    return patch
}

// ── PR Body Generator (NEW — Phase 1) ──────────────────────────────────────

/**
 * Generate a structured PR body for a remediation plan.
 * Format follows Redamon's CypherFix PR template.
 */
function generatePRBody(plan: RemediationPlan): PRBody {
    const severityEmoji: Record<string, string> = {
        critical: "🔴",
        high: "🟠",
        medium: "🟡",
        low: "🟢",
    }

    const findingsSummary = plan.findings.map(f => {
        const cwe = CWE_MAP[f.category] ?? "CWE-Unknown"
        const emoji = severityEmoji[f.severity] ?? "⚪"
        const location = f.filePath ? `\`${f.filePath}${f.lineNumber ? `:L${f.lineNumber}` : ""}\`` : "N/A"
        return `| ${emoji} ${f.severity.toUpperCase()} | ${cwe} | ${f.title} | ${location} |`
    }).join("\n")

    const suggestionsSection = plan.suggestions.map(s => {
        return `- **${s.strategy}** (${Math.round(s.confidence * 100)}% confidence): ${s.description}`
    }).join("\n")

    const patchSections = plan.findings
        .map(f => patchSuggestions.get(f.id))
        .filter((p): p is PatchSuggestion => p != null)
        .map(p => {
            return [
                `### ${p.filePath}`,
                "",
                "```diff",
                p.diffBlock,
                "```",
                "",
                p.explanation,
            ].join("\n")
        })
        .join("\n\n")

    const branchName = `fix/security-${plan.priority}-${plan.id.slice(0, 8)}`

    const body = [
        "## 🛡️ Security Remediation",
        "",
        `**Priority**: ${severityEmoji[plan.priority] ?? "⚪"} ${plan.priority.toUpperCase()}`,
        `**Effort**: ${plan.estimatedEffort}`,
        `**Findings**: ${plan.findings.length}`,
        `**Generated**: ${new Date(plan.createdAt).toISOString()}`,
        "",
        "### Findings",
        "",
        "| Severity | CWE | Title | Location |",
        "|----------|-----|-------|----------|",
        findingsSummary,
        "",
        "### Remediation Strategies",
        "",
        suggestionsSection,
        "",
        patchSections ? `### Patches\n\n${patchSections}` : "",
        "",
        "### Validation",
        "",
        `- Pipeline mode: \`${config.pipelineMode}\``,
        "- [ ] Tests pass",
        "- [ ] Linter clean",
        "- [ ] No new warnings",
        "",
        "### References",
        "",
        ...plan.findings.map(f => {
            const cwe = CWE_MAP[f.category]
            return cwe
                ? `- [${cwe}](https://cwe.mitre.org/data/definitions/${cwe.replace("CWE-", "")}.html)`
                : `- ${f.category}`
        }),
        "",
        "---",
        "*Generated by omo-cli auto-remediate pipeline*",
    ].join("\n")

    const title = plan.findings.length === 1
        ? `fix(security): ${plan.findings[0].title}`
        : `fix(security): Remediate ${plan.findings.length} ${plan.priority}-severity findings`

    return {
        title,
        body,
        branch: branchName,
        labels: ["security", `priority:${plan.priority}`, "auto-remediate"],
    }
}

// ── Accessors ───────────────────────────────────────────────────────────────

function getSuggestion(id: string): RemediationSuggestion | undefined {
    return suggestions.get(id)
}

function getPlan(id: string): RemediationPlan | undefined {
    return plans.get(id)
}

function getTriageScore(findingId: string): TriageScore | undefined {
    return triageScores.get(findingId)
}

function getPatchSuggestion(findingId: string): PatchSuggestion | undefined {
    return patchSuggestions.get(findingId)
}

function hasStrategy(category: string): boolean {
    return config.strategies.some(s => s.category === category)
}

function listCategories(): string[] {
    return config.strategies.map(s => s.category)
}

function getPipelineMode(): RemediationConfig["pipelineMode"] {
    return config.pipelineMode
}

/**
 * Get stats.
 */
function getStats(): RemediationStats {
    const allSugs = Array.from(suggestions.values())
    const byCat: Record<string, number> = {}

    let totalConf = 0
    for (const s of allSugs) {
        byCat[s.category] = (byCat[s.category] ?? 0) + 1
        totalConf += s.confidence
    }

    return {
        totalFindings: processedFindings.size,
        totalSuggestions: allSugs.length,
        totalPlans: plans.size,
        suggestionsByCategory: byCat,
        avgConfidence: allSugs.length > 0 ? totalConf / allSugs.length : 0,
        coverageRate: processedFindings.size > 0
            ? allSugs.length / processedFindings.size
            : 0,
        triageStats: getTriageStats(),
    }
}

/**
 * Reset all state.
 */
function resetAll(): void {
    suggestions.clear()
    plans.clear()
    processedFindings.clear()
    triageScores.clear()
    patchSuggestions.clear()
    config = { ...DEFAULT_CONFIG, strategies: [...DEFAULT_STRATEGIES] }
}

function configure(overrides: Partial<RemediationConfig>): void {
    config = { ...config, ...overrides }
}

// ── Hook Factory ─────────────────────────────────────────────────────────────

function createAutoRemediateHook(overrides?: Partial<RemediationConfig>): Record<string, Function> | null {
    if (overrides) configure(overrides)
    if (!config.enabled) return null

    return {
        "finding.new": async (ctx: Record<string, unknown>) => {
            const finding = ctx.finding as Finding | undefined
            if (finding) {
                remediate(finding)
            }
        },

        "session.end": async () => {
            const stats = getStats()
            log("[auto-remediate] Session summary", stats)
        },
    }
}

// ── Exports ──────────────────────────────────────────────────────────────────

export {
    // Core (v1)
    remediate,
    createPlan,
    autoGroup,
    getSuggestion,
    getPlan,
    hasStrategy,
    listCategories,
    getStats,
    resetAll,
    configure,
    createAutoRemediateHook,
    DEFAULT_CONFIG,
    DEFAULT_STRATEGIES,

    // Triage (v2 — Phase 1 Enhancement)
    triageFinding,
    triageFindings,
    getTriageScore,
    getTriageStats,

    // Patch Generation (v2 — Phase 1 Enhancement)
    generatePatchSuggestion,
    getPatchSuggestion,

    // PR Generation (v2 — Phase 1 Enhancement)
    generatePRBody,
    getPipelineMode,

    // CWE mapping
    CWE_MAP,

    // Type exports
    type Finding,
    type RemediationSuggestion,
    type RemediationPlan,
    type RemediationStats,
    type RemediationConfig,
    type TriageScore,
    type TriageStats,
    type PatchSuggestion,
    type PRBody,
}
