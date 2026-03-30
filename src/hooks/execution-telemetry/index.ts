/**
 * Execution Telemetry — Per-span metrics, cost tracking, performance profiling.
 *
 * Inspired by:
 * - AutoGPT: Prometheus gauges (active_runs, pool_size, utilization), per-node stats
 * - Strix: OpenTelemetry-style structured spans for agent actions
 *
 * Tracks:
 * - Per-tool: input_size, output_size, duration_ms, success, cost
 * - Per-session: total_cost, tool_breakdown, error_rate, throughput
 * - Time-series: moving averages, percentiles
 *
 * @see AutoGPT: executor/manager.py — GraphExecutionStats, NodeExecutionStats
 * @see Strix: strix/telemetry/ — OpenTelemetry spans
 */

import { log } from "../../shared/logger"
import { createHash } from "node:crypto"

const HOOK_NAME = "execution-telemetry"

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExecutionSpan {
    id: string
    sessionID: string
    tool: string
    startTime: number
    endTime: number
    durationMs: number
    inputSize: number
    outputSize: number
    success: boolean
    errorType?: string
    cost: number
    metadata: Record<string, unknown>
}

export interface SessionMetrics {
    sessionID: string
    totalSpans: number
    totalDurationMs: number
    totalCost: number
    totalInputSize: number
    totalOutputSize: number
    successCount: number
    errorCount: number
    errorRate: number
    toolBreakdown: Record<string, ToolMetrics>
    startTime: number
    lastActivityTime: number
    avgSpanDurationMs: number
    p50DurationMs: number
    p95DurationMs: number
    p99DurationMs: number
}

export interface ToolMetrics {
    tool: string
    callCount: number
    totalDurationMs: number
    avgDurationMs: number
    successRate: number
    totalCost: number
    totalInputSize: number
    totalOutputSize: number
}

export interface TelemetryConfig {
    enabled: boolean
    /** Sampling rate: 0-1, where 1 = track all, 0.5 = track 50%. */
    samplingRate: number
    /** Maximum spans to retain per session. */
    maxSpansPerSession: number
    /** Cost per input token (for cost estimation). */
    costPerInputToken: number
    /** Cost per output token. */
    costPerOutputToken: number
    /** Approximate chars per token for cost calculation. */
    charsPerToken: number
    /** Whether to export Prometheus-compatible metrics. */
    prometheusFormat: boolean
}

// ── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: TelemetryConfig = {
    enabled: true,
    samplingRate: 1.0,
    maxSpansPerSession: 500,
    costPerInputToken: 0.000003,  // $3/1M tokens
    costPerOutputToken: 0.000015, // $15/1M tokens
    charsPerToken: 4,
    prometheusFormat: false,
}

// ── State ──────────────────────────────────────────────────────────────────

const sessionSpans = new Map<string, ExecutionSpan[]>()
const pendingSpans = new Map<string, { sessionID: string; tool: string; startTime: number; inputSize: number }>()
let globalSpanCount = 0

// ── Utility ────────────────────────────────────────────────────────────────

/**
 * Estimate cost based on character count.
 */
export function estimateCost(
    inputChars: number,
    outputChars: number,
    config?: Partial<TelemetryConfig>,
): number {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const inputTokens = inputChars / cfg.charsPerToken
    const outputTokens = outputChars / cfg.charsPerToken
    return (inputTokens * cfg.costPerInputToken) + (outputTokens * cfg.costPerOutputToken)
}

/**
 * Calculate percentile from sorted array.
 */
export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
}

// ── Core API ───────────────────────────────────────────────────────────────

/**
 * Start tracking a tool execution span.
 */
export function startSpan(
    sessionID: string,
    tool: string,
    inputSize: number,
): string {
    const spanId = createHash("sha256")
        .update(`${sessionID}|${tool}|${Date.now()}|${Math.random()}`)
        .digest("hex")
        .slice(0, 16)

    pendingSpans.set(spanId, {
        sessionID,
        tool,
        startTime: Date.now(),
        inputSize,
    })

    return spanId
}

/**
 * End a tool execution span and record it.
 */
