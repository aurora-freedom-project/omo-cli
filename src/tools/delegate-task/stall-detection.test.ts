/**
 * Tests for Symphony P0 features:
 *   - Stall detection (session-poller stall timeout)
 *   - Retry differentiation (buildSystemContent with retryContext)
 *   - Completion gate (hasCompletionSignal)
 */
import { describe, expect, it } from "bun:test"
import { buildSystemContent } from "./helpers"
import { hasCompletionSignal, DEFAULT_COMPLETION_SIGNALS } from "../../hooks/delegate-task-retry"

// ──── Retry Differentiation ────

describe("buildSystemContent - retry context", () => {
    it("returns undefined when no inputs provided", () => {
        expect(buildSystemContent({})).toBeUndefined()
    })

    it("does not inject retry preamble on first attempt", () => {
        const result = buildSystemContent({
            skillContent: "test skill",
            retryContext: { attempt: 1 },
        })
        expect(result).not.toContain("RETRY ATTEMPT")
        expect(result).toContain("test skill")
    })

    it("injects retry preamble on attempt > 1", () => {
        const result = buildSystemContent({
            skillContent: "test skill",
            retryContext: { attempt: 2 },
        })
        expect(result).toContain("⚠️ RETRY ATTEMPT #2")
        expect(result).toContain("previously failed")
        expect(result).toContain("test skill")
    })

    it("indicates stall detection in retry preamble", () => {
        const result = buildSystemContent({
            retryContext: { attempt: 3, stallDetected: true },
        })
        expect(result).toContain("RETRY ATTEMPT #3")
        expect(result).toContain("stalled")
        expect(result).toContain("no activity detected")
    })

    it("includes previous error in retry preamble", () => {
        const result = buildSystemContent({
            retryContext: { attempt: 2, previousError: "Connection timeout" },
        })
        expect(result).toContain("Previous error: Connection timeout")
    })

    it("retry preamble appears before skill content", () => {
        const result = buildSystemContent({
            skillContent: "SKILL_CONTENT_HERE",
            retryContext: { attempt: 2 },
        })!
        const retryIdx = result.indexOf("RETRY ATTEMPT")
        const skillIdx = result.indexOf("SKILL_CONTENT_HERE")
        expect(retryIdx).toBeLessThan(skillIdx)
    })

    it("includes efficiency guidance", () => {
        const result = buildSystemContent({
            retryContext: { attempt: 2 },
        })
        expect(result).toContain("Focus on completing the task efficiently")
    })
})

// ──── Completion Gate ────

describe("hasCompletionSignal", () => {
    it("detects RESULT signal", () => {
        expect(hasCompletionSignal("Task completed.\n\nRESULT:\nSome output")).toBe(true)
    })

    it("detects COMPLETED signal", () => {
        expect(hasCompletionSignal("Task COMPLETED successfully")).toBe(true)
    })

    it("detects DONE signal", () => {
        expect(hasCompletionSignal("All items DONE")).toBe(true)
    })

    it("detects ✅ signal", () => {
        expect(hasCompletionSignal("✅ Task finished")).toBe(true)
    })

    it("detects signals case-insensitively", () => {
        expect(hasCompletionSignal("result: output here")).toBe(true)
        expect(hasCompletionSignal("completed the work")).toBe(true)
    })

    it("returns false when no signal present", () => {
        expect(hasCompletionSignal("The agent started processing but was interrupted.")).toBe(false)
    })

    it("returns false for empty string", () => {
        expect(hasCompletionSignal("")).toBe(false)
    })

    it("uses custom signals when provided", () => {
        expect(hasCompletionSignal("FINISHED", ["FINISHED", "READY"])).toBe(true)
        expect(hasCompletionSignal("DONE", ["FINISHED", "READY"])).toBe(false)
    })

    it("defaults to DEFAULT_COMPLETION_SIGNALS", () => {
        expect(DEFAULT_COMPLETION_SIGNALS).toEqual(["RESULT", "COMPLETED", "DONE", "✅"])
    })
})
