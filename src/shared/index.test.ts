/**
 * @module shared/index.test
 *
 * Barrel export verification — ensures all shared modules re-export correctly.
 */

import { describe, test, expect } from "bun:test"

describe("shared/index barrel exports", () => {
    test("exports core utility functions", async () => {
        const shared = await import("./index")

        // Verify a representative sample of exports from each re-exported module
        expect(shared.parseFrontmatter).toBeFunction()        // frontmatter
        expect(shared.executeCommand).toBeFunction()           // command-executor
        expect(shared.sanitizeModelField).toBeFunction()       // model-sanitizer
        expect(shared.camelToSnake).toBeFunction()             // snake-case
        expect(shared.transformToolName).toBeFunction()        // tool-name
        expect(shared.deepMerge).toBeFunction()                // deep-merge
    })

    test("exports logger", async () => {
        const shared = await import("./index")
        expect(shared.log).toBeFunction()
    })

    test("exports config utilities", async () => {
        const shared = await import("./index")
        expect(shared.getClaudeConfigDir).toBeFunction()       // claude-config-dir
        expect(shared.getOpenCodeConfigDir).toBeFunction()     // opencode-config-dir
    })

    test("exports session utilities", async () => {
        const shared = await import("./index")
        expect(shared.getMessageDir).toBeFunction()            // session-utils
    })

    test("exports model utilities", async () => {
        const shared = await import("./index")
        expect(shared.resolveModel).toBeFunction()             // model-resolver
        expect(shared.AGENT_MODEL_REQUIREMENTS).toBeDefined()  // model-requirements
    })

    test("module count is non-trivial", async () => {
        const shared = await import("./index")
        const exportKeys = Object.keys(shared)
        // Barrel should export at least 20+ symbols
        expect(exportKeys.length).toBeGreaterThan(20)
    })
})
