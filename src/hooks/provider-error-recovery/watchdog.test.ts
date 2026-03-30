/**
 * @module hooks/provider-error-recovery/watchdog.test
 *
 * Tests for the timeout watchdog manager.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from "bun:test"
import { WatchdogManager } from "./watchdog"

describe("WatchdogManager", () => {
    let timeouts: string[]
    let manager: WatchdogManager

    beforeEach(() => {
        timeouts = []
        manager = new WatchdogManager(
            (sessionID) => timeouts.push(sessionID),
            50 // 50ms timeout for fast tests
        )
    })

    afterEach(() => {
        manager.stopAll()
    })

    //#given a new watchdog manager
    it("should start with zero active watchdogs", () => {
        //#then
        expect(manager.activeCount).toBe(0)
    })

    //#given a started watchdog
    it("should track active sessions", () => {
        //#when
        manager.start("session-1")
        //#then
        expect(manager.activeCount).toBe(1)
        expect(manager.isActive("session-1")).toBe(true)
    })

    //#given a stopped watchdog
    it("should remove session on stop", () => {
        //#when
        manager.start("session-1")
        manager.stop("session-1")
        //#then
        expect(manager.activeCount).toBe(0)
        expect(manager.isActive("session-1")).toBe(false)
    })

    //#given multiple active watchdogs
    it("should stop all on stopAll", () => {
        //#when
        manager.start("s1")
        manager.start("s2")
        manager.start("s3")
        manager.stopAll()
        //#then
        expect(manager.activeCount).toBe(0)
    })

    //#given a watchdog that times out
    it("should fire callback on timeout", async () => {
        //#when
        manager.start("session-timeout")
        //#then
        await new Promise((resolve) => setTimeout(resolve, 80))
        expect(timeouts).toContain("session-timeout")
    })

    //#given a watchdog that is reset before timeout
    it("should not fire when reset in time", async () => {
        //#when
        manager.start("session-reset")
        await new Promise((resolve) => setTimeout(resolve, 30))
        manager.reset("session-reset")
        await new Promise((resolve) => setTimeout(resolve, 30))
        //#then — did not fire yet (total 60ms but reset at 30ms restarted the 50ms timer)
        expect(timeouts).not.toContain("session-reset")
        // Clean up
        manager.stop("session-reset")
    })

    //#given a watchdog that is stopped before timeout
    it("should not fire when stopped in time", async () => {
        //#when
        manager.start("session-stopped")
        await new Promise((resolve) => setTimeout(resolve, 20))
        manager.stop("session-stopped")
        await new Promise((resolve) => setTimeout(resolve, 60))
        //#then
        expect(timeouts).not.toContain("session-stopped")
    })

    //#given stopping a non-existent session
    it("should handle stopping non-existent session gracefully", () => {
        //#when & then — should not throw
        manager.stop("non-existent")
        expect(manager.activeCount).toBe(0)
    })

    //#given resetting a non-active session
    it("should ignore reset for non-active sessions", () => {
        //#when & then — should not start a new watchdog
        manager.reset("non-active")
        expect(manager.activeCount).toBe(0)
    })
})
