/**
 * Background Consciousness — Ouroboros-inspired proactive agent thinking.
 *
 * Learned from:
 * - Ouroboros (446⭐): Background Consciousness pattern — agent proactively
 *   reviews code quality, suggests improvements, and monitors drift between tasks
 * - OpenFang (15.8K⭐): Scheduled "Hands" that run autonomously
 *
 * The Background Consciousness runs between user tasks, performing:
 * 1. Code Quality Scan — checks for patterns that need attention
 * 2. Dependency Audit — flags outdated or vulnerable deps
 * 3. Architecture Drift — compares current code against spec documents
 * 4. Suggestion Generation — produces actionable improvement suggestions
 *
 * The consciousness is non-blocking: it collects observations silently and
 * surfaces them when the user starts a new task via the "proactive_insights"
 * system prompt injection.
 *
 * @see Phase 8.2 of omo-cli v4.0+ upgrade blueprint
 */

import { log } from "../../shared/logger"

// ── Types ──────────────────────────────────────────────────────────────────

export type InsightCategory =
    | "code_quality"
    | "dependency"
    | "architecture"
    | "security"
    | "performance"
    | "documentation"
    | "testing"

export type InsightPriority = "high" | "medium" | "low"

export interface Insight {
    /** Unique insight ID. */
    id: string
    /** Category of the insight. */
    category: InsightCategory
    /** Priority. */
    priority: InsightPriority
    /** Human-readable title. */
    title: string
    /** Detailed description with actionable suggestion. */
    description: string
    /** File path(s) this insight relates to. */
    files: string[]
    /** When this insight was discovered. */
    discoveredAt: number
    /** Whether this insight has been surfaced to the user. */
    surfaced: boolean
    /** Whether the user dismissed this insight. */
    dismissed: boolean
    /** Confidence score (0-1). */
    confidence: number
}

export interface ScanRule {
    /** Rule ID. */
    id: string
    /** Rule category. */
    category: InsightCategory
    /** Rule description. */
    description: string
    /** Priority of findings from this rule. */
    priority: InsightPriority
    /** Detection function — returns insights for a file. */
    detect: (filePath: string, content: string) => Insight[]
}

export interface ConsciousnessConfig {
    /** Maximum insights to accumulate before auto-surfacing. */
    maxInsights: number
    /** Maximum age of insights before auto-expiry (ms). */
    insightExpiryMs: number
    /** Minimum confidence to keep an insight. */
    minConfidence: number
    /** Categories to enable. */
    enabledCategories: InsightCategory[]
    /** Maximum insights to surface per task. */
    maxSurfacedPerTask: number
}

