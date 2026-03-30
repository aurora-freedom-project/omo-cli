import { describe, it, expect } from "bun:test"
import {
    escalate,
    getCurrentTier,
    shouldEscalate,
    getRouteState,
    resetRoute,
    getModelForTier,
    formatRouteInfo,
} from "./index"

describe("PAL Router", () => {
    describe("getCurrentTier", () => {
        it("defaults to tier 1", () => {
            expect(getCurrentTier("pal-test-1")).toBe(1)
        })
    })

    describe("escalate", () => {
        it("escalates from tier 1 to tier 2", () => {
            const session = "pal-esc-1"
            resetRoute(session)
            const result = escalate(session, "task-1", "agent_blocked")
            expect(result).toBe(2)
            expect(getCurrentTier(session)).toBe(2)
        })

        it("escalates from tier 2 to tier 3", () => {
            const session = "pal-esc-2"
            resetRoute(session)
            escalate(session, "task-1", "blocked")
            const result = escalate(session, "task-2", "context_overflow")
            expect(result).toBe(3)
        })

        it("returns null at max tier", () => {
            const session = "pal-esc-3"
            resetRoute(session)
            escalate(session, "t1", "r1")
            escalate(session, "t2", "r2")
            const result = escalate(session, "t3", "r3")
            expect(result).toBeNull()
        })

        it("respects max escalations limit", () => {
            const session = "pal-esc-4"
            resetRoute(session)
            escalate(session, "t1", "r1", { maxEscalations: 1 })
            const result = escalate(session, "t2", "r2", { maxEscalations: 1 })
            expect(result).toBeNull()
        })

        it("records history", () => {
            const session = "pal-esc-5"
            resetRoute(session)
            escalate(session, "task-abc", "loop_detected")
            const state = getRouteState(session)
            expect(state.history.length).toBe(1)
            expect(state.history[0].fromTier).toBe(1)
            expect(state.history[0].toTier).toBe(2)
            expect(state.history[0].reason).toBe("loop_detected")
            expect(state.history[0].taskId).toBe("task-abc")
        })
    })

    describe("shouldEscalate", () => {
        it("triggers on agent_blocked", () => {
            expect(shouldEscalate("agent_blocked")).toBe(true)
        })

        it("triggers on context_overflow", () => {
            expect(shouldEscalate("context_overflow")).toBe(true)
        })

        it("triggers on drift_unrecoverable", () => {
            expect(shouldEscalate("drift_unrecoverable")).toBe(true)
        })

        it("triggers on low confidence", () => {
            expect(shouldEscalate("unknown_error", 0.2)).toBe(true)
        })

        it("does NOT trigger on normal failure with ok confidence", () => {
            expect(shouldEscalate("task failed normally", 0.6)).toBe(false)
        })
    })

    describe("getModelForTier", () => {
        it("returns tier name", () => {
            expect(getModelForTier(1)).toBe("fast")
            expect(getModelForTier(2)).toBe("standard")
            expect(getModelForTier(3)).toBe("heavy")
        })

        it("respects custom tiers", () => {
            expect(getModelForTier(1, { tiers: { 1: "gpt-4o-mini", 2: "gpt-4o", 3: "o1" } })).toBe("gpt-4o-mini")
        })
    })

    describe("formatRouteInfo", () => {
        it("formats basic route info", () => {
            const session = "pal-fmt-1"
            resetRoute(session)
            const info = formatRouteInfo(session)
            expect(info).toContain("Tier 1")
            expect(info).toContain("Escalations: 0/")
        })
    })

    describe("resetRoute", () => {
        it("resets to clean state", () => {
            const session = "pal-reset-1"
            escalate(session, "t1", "r1")
            expect(getCurrentTier(session)).toBe(2)
            resetRoute(session)
            expect(getCurrentTier(session)).toBe(1)
        })
    })
})
