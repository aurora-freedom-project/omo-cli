import { describe, it, expect, beforeEach } from "vitest"
import {
    estimateCost,
    percentile,
    startSpan,
    endSpan,
    recordSpan,
    getSessionMetrics,
    exportPrometheus,
    getGlobalSpanCount,
    clearAll,
    clearSession,
    createExecutionTelemetryHook,
} from "./index"

describe("Execution Telemetry", () => {
    beforeEach(() => { clearAll() })

    describe("estimateCost", () => {
        it("calculates cost correctly", () => {
            const cost = estimateCost(4000, 2000) // ~1000 input + 500 output tokens
            expect(cost).toBeGreaterThan(0)
            expect(cost).toBeLessThan(0.02)
        })
        it("returns 0 for zero chars", () => {
            expect(estimateCost(0, 0)).toBe(0)
        })
    })

    describe("percentile", () => {
        it("returns correct p50", () => {
            expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3)
        })
        it("returns correct p95 for small array", () => {
            expect(percentile([10, 20, 30, 40, 50], 95)).toBe(50)
        })
        it("returns 0 for empty array", () => {
            expect(percentile([], 50)).toBe(0)
        })
    })

    describe("span lifecycle", () => {
        it("creates and ends a span", () => {
            const spanId = startSpan("s1", "nmap", 100)
            expect(spanId.length).toBe(16)
            const span = endSpan(spanId, 500, true)
            expect(span).not.toBeNull()
            expect(span!.tool).toBe("nmap")
            expect(span!.inputSize).toBe(100)
            expect(span!.outputSize).toBe(500)
            expect(span!.success).toBe(true)
            expect(span!.durationMs).toBeGreaterThanOrEqual(0)
        })

        it("returns null for unknown spanId", () => {
            expect(endSpan("nonexistent", 100, true)).toBeNull()
        })

        it("increments global span count", () => {
            const before = getGlobalSpanCount()
            const id = startSpan("s1", "test", 10)
            endSpan(id, 20, true)
            expect(getGlobalSpanCount()).toBe(before + 1)
        })
    })

    describe("recordSpan", () => {
        it("records a complete span", () => {
            const span = recordSpan("s1", "nmap", 100, 500, 250, true)
            expect(span.tool).toBe("nmap")
            expect(span.durationMs).toBe(250)
            expect(span.cost).toBeGreaterThan(0)
        })
    })

    describe("getSessionMetrics", () => {
        it("aggregates metrics correctly", () => {
            recordSpan("s1", "nmap", 100, 500, 200, true)
            recordSpan("s1", "nmap", 150, 600, 300, true)
            recordSpan("s1", "grep", 50, 200, 50, false)

            const metrics = getSessionMetrics("s1")
            expect(metrics.totalSpans).toBe(3)
            expect(metrics.successCount).toBe(2)
            expect(metrics.errorCount).toBe(1)
            expect(metrics.errorRate).toBeCloseTo(1/3, 2)
            expect(metrics.totalCost).toBeGreaterThan(0)
        })

        it("provides tool breakdown", () => {
            recordSpan("s1", "nmap", 100, 500, 200, true)
            recordSpan("s1", "nmap", 100, 500, 400, true)
            recordSpan("s1", "grep", 50, 200, 50, true)

            const metrics = getSessionMetrics("s1")
            expect(metrics.toolBreakdown["nmap"].callCount).toBe(2)
            expect(metrics.toolBreakdown["nmap"].avgDurationMs).toBe(300)
            expect(metrics.toolBreakdown["nmap"].successRate).toBe(1.0)
            expect(metrics.toolBreakdown["grep"].callCount).toBe(1)
        })

        it("computes percentiles", () => {
            for (let i = 0; i < 100; i++) {
                recordSpan("s1", "tool", 10, 10, (i + 1) * 10, true)
            }
            const metrics = getSessionMetrics("s1")
            expect(metrics.p50DurationMs).toBe(500)
            expect(metrics.p95DurationMs).toBe(950)
            expect(metrics.p99DurationMs).toBe(990)
        })

        it("handles empty session", () => {
            const metrics = getSessionMetrics("empty")
            expect(metrics.totalSpans).toBe(0)
            expect(metrics.errorRate).toBe(0)
            expect(metrics.avgSpanDurationMs).toBe(0)
        })
    })

    describe("exportPrometheus", () => {
        it("exports valid format", () => {
            recordSpan("s1", "nmap", 100, 500, 200, true)
            const output = exportPrometheus("s1")
            expect(output).toContain("omo_total_spans")
            expect(output).toContain("omo_total_cost_usd")
            expect(output).toContain("omo_error_rate")
            expect(output).toContain("omo_span_duration_ms")
            expect(output).toContain('tool="nmap"')
        })
    })

    describe("session management", () => {
        it("clears session data", () => {
            recordSpan("s1", "test", 10, 10, 10, true)
            clearSession("s1")
            expect(getSessionMetrics("s1").totalSpans).toBe(0)
        })
    })

    describe("createExecutionTelemetryHook", () => {
        it("returns hook when enabled", () => {
            const hook = createExecutionTelemetryHook()
            expect(hook).not.toBeNull()
            expect(hook!["tool.execute.before"]).toBeDefined()
            expect(hook!["tool.execute.after"]).toBeDefined()
        })
        it("returns null when disabled", () => {
            expect(createExecutionTelemetryHook({ enabled: false })).toBeNull()
        })
    })
})
