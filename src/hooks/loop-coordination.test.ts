import { describe, it, expect, beforeEach } from "bun:test"
import {
    markRalphLoopActive,
    clearRalphLoopActive,
    isRalphLoopActive,
    markCompactionActive,
    clearCompactionActive,
    isCompactionActive,
    isCompactionCooldown,
    acquireInjectionLock,
    releaseInjectionLock,
    canInject,
    cleanupSession,
} from "./loop-coordination"

describe("loop-coordination", () => {
    const SESSION_A = "ses_aaa"
    const SESSION_B = "ses_bbb"

    beforeEach(() => {
        // Clean up both sessions before each test
        cleanupSession(SESSION_A)
        cleanupSession(SESSION_B)
    })

    describe("ralph-loop state", () => {
        it("should track active ralph-loop sessions", () => {
            expect(isRalphLoopActive(SESSION_A)).toBe(false)
            markRalphLoopActive(SESSION_A)
            expect(isRalphLoopActive(SESSION_A)).toBe(true)
            expect(isRalphLoopActive(SESSION_B)).toBe(false)
        })

        it("should clear ralph-loop state", () => {
            markRalphLoopActive(SESSION_A)
            clearRalphLoopActive(SESSION_A)
            expect(isRalphLoopActive(SESSION_A)).toBe(false)
        })
    })

    describe("compaction state", () => {
        it("should track compaction in progress", () => {
            expect(isCompactionActive(SESSION_A)).toBe(false)
            markCompactionActive(SESSION_A)
            expect(isCompactionActive(SESSION_A)).toBe(true)
        })

        it("should clear compaction and start cooldown", () => {
            markCompactionActive(SESSION_A)
            clearCompactionActive(SESSION_A)
            expect(isCompactionActive(SESSION_A)).toBe(false)
            expect(isCompactionCooldown(SESSION_A)).toBe(true)
        })

        it("should not report cooldown if never compacted", () => {
            expect(isCompactionCooldown(SESSION_A)).toBe(false)
        })
    })

    describe("injection lock", () => {
        it("should allow first hook to acquire lock", () => {
            expect(acquireInjectionLock(SESSION_A, "ralph-loop")).toBe(true)
        })

        it("should deny second hook if lock is held", () => {
            acquireInjectionLock(SESSION_A, "ralph-loop")
            expect(acquireInjectionLock(SESSION_A, "todo-continuation")).toBe(false)
        })

        it("should allow same hook to re-acquire", () => {
            acquireInjectionLock(SESSION_A, "ralph-loop")
            expect(acquireInjectionLock(SESSION_A, "ralph-loop")).toBe(true)
        })

        it("should allow lock after release", () => {
            acquireInjectionLock(SESSION_A, "ralph-loop")
            releaseInjectionLock(SESSION_A, "ralph-loop")
            expect(acquireInjectionLock(SESSION_A, "todo-continuation")).toBe(true)
        })

        it("should not release if not the holder", () => {
            acquireInjectionLock(SESSION_A, "ralph-loop")
            releaseInjectionLock(SESSION_A, "todo-continuation") // wrong holder
            expect(acquireInjectionLock(SESSION_A, "todo-continuation")).toBe(false) // still locked
        })

        it("should be per-session", () => {
            acquireInjectionLock(SESSION_A, "ralph-loop")
            expect(acquireInjectionLock(SESSION_B, "todo-continuation")).toBe(true)
        })
    })

    describe("canInject", () => {
        it("should allow injection when nothing is active", () => {
            const result = canInject(SESSION_A, "todo-continuation")
            expect(result.allowed).toBe(true)
        })

        it("should block during compaction", () => {
            markCompactionActive(SESSION_A)
            const result = canInject(SESSION_A, "ralph-loop")
            expect(result.allowed).toBe(false)
            expect(result.reason).toContain("compaction in progress")
        })

        it("should block during compaction cooldown", () => {
            markCompactionActive(SESSION_A)
            clearCompactionActive(SESSION_A) // starts cooldown
            const result = canInject(SESSION_A, "ralph-loop")
            expect(result.allowed).toBe(false)
            expect(result.reason).toContain("compaction cooldown")
        })

        it("should block non-ralph hooks when ralph-loop is active", () => {
            markRalphLoopActive(SESSION_A)
            const result = canInject(SESSION_A, "todo-continuation")
            expect(result.allowed).toBe(false)
            expect(result.reason).toContain("ralph-loop is active")
        })

        it("should allow ralph-loop even when ralph-loop is active", () => {
            markRalphLoopActive(SESSION_A)
            const result = canInject(SESSION_A, "ralph-loop")
            expect(result.allowed).toBe(true)
        })

        it("should block when injection lock is held by another hook", () => {
            acquireInjectionLock(SESSION_A, "navigator")
            const result = canInject(SESSION_A, "todo-continuation")
            expect(result.allowed).toBe(false)
            expect(result.reason).toContain("injection lock held")
        })

        it("should acquire lock on successful canInject", () => {
            const result = canInject(SESSION_A, "ralph-loop")
            expect(result.allowed).toBe(true)
            // Lock should now be held
            expect(acquireInjectionLock(SESSION_A, "todo-continuation")).toBe(false)
        })

        it("compaction blocks should take priority", () => {
            markCompactionActive(SESSION_A)
            markRalphLoopActive(SESSION_A)
            const result = canInject(SESSION_A, "ralph-loop")
            expect(result.allowed).toBe(false)
            expect(result.reason).toContain("compaction")
        })
    })

    describe("cleanupSession", () => {
        it("should clean up all state for a session", () => {
            markRalphLoopActive(SESSION_A)
            markCompactionActive(SESSION_A)
            acquireInjectionLock(SESSION_A, "ralph-loop")

            cleanupSession(SESSION_A)

            expect(isRalphLoopActive(SESSION_A)).toBe(false)
            expect(isCompactionActive(SESSION_A)).toBe(false)
            expect(acquireInjectionLock(SESSION_A, "any-hook")).toBe(true)
        })

        it("should not affect other sessions", () => {
            markRalphLoopActive(SESSION_A)
            markRalphLoopActive(SESSION_B)

            cleanupSession(SESSION_A)

            expect(isRalphLoopActive(SESSION_A)).toBe(false)
            expect(isRalphLoopActive(SESSION_B)).toBe(true)
        })
    })
})
