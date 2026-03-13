import { describe, test, expect } from "bun:test"
import {
    ContextBudget,
    createContextBudget,
    estimateTokens,
    truncateToTokenBudget,
    InjectionPriority,
} from "./context-budget"

describe("estimateTokens", () => {
    test("empty string returns 0", () => {
        expect(estimateTokens("")).toBe(0)
    })

    test("estimates tokens as chars/4 (rounded up)", () => {
        expect(estimateTokens("abcd")).toBe(1) // 4 chars / 4 = 1
        expect(estimateTokens("abcde")).toBe(2) // 5 chars / 4 = 1.25 → 2
        expect(estimateTokens("a".repeat(100))).toBe(25)
    })
})

describe("truncateToTokenBudget", () => {
    test("returns text unchanged if within budget", () => {
        const text = "hello world" // 11 chars = ~3 tokens
        expect(truncateToTokenBudget(text, 10)).toBe(text)
    })

    test("truncates and adds indicator when over budget", () => {
        const text = "a".repeat(100) // 25 tokens
        const result = truncateToTokenBudget(text, 5) // 5 tokens = 20 chars
        expect(result.length).toBeLessThan(100)
        expect(result).toContain("[Truncated to fit context budget]")
    })
})

describe("ContextBudget", () => {
    const SESSION = "test-session"

    test("creates with default limit", () => {
        const budget = createContextBudget()
        expect(budget.getContextLimit()).toBe(128_000)
    })

    test("creates with custom limit", () => {
        const budget = createContextBudget(32_000)
        expect(budget.getContextLimit()).toBe(32_000)
    })

    test("injection budget is 40% of context limit", () => {
        const budget = createContextBudget(100_000)
        expect(budget.getInjectionBudget()).toBe(40_000)
    })

    test("remaining starts at full injection budget", () => {
        const budget = createContextBudget(100_000)
        expect(budget.getRemaining(SESSION)).toBe(40_000)
    })

    test("setContextLimit updates budget", () => {
        const budget = createContextBudget(100_000)
        budget.setContextLimit(200_000)
        expect(budget.getContextLimit()).toBe(200_000)
        expect(budget.getInjectionBudget()).toBe(80_000)
    })

    describe("requestAllocation", () => {
        test("CRITICAL always allowed, not tracked", () => {
            const budget = createContextBudget(1_000) // Very small budget
            // Fill budget first
            budget.recordInjection("other", 500, SESSION)
            const result = budget.requestAllocation("critical-hook", InjectionPriority.CRITICAL, 10_000, SESSION)
            expect(result.allowed).toBe(true)
            expect(result.maxTokens).toBe(10_000)
        })

        test("HIGH allowed when budget available", () => {
            const budget = createContextBudget(100_000)
            const result = budget.requestAllocation("rules", InjectionPriority.HIGH, 5_000, SESSION)
            expect(result.allowed).toBe(true)
            expect(result.maxTokens).toBe(5_000)
        })

        test("HIGH truncated to remaining when near limit", () => {
            const budget = createContextBudget(100_000) // 40K injection budget
            budget.recordInjection("other", 38_000, SESSION) // 2K remaining
            const result = budget.requestAllocation("rules", InjectionPriority.HIGH, 5_000, SESSION)
            expect(result.allowed).toBe(true)
            expect(result.maxTokens).toBe(2_000) // capped to remaining
        })

        test("LOW skipped when budget > 80%", () => {
            const budget = createContextBudget(100_000) // 40K injection budget
            budget.recordInjection("other", 33_000, SESSION) // 82.5% used
            const result = budget.requestAllocation("readme", InjectionPriority.LOW, 2_000, SESSION)
            expect(result.allowed).toBe(false)
        })

        test("LOW allowed when budget < 80%", () => {
            const budget = createContextBudget(100_000) // 40K
            budget.recordInjection("other", 20_000, SESSION) // 50% used
            const result = budget.requestAllocation("readme", InjectionPriority.LOW, 2_000, SESSION)
            expect(result.allowed).toBe(true)
        })

        test("OPTIONAL skipped when budget > 60%", () => {
            const budget = createContextBudget(100_000) // 40K
            budget.recordInjection("other", 25_000, SESSION) // 62.5% used
            const result = budget.requestAllocation("memory", InjectionPriority.OPTIONAL, 1_000, SESSION)
            expect(result.allowed).toBe(false)
        })

        test("MEDIUM truncated when budget > 60%", () => {
            const budget = createContextBudget(100_000) // 40K
            budget.recordInjection("other", 30_000, SESSION) // 75% used, 10K remaining
            const result = budget.requestAllocation("todo", InjectionPriority.MEDIUM, 8_000, SESSION)
            expect(result.allowed).toBe(true)
            expect(result.maxTokens).toBe(5_000) // 50% of 10K remaining
        })

        test("no budget remaining denies all except CRITICAL", () => {
            const budget = createContextBudget(100_000) // 40K
            budget.recordInjection("other", 40_000, SESSION) // 100% used
            expect(budget.requestAllocation("rules", InjectionPriority.HIGH, 100, SESSION).allowed).toBe(false)
            expect(budget.requestAllocation("readme", InjectionPriority.LOW, 100, SESSION).allowed).toBe(false)
            expect(budget.requestAllocation("sys", InjectionPriority.CRITICAL, 100, SESSION).allowed).toBe(true)
        })
    })

    describe("recordInjection", () => {
        test("reduces remaining budget", () => {
            const budget = createContextBudget(100_000) // 40K
            budget.recordInjection("hook-a", 10_000, SESSION)
            expect(budget.getRemaining(SESSION)).toBe(30_000)
            budget.recordInjection("hook-b", 5_000, SESSION)
            expect(budget.getRemaining(SESSION)).toBe(25_000)
        })

        test("accumulates per hook", () => {
            const budget = createContextBudget(100_000)
            budget.recordInjection("hook-a", 1_000, SESSION)
            budget.recordInjection("hook-a", 2_000, SESSION)
            expect(budget.getRemaining(SESSION)).toBe(37_000)
        })
    })

    describe("resetSession", () => {
        test("resets budget for a specific session", () => {
            const budget = createContextBudget(100_000) // 40K
            budget.recordInjection("hook-a", 30_000, SESSION)
            expect(budget.getRemaining(SESSION)).toBe(10_000)

            budget.resetSession(SESSION)
            expect(budget.getRemaining(SESSION)).toBe(40_000)
        })

        test("does not affect other sessions", () => {
            const budget = createContextBudget(100_000)
            budget.recordInjection("hook", 10_000, "session-1")
            budget.recordInjection("hook", 20_000, "session-2")

            budget.resetSession("session-1")
            expect(budget.getRemaining("session-1")).toBe(40_000)
            expect(budget.getRemaining("session-2")).toBe(20_000)
        })
    })

    describe("getUsageRatio", () => {
        test("returns 0 for fresh session", () => {
            const budget = createContextBudget(100_000)
            expect(budget.getUsageRatio(SESSION)).toBe(0)
        })

        test("returns correct ratio", () => {
            const budget = createContextBudget(100_000) // 40K
            budget.recordInjection("hook", 20_000, SESSION)
            expect(budget.getUsageRatio(SESSION)).toBe(0.5)
        })
    })
})
