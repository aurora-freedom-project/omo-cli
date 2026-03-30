import { describe, test, expect, mock, beforeEach } from "bun:test"
import { createPreflightSkillInjectorHook } from "./index"

// Mock dependencies
mock.module("../../shared/skills-brain-query", () => ({
    hybridSkillSearch: mock(),
    isBrainReachable: mock(),
}))

mock.module("../../features/claude-code-session-state", () => ({
    subagentSessions: new Set<string>(),
}))

// Lazy-import so mocks apply
const { hybridSkillSearch, isBrainReachable } = await import("../../shared/skills-brain-query")
const { subagentSessions } = await import("../../features/claude-code-session-state")

const mockShowToast = mock(() => Promise.resolve())
const mockCtx = {
    client: {
        tui: { showToast: mockShowToast },
    },
    directory: "/test/dir",
} as any

describe("preflight-skill-injector", () => {
    beforeEach(() => {
        ;(hybridSkillSearch as any).mockReset()
        ;(isBrainReachable as any).mockReset()
        ;(isBrainReachable as any).mockResolvedValue(true)
        mockShowToast.mockClear()
        subagentSessions.clear()
    })

    // ────────────────────────── Guard Tests ──────────────────────────

    test("returns null when preflight_skills is not enabled", () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, undefined)
        expect(hook).toBeNull()
    })

    test("returns null when preflight_skills is explicitly false", () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: false })
        expect(hook).toBeNull()
    })

    test("returns hook object when preflight_skills is true", () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })
        expect(hook).not.toBeNull()
        expect(hook!["chat.message"]).toBeInstanceOf(Function)
        expect(hook!.clearSession).toBeInstanceOf(Function)
    })

    test("skips assistant messages", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        const output = { message: { role: "assistant" }, parts: [] }
        await hook["chat.message"]({ sessionID: "s1" }, output)
        expect(hybridSkillSearch).not.toHaveBeenCalled()
    })

    test("skips short prompts (< 15 chars)", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        const output = { message: { role: "user" }, parts: [{ type: "text", text: "fix this" }] }
        await hook["chat.message"]({ sessionID: "s2" }, output)
        expect(hybridSkillSearch).not.toHaveBeenCalled()
    })

    test("skips subagent/background sessions", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        subagentSessions.add("bg-session")
        const output = {
            message: { role: "user" },
            parts: [{ type: "text", text: "how do I configure AWS S3 buckets in NodeJS?" }],
        }
        await hook["chat.message"]({ sessionID: "bg-session" }, output)
        expect(hybridSkillSearch).not.toHaveBeenCalled()
    })

    // ────────────────────────── Happy Path ──────────────────────────

    test("injects skills when prompt is long enough and brain returns results", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        ;(hybridSkillSearch as any).mockResolvedValue([
            { name: "aws-s3-skill", description: "S3 configuration", content: "## S3 Guide\nUse aws-sdk..." },
        ])

        const initialText = "how do I configure AWS S3 buckets in NodeJS?"
        const output = {
            message: { role: "user" },
            parts: [{ type: "text", text: initialText }],
        }

        await hook["chat.message"]({ sessionID: "s3" }, output)

        expect(hybridSkillSearch).toHaveBeenCalledWith(expect.any(String), undefined, 2)
        expect(mockShowToast).toHaveBeenCalledTimes(1)

        // Assert modified text
        expect(output.parts[0].text).toContain("<injected_skills>")
        expect(output.parts[0].text).toContain("aws-s3-skill")
        // Original text must be preserved at the end
        expect(output.parts[0].text).toContain(initialText)
    })

    // ────────────────────────── Once-per-session ──────────────────────────

    test("only injects once per session (idempotent)", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        ;(hybridSkillSearch as any).mockResolvedValue([
            { name: "test-skill", description: "Test", content: "content" },
        ])

        const longText = "how do I configure AWS S3 buckets in NodeJS?"

        // First call: should inject
        const o1 = { message: { role: "user" }, parts: [{ type: "text", text: longText }] }
        await hook["chat.message"]({ sessionID: "s4" }, o1)
        expect(hybridSkillSearch).toHaveBeenCalledTimes(1)

        // Second call same session: should NOT inject again
        const o2 = { message: { role: "user" }, parts: [{ type: "text", text: "another long prompt for testing" }] }
        await hook["chat.message"]({ sessionID: "s4" }, o2)
        expect(hybridSkillSearch).toHaveBeenCalledTimes(1)

        // Different session: should inject
        const o3 = { message: { role: "user" }, parts: [{ type: "text", text: longText }] }
        await hook["chat.message"]({ sessionID: "s5" }, o3)
        expect(hybridSkillSearch).toHaveBeenCalledTimes(2)
    })

    // ────────────────────────── clearSession ──────────────────────────

    test("clearSession allows re-injection for that session", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        ;(hybridSkillSearch as any).mockResolvedValue([
            { name: "test-skill", description: "Test", content: "content" },
        ])

        const longText = "how do I configure AWS S3 buckets in NodeJS?"

        // First call
        const o1 = { message: { role: "user" }, parts: [{ type: "text", text: longText }] }
        await hook["chat.message"]({ sessionID: "s6" }, o1)
        expect(hybridSkillSearch).toHaveBeenCalledTimes(1)

        // Clear session tracking
        hook.clearSession("s6")

        // Should inject again after clearing
        const o2 = { message: { role: "user" }, parts: [{ type: "text", text: longText }] }
        await hook["chat.message"]({ sessionID: "s6" }, o2)
        expect(hybridSkillSearch).toHaveBeenCalledTimes(2)
    })

    // ────────────────────────── Error Resilience ──────────────────────────

    test("gracefully handles hybridSkillSearch failure", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        ;(hybridSkillSearch as any).mockRejectedValue(new Error("DB connection failed"))

        const longText = "how do I configure AWS S3 buckets in NodeJS?"
        const output = {
            message: { role: "user" },
            parts: [{ type: "text", text: longText }],
        }

        // Should NOT throw — error is caught internally
        await hook["chat.message"]({ sessionID: "s7" }, output)

        // Text should be unchanged (no injection)
        expect(output.parts[0].text).toBe(longText)
    })

    test("skips injection when brain is not reachable", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        ;(isBrainReachable as any).mockResolvedValue(false)

        const longText = "how do I configure AWS S3 buckets in NodeJS?"
        const output = {
            message: { role: "user" },
            parts: [{ type: "text", text: longText }],
        }

        await hook["chat.message"]({ sessionID: "s8" }, output)
        expect(hybridSkillSearch).not.toHaveBeenCalled()
    })

    test("does nothing when search returns empty results", async () => {
        const hook = createPreflightSkillInjectorHook(mockCtx, { preflight_skills: true })!
        ;(hybridSkillSearch as any).mockResolvedValue([])

        const longText = "how do I configure AWS S3 buckets in NodeJS?"
        const output = {
            message: { role: "user" },
            parts: [{ type: "text", text: longText }],
        }

        await hook["chat.message"]({ sessionID: "s9" }, output)
        expect(output.parts[0].text).toBe(longText) // unchanged
    })

    // ────────────────────────── Context Budget ──────────────────────────

    test("respects context budget when provided", async () => {
        const mockBudget = {
            requestAllocation: mock(() => ({ allowed: false, maxTokens: 0 })),
            recordInjection: mock(),
        }
        const hook = createPreflightSkillInjectorHook(
            mockCtx,
            { preflight_skills: true },
            mockBudget as any,
        )!
        ;(hybridSkillSearch as any).mockResolvedValue([
            { name: "test-skill", description: "Test", content: "content" },
        ])

        const longText = "how do I configure AWS S3 buckets in NodeJS?"
        const output = {
            message: { role: "user" },
            parts: [{ type: "text", text: longText }],
        }

        await hook["chat.message"]({ sessionID: "s10" }, output)

        // Budget denied → text should be unchanged
        expect(output.parts[0].text).toBe(longText)
        expect(mockBudget.requestAllocation).toHaveBeenCalledTimes(1)
        expect(mockBudget.recordInjection).not.toHaveBeenCalled()
    })
})
