/**
 * Autonomous Hands — Test Suite
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    cronMatchesTime,
    validateManifest,
    createHandScheduler,
    createSecurityScanHand,
    createDependencyAuditHand,
    type HandManifest,
} from "./index"

// ── Helpers ────────────────────────────────────────────────────────────────

function makeManifest(overrides: Partial<HandManifest> = {}): HandManifest {
    return {
        id: "test-hand",
        name: "Test Hand",
        description: "A test hand for unit testing",
        version: "1.0.0",
        author: "test",
        trigger: { type: "manual" },
        allowedTools: ["read_file", "grep_search"],
        approvalRequired: ["shell_command"],
        maxExecutionMs: 60000,
        maxOutputTokens: 4096,
        systemPrompt: "You are a test agent. Analyze the codebase.",
        guardrails: ["rm\\s+-rf"],
        tags: ["test"],
        enabled: true,
        ...overrides,
    }
}

// ── Cron Parser ────────────────────────────────────────────────────────────

describe("cronMatchesTime", () => {
    it("matches wildcard expression", () => {
        expect(cronMatchesTime("* * * * *", new Date())).toBe(true)
    })

    it("matches specific minute and hour", () => {
        const date = new Date(2026, 2, 28, 6, 0, 0)  // 6:00 AM
        expect(cronMatchesTime("0 6 * * *", date)).toBe(true)
    })

    it("rejects non-matching time", () => {
        const date = new Date(2026, 2, 28, 14, 30, 0)  // 2:30 PM
        expect(cronMatchesTime("0 6 * * *", date)).toBe(false)
    })

    it("matches specific day of week", () => {
        const monday = new Date(2026, 2, 23, 8, 0, 0)  // Monday
        expect(cronMatchesTime("0 8 * * 1", monday)).toBe(true)
    })

    it("supports comma-separated values", () => {
        const date = new Date(2026, 2, 28, 6, 0, 0)
        expect(cronMatchesTime("0 6,12,18 * * *", date)).toBe(true)
    })

    it("rejects invalid expression", () => {
        expect(cronMatchesTime("invalid", new Date())).toBe(false)
    })
})

// ── Manifest Validation ────────────────────────────────────────────────────

describe("validateManifest", () => {
    it("accepts valid manifest", () => {
        const result = validateManifest(makeManifest())
        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
    })

    it("rejects invalid ID", () => {
        const result = validateManifest(makeManifest({ id: "INVALID ID!" }))
        expect(result.valid).toBe(false)
        expect(result.errors[0]).toContain("kebab-case")
    })

    it("rejects short name", () => {
        const result = validateManifest(makeManifest({ name: "ab" }))
        expect(result.valid).toBe(false)
    })

    it("rejects missing description", () => {
        const result = validateManifest(makeManifest({ description: "" }))
        expect(result.valid).toBe(false)
    })

    it("rejects missing trigger", () => {
        const result = validateManifest({ ...makeManifest(), trigger: undefined as any })
        expect(result.valid).toBe(false)
    })

    it("rejects short system prompt", () => {
        const result = validateManifest(makeManifest({ systemPrompt: "short" }))
        expect(result.valid).toBe(false)
    })

    it("rejects too-short execution time", () => {
        const result = validateManifest(makeManifest({ maxExecutionMs: 100 }))
        expect(result.valid).toBe(false)
    })

    it("rejects empty tools", () => {
        const result = validateManifest(makeManifest({ allowedTools: [] }))
        expect(result.valid).toBe(false)
    })
})

// ── Hand Scheduler ─────────────────────────────────────────────────────────

describe("createHandScheduler", () => {
    let scheduler: ReturnType<typeof createHandScheduler>

    beforeEach(() => {
        scheduler = createHandScheduler()
    })

    it("registers a valid hand", () => {
        const result = scheduler.registerHand(makeManifest())
        expect(result.success).toBe(true)
        expect(scheduler.listHands()).toHaveLength(1)
    })

    it("rejects invalid hand", () => {
        const result = scheduler.registerHand(makeManifest({ id: "" }))
        expect(result.success).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
    })

    it("unregisters a hand", () => {
        scheduler.registerHand(makeManifest())
        expect(scheduler.unregisterHand("test-hand")).toBe(true)
        expect(scheduler.listHands()).toHaveLength(0)
    })

    it("enables/disables a hand", () => {
        scheduler.registerHand(makeManifest())
        scheduler.setEnabled("test-hand", false)
        expect(scheduler.getHand("test-hand")?.enabled).toBe(false)
        expect(scheduler.getMetrics().activeHands).toBe(0)
    })

    it("schedules cron-triggered hands", () => {
        const sixAm = new Date(2026, 2, 28, 6, 0, 0)
        scheduler.registerHand(makeManifest({
            id: "cron-hand",
            trigger: { type: "cron", expression: "0 6 * * *" },
        }))
        const scheduled = scheduler.getScheduledHands(sixAm)
        expect(scheduled.length).toBe(1)
    })

    it("does not schedule disabled hands", () => {
        scheduler.registerHand(makeManifest({
            id: "disabled-hand",
            trigger: { type: "cron", expression: "* * * * *" },
            enabled: false,
        }))
        expect(scheduler.getScheduledHands()).toHaveLength(0)
    })

    it("triggers hands by event", () => {
        scheduler.registerHand(makeManifest({
            id: "event-hand",
            trigger: { type: "event", eventName: "post_commit" },
        }))
        const triggered = scheduler.triggerByEvent("post_commit")
        expect(triggered.length).toBe(1)
    })

    it("does not trigger for wrong event", () => {
        scheduler.registerHand(makeManifest({
            id: "event-hand",
            trigger: { type: "event", eventName: "post_commit" },
        }))
        expect(scheduler.triggerByEvent("post_push")).toHaveLength(0)
    })

    it("manages execution lifecycle", () => {
        scheduler.registerHand(makeManifest())
        const exec = scheduler.startExecution("test-hand")
        const result = exec.complete("Scan complete: 0 issues found", "completed")
        expect(result.status).toBe("completed")
        expect(result.durationMs).toBeGreaterThanOrEqual(0)
        expect(scheduler.getMetrics().totalExecutions).toBe(1)
        expect(scheduler.getMetrics().successfulExecutions).toBe(1)
    })

    it("tracks failed executions", () => {
        scheduler.registerHand(makeManifest())
        const exec = scheduler.startExecution("test-hand")
        exec.complete("Error during scan", "failed", ["Connection timeout"])
        expect(scheduler.getMetrics().failedExecutions).toBe(1)
    })

    it("creates approval requests", () => {
        scheduler.registerHand(makeManifest())
        const exec = scheduler.startExecution("test-hand")
        const approval = exec.requestApproval("shell_command", "Run npm audit")
        expect(approval.status).toBe("pending")
        exec.complete("Awaiting approval", "completed")
        expect(scheduler.getPendingApprovals().length).toBe(1)
    })

    it("resolves approvals", () => {
        scheduler.registerHand(makeManifest())
        const exec = scheduler.startExecution("test-hand")
        const approval = exec.requestApproval("shell_command", "Run command")
        exec.complete("Done", "completed")

        expect(scheduler.resolveApproval(approval.id, true)).toBe(true)
        expect(scheduler.getPendingApprovals()).toHaveLength(0)
    })

    it("rejects approvals", () => {
        scheduler.registerHand(makeManifest())
        const exec = scheduler.startExecution("test-hand")
        const approval = exec.requestApproval("file_delete", "Delete temp files")
        exec.complete("Done", "completed")

        scheduler.resolveApproval(approval.id, false)
        expect(scheduler.getPendingApprovals()).toHaveLength(0)
    })

    it("checks approval requirements", () => {
        scheduler.registerHand(makeManifest({ approvalRequired: ["shell_command", "deploy"] }))
        expect(scheduler.requiresApproval("test-hand", "shell_command")).toBe(true)
        expect(scheduler.requiresApproval("test-hand", "file_delete")).toBe(false)
    })

    it("enforces guardrails", () => {
        scheduler.registerHand(makeManifest({ guardrails: ["rm\\s+-rf", "eval\\("] }))
        const clean = scheduler.checkGuardrails("test-hand", "echo hello")
        expect(clean.passed).toBe(true)

        const violation = scheduler.checkGuardrails("test-hand", "rm -rf /")
        expect(violation.passed).toBe(false)
        expect(violation.violations.length).toBe(1)
    })

    it("gets execution history", () => {
        scheduler.registerHand(makeManifest())

        const exec1 = scheduler.startExecution("test-hand")
        exec1.complete("Run 1", "completed")

        const exec2 = scheduler.startExecution("test-hand")
        exec2.complete("Run 2", "completed")

        const history = scheduler.getExecutionHistory("test-hand")
        expect(history.length).toBe(2)
    })

    it("gets last execution", () => {
        scheduler.registerHand(makeManifest())

        const exec1 = scheduler.startExecution("test-hand")
        exec1.complete("Run 1", "completed")

        const last = scheduler.getLastExecution("test-hand")
        expect(last).not.toBeNull()
        expect(last!.output).toBe("Run 1")
    })

    it("returns null for no execution history", () => {
        expect(scheduler.getLastExecution("nonexistent")).toBeNull()
    })

    it("tracks metrics correctly", () => {
        scheduler.registerHand(makeManifest({ id: "hand-a" }))
        scheduler.registerHand(makeManifest({ id: "hand-b" }))

        const m = scheduler.getMetrics()
        expect(m.totalHands).toBe(2)
        expect(m.activeHands).toBe(2)
    })

    it("resets state", () => {
        scheduler.registerHand(makeManifest())
        scheduler.startExecution("test-hand").complete("Done", "completed")
        scheduler.reset()

        expect(scheduler.listHands()).toHaveLength(0)
        expect(scheduler.getMetrics().totalExecutions).toBe(0)
    })

    it("throws for unknown hand execution", () => {
        expect(() => scheduler.startExecution("nonexistent")).toThrow("Hand not found")
    })

    it("interval trigger respects elapsed time", () => {
        scheduler.registerHand(makeManifest({
            id: "interval-hand",
            trigger: { type: "interval", intervalMs: 60000 },  // 1 minute
        }))

        // First check — no executions yet, should be scheduled
        const first = scheduler.getScheduledHands()
        expect(first.length).toBe(1)

        // Record an execution
        const exec = scheduler.startExecution("interval-hand")
        exec.complete("Done", "completed")

        // Immediately after — should NOT be scheduled
        const immediate = scheduler.getScheduledHands(new Date())
        expect(immediate.length).toBe(0)
    })
})

// ── Built-in Templates ─────────────────────────────────────────────────────

describe("built-in hand templates", () => {
    it("creates valid security scan hand", () => {
        const hand = createSecurityScanHand("my-project")
        const result = validateManifest(hand)
        expect(result.valid).toBe(true)
        expect(hand.trigger.type).toBe("cron")
    })

    it("creates valid dependency audit hand", () => {
        const hand = createDependencyAuditHand("my-project")
        const result = validateManifest(hand)
        expect(result.valid).toBe(true)
        expect(hand.trigger.type).toBe("cron")
    })
})
