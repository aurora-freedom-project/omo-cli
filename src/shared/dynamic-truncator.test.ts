import { describe, test, expect, mock, spyOn, afterEach } from "bun:test"
import {
    truncateToTokenLimit,
    getContextWindowUsage,
    dynamicTruncate,
    createDynamicTruncator,
} from "./dynamic-truncator"
import type { PluginInput } from "@opencode-ai/plugin"

describe("dynamic-truncator", () => {
    afterEach(() => {
        mock.restore()
    })

    describe("truncateToTokenLimit", () => {
        test("does not truncate if within limit", () => {
            const output = "Hello short string"
            const result = truncateToTokenLimit(output, 100)

            expect(result.truncated).toBe(false)
            expect(result.result).toBe(output)
        })

        test("truncates single line string if it exceeds tokens", () => {
            // CHARS_PER_TOKEN_ESTIMATE is 4
            const output = "AAAA" // 4 chars = 1 token
            // A max of 0 tokens guarantees truncation because currentTokens (1) > maxTokens (0)
            const result = truncateToTokenLimit(output, 0)

            expect(result.truncated).toBe(true)
            expect(result.result).toContain("[Output truncated")
        })

        test("truncates long strings with preserving headers", () => {
            // My debug tests found that availableTokens = maxTokens - headerTokens(2) - truncationMessageTokens(50)
            // Any limit under 52 will cause availableTokens <= 0, keeping only header
            const output = "1\n2\n3\n4\n5"
            // With target 50, availableTokens = 50 - 2 - 50 = -2 (so it completely omits body lines 4 and 5)
            // But if maxTokens drops below 10, the original `if (lines.length <= preserveHeaderLines)` handles small limits
            // Oh actually, it's 5 lines. 5 > 3. So it uses preserve header path.
            // If we set limit to 0, it behaves differently. Let's use 2 as found in my debug script.
            const result = truncateToTokenLimit(output, 2, 3)

            expect(result.truncated).toBe(true)
            expect(result.result).toContain("1\n2\n3")
            expect(result.result).toContain("[Content truncated due to context window limit]")
            // wait, my output showed removedCount=2 because lines.length=5, preserve=3, so 2 removed.
            expect(result.removedCount).toBe(2)
        })

        test("partially truncates lines when availableTokens > 0", () => {
            // To reach the partial branch, we need:
            // availableTokens = maxTokens - headerTokens(2) - truncationMsg(50)
            // We want availableTokens to fit exactly 1 line (e.g. line 4 which is 2 chars -> 1 token).
            // maxTokens = 50 + 2 + 1 = 53
            // So if we use maxTokens = 53, it should include "4\n" but stop before "5\n".
            const output = "1\n2\n3\n4\n5"

            // Wait, my loop log earlier showed `maxTokens=3 -> truncated=false`.
            // Let's look at `estimateTokens(output)`. 
            // "1\n2\n3\n4\n5" length 9. 9/4 = 3 tokens.
            // When maxTokens is 3, currentTokens (3) <= maxTokens (3), so it RETURNS EARLY and does not truncate.
            // This is why it never reached the inner code in my math.
            // To force it to reach the inner logic, currentTokens MUST be > maxTokens. 
            // BUT wait! If currentTokens > maxTokens, it drops to the logic.
            // But if we use large inputs, the estimate > maxTokens.

            // Let's use a very large string for the body so currentTokens is HUGE.
            // Header: "H1\nH2\nH3" (8) = 2 tokens.
            // Body lines: "1\n" * 50 = 100 chars (25 tokens)
            // Total text: 108 chars = 27 tokens.
            // So currentTokens = 27. It exceeds maxTokens = 27.
            // If we set maxTokens = 27... wait, the logic: maxTokens - headerTokens - 50.
            // If maxTokens is 27, availableTokens = 27 - 2 - 50 = -25 (<= 0!). It will NEVER partially truncate
            // unless currentTokens > maxTokens AND availableTokens > 0.
            // So estimateTokens(output) > maxTokens AND (maxTokens - headerTokens - 50) > 0.
            // Thus maxTokens > 50 + headerTokens.
            // Let maxTokens = 55. We need estimateTokens > 55.
            // Let's make an input that estimates at 100 tokens (400 chars).
            const header = "1\n2\n3" // 5 chars -> 2 tokens
            // we want body line 1 to fit.
            const bodyLineThatFits = "A".repeat(4) // 4 chars -> 1 token
            // we want body line 2 to cause overflow. It should be massive.
            const bodyLineOverflow = "B".repeat(400) // 400 chars -> 100 tokens

            const output2 = [header, bodyLineThatFits, bodyLineOverflow].join("\n")
            // Total length: 5 + 1 + 4 + 1 + 400 = 411 chars = 103 tokens.

            // We want maxTokens such that it fits the header (2) + trunc msg (50) + body line that fits (1).
            // target = 53
            // currentTokens = 103 > 53.
            // availableTokens = 53 - 2 - 50 = 1.
            // Body line 1 requires estimateTokens(bodyline + "\n") = est(5) = 2 tokens. 
            // Wait, "AAAA\n" is 5 chars. ceil(5/4) = 2 tokens.
            // So we need availableTokens = 2.
            // maxTokens = 50 + 2 + 2 = 54.
            const result2 = truncateToTokenLimit(output2, 54, 3)

            expect(result2.truncated).toBe(true)
            expect(result2.result).toContain(bodyLineThatFits)
            expect(result2.result).not.toContain(bodyLineOverflow)
            expect(result2.result).toContain("[1 more lines truncated")
            expect(result2.removedCount).toBe(1)
        })
    })

    describe("getContextWindowUsage", () => {
        test("returns null if API client fails", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.reject(new Error("Network Error")))
                    }
                }
            } as unknown as PluginInput

            const result = await getContextWindowUsage(mockCtx, "session-123")
            expect(result).toBeNull()
        })

        test("returns null if no assistant messages found", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.resolve({
                            data: [
                                { info: { role: "user" } }
                            ]
                        }))
                    }
                }
            } as unknown as PluginInput

            const result = await getContextWindowUsage(mockCtx, "session-123")
            expect(result).toBeNull()
        })

        test("calculates tokens successfully with assistant messages", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.resolve({
                            data: [
                                {
                                    info: {
                                        role: "assistant",
                                        tokens: {
                                            input: 100,
                                            output: 50,
                                            cache: { read: 50, write: 0 } // Total used = 100 + 50 + 50 = 200
                                        }
                                    }
                                }
                            ]
                        }))
                    }
                }
            } as unknown as PluginInput

            const result = await getContextWindowUsage(mockCtx, "session-123")
            expect(result).not.toBeNull()
            expect(result?.usedTokens).toBe(200)
            // ANTHROPIC_ACTUAL_LIMIT is 200,000 for standard limits
            expect(result?.remainingTokens).toBe(200000 - 200)
        })

        test("handles non-data nested response", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.resolve([
                            {
                                info: {
                                    role: "assistant",
                                    tokens: { input: 10, output: 10 }
                                }
                            }
                        ]))
                    }
                }
            } as unknown as PluginInput

            const result = await getContextWindowUsage(mockCtx, "session-123")
            expect(result?.usedTokens).toBe(20)
        })
    })

    describe("dynamicTruncate", () => {
        test("falls back to default truncateToTokenLimit if getUsage returns null", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.reject(new Error("fail")))
                    }
                }
            } as unknown as PluginInput

            const output = "Some output string"
            const result = await dynamicTruncate(mockCtx, "id", output, { targetMaxTokens: 0 })

            expect(result.truncated).toBe(true) // Because target is 0, it falls back
        })

        test("suppresses output when exhausted", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.resolve([
                            {
                                info: {
                                    role: "assistant", // Pretend we used all tokens
                                    tokens: { input: 200_000, output: 0 } // remaining 0
                                }
                            }
                        ]))
                    }
                }
            } as unknown as PluginInput

            const result = await dynamicTruncate(mockCtx, "id", "Big file content")
            expect(result.truncated).toBe(true)
            expect(result.result).toBe("[Output suppressed - context window exhausted]")
        })

        test("truncates based on half remaining tokens when below maxTarget", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.resolve([
                            {
                                info: {
                                    role: "assistant",
                                    // Limit is 200k. Used 190k. Remaining 10k.
                                    // 10k * 0.5 = 5k. targetMaxTokens defaults to 50k. min is 5k.
                                    tokens: { input: 190000, output: 0 }
                                }
                            }
                        ]))
                    }
                }
            } as unknown as PluginInput

            // Wait, estimateTokens("L\n") = ceil(2/4) = 1.
            // Output length: 20,000 chars -> 5000 est tokens
            // maxTokens is 5000 (from remaining half math logic).
            // But if maxTokens is 5000, and currentTokens=5000. 
            // 5000 <= 5000 --> currentTokens <= maxTokens --> RETURN EARLY!
            // I must have currentTokens > maxOutputTokens to trigger the truncation branch.
            // 5000 from the `dynamicTruncate` math logic.
            // Since it checks `Math.min(remaining * 0.5, targetMax)`, remaining = 10k -> half is 5k tokens target.
            // So my test dummy file needs to be MUCH larger than 5k tokens!
            // Let's make it 6000 estimated tokens. 6000 * 4 = 24000 characters.
            const output = "L\\n".repeat(12000)

            const result = await dynamicTruncate(mockCtx, "id", output)

            // Since currentTokens (6000) > maxOutputTokens (5000), it will truncate.
            expect(result.truncated).toBe(true)
        })
    })

    describe("createDynamicTruncator", () => {
        test("creates object with bound methods", async () => {
            const mockCtx = {
                client: {
                    session: {
                        messages: mock(() => Promise.reject(new Error("fail")))
                    }
                }
            } as unknown as PluginInput

            const truncator = createDynamicTruncator(mockCtx)

            expect(truncator.truncate).toBeDefined()
            expect(truncator.getUsage).toBeDefined()
            expect(truncator.truncateSync).toBeDefined()

            const s = truncator.truncateSync("hi", 100)
            expect(s.truncated).toBe(false)
            expect(s.result).toBe("hi")
        })
    })
})
