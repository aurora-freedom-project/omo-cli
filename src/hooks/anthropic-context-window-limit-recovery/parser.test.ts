import { describe, test, expect } from "bun:test"
import { parseAnthropicTokenLimitError } from "./parser"

describe("anthropic-context-window-limit-recovery/parser", () => {
    describe("parseAnthropicTokenLimitError", () => {
        test("returns null for non-error values", () => {
            // #given / #when / #then
            expect(parseAnthropicTokenLimitError(null)).toBeNull()
            expect(parseAnthropicTokenLimitError(undefined)).toBeNull()
            expect(parseAnthropicTokenLimitError(42)).toBeNull()
        })

        test("parses string token limit error with numbers", () => {
            // #given
            const error = "prompt is too long: 250000 tokens > 200000 maximum"

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).not.toBeNull()
            expect(result!.currentTokens).toBe(250000)
            expect(result!.maxTokens).toBe(200000)
        })

        test("parses string with 'is too long' keyword", () => {
            // #given
            const error = "Your prompt is too long"

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).not.toBeNull()
            expect(result!.errorType).toContain("token_limit_exceeded")
        })

        test("parses non-empty content error with message index", () => {
            // #given
            const error = "messages.5 non-empty content is required"

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).not.toBeNull()
            expect(result!.errorType).toBe("non-empty content")
            expect(result!.messageIndex).toBe(5)
        })

        test("parses error object with message field", () => {
            // #given
            const error = {
                message: "prompt is too long: 150000 tokens > 100000 maximum"
            }

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).not.toBeNull()
            expect(result!.currentTokens).toBe(150000)
            expect(result!.maxTokens).toBe(100000)
        })

        test("parses nested Anthropic error format", () => {
            // #given
            const error = {
                error: {
                    type: "invalid_request_error",
                    message: "prompt is too long: 300000 tokens > 200000 maximum"
                }
            }

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).not.toBeNull()
            expect(result!.currentTokens).toBe(300000)
            expect(result!.maxTokens).toBe(200000)
        })

        test("returns null for non-token-limit error strings", () => {
            // #given
            const error = "network timeout after 30s"

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).toBeNull()
        })

        test("returns null for thinking block errors", () => {
            // #given
            const error = "thinking must be the first block"

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then — thinking block errors are NOT token limit errors
            expect(result).toBeNull()
        })

        test("parses context_length_exceeded keyword", () => {
            // #given
            const error = { message: "context_length_exceeded: input too large" }

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).not.toBeNull()
        })

        test("parses error with responseBody containing JSON", () => {
            // #given
            const error = {
                data: {
                    responseBody: JSON.stringify({
                        type: "error",
                        error: {
                            type: "invalid_request_error",
                            message: "100000 tokens > 80000 maximum",
                        },
                        request_id: "req_abc123",
                    }),
                },
                message: "prompt is too long",
            }

            // #when
            const result = parseAnthropicTokenLimitError(error)

            // #then
            expect(result).not.toBeNull()
            expect(result!.currentTokens).toBe(100000)
            expect(result!.maxTokens).toBe(80000)
            expect(result!.requestId).toBe("req_abc123")
        })
    })
})
