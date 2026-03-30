/**
 * @module hooks/provider-error-recovery/network.test
 *
 * Tests for network and streaming error detection.
 */

import { describe, expect, it } from "bun:test"
import {
    extractNetworkErrorCode,
    isNetworkError,
    isStreamingError,
    describeNetworkError,
} from "./network"

describe("extractNetworkErrorCode", () => {
    //#given an error with direct code property
    it("should extract ECONNRESET from code property", () => {
        //#when
        const result = extractNetworkErrorCode({ code: "ECONNRESET", message: "connection reset" })
        //#then
        expect(result).toBe("ECONNRESET")
    })

    //#given an error with ETIMEDOUT in nested cause
    it("should extract code from cause chain", () => {
        //#when
        const result = extractNetworkErrorCode({
            message: "request failed",
            cause: { code: "ETIMEDOUT" },
        })
        //#then
        expect(result).toBe("ETIMEDOUT")
    })

    //#given an error with code in message string
    it("should extract code from message pattern", () => {
        //#when
        const result = extractNetworkErrorCode({
            message: "failed to fetch: ENOTFOUND api.anthropic.com",
        })
        //#then
        expect(result).toBe("ENOTFOUND")
    })

    //#given an error with no network code
    it("should return null for non-network errors", () => {
        //#when
        const result = extractNetworkErrorCode({ message: "400 Bad Request" })
        //#then
        expect(result).toBeNull()
    })

    //#given an error with unknown code
    it("should return null for unknown code strings", () => {
        //#when
        const result = extractNetworkErrorCode({ code: "ERR_PARSE_ERROR" })
        //#then
        expect(result).toBeNull()
    })
})

describe("isNetworkError", () => {
    //#given error data with EPIPE
    it("should return true for EPIPE", () => {
        //#when & then
        expect(isNetworkError({ code: "EPIPE" })).toBe(true)
    })

    //#given error data with EHOSTUNREACH
    it("should return true for EHOSTUNREACH", () => {
        //#when & then
        expect(isNetworkError({ code: "EHOSTUNREACH" })).toBe(true)
    })

    //#given a regular HTTP error
    it("should return false for HTTP errors", () => {
        //#when & then
        expect(isNetworkError({ statusCode: 500, message: "Internal Server Error" })).toBe(false)
    })
})

describe("isStreamingError", () => {
    //#given a stream error message
    it("should detect 'stream error'", () => {
        //#when & then
        expect(isStreamingError({ message: "stream error: unexpected EOF" })).toBe(true)
    })

    //#given an SSE disconnect
    it("should detect 'SSE disconnect'", () => {
        //#when & then
        expect(isStreamingError({ message: "SSE disconnect during response" })).toBe(true)
    })

    //#given a premature close
    it("should detect 'premature close'", () => {
        //#when & then
        expect(isStreamingError({ message: "premature close" })).toBe(true)
    })

    //#given a connection reset message
    it("should detect 'connection reset'", () => {
        //#when & then
        expect(isStreamingError({ message: "connection reset by peer" })).toBe(true)
    })

    //#given an incomplete response
    it("should detect 'incomplete response'", () => {
        //#when & then
        expect(isStreamingError({ message: "incomplete response from server" })).toBe(true)
    })

    //#given an AbortError type
    it("should detect AbortError type", () => {
        //#when & then
        expect(isStreamingError({ type: "AbortError", message: "aborted" })).toBe(true)
    })

    //#given a chunk failure
    it("should detect 'chunk error'", () => {
        //#when & then
        expect(isStreamingError({ message: "chunk error: invalid JSON" })).toBe(true)
    })

    //#given a ReadableStream error
    it("should detect ReadableStream errors", () => {
        //#when & then
        expect(isStreamingError({ message: "ReadableStream error during read" })).toBe(true)
    })

    //#given unexpected end of stream
    it("should detect unexpected end of stream", () => {
        //#when & then
        expect(isStreamingError({ message: "unexpected end of stream" })).toBe(true)
    })

    //#given a normal error
    it("should return false for non-streaming errors", () => {
        //#when & then
        expect(isStreamingError({ message: "400 Bad Request: invalid model" })).toBe(false)
    })
})

describe("describeNetworkError", () => {
    //#given an ECONNRESET error
    it("should describe ECONNRESET", () => {
        //#when
        const desc = describeNetworkError({ code: "ECONNRESET" })
        //#then
        expect(desc).toBe("Connection reset by provider")
    })

    //#given an ETIMEDOUT error
    it("should describe ETIMEDOUT", () => {
        //#when
        const desc = describeNetworkError({ code: "ETIMEDOUT" })
        //#then
        expect(desc).toBe("Connection timed out")
    })

    //#given an ENOTFOUND error
    it("should describe ENOTFOUND", () => {
        //#when
        const desc = describeNetworkError({ code: "ENOTFOUND" })
        //#then
        expect(desc).toBe("Provider hostname not found (DNS failure)")
    })

    //#given a streaming error (not network)
    it("should describe streaming errors", () => {
        //#when
        const desc = describeNetworkError({ message: "premature close" })
        //#then
        expect(desc).toBe("Streaming response disconnected mid-transfer")
    })

    //#given an unknown error
    it("should return generic for unknown errors", () => {
        //#when
        const desc = describeNetworkError({ message: "something else" })
        //#then
        expect(desc).toBe("Unknown network error")
    })
})