export function endSpan(
    spanId: string,
    outputSize: number,
    success: boolean,
    errorType?: string,
    config?: Partial<TelemetryConfig>,
): ExecutionSpan | null {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const pending = pendingSpans.get(spanId)
    if (!pending) return null

    pendingSpans.delete(spanId)

    // Sampling
    if (cfg.samplingRate < 1 && Math.random() > cfg.samplingRate) {
        return null
    }

    const endTime = Date.now()
    const durationMs = endTime - pending.startTime
    const cost = estimateCost(pending.inputSize, outputSize, cfg)

    const span: ExecutionSpan = {
        id: spanId,
        sessionID: pending.sessionID,
        tool: pending.tool,
        startTime: pending.startTime,
        endTime,
        durationMs,
        inputSize: pending.inputSize,
        outputSize,
        success,
        errorType,
        cost,
        metadata: {},
    }

    // Store span
    let spans = sessionSpans.get(pending.sessionID)
    if (!spans) {
        spans = []
        sessionSpans.set(pending.sessionID, spans)
    }
    spans.push(span)

    // Ring buffer
    if (spans.length > cfg.maxSpansPerSession) {
        spans.splice(0, spans.length - cfg.maxSpansPerSession)
    }

    globalSpanCount++

    return span
}

/**
 * Record a complete span in one call (for post-hoc recording).
 */
export function recordSpan(
    sessionID: string,
    tool: string,
    inputSize: number,
    outputSize: number,
    durationMs: number,
    success: boolean,
    config?: Partial<TelemetryConfig>,
): ExecutionSpan {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    const cost = estimateCost(inputSize, outputSize, cfg)
    const now = Date.now()

    const span: ExecutionSpan = {
        id: createHash("sha256")
            .update(`${sessionID}|${tool}|${now}|${Math.random()}`)
            .digest("hex")
            .slice(0, 16),
        sessionID,
        tool,
        startTime: now - durationMs,
        endTime: now,
        durationMs,
        inputSize,
        outputSize,
        success,
        cost,
        metadata: {},
    }

    let spans = sessionSpans.get(sessionID)
    if (!spans) {
        spans = []
        sessionSpans.set(sessionID, spans)
    }
    spans.push(span)

    if (spans.length > cfg.maxSpansPerSession) {
        spans.splice(0, spans.length - cfg.maxSpansPerSession)
    }

    globalSpanCount++

    return span
}

/**
 * Get comprehensive session metrics.
 */
export function getSessionMetrics(sessionID: string): SessionMetrics {
    const spans = sessionSpans.get(sessionID) || []

    const toolBreakdown: Record<string, ToolMetrics> = {}
    let totalDuration = 0
    let totalCost = 0
    let totalInputSize = 0
    let totalOutputSize = 0
    let successCount = 0
    let errorCount = 0
    let earliest = Infinity
    let latest = 0

    for (const span of spans) {
        totalDuration += span.durationMs
        totalCost += span.cost
        totalInputSize += span.inputSize
        totalOutputSize += span.outputSize
        if (span.success) successCount++
        else errorCount++
        if (span.startTime < earliest) earliest = span.startTime
        if (span.endTime > latest) latest = span.endTime

        // Tool breakdown
        if (!toolBreakdown[span.tool]) {
            toolBreakdown[span.tool] = {
                tool: span.tool,
                callCount: 0,
                totalDurationMs: 0,
                avgDurationMs: 0,
                successRate: 0,
                totalCost: 0,
                totalInputSize: 0,
                totalOutputSize: 0,
            }
        }
        const tb = toolBreakdown[span.tool]
        tb.callCount++
        tb.totalDurationMs += span.durationMs
        tb.totalCost += span.cost
        tb.totalInputSize += span.inputSize
        tb.totalOutputSize += span.outputSize
    }

    // Compute averages for tool breakdown
    for (const tb of Object.values(toolBreakdown)) {
        tb.avgDurationMs = tb.callCount > 0 ? tb.totalDurationMs / tb.callCount : 0
        const toolSpans = spans.filter(s => s.tool === tb.tool)
        const toolSuccesses = toolSpans.filter(s => s.success).length
        tb.successRate = toolSpans.length > 0 ? toolSuccesses / toolSpans.length : 0
    }

    // Percentiles
    const durations = spans.map(s => s.durationMs).sort((a, b) => a - b)

    return {
        sessionID,
        totalSpans: spans.length,
        totalDurationMs: totalDuration,
        totalCost: Math.round(totalCost * 1_000_000) / 1_000_000, // 6 decimal places
        totalInputSize,
        totalOutputSize,
        successCount,
        errorCount,
        errorRate: spans.length > 0 ? errorCount / spans.length : 0,
        toolBreakdown,
        startTime: earliest === Infinity ? 0 : earliest,
        lastActivityTime: latest,
        avgSpanDurationMs: spans.length > 0 ? totalDuration / spans.length : 0,
        p50DurationMs: percentile(durations, 50),
        p95DurationMs: percentile(durations, 95),
        p99DurationMs: percentile(durations, 99),
    }
}

