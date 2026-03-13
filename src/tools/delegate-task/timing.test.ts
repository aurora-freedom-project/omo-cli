import { describe, test, expect, afterEach } from "bun:test"
import { getTimingConfig, __resetTimingConfig, __setTimingConfig } from "./timing"

describe("timing", () => {
    afterEach(() => {
        __resetTimingConfig()
    })

    describe("getTimingConfig", () => {
        test("returns default config", () => {
            // #given / #when
            const config = getTimingConfig()

            // #then
            expect(config.POLL_INTERVAL_MS).toBe(500)
            expect(config.MIN_STABILITY_TIME_MS).toBe(10000)
            expect(config.STABILITY_POLLS_REQUIRED).toBe(3)
            expect(config.WAIT_FOR_SESSION_INTERVAL_MS).toBe(100)
            expect(config.WAIT_FOR_SESSION_TIMEOUT_MS).toBe(30000)
            expect(config.MAX_POLL_TIME_MS).toBe(10 * 60 * 1000)
            expect(config.SESSION_CONTINUATION_STABILITY_MS).toBe(5000)
        })

        test("config object is frozen (immutable)", () => {
            // #given
            const config = getTimingConfig()

            // #when / #then
            expect(() => {
                ; (config as unknown as Record<string, number>).POLL_INTERVAL_MS = 999
            }).toThrow()
        })
    })

    describe("__setTimingConfig", () => {
        test("overrides specific fields", () => {
            // #given / #when
            __setTimingConfig({ POLL_INTERVAL_MS: 100 })

            // #then
            const config = getTimingConfig()
            expect(config.POLL_INTERVAL_MS).toBe(100)
            // Other fields unchanged
            expect(config.MIN_STABILITY_TIME_MS).toBe(10000)
        })

        test("overrides multiple fields at once", () => {
            // #given / #when
            __setTimingConfig({
                POLL_INTERVAL_MS: 50,
                MAX_POLL_TIME_MS: 5000,
                STABILITY_POLLS_REQUIRED: 1,
            })

            // #then
            const config = getTimingConfig()
            expect(config.POLL_INTERVAL_MS).toBe(50)
            expect(config.MAX_POLL_TIME_MS).toBe(5000)
            expect(config.STABILITY_POLLS_REQUIRED).toBe(1)
        })

        test("overridden config is also frozen", () => {
            // #given
            __setTimingConfig({ POLL_INTERVAL_MS: 100 })
            const config = getTimingConfig()

            // #when / #then
            expect(() => {
                ; (config as unknown as Record<string, number>).POLL_INTERVAL_MS = 999
            }).toThrow()
        })
    })

    describe("__resetTimingConfig", () => {
        test("restores defaults after overrides", () => {
            // #given
            __setTimingConfig({ POLL_INTERVAL_MS: 1, MAX_POLL_TIME_MS: 1 })
            expect(getTimingConfig().POLL_INTERVAL_MS).toBe(1)

            // #when
            __resetTimingConfig()

            // #then
            const config = getTimingConfig()
            expect(config.POLL_INTERVAL_MS).toBe(500)
            expect(config.MAX_POLL_TIME_MS).toBe(10 * 60 * 1000)
        })
    })
})
