import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { pollForSessionCompletion, fetchLastAssistantMessage } from "./session-poller"
import { __setTimingConfig, __resetTimingConfig } from "./timing"

describe("session-poller", () => {
    beforeEach(() => {
        // Fast timings for tests
        __setTimingConfig({
            POLL_INTERVAL_MS: 10,
            MIN_STABILITY_TIME_MS: 20,
            STABILITY_POLLS_REQUIRED: 2,
            MAX_POLL_TIME_MS: 2000,
            SESSION_CONTINUATION_STABILITY_MS: 20,
            WAIT_FOR_SESSION_INTERVAL_MS: 10,
            WAIT_FOR_SESSION_TIMEOUT_MS: 500,
        })
    })

    afterEach(() => {
        __resetTimingConfig()
    })

    describe("pollForSessionCompletion", () => {
        test("detects stable message count and completes", async () => {
            // #given - messages stabilize at count 3
            let callCount = 0
            const mockClient = {
                session: {
                    messages: async () => {
                        callCount++
                        return { data: [{ id: 1 }, { id: 2 }, { id: 3 }] }
                    },
                    status: async () => ({ data: {} }),
                },
            } as any

            // #when
            const result = await pollForSessionCompletion({
                client: mockClient,
                sessionID: "test-session",
            })

            // #then
            expect(result.aborted).toBe(false)
            expect(result.timedOut).toBe(false)
            expect(callCount).toBeGreaterThanOrEqual(2) // needs STABILITY_POLLS_REQUIRED polls
        })

        test("returns aborted when abort signal fires", async () => {
            // #given
            const controller = new AbortController()
            const mockClient = {
                session: {
                    messages: async () => ({ data: [] }),
                    status: async () => ({ data: {} }),
                },
            } as any

            // Abort after a short delay
            setTimeout(() => controller.abort(), 30)

            // #when
            const result = await pollForSessionCompletion({
                client: mockClient,
                sessionID: "test-session",
                abort: controller.signal,
            })

            // #then
            expect(result.aborted).toBe(true)
            expect(result.timedOut).toBe(false)
        })

        test("times out when maxTimeMs exceeded", async () => {
            // #given - messages keep changing so stability never reached
            let count = 0
            const mockClient = {
                session: {
                    messages: async () => {
                        count++
                        return { data: Array(count).fill({ id: count }) }
                    },
                    status: async () => ({ data: {} }),
                },
            } as any

            // #when
            const result = await pollForSessionCompletion({
                client: mockClient,
                sessionID: "test-session",
                maxTimeMs: 200,
            })

            // #then
            expect(result.timedOut).toBe(true)
            expect(result.aborted).toBe(false)
        })

        test("waits for minimum stability time before checking", async () => {
            // #given - messages stable from the start, but MIN_STABILITY_TIME_MS must pass
            __setTimingConfig({
                POLL_INTERVAL_MS: 10,
                MIN_STABILITY_TIME_MS: 100,
                STABILITY_POLLS_REQUIRED: 1,
                MAX_POLL_TIME_MS: 5000,
                SESSION_CONTINUATION_STABILITY_MS: 20,
                WAIT_FOR_SESSION_INTERVAL_MS: 10,
                WAIT_FOR_SESSION_TIMEOUT_MS: 500,
            })

            const startTime = Date.now()
            const mockClient = {
                session: {
                    messages: async () => ({ data: [{ id: 1 }] }),
                    status: async () => ({ data: {} }),
                },
            } as any

            // #when
            const result = await pollForSessionCompletion({
                client: mockClient,
                sessionID: "test-session",
            })

            // #then
            const elapsed = Date.now() - startTime
            expect(result.aborted).toBe(false)
            expect(elapsed).toBeGreaterThanOrEqual(90) // approximately MIN_STABILITY_TIME_MS
        })

        test("checks session status when checkSessionStatus is true", async () => {
            // #given - session is busy for first call, then idle
            let statusCallCount = 0
            const mockClient = {
                session: {
                    messages: async () => ({ data: [{ id: 1 }] }),
                    status: async () => {
                        statusCallCount++
                        // First few calls: session is busy
                        if (statusCallCount <= 2) {
                            return { data: { "test-session": { type: "running" } } }
                        }
                        // Then idle
                        return { data: { "test-session": { type: "idle" } } }
                    },
                },
            } as any

            // #when
            const result = await pollForSessionCompletion({
                client: mockClient,
                sessionID: "test-session",
                checkSessionStatus: true,
            })

            // #then
            expect(result.aborted).toBe(false)
            expect(statusCallCount).toBeGreaterThanOrEqual(3)
        })

        test("skips session status check when checkSessionStatus is false", async () => {
            // #given
            let statusCallCount = 0
            const mockClient = {
                session: {
                    messages: async () => ({ data: [{ id: 1 }] }),
                    status: async () => {
                        statusCallCount++
                        return { data: {} }
                    },
                },
            } as any

            // #when
            const result = await pollForSessionCompletion({
                client: mockClient,
                sessionID: "test-session",
                checkSessionStatus: false,
            })

            // #then
            expect(result.aborted).toBe(false)
            expect(statusCallCount).toBe(0) // status() should never be called
        })

        test("uses custom minStabilityTimeMs when provided", async () => {
            // #given
            __setTimingConfig({
                POLL_INTERVAL_MS: 10,
                MIN_STABILITY_TIME_MS: 5000, // default is high
                STABILITY_POLLS_REQUIRED: 1,
                MAX_POLL_TIME_MS: 5000,
                SESSION_CONTINUATION_STABILITY_MS: 20,
                WAIT_FOR_SESSION_INTERVAL_MS: 10,
                WAIT_FOR_SESSION_TIMEOUT_MS: 500,
            })

            const startTime = Date.now()
            const mockClient = {
                session: {
                    messages: async () => ({ data: [{ id: 1 }] }),
                    status: async () => ({ data: {} }),
                },
            } as any

            // #when - override minStabilityTimeMs to something low
            const result = await pollForSessionCompletion({
                client: mockClient,
                sessionID: "test-session",
                minStabilityTimeMs: 50,
            })

            // #then - should complete much faster than the default 5000ms
            const elapsed = Date.now() - startTime
            expect(result.aborted).toBe(false)
            expect(elapsed).toBeLessThan(3000)
        })
    })

    describe("fetchLastAssistantMessage", () => {
        test("returns text from last assistant message", async () => {
            // #given
            const mockClient = {
                session: {
                    messages: async () => ({
                        data: [
                            { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
                            {
                                info: { role: "assistant", time: { created: 1000 } },
                                parts: [{ type: "text", text: "response A" }],
                            },
                            {
                                info: { role: "assistant", time: { created: 2000 } },
                                parts: [{ type: "text", text: "response B" }],
                            },
                        ],
                    }),
                },
            } as any

            // #when
            const result = await fetchLastAssistantMessage(mockClient, "test-session")

            // #then - should return the latest assistant message (created: 2000)
            expect(result.found).toBe(true)
            expect(result.text).toBe("response B")
        })

        test("returns reasoning parts for thinking models", async () => {
            // #given
            const mockClient = {
                session: {
                    messages: async () => ({
                        data: [
                            {
                                info: { role: "assistant", time: { created: 1000 } },
                                parts: [
                                    { type: "reasoning", text: "Let me think..." },
                                    { type: "text", text: "The answer is 42" },
                                ],
                            },
                        ],
                    }),
                },
            } as any

            // #when
            const result = await fetchLastAssistantMessage(mockClient, "test-session")

            // #then
            expect(result.found).toBe(true)
            expect(result.text).toContain("Let me think...")
            expect(result.text).toContain("The answer is 42")
        })

        test("returns found=false when no assistant messages", async () => {
            // #given
            const mockClient = {
                session: {
                    messages: async () => ({
                        data: [
                            { info: { role: "user" }, parts: [{ type: "text", text: "hello" }] },
                        ],
                    }),
                },
            } as any

            // #when
            const result = await fetchLastAssistantMessage(mockClient, "test-session")

            // #then
            expect(result.found).toBe(false)
            expect(result.text).toBe("")
        })

        test("returns found=false with error text on API error", async () => {
            // #given
            const mockClient = {
                session: {
                    messages: async () => ({ error: "Not found" }),
                },
            } as any

            // #when
            const result = await fetchLastAssistantMessage(mockClient, "test-session")

            // #then
            expect(result.found).toBe(false)
            expect(result.text).toContain("Error")
        })

        test("handles empty parts gracefully", async () => {
            // #given
            const mockClient = {
                session: {
                    messages: async () => ({
                        data: [
                            {
                                info: { role: "assistant", time: { created: 1000 } },
                                parts: [],
                            },
                        ],
                    }),
                },
            } as any

            // #when
            const result = await fetchLastAssistantMessage(mockClient, "test-session")

            // #then
            expect(result.found).toBe(true)
            expect(result.text).toBe("")
        })
    })
})
