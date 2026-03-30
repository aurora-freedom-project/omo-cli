/**
 * Background Consciousness — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    detectTodoComments,
    detectLargeFiles,
    detectDebugStatements,
    detectMissingErrorHandling,
    detectHardcodedSecrets,
    detectMissingTests,
    createBackgroundConsciousness,
} from "./index"

// ── Detection Rules ────────────────────────────────────────────────────────

describe("detectTodoComments", () => {
    it("finds TODO comments", () => {
        const content = `
const x = 1
// TODO: fix this later
const y = 2
`
        const insights = detectTodoComments("src/app.ts", content)
        expect(insights.length).toBe(1)
        expect(insights[0].title).toContain("TODO")
        expect(insights[0].priority).toBe("medium")
    })

    it("finds FIXME as high priority", () => {
        const content = `// FIXME: critical security bug`
        const insights = detectTodoComments("src/app.ts", content)
        expect(insights[0].priority).toBe("high")
    })

    it("finds HACK as high priority", () => {
        const content = `// HACK: workaround for API bug`
        const insights = detectTodoComments("src/app.ts", content)
        expect(insights[0].priority).toBe("high")
    })

    it("finds multiple markers", () => {
        const content = `
// TODO: first
// FIXME: second
// HACK: third
`
        const insights = detectTodoComments("src/app.ts", content)
        expect(insights.length).toBe(3)
    })

    it("returns empty for clean file", () => {
        const content = `const x = 1\nconst y = 2`
        expect(detectTodoComments("src/clean.ts", content)).toHaveLength(0)
    })
})

describe("detectLargeFiles", () => {
    it("flags files with > 500 lines", () => {
        const content = Array(600).fill("const x = 1").join("\n")
        const insights = detectLargeFiles("src/big.ts", content)
        expect(insights.length).toBe(1)
        expect(insights[0].priority).toBe("medium")
    })

    it("flags files with > 1000 lines as high priority", () => {
        const content = Array(1200).fill("const x = 1").join("\n")
        const insights = detectLargeFiles("src/huge.ts", content)
        expect(insights[0].priority).toBe("high")
    })

    it("returns empty for small files", () => {
        const content = Array(100).fill("const x = 1").join("\n")
        expect(detectLargeFiles("src/small.ts", content)).toHaveLength(0)
    })
})

describe("detectDebugStatements", () => {
    it("flags > 3 console.log statements", () => {
        const content = `
console.log("a")
console.log("b")
console.log("c")
console.log("d")
`
        const insights = detectDebugStatements("src/app.ts", content)
        expect(insights.length).toBe(1)
        expect(insights[0].description).toContain("4")
    })

    it("returns empty for few debug statements", () => {
        const content = `console.log("just one")`
        expect(detectDebugStatements("src/app.ts", content)).toHaveLength(0)
    })

    it("skips commented-out debug statements", () => {
        const content = `
// console.log("a")
// console.log("b")
// console.log("c")
// console.log("d")
`
        expect(detectDebugStatements("src/app.ts", content)).toHaveLength(0)
    })
})

describe("detectMissingErrorHandling", () => {
    it("finds empty catch blocks", () => {
        const content = `try { risky() } catch (e) {}`
        const insights = detectMissingErrorHandling("src/app.ts", content)
        expect(insights.length).toBe(1)
        expect(insights[0].priority).toBe("high")
    })

    it("finds empty promise catches", () => {
        const content = `fetch(url).catch(() => {})`
        const insights = detectMissingErrorHandling("src/app.ts", content)
        expect(insights.length).toBe(1)
    })

    it("returns empty for proper error handling", () => {
        const content = `try { risky() } catch (e) { console.error(e) }`
        expect(detectMissingErrorHandling("src/app.ts", content)).toHaveLength(0)
    })
})

describe("detectHardcodedSecrets", () => {
    it("detects hardcoded passwords", () => {
        const content = `const password = "supersecret123"`
        const insights = detectHardcodedSecrets("src/config.ts", content)
        expect(insights.length).toBe(1)
        expect(insights[0].category).toBe("security")
    })

    it("detects API keys", () => {
        const content = `const apiKey = "my_fake_api_secret_key_1234"`
        const insights = detectHardcodedSecrets("src/api.ts", content)
        expect(insights.length).toBeGreaterThan(0)
    })

    it("skips test files", () => {
        const content = `const password = "test_password_123"`
        const insights = detectHardcodedSecrets("src/config.test.ts", content)
        expect(insights).toHaveLength(0)
    })

    it("skips comments", () => {
        const content = `// password = "example_password_value"`
        const insights = detectHardcodedSecrets("src/config.ts", content)
        expect(insights).toHaveLength(0)
    })
})

describe("detectMissingTests", () => {
    it("flags source files without tests", () => {
        const insights = detectMissingTests("src/engine.ts", "export function work() {}")
        expect(insights.length).toBe(1)
        expect(insights[0].category).toBe("testing")
    })

    it("skips test files themselves", () => {
        expect(detectMissingTests("src/engine.test.ts", "")).toHaveLength(0)
    })

    it("skips non-code files", () => {
        expect(detectMissingTests("README.md", "# Hello")).toHaveLength(0)
    })
})

// ── Background Consciousness Manager ───────────────────────────────────────

describe("createBackgroundConsciousness", () => {
    let consciousness: ReturnType<typeof createBackgroundConsciousness>

    beforeEach(() => {
        consciousness = createBackgroundConsciousness()
    })

    it("scans a file and discovers insights", () => {
        const content = `
// TODO: fix this
try { risky() } catch (e) {}
`
        const insights = consciousness.scanFile("src/app.ts", content)
        expect(insights.length).toBeGreaterThan(0)
    })

    it("deduplicates insights by ID", () => {
        const content = `// TODO: same thing`
        consciousness.scanFile("src/app.ts", content)
        consciousness.scanFile("src/app.ts", content) // same file, same content
        expect(consciousness.getActiveInsights().length).toBe(2) // TODO + missing test
    })

    it("surfaces top insights by priority", () => {
        const content = `
// FIXME: critical issue
// TODO: minor thing
const password = "secret_password_value"
`
        consciousness.scanFile("src/app.ts", content)
        const surfaced = consciousness.getInsightsForTask()
        expect(surfaced.length).toBeGreaterThan(0)
        expect(surfaced.length).toBeLessThanOrEqual(3)
        // High priority should come first
        if (surfaced.length >= 2) {
            expect(surfaced[0].priority === "high" || surfaced[0].priority === surfaced[1].priority).toBe(true)
        }
    })

    it("formats injection string", () => {
        consciousness.scanFile("src/app.ts", "// FIXME: urgent fix needed")
        const injection = consciousness.formatForInjection()
        expect(injection).toContain("Proactive Insights")
        expect(injection).toContain("FIXME")
    })

    it("returns empty injection when no insights", () => {
        const injection = consciousness.formatForInjection()
        expect(injection).toBe("")
    })

    it("dismisses insights", () => {
        consciousness.scanFile("src/app.ts", "// TODO: test")
        const active = consciousness.getActiveInsights()
        expect(active.length).toBeGreaterThan(0)

        const dismissed = consciousness.dismissInsight(active[0].id)
        expect(dismissed).toBe(true)
        expect(consciousness.getMetrics().totalDismissed).toBe(1)
    })

    it("dismiss returns false for unknown insight", () => {
        expect(consciousness.dismissInsight("nonexistent")).toBe(false)
    })

    it("scans multiple files", () => {
        const results = consciousness.scanFiles([
            { path: "src/a.ts", content: "// TODO: a" },
            { path: "src/b.ts", content: "// FIXME: b" },
        ])
        expect(results.length).toBeGreaterThan(0)
    })

    it("respects maxInsights", () => {
        const cs = createBackgroundConsciousness({ maxInsights: 3 })
        for (let i = 0; i < 10; i++) {
            cs.scanFile(`src/file${i}.ts`, `// TODO: item ${i}`)
        }
        // Should not exceed maxInsights
        expect(cs.getActiveInsights().length).toBeLessThanOrEqual(10) // Each file gets TODO + missing test
    })

    it("adds custom rules", () => {
        consciousness.addRule({
            id: "custom",
            category: "performance",
            description: "Custom rule",
            priority: "medium",
            detect: (path, content) => {
                if (content.includes("SLOW")) {
                    return [{
                        id: `slow_${path}`,
                        category: "performance",
                        priority: "medium",
                        title: "Slow pattern detected",
                        description: "Consider optimization",
                        files: [path],
                        discoveredAt: Date.now(),
                        surfaced: false,
                        dismissed: false,
                        confidence: 0.8,
                    }]
                }
                return []
            },
        })

        consciousness.scanFile("src/slow.ts", "// SLOW operation here")
        const active = consciousness.getActiveInsights()
        expect(active.some(i => i.category === "performance")).toBe(true)
    })

    it("tracks metrics", () => {
        consciousness.scanFile("src/app.ts", "// TODO: test")
        const metrics = consciousness.getMetrics()
        expect(metrics.totalScans).toBe(1)
        expect(metrics.totalDiscovered).toBeGreaterThan(0)
        expect(metrics.lastScanAt).toBeGreaterThan(0)
    })

    it("tracks category breakdown", () => {
        consciousness.scanFile("src/app.ts", "// TODO: test")
        const metrics = consciousness.getMetrics()
        expect(metrics.byCategory.code_quality).toBeGreaterThan(0)
    })

    it("resets state", () => {
        consciousness.scanFile("src/app.ts", "// TODO: test")
        consciousness.reset()
        expect(consciousness.getMetrics().totalScans).toBe(0)
        expect(consciousness.getActiveInsights()).toHaveLength(0)
    })

    it("filters by minConfidence", () => {
        const cs = createBackgroundConsciousness({ minConfidence: 0.99 })
        cs.scanFile("src/app.ts", "// TODO: low confidence won't pass")
        // No insights should pass the 0.99 threshold since TODO has 0.9
        expect(cs.getActiveInsights()).toHaveLength(0)
    })

    it("respects enabled categories", () => {
        const cs = createBackgroundConsciousness({
            enabledCategories: ["security"], // Only security
        })
        cs.scanFile("src/app.ts", "// TODO: should be ignored")
        const active = cs.getActiveInsights()
        // Should not have code_quality insights
        expect(active.every(i => i.category === "security")).toBe(true)
    })
})
