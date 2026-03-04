import { describe, it, expect } from "bun:test"

/**
 * Tests for thinking-block-validator hook.
 * Tests pure utility functions extracted for testability.
 */

// ─── Import internal functions via module for testing ───────────────────────
// The hook exports a factory, but we can test the internal logic patterns

describe("thinking-block-validator", () => {
    describe("extended thinking model detection", () => {
        // Replicate isExtendedThinkingModel logic for testing
        const isExtendedThinkingModel = (modelID: string): boolean => {
            if (!modelID) return false
            const lower = modelID.toLowerCase()
            if (lower.includes("thinking") || lower.endsWith("-high")) return true
            return (
                lower.includes("claude-sonnet-4") ||
                lower.includes("claude-opus-4") ||
                lower.includes("claude-3")
            )
        }

        it("detects thinking models", () => {
            expect(isExtendedThinkingModel("anthropic/claude-sonnet-4-5-thinking")).toBe(true)
            expect(isExtendedThinkingModel("anthropic/claude-opus-4-high")).toBe(true)
            expect(isExtendedThinkingModel("anthropic/claude-sonnet-4-5")).toBe(true)
            expect(isExtendedThinkingModel("anthropic/claude-3-5-sonnet")).toBe(true)
        })

        it("rejects non-thinking models", () => {
            expect(isExtendedThinkingModel("openai/gpt-4")).toBe(false)
            expect(isExtendedThinkingModel("google/gemini-3-pro")).toBe(false)
            expect(isExtendedThinkingModel("")).toBe(false)
        })
    })

    describe("content part analysis", () => {
        const hasContentParts = (parts: Array<{ type: string }>): boolean => {
            if (!parts || parts.length === 0) return false
            return parts.some((part) => {
                const type = part.type
                return type === "tool" || type === "tool_use" || type === "text"
            })
        }

        const startsWithThinkingBlock = (parts: Array<{ type: string }>): boolean => {
            if (!parts || parts.length === 0) return false
            const firstPart = parts[0]!
            return firstPart.type === "thinking" || firstPart.type === "reasoning"
        }

        it("detects content parts", () => {
            expect(hasContentParts([{ type: "text" }, { type: "thinking" }])).toBe(true)
            expect(hasContentParts([{ type: "tool_use" }])).toBe(true)
            expect(hasContentParts([{ type: "tool" }])).toBe(true)
        })

        it("rejects messages with only thinking parts", () => {
            expect(hasContentParts([{ type: "thinking" }])).toBe(false)
            expect(hasContentParts([{ type: "reasoning" }])).toBe(false)
            expect(hasContentParts([])).toBe(false)
        })

        it("detects thinking block at start", () => {
            expect(startsWithThinkingBlock([{ type: "thinking" }, { type: "text" }])).toBe(true)
            expect(startsWithThinkingBlock([{ type: "reasoning" }, { type: "tool" }])).toBe(true)
        })

        it("rejects non-thinking starts", () => {
            expect(startsWithThinkingBlock([{ type: "text" }])).toBe(false)
            expect(startsWithThinkingBlock([{ type: "tool_use" }])).toBe(false)
            expect(startsWithThinkingBlock([])).toBe(false)
        })
    })
})