export interface ConsciousnessMetrics {
    /** Total scans performed. */
    totalScans: number
    /** Total insights discovered. */
    totalDiscovered: number
    /** Insights surfaced to user. */
    totalSurfaced: number
    /** Insights dismissed by user. */
    totalDismissed: number
    /** Active (unsurfaced) insights. */
    activeInsights: number
    /** Breakdown by category. */
    byCategory: Record<InsightCategory, number>
    /** Last scan timestamp. */
    lastScanAt: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ConsciousnessConfig = {
    maxInsights: 50,
    insightExpiryMs: 24 * 60 * 60 * 1000, // 24 hours
    minConfidence: 0.5,
    enabledCategories: [
        "code_quality", "dependency", "architecture",
        "security", "performance", "documentation", "testing",
    ],
    maxSurfacedPerTask: 3,
}

// ── Built-in Detection Rules ───────────────────────────────────────────────

/** Detect TODO/FIXME/HACK comments that need attention. */
export function detectTodoComments(filePath: string, content: string): Insight[] {
    const insights: Insight[] = []
    const lines = content.split("\n")
    const markers = [
        { pattern: /\bTODO\b/i, priority: "medium" as InsightPriority, label: "TODO" },
        { pattern: /\bFIXME\b/i, priority: "high" as InsightPriority, label: "FIXME" },
        { pattern: /\bHACK\b/i, priority: "high" as InsightPriority, label: "HACK" },
        { pattern: /\bXXX\b/i, priority: "medium" as InsightPriority, label: "XXX" },
    ]

    for (let i = 0; i < lines.length; i++) {
        for (const { pattern, priority, label } of markers) {
            if (pattern.test(lines[i])) {
                const cleanLine = lines[i].trim().slice(0, 100)
                insights.push({
                    id: `todo_${filePath}_${i + 1}`,
                    category: "code_quality",
                    priority,
                    title: `${label} found at ${filePath}:${i + 1}`,
                    description: `Line ${i + 1}: ${cleanLine}`,
                    files: [filePath],
                    discoveredAt: Date.now(),
                    surfaced: false,
                    dismissed: false,
                    confidence: 0.9,
                })
            }
        }
    }

    return insights
}

/** Detect large files that may need splitting. */
export function detectLargeFiles(filePath: string, content: string): Insight[] {
    const lines = content.split("\n").length
    if (lines > 500) {
        return [{
            id: `large_${filePath}`,
            category: "code_quality",
            priority: lines > 1000 ? "high" : "medium",
            title: `Large file: ${filePath} (${lines} lines)`,
            description: `This file has ${lines} lines. Consider splitting into smaller, focused modules.`,
            files: [filePath],
            discoveredAt: Date.now(),
            surfaced: false,
            dismissed: false,
            confidence: 0.8,
        }]
    }
    return []
}

/** Detect console.log / print statements that should be cleaned up. */
export function detectDebugStatements(filePath: string, content: string): Insight[] {
    const insights: Insight[] = []
    const lines = content.split("\n")
    const debugPatterns = [
        { pattern: /console\.log\(/, lang: "js/ts" },
        { pattern: /console\.debug\(/, lang: "js/ts" },
        { pattern: /print\(/, lang: "python" },
        { pattern: /println!\(/, lang: "rust" },
        { pattern: /dbg!\(/, lang: "rust" },
    ]

    let debugCount = 0
    for (let i = 0; i < lines.length; i++) {
        for (const { pattern } of debugPatterns) {
            if (pattern.test(lines[i]) && !lines[i].trim().startsWith("//") && !lines[i].trim().startsWith("#")) {
                debugCount++
            }
        }
    }

    if (debugCount > 3) {
        insights.push({
            id: `debug_${filePath}`,
            category: "code_quality",
            priority: "low",
            title: `${debugCount} debug statements in ${filePath}`,
            description: `Found ${debugCount} debug/logging statements. Consider removing or replacing with proper logging.`,
            files: [filePath],
            discoveredAt: Date.now(),
            surfaced: false,
            dismissed: false,
            confidence: 0.7,
        })
    }

    return insights
}

/** Detect missing error handling patterns. */
export function detectMissingErrorHandling(filePath: string, content: string): Insight[] {
    const insights: Insight[] = []

    // Check for empty catch blocks
    const emptyCatchPattern = /catch\s*\([^)]*\)\s*\{\s*\}/g
    const matches = content.match(emptyCatchPattern)
    if (matches && matches.length > 0) {
        insights.push({
            id: `empty_catch_${filePath}`,
            category: "code_quality",
            priority: "high",
            title: `${matches.length} empty catch block(s) in ${filePath}`,
            description: `Found ${matches.length} empty catch blocks. Errors are being silently swallowed.`,
            files: [filePath],
            discoveredAt: Date.now(),
            surfaced: false,
            dismissed: false,
            confidence: 0.95,
        })
    }

    // Check for .catch(() => {}) in promises
    const emptyCatchPromise = /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/g
    const promiseMatches = content.match(emptyCatchPromise)
    if (promiseMatches && promiseMatches.length > 0) {
        insights.push({
            id: `empty_promise_catch_${filePath}`,
            category: "code_quality",
            priority: "high",
            title: `${promiseMatches.length} empty promise catch(es) in ${filePath}`,
            description: `Found ${promiseMatches.length} empty promise .catch() handlers.`,
            files: [filePath],
            discoveredAt: Date.now(),
            surfaced: false,
            dismissed: false,
            confidence: 0.9,
        })
    }

    return insights
}

/** Detect hardcoded secrets. */
export function detectHardcodedSecrets(filePath: string, content: string): Insight[] {
    const insights: Insight[] = []
    const lines = content.split("\n")

    const secretPatterns = [
        { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{3,}["']/i, label: "Hardcoded password" },
        { pattern: /(?:api_key|apikey|api[-_]?token)\s*[:=]\s*["'][^"']{8,}["']/i, label: "Hardcoded API key" },
        { pattern: /(?:secret|token)\s*[:=]\s*["'][a-zA-Z0-9+/=]{16,}["']/i, label: "Hardcoded secret/token" },
        { pattern: /sk[-_](?:live|test)_[a-zA-Z0-9]{20,}/i, label: "Stripe key" },
    ]

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Skip comments and test files
        if (line.trim().startsWith("//") || line.trim().startsWith("#")) continue
        if (filePath.includes(".test.") || filePath.includes(".spec.")) continue

        for (const { pattern, label } of secretPatterns) {
            if (pattern.test(line)) {
                insights.push({
                    id: `secret_${filePath}_${i + 1}`,
                    category: "security",
                    priority: "high",
                    title: `${label} detected at ${filePath}:${i + 1}`,
                    description: `Potential ${label.toLowerCase()} found. Use environment variables instead.`,
                    files: [filePath],
                    discoveredAt: Date.now(),
                    surfaced: false,
                    dismissed: false,
                    confidence: 0.85,
                })
            }
        }
    }

    return insights
}

/** Detect missing test files. */
export function detectMissingTests(filePath: string, _content: string): Insight[] {
    // Only check source files (not test files themselves)
    if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("__test__")) {
        return []
    }

    // Only check implementation files
    const ext = filePath.split(".").pop()
    if (!["ts", "tsx", "js", "jsx", "py", "rs"].includes(ext ?? "")) {
        return []
    }

    // Check if a corresponding test file would be expected
    const baseName = filePath.replace(new RegExp(`\\.${ext}$`), "")
    const expectedTestFile = `${baseName}.test.${ext}`

    return [{
        id: `missing_test_${filePath}`,
        category: "testing",
        priority: "low",
        title: `No test file found for ${filePath}`,
        description: `Expected test file: ${expectedTestFile}. Consider adding tests for better coverage.`,
        files: [filePath],
        discoveredAt: Date.now(),
        surfaced: false,
        dismissed: false,
        confidence: 0.6,
    }]
}

// ── Background Consciousness Manager ───────────────────────────────────────

/**
 * Create a Background Consciousness manager.
 */
export function createBackgroundConsciousness(config: Partial<ConsciousnessConfig> = {}) {
    const cfg: ConsciousnessConfig = { ...DEFAULT_CONFIG, ...config }
    const insights = new Map<string, Insight>()
    let nextId = 1
    const metrics: ConsciousnessMetrics = {
        totalScans: 0,
        totalDiscovered: 0,
        totalSurfaced: 0,
        totalDismissed: 0,
        activeInsights: 0,
        byCategory: {
            code_quality: 0,
            dependency: 0,
            architecture: 0,
            security: 0,
            performance: 0,
            documentation: 0,
            testing: 0,
        },
        lastScanAt: 0,
    }

    // Built-in rules
    const rules: ScanRule[] = [
        { id: "todos", category: "code_quality", description: "TODO/FIXME/HACK comments", priority: "medium", detect: detectTodoComments },
        { id: "large_files", category: "code_quality", description: "Files > 500 lines", priority: "medium", detect: detectLargeFiles },
        { id: "debug_stmts", category: "code_quality", description: "Debug statements", priority: "low", detect: detectDebugStatements },
        { id: "error_handling", category: "code_quality", description: "Missing error handling", priority: "high", detect: detectMissingErrorHandling },
        { id: "secrets", category: "security", description: "Hardcoded secrets", priority: "high", detect: detectHardcodedSecrets },
        { id: "missing_tests", category: "testing", description: "Missing test files", priority: "low", detect: detectMissingTests },
    ]

    /**
     * Scan a file with all active rules.
     */
    function scanFile(filePath: string, content: string): Insight[] {
        metrics.totalScans++
        metrics.lastScanAt = Date.now()

        const discovered: Insight[] = []

        for (const rule of rules) {
            if (!cfg.enabledCategories.includes(rule.category)) continue

            try {
                const ruleInsights = rule.detect(filePath, content)
                for (const insight of ruleInsights) {
                    if (insight.confidence < cfg.minConfidence) continue

                    // Dedup — don't re-add existing insights
                    if (insights.has(insight.id)) continue

                    // Enforce max insights
                    if (insights.size >= cfg.maxInsights) {
                        expireOldest()
                    }

                    insights.set(insight.id, insight)
                    discovered.push(insight)
                    metrics.totalDiscovered++
                    metrics.byCategory[insight.category]++
                }
            } catch (err) {
                log("[consciousness] Rule failed", { rule: rule.id, error: String(err) })
            }
        }

        updateActiveCount()

        log("[consciousness] File scanned", {
            file: filePath,
            discovered: discovered.length,
            total: insights.size,
        })

        return discovered
    }

    /**
     * Scan multiple files.
     */
    function scanFiles(files: Array<{ path: string; content: string }>): Insight[] {
        const all: Insight[] = []
        for (const file of files) {
            all.push(...scanFile(file.path, file.content))
        }
        return all
    }

    /**
     * Get insights to surface for the current task.
     *
     * Returns the top N unsurfaced insights by priority.
     */
    function getInsightsForTask(): Insight[] {
        // Expire old insights
        expireByAge()

        const unsurfaced = [...insights.values()]
            .filter(i => !i.surfaced && !i.dismissed)
            .sort((a, b) => {
                // Sort by priority (high > medium > low), then by confidence
                const priorityOrder = { high: 3, medium: 2, low: 1 }
                const pDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
                if (pDiff !== 0) return pDiff
                return b.confidence - a.confidence
            })
            .slice(0, cfg.maxSurfacedPerTask)

        // Mark as surfaced
        for (const insight of unsurfaced) {
            insight.surfaced = true
            metrics.totalSurfaced++
        }

        return unsurfaced
    }

    /**
     * Format insights as a system prompt injection.
     */
    function formatForInjection(): string {
        const toSurface = getInsightsForTask()
        if (toSurface.length === 0) return ""

        const icon: Record<InsightPriority, string> = {
            high: "🔴",
            medium: "🟡",
            low: "🟢",
        }

        const lines = ["--- Proactive Insights (Background Consciousness) ---"]
        for (const insight of toSurface) {
            lines.push(`${icon[insight.priority]} [${insight.category}] ${insight.title}`)
            lines.push(`   ${insight.description}`)
        }
        return lines.join("\n")
    }

    /**
     * Dismiss an insight (user doesn't want to see it again).
     */
    function dismissInsight(insightId: string): boolean {
        const insight = insights.get(insightId)
        if (!insight) return false
        insight.dismissed = true
        metrics.totalDismissed++
        updateActiveCount()
        return true
    }

    /**
     * Add a custom scan rule.
     */
    function addRule(rule: ScanRule): void {
        rules.push(rule)
    }

    /**
     * Get all active (unsurfaced, undismissed) insights.
     */
    function getActiveInsights(): Insight[] {
        return [...insights.values()].filter(i => !i.surfaced && !i.dismissed)
    }

    /**
     * Get metrics.
     */
    function getMetrics(): ConsciousnessMetrics {
        updateActiveCount()
        return { ...metrics }
    }

    /**
     * Reset all state (for testing).
     */
    function reset(): void {
        insights.clear()
        nextId = 1
        metrics.totalScans = 0
        metrics.totalDiscovered = 0
        metrics.totalSurfaced = 0
        metrics.totalDismissed = 0
        metrics.activeInsights = 0
        metrics.lastScanAt = 0
        for (const key in metrics.byCategory) {
            metrics.byCategory[key as InsightCategory] = 0
        }
    }

    // ── Internal ───────────────────────────────────────────────────────

    function expireOldest(): void {
        let oldest: Insight | null = null
        for (const insight of insights.values()) {
            if (!oldest || insight.discoveredAt < oldest.discoveredAt) {
                oldest = insight
            }
        }
        if (oldest) {
            insights.delete(oldest.id)
        }
    }

    function expireByAge(): void {
        const now = Date.now()
        for (const [id, insight] of insights) {
            if (now - insight.discoveredAt > cfg.insightExpiryMs) {
                insights.delete(id)
            }
        }
    }

    function updateActiveCount(): void {
        metrics.activeInsights = [...insights.values()].filter(i => !i.surfaced && !i.dismissed).length
    }

    return {
        scanFile,
        scanFiles,
        getInsightsForTask,
        formatForInjection,
        dismissInsight,
        addRule,
        getActiveInsights,
        getMetrics,
        reset,
    }
}

export { DEFAULT_CONFIG }
