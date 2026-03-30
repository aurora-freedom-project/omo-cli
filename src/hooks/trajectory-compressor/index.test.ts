/**
 * Tests for Trajectory Compressor hook.
 *
 * Validates the OpenGauss-inspired compression algorithm:
 * - Protected turn detection (head/tail)
 * - Token estimation
 * - Extractive summary generation
 * - Compression decision logic
 * - Metrics tracking
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
    estimateTokens,
    countMessageTokens,
    countPerMessageTokens,
    findProtectedIndices,
    extractiveSummary,
    compress,
    shouldCompress,
    recordCompression,
    getMetrics,
    formatCompressionResult,
    type Message,
    type CompressionConfig,
} from "./index"

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMessage(role: Message["role"], content: string): Message {
    return { role, content }
}

function makeConversation(turnCount: number, tokensPer: number = 200): Message[] {
    const roles: Message["role"][] = ["system", "user", "assistant", "tool"]
    const messages: Message[] = []
    for (let i = 0; i < turnCount; i++) {
        const role = roles[i % roles.length]
        // Each char ≈ 0.25 tokens, so tokensPer * 4 chars ≈ tokensPer tokens
        const content = `Turn ${i} (${role}): ${"x".repeat(tokensPer * 4 - 30)}`
        messages.push(makeMessage(role, content))
    }
    return messages
}

// ── Token Estimation ───────────────────────────────────────────────────────

describe("estimateTokens", () => {
    it("should return 0 for empty string", () => {
        expect(estimateTokens("")).toBe(0)
    })

    it("should estimate ~1 token per 4 characters", () => {
        const text = "Hello world, this is a test."
        const tokens = estimateTokens(text)
        expect(tokens).toBeGreaterThan(0)
        expect(tokens).toBe(Math.ceil(text.length / 4))
    })

    it("should handle long strings", () => {
        const longText = "a".repeat(10000)
        expect(estimateTokens(longText)).toBe(2500)
    })
})

describe("countMessageTokens", () => {
    it("should count tokens across all messages", () => {
        const messages = [
            makeMessage("system", "You are a helpful assistant."),
            makeMessage("user", "Tell me about cats."),
        ]
        const count = countMessageTokens(messages)
        expect(count).toBeGreaterThan(0)
        // 2 messages × 4 overhead + content tokens
        expect(count).toBe(
            estimateTokens(messages[0].content) + 4 +
            estimateTokens(messages[1].content) + 4
        )
    })

    it("should return 0 for empty array", () => {
        expect(countMessageTokens([])).toBe(0)
    })
})

describe("countPerMessageTokens", () => {
    it("should return array of per-message token counts", () => {
        const messages = [
            makeMessage("system", "Short"),
            makeMessage("user", "A longer message with more content"),
        ]
        const counts = countPerMessageTokens(messages)
        expect(counts).toHaveLength(2)
        expect(counts[0]).toBeLessThan(counts[1])
    })
})

// ── Protected Turn Detection ───────────────────────────────────────────────

describe("findProtectedIndices", () => {
    it("should protect first occurrence of each role", () => {
        const messages = [
            makeMessage("system", "System prompt"),
            makeMessage("user", "User message"),
            makeMessage("assistant", "Response"),
            makeMessage("tool", "Tool result"),
            makeMessage("user", "Follow-up"),
            makeMessage("assistant", "Another response"),
            makeMessage("user", "Third message"),
            makeMessage("assistant", "Third response"),
            makeMessage("user", "Fourth message"),
            makeMessage("assistant", "Final response"),
        ]

        const { protected: protectedSet } = findProtectedIndices(messages, {
            targetMaxTokens: 15250,
            protectHeadTurns: 4,
            protectTailTurns: 4,
            summaryTargetTokens: 750,
            mode: "extractive",
        })

        // Head: indices 0(system), 1(user), 2(assistant), 3(tool)
        expect(protectedSet.has(0)).toBe(true)
        expect(protectedSet.has(1)).toBe(true)
        expect(protectedSet.has(2)).toBe(true)
        expect(protectedSet.has(3)).toBe(true)

        // Tail: last 4 = indices 6, 7, 8, 9
        expect(protectedSet.has(6)).toBe(true)
        expect(protectedSet.has(7)).toBe(true)
        expect(protectedSet.has(8)).toBe(true)
        expect(protectedSet.has(9)).toBe(true)
    })

    it("should calculate correct compressible region", () => {
        const messages = makeConversation(12)
        const { compressibleStart, compressibleEnd } = findProtectedIndices(messages)

        // Head protected: 0,1,2,3 → compressibleStart = 4
        expect(compressibleStart).toBe(4)
        // Tail protected: 8,9,10,11 → compressibleEnd = 8
        expect(compressibleEnd).toBe(8)
    })

    it("should handle messages with fewer roles than protectHeadTurns", () => {
        const messages = [
            makeMessage("user", "Question"),
            makeMessage("assistant", "Answer"),
            makeMessage("user", "Follow-up"),
            makeMessage("assistant", "Second answer"),
            makeMessage("user", "Third"),
            makeMessage("assistant", "Third answer"),
            makeMessage("user", "Fourth"),
            makeMessage("assistant", "Fourth answer"),
            makeMessage("user", "Fifth"),
            makeMessage("assistant", "Fifth answer"),
        ]

        const { protected: protectedSet } = findProtectedIndices(messages)
        // Should protect first 4 turns as fallback
        expect(protectedSet.has(0)).toBe(true)
        expect(protectedSet.has(1)).toBe(true)
        expect(protectedSet.has(2)).toBe(true)
        expect(protectedSet.has(3)).toBe(true)
    })
})

// ── Extractive Summary ─────────────────────────────────────────────────────

describe("extractiveSummary", () => {
    it("should extract first sentence from each turn", () => {
        const messages = [
            makeMessage("user", "Find all SQL injection points. Then test them."),
            makeMessage("assistant", "I found 3 potential injection points. Let me test each one."),
            makeMessage("tool", "Scan complete: 2 confirmed vulnerabilities found."),
        ]

        const summary = extractiveSummary(messages, 0, 3)
        expect(summary).toContain("[CONTEXT SUMMARY]")
        expect(summary).toContain("3 compressed turns")
        expect(summary).toContain("[USER]")
        expect(summary).toContain("[ASSISTANT]")
        expect(summary).toContain("[TOOL]")
    })

    it("should respect maxTokens limit", () => {
        const messages = makeConversation(20)
        const summary = extractiveSummary(messages, 0, 20, 100)
        const tokens = estimateTokens(summary)
        // Should be roughly within the limit (some overhead allowed)
        expect(tokens).toBeLessThan(200) // generous bound
    })

    it("should handle empty content", () => {
        const messages = [
            makeMessage("user", ""),
            makeMessage("assistant", ""),
        ]
        const summary = extractiveSummary(messages, 0, 2)
        expect(summary).toContain("[CONTEXT SUMMARY]")
    })

    it("should truncate very long first sentences", () => {
        const longContent = "A".repeat(2000) + ". Second sentence."
        const messages = [makeMessage("user", longContent)]
        const summary = extractiveSummary(messages, 0, 1)
        // Summary should be much shorter than original content (200 char extract + prefix)
        expect(summary.length).toBeLessThan(longContent.length)
        // Should not contain the second sentence (it comes after 2000 A's)
        expect(summary).not.toContain("Second sentence")
    })
})

// ── Core Compression ───────────────────────────────────────────────────────

describe("compress", () => {
    it("should skip compression when under budget", () => {
        const messages = [
            makeMessage("system", "You are helpful."),
            makeMessage("user", "Hello"),
            makeMessage("assistant", "Hi there!"),
        ]

        const result = compress(messages, { targetMaxTokens: 10000 })
        expect(result.wasCompressed).toBe(false)
        expect(result.messages).toHaveLength(3)
        expect(result.tokensSaved).toBe(0)
        expect(result.compressionRatio).toBe(1.0)
    })

    it("should compress when over budget", () => {
        // Create a conversation that exceeds default 15250 token budget
        // Each turn ≈ 500 tokens, 40 turns ≈ 20000 tokens
        const messages = makeConversation(40, 500)

        const result = compress(messages, { targetMaxTokens: 8000 })
        expect(result.wasCompressed).toBe(true)
        expect(result.messages.length).toBeLessThan(40)
        expect(result.tokensSaved).toBeGreaterThan(0)
        expect(result.compressionRatio).toBeLessThan(1.0)
    })

    it("should preserve head and tail turns", () => {
        const messages = makeConversation(20, 500)

        const result = compress(messages, {
            targetMaxTokens: 4000,
            protectHeadTurns: 4,
            protectTailTurns: 4,
        })

        if (result.wasCompressed) {
            // First message should still be system
            expect(result.messages[0].role).toBe("system")
            // Last message should be from original tail
            const lastOriginal = messages[messages.length - 1]
            const lastCompressed = result.messages[result.messages.length - 1]
            expect(lastCompressed.content).toBe(lastOriginal.content)
        }
    })

    it("should insert summary message in compressed region", () => {
        const messages = makeConversation(20, 500)

        const result = compress(messages, { targetMaxTokens: 4000 })

        if (result.wasCompressed) {
            // Should have a summary message somewhere
            const summaryMsg = result.messages.find(m =>
                m.content.includes("[CONTEXT SUMMARY]")
            )
            expect(summaryMsg).toBeDefined()
            expect(summaryMsg!.role).toBe("user")
        }
    })

    it("should not compress when too few messages", () => {
        const messages = [
            makeMessage("system", "x".repeat(10000)),
            makeMessage("user", "x".repeat(10000)),
        ]

        // Only 2 messages, but protectHead=4 + protectTail=4 = 8 > 2
        const result = compress(messages, { targetMaxTokens: 100 })
        expect(result.wasCompressed).toBe(false)
    })

    it("should work with truncation mode", () => {
        const messages = makeConversation(20, 500)

        const result = compress(messages, {
            targetMaxTokens: 4000,
            mode: "truncation",
        })

        if (result.wasCompressed) {
            const summaryMsg = result.messages.find(m =>
                m.content.includes("[CONTEXT SUMMARY]")
            )
            expect(summaryMsg).toBeDefined()
            expect(summaryMsg!.content).toContain("compressed to fit context budget")
        }
    })

    it("should report correct compression metrics", () => {
        const messages = makeConversation(30, 400)
        const result = compress(messages, { targetMaxTokens: 5000 })

        if (result.wasCompressed) {
            expect(result.originalTokens).toBeGreaterThan(result.compressedTokens)
            expect(result.tokensSaved).toBe(result.originalTokens - result.compressedTokens)
            expect(result.turnsRemoved).toBe(
                (30 - result.messages.length)
            )
            // turnsRemoved + 1 summary = turnsInCompressedRegion
            expect(result.turnsInCompressedRegion).toBeGreaterThan(0)
            expect(result.compressedRegionStart).toBeGreaterThanOrEqual(0)
            expect(result.compressedRegionEnd).toBeGreaterThan(result.compressedRegionStart)
        }
    })
})

// ── shouldCompress ─────────────────────────────────────────────────────────

describe("shouldCompress", () => {
    it("should return true when over budget", () => {
        expect(shouldCompress(20000, { targetMaxTokens: 15250 })).toBe(true)
    })

    it("should return false when under budget", () => {
        expect(shouldCompress(10000, { targetMaxTokens: 15250 })).toBe(false)
    })

    it("should return false when exactly at budget", () => {
        expect(shouldCompress(15250, { targetMaxTokens: 15250 })).toBe(false)
    })
})

// ── Metrics ────────────────────────────────────────────────────────────────

describe("metrics tracking", () => {
    it("should track compression events", () => {
        const messages = makeConversation(30, 400)
        const result = compress(messages, { targetMaxTokens: 5000 })

        if (result.wasCompressed) {
            recordCompression(result)
            const metrics = getMetrics()
            expect(metrics.totalCompressions).toBeGreaterThanOrEqual(1)
            expect(metrics.totalTokensSaved).toBeGreaterThan(0)
            expect(metrics.compressionHistory.length).toBeGreaterThanOrEqual(1)
        }
    })

    it("should not track non-compression events", () => {
        const initialMetrics = getMetrics()
        const count = initialMetrics.totalCompressions

        const messages = [makeMessage("user", "short")]
        const result = compress(messages, { targetMaxTokens: 10000 })
        recordCompression(result)

        const afterMetrics = getMetrics()
        expect(afterMetrics.totalCompressions).toBe(count)
    })
})

// ── formatCompressionResult ────────────────────────────────────────────────

describe("formatCompressionResult", () => {
    it("should format non-compressed result", () => {
        const messages = [makeMessage("user", "Hello")]
        const result = compress(messages, { targetMaxTokens: 10000 })
        const formatted = formatCompressionResult(result)
        expect(formatted).toContain("No compression needed")
    })

    it("should format compressed result with stats", () => {
        const messages = makeConversation(30, 400)
        const result = compress(messages, { targetMaxTokens: 5000 })

        if (result.wasCompressed) {
            const formatted = formatCompressionResult(result)
            expect(formatted).toContain("Context compressed")
            expect(formatted).toContain("Original:")
            expect(formatted).toContain("Compressed:")
            expect(formatted).toContain("Saved:")
        }
    })
})
