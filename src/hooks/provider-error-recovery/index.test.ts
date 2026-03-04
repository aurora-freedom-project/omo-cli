import { describe, it, expect } from "bun:test"
import {
    parseProviderError,
    isRetryable,
    calculateBackoff,
    buildToastMessage,
} from "./index"

describe("provider-error-recovery", () => {
    describe("parseProviderError", () => {
        it("parses error with explicit statusCode", () => {
            const result = parseProviderError({
                statusCode: 429,
                providerID: "anthropic",
                modelID: "claude-sonnet-4-5",
                message: "Rate limit exceeded",
            })
            expect(result).not.toBeNull()
            expect(result!.statusCode).toBe(429)
            expect(result!.providerID).toBe("anthropic")
            expect(result!.modelID).toBe("claude-sonnet-4-5")
        })

        it("parses error with status field", () => {
            const result = parseProviderError({
                status: 500,
                provider: "openai",
                message: "Internal server error",
            })
            expect(result!.statusCode).toBe(500)
            expect(result!.providerID).toBe("openai")
        })

        it("extracts status from message text", () => {
            const result = parseProviderError({
                message: "Request failed with HTTP 429: Too Many Requests",
            })
            expect(result!.statusCode).toBe(429)
        })

        it("returns null for non-HTTP errors", () => {
            const result = parseProviderError({ message: "Network timeout" })
            expect(result).toBeNull()
        })

        it("parses Retry-After header", () => {
            const result = parseProviderError({
                statusCode: 429,
                providerID: "anthropic",
                message: "Rate limited",
                retryAfter: 30,
            })
            expect(result!.retryAfter).toBe(30)
        })

        it("parses string Retry-After", () => {
            const result = parseProviderError({
                statusCode: 429,
                providerID: "anthropic",
                message: "Rate limited",
                retryAfter: "15",
            })
            expect(result!.retryAfter).toBe(15)
        })
    })

    describe("isRetryable", () => {
        it("429 is retryable", () => expect(isRetryable(429)).toBe(true))
        it("500 is retryable", () => expect(isRetryable(500)).toBe(true))
        it("502 is retryable", () => expect(isRetryable(502)).toBe(true))
        it("503 is retryable", () => expect(isRetryable(503)).toBe(true))
        it("400 is NOT retryable", () => expect(isRetryable(400)).toBe(false))
        it("401 is NOT retryable", () => expect(isRetryable(401)).toBe(false))
        it("403 is NOT retryable", () => expect(isRetryable(403)).toBe(false))
        it("404 is NOT retryable", () => expect(isRetryable(404)).toBe(false))
        it("422 is NOT retryable", () => expect(isRetryable(422)).toBe(false))
    })

    describe("calculateBackoff", () => {
        it("uses Retry-After when provided", () => {
            const delay = calculateBackoff(0, 10)
            expect(delay).toBe(10_000) // 10 seconds
        })

        it("caps Retry-After at max delay", () => {
            const delay = calculateBackoff(0, 60)
            expect(delay).toBeLessThanOrEqual(30_000)
        })

        it("exponential backoff increases with attempts", () => {
            const delay0 = calculateBackoff(0)
            const delay1 = calculateBackoff(1)
            const delay2 = calculateBackoff(2)
            // Should generally increase (some jitter variation)
            expect(delay2).toBeGreaterThanOrEqual(delay0)
        })

        it("never exceeds max delay", () => {
            for (let i = 0; i < 10; i++) {
                expect(calculateBackoff(i)).toBeLessThanOrEqual(30_000)
            }
        })
    })

    describe("buildToastMessage", () => {
        it("builds rate limit message", () => {
            const toast = buildToastMessage(
                { statusCode: 429, providerID: "anthropic", message: "Rate limited" },
                { attempts: 1, lastErrorTime: Date.now(), backoffMs: 5000 },
            )
            expect(toast.title).toContain("429")
            expect(toast.title).toContain("Rate Limited")
            expect(toast.message).toContain("anthropic")
            expect(toast.message).toContain("retrying")
        })

        it("builds server error message", () => {
            const toast = buildToastMessage(
                { statusCode: 500, providerID: "openai", message: "Internal error" },
                { attempts: 2, lastErrorTime: Date.now(), backoffMs: 8000 },
            )
            expect(toast.title).toContain("500")
            expect(toast.title).toContain("Server Error")
        })

        it("builds non-retryable error message", () => {
            const toast = buildToastMessage(
                { statusCode: 401, providerID: "anthropic", message: "Unauthorized" },
                { attempts: 0, lastErrorTime: 0, backoffMs: 0 },
            )
            expect(toast.title).toContain("401")
            expect(toast.title).toContain("⛔")
        })

        it("includes model in message when available", () => {
            const toast = buildToastMessage(
                { statusCode: 429, providerID: "anthropic", modelID: "claude-sonnet-4-5", message: "Limited" },
                { attempts: 1, lastErrorTime: Date.now(), backoffMs: 3000 },
            )
            expect(toast.message).toContain("claude-sonnet-4-5")
        })
    })
})
