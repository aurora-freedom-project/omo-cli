/**
 * Performance Benchmarks — Track and detect regressions in key operations.
 *
 * Feature #19 from the 27-feature integration plan.
 * Inspired by ruflo's benchmark framework.
 *
 * Provides:
 *  - Timing measurement for key operations
 *  - Regression detection (alert when operation exceeds baseline)
 *  - Statistics (p50, p95, p99) for profiling
 */

import { log } from "../../shared"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BenchmarkSample {
    readonly operation: string
    readonly durationMs: number
    readonly timestamp: number
}

export interface BenchmarkStats {
    readonly operation: string
    readonly count: number
    readonly p50Ms: number
    readonly p95Ms: number
    readonly p99Ms: number
    readonly minMs: number
    readonly maxMs: number
    readonly avgMs: number
}

// ─── Store ──────────────────────────────────────────────────────────────────

const _samples = new Map<string, number[]>()
const MAX_SAMPLES_PER_OP = 100
const _baselines = new Map<string, number>()  // operation → expected p95

/** Set a baseline for an operation (for regression detection). */
export function setBaseline(operation: string, expectedP95Ms: number): void {
    _baselines.set(operation, expectedP95Ms)
}

/** Record a benchmark sample. Returns true if it exceeded baseline (regression). */
export function recordSample(operation: string, durationMs: number): boolean {
    let samples = _samples.get(operation)
    if (!samples) {
        samples = []
        _samples.set(operation, samples)
    }

    samples.push(durationMs)

    // Evict oldest if over capacity
    if (samples.length > MAX_SAMPLES_PER_OP) {
        samples.splice(0, samples.length - MAX_SAMPLES_PER_OP)
    }

    // Check regression
    const baseline = _baselines.get(operation)
    if (baseline && durationMs > baseline) {
        log(`[benchmark] ⚠️ REGRESSION: ${operation} took ${durationMs.toFixed(1)}ms (baseline: ${baseline}ms)`)
        return true
    }

    return false
}

/** Measure an async operation's duration. */
export async function measure<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    try {
        return await fn()
    } finally {
        const duration = performance.now() - start
        recordSample(operation, duration)
    }
}

/** Measure a sync operation's duration. */
export function measureSync<T>(operation: string, fn: () => T): T {
    const start = performance.now()
    try {
        return fn()
    } finally {
        const duration = performance.now() - start
        recordSample(operation, duration)
    }
}

/** Get statistics for an operation. */
export function getStats(operation: string): BenchmarkStats | undefined {
    const samples = _samples.get(operation)
    if (!samples || samples.length === 0) return undefined

    const sorted = [...samples].sort((a, b) => a - b)
    const count = sorted.length

    return {
        operation,
        count,
        p50Ms: sorted[Math.floor(count * 0.5)],
        p95Ms: sorted[Math.floor(count * 0.95)],
        p99Ms: sorted[Math.floor(count * 0.99)],
        minMs: sorted[0],
        maxMs: sorted[count - 1],
        avgMs: sorted.reduce((s, v) => s + v, 0) / count,
    }
}

/** Get stats for all tracked operations. */
export function getAllStats(): BenchmarkStats[] {
    const stats: BenchmarkStats[] = []
    for (const operation of _samples.keys()) {
        const s = getStats(operation)
        if (s) stats.push(s)
    }
    return stats.sort((a, b) => b.p95Ms - a.p95Ms)
}

/** Format benchmark stats as a human-readable table. */
export function formatBenchmarkReport(): string {
    const stats = getAllStats()
    if (stats.length === 0) return "(no benchmark data)"

    const header = "Operation".padEnd(30) + "Count".padStart(6) + "p50".padStart(8) + "p95".padStart(8) + "p99".padStart(8) + "max".padStart(8)
    const lines = stats.map(s =>
        s.operation.padEnd(30) +
        String(s.count).padStart(6) +
        `${s.p50Ms.toFixed(1)}ms`.padStart(8) +
        `${s.p95Ms.toFixed(1)}ms`.padStart(8) +
        `${s.p99Ms.toFixed(1)}ms`.padStart(8) +
        `${s.maxMs.toFixed(1)}ms`.padStart(8)
    )

    return `📊 Benchmark Report\n${"─".repeat(74)}\n${header}\n${"─".repeat(74)}\n${lines.join("\n")}`
}

/** Clear all samples (for testing). */
export function clearBenchmarks(): void {
    _samples.clear()
    _baselines.clear()
}