/**
 * Export metrics in Prometheus format.
 */
export function exportPrometheus(sessionID: string): string {
    const metrics = getSessionMetrics(sessionID)
    const lines: string[] = []

    lines.push(`# HELP omo_total_spans Total execution spans`)
    lines.push(`# TYPE omo_total_spans counter`)
    lines.push(`omo_total_spans{session="${sessionID}"} ${metrics.totalSpans}`)

    lines.push(`# HELP omo_total_cost_usd Total cost in USD`)
    lines.push(`# TYPE omo_total_cost_usd counter`)
    lines.push(`omo_total_cost_usd{session="${sessionID}"} ${metrics.totalCost}`)

    lines.push(`# HELP omo_error_rate Error rate (0-1)`)
    lines.push(`# TYPE omo_error_rate gauge`)
    lines.push(`omo_error_rate{session="${sessionID}"} ${metrics.errorRate}`)

    lines.push(`# HELP omo_span_duration_ms Span duration percentiles`)
    lines.push(`# TYPE omo_span_duration_ms summary`)
    lines.push(`omo_span_duration_ms{session="${sessionID}",quantile="0.5"} ${metrics.p50DurationMs}`)
    lines.push(`omo_span_duration_ms{session="${sessionID}",quantile="0.95"} ${metrics.p95DurationMs}`)
    lines.push(`omo_span_duration_ms{session="${sessionID}",quantile="0.99"} ${metrics.p99DurationMs}`)

    for (const [tool, tb] of Object.entries(metrics.toolBreakdown)) {
        lines.push(`omo_tool_calls{session="${sessionID}",tool="${tool}"} ${tb.callCount}`)
        lines.push(`omo_tool_success_rate{session="${sessionID}",tool="${tool}"} ${tb.successRate}`)
    }

    return lines.join("\n")
}

/**
 * Get global span count.
 */
export function getGlobalSpanCount(): number {
    return globalSpanCount
}

/**
 * Clear session state.
 */
export function clearSession(sessionID: string): void {
    sessionSpans.delete(sessionID)
}

/**
 * Clear all state.
 */
export function clearAll(): void {
    sessionSpans.clear()
    pendingSpans.clear()
    globalSpanCount = 0
}

// ── Hook Creation ──────────────────────────────────────────────────────────

/**
 * Create the execution telemetry hook.
 */
export function createExecutionTelemetryHook(config?: Partial<TelemetryConfig>) {
    const cfg = { ...DEFAULT_CONFIG, ...config }
    if (!cfg.enabled) return null

    // Track span starts per tool call
    const activeSpans = new Map<string, string>()

    return {
        "tool.execute.before": async (
            input: { sessionID: string; tool: string; args: Record<string, unknown> },
            _output: unknown,
        ): Promise<void> => {
            const inputSize = JSON.stringify(input.args).length
            const spanId = startSpan(input.sessionID, input.tool, inputSize)
            const callKey = `${input.sessionID}|${input.tool}|${Date.now()}`
            activeSpans.set(callKey, spanId)
            // Store spanId in a way accessible to after hook
            ;(input as Record<string, unknown>).__spanId = spanId
        },

        "tool.execute.after": async (
            input: { sessionID: string; tool: string; args: Record<string, unknown>; __spanId?: string },
            output: { result?: string; output?: string },
        ): Promise<void> => {
            const spanId = input.__spanId
            if (!spanId) return

            const outputText = output.result || output.output || ""
            const outputSize = outputText.length
            const success = !outputText.toLowerCase().includes("error:")

            endSpan(spanId, outputSize, success, undefined, cfg)
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
