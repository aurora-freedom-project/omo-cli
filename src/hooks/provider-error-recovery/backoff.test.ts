import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import {
    calculateBackoff,
    calculateBackoffEffect,
    generateBackoffSequence,
    formatDelay,
    calculateTotalDelay,
} from "./backoff"
import type { RetryStrategy } from "./types"

const defaultStrategy: RetryStrategy = {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    jitterMaxMs: 1000,
    retryableStatuses: new Set([429, 500, 502, 503, 504]),
}

describe("provider-error-recovery/backoff", () => {
    describe("calculateBackoff", () => {
        test("uses retryAfterSeconds when provided", () => {
            // #given
            const options = { attempt: 0, retryAfterSeconds: 5, strategy: defaultStrategy }

            // #when
            const delay = calculateBackoff(options)

            // #then — retryAfter = 5s = 5000ms, capped at max 30000ms
            expect(delay).toBe(5000)
        })

        test("caps retryAfterSeconds at maxDelayMs", () => {
            // #given
            const options = { attempt: 0, retryAfterSeconds: 60, strategy: defaultStrategy }

            // #when
            const delay = calculateBackoff(options)

            // #then — 60s = 60000ms, capped at 30000ms
            expect(delay).toBe(30000)
        })

        test("returns delay capped at maxDelayMs for high attempts", () => {
            // #given — attempt 10 would give 2000 * 2^10 = 2048000ms
            const options = { attempt: 10, strategy: defaultStrategy }

            // #when
            const delay = calculateBackoff(options)

            // #then — capped at 30000ms
            expect(delay).toBeLessThanOrEqual(30000)
        })

        test("returns non-negative delay for first attempt", () => {
            // #given
            const options = { attempt: 0, strategy: defaultStrategy }

            // #when
            const delay = calculateBackoff(options)

            // #then
            expect(delay).toBeGreaterThanOrEqual(0)
            expect(delay).toBeLessThanOrEqual(defaultStrategy.maxDelayMs)
        })

        test("delay generally increases with attempts (probabilistic)", () => {
            // #given — run multiple times to get average
            const samples = 20
            let sum0 = 0, sum3 = 0

            // #when
            for (let i = 0; i < samples; i++) {
                sum0 += calculateBackoff({ attempt: 0, strategy: defaultStrategy })
                sum3 += calculateBackoff({ attempt: 3, strategy: defaultStrategy })
            }

            // #then — average of attempt 3 should be higher than attempt 0
            expect(sum3 / samples).toBeGreaterThan(sum0 / samples)
        })
    })

    describe("calculateBackoffEffect", () => {
        test("succeeds for valid attempt", () => {
            // #given / #when
            const result = Effect.runSync(calculateBackoffEffect(0))

            // #then
            expect(typeof result).toBe("number")
            expect(result).toBeGreaterThanOrEqual(0)
        })

        test("fails for negative attempt", () => {
            // #given / #when / #then
            expect(() => Effect.runSync(calculateBackoffEffect(-1))).toThrow()
        })

        test("fails for negative retryAfterSeconds", () => {
            // #given / #when / #then
            expect(() => Effect.runSync(calculateBackoffEffect(0, -5))).toThrow()
        })

        test("succeeds with retryAfterSeconds", () => {
            // #given / #when
            const result = Effect.runSync(calculateBackoffEffect(0, 3))

            // #then
            expect(result).toBe(3000)
        })
    })

    describe("generateBackoffSequence", () => {
        test("generates correct number of delays", () => {
            // #given / #when
            const sequence = generateBackoffSequence(5, defaultStrategy)

            // #then
            expect(sequence).toHaveLength(5)
        })

        test("all delays are within bounds", () => {
            // #given / #when
            const sequence = generateBackoffSequence(5, defaultStrategy)

            // #then
            for (const delay of sequence) {
                expect(delay).toBeGreaterThanOrEqual(0)
                expect(delay).toBeLessThanOrEqual(defaultStrategy.maxDelayMs)
            }
        })

        test("returns empty for 0 retries", () => {
            // #given / #when
            const sequence = generateBackoffSequence(0, defaultStrategy)

            // #then
            expect(sequence).toHaveLength(0)
        })
    })

    describe("formatDelay", () => {
        test("formats milliseconds", () => {
            // #given / #when / #then
            expect(formatDelay(500)).toBe("500ms")
        })

        test("formats seconds", () => {
            // #given / #when / #then
            expect(formatDelay(2000)).toBe("2s")
            expect(formatDelay(30000)).toBe("30s")
        })

        test("formats minutes and seconds", () => {
            // #given / #when / #then
            expect(formatDelay(90000)).toBe("1m 30s")
        })

        test("formats exact minutes", () => {
            // #given / #when / #then
            expect(formatDelay(120000)).toBe("2m")
        })
    })

    describe("calculateTotalDelay", () => {
        test("returns sum of all delays", () => {
            // #given / #when
            const total = calculateTotalDelay(3, defaultStrategy)

            // #then
            expect(total).toBeGreaterThan(0)
            expect(total).toBeLessThanOrEqual(3 * defaultStrategy.maxDelayMs)
        })

        test("returns 0 for 0 retries", () => {
            // #given / #when
            const total = calculateTotalDelay(0, defaultStrategy)

            // #then
            expect(total).toBe(0)
        })
    })
})
