import { describe, test, expect } from "bun:test"
import {
    removeCodeBlocks,
    detectKeywords,
    detectKeywordsWithType,
    extractPromptText,
} from "./detector"

describe("keyword-detector/detector", () => {
    describe("removeCodeBlocks", () => {
        test("removes fenced code blocks", () => {
            const input = "before ```code here``` after"
            expect(removeCodeBlocks(input)).toBe("before  after")
        })

        test("removes multiline fenced code blocks", () => {
            const input = "before\n```typescript\nconst x = 1\n```\nafter"
            expect(removeCodeBlocks(input)).toBe("before\n\nafter")
        })

        test("removes inline code", () => {
            const input = "use `ultrawork` to start"
            expect(removeCodeBlocks(input)).toBe("use  to start")
        })

        test("removes both fenced and inline code", () => {
            const input = "try `cmd` then ```\nblock\n``` done"
            expect(removeCodeBlocks(input)).toBe("try  then  done")
        })

        test("handles text without code", () => {
            expect(removeCodeBlocks("plain text")).toBe("plain text")
        })

        test("handles empty string", () => {
            expect(removeCodeBlocks("")).toBe("")
        })
    })

    describe("detectKeywords", () => {
        test("detects ultrawork keyword", () => {
            const result = detectKeywords("ultrawork on this task")
            expect(result.length).toBeGreaterThan(0)
        })

        test("returns empty for plain text without keywords", () => {
            const result = detectKeywords("hello world fix this bug")
            expect(result).toEqual([])
        })

        test("does not detect keywords inside code blocks", () => {
            const result = detectKeywords("```\nultrawork\n```")
            expect(result).toEqual([])
        })

        test("does not detect keywords inside inline code", () => {
            const result = detectKeywords("use `ultrawork` cmd")
            expect(result).toEqual([])
        })

        test("returns message strings", () => {
            const result = detectKeywords("ultrawork")
            expect(result.length).toBeGreaterThan(0)
            for (const msg of result) {
                expect(typeof msg).toBe("string")
                expect(msg.length).toBeGreaterThan(0)
            }
        })

        test("passes agentName to dynamic message functions", () => {
            const withAgent = detectKeywords("ultrawork", "TestAgent")
            const withoutAgent = detectKeywords("ultrawork")
            // Both should return messages (at least one)
            expect(withAgent.length).toBeGreaterThan(0)
            expect(withoutAgent.length).toBeGreaterThan(0)
        })
    })

    describe("detectKeywordsWithType", () => {
        test("returns typed results with type field", () => {
            const result = detectKeywordsWithType("ultrawork")
            expect(result.length).toBeGreaterThan(0)
            for (const item of result) {
                expect(["ultrawork", "search", "analyze"]).toContain(item.type)
                expect(typeof item.message).toBe("string")
            }
        })

        test("returns empty for non-matching text", () => {
            const result = detectKeywordsWithType("hello world")
            expect(result).toEqual([])
        })

        test("filters out non-matching keywords", () => {
            const result = detectKeywordsWithType("ultrawork")
            // Should have ultrawork type but not necessarily search/analyze
            const types = result.map((r) => r.type)
            expect(types).toContain("ultrawork")
        })

        test("does not detect keywords in code blocks", () => {
            const result = detectKeywordsWithType("```ultrawork```")
            expect(result).toEqual([])
        })
    })

    describe("extractPromptText", () => {
        test("extracts text parts and joins with space", () => {
            const parts = [
                { type: "text", text: "hello" },
                { type: "text", text: "world" },
            ]
            expect(extractPromptText(parts)).toBe("hello world")
        })

        test("filters non-text parts", () => {
            const parts = [
                { type: "text", text: "hello" },
                { type: "image" },
                { type: "text", text: "world" },
            ]
            expect(extractPromptText(parts)).toBe("hello world")
        })

        test("handles empty array", () => {
            expect(extractPromptText([])).toBe("")
        })

        test("handles parts without text field", () => {
            const parts = [{ type: "text" }, { type: "text", text: "hello" }]
            expect(extractPromptText(parts)).toBe(" hello")
        })

        test("joins with space (differs from think-mode which joins with empty)", () => {
            const parts = [
                { type: "text", text: "a" },
                { type: "text", text: "b" },
            ]
            expect(extractPromptText(parts)).toBe("a b")
        })
    })
})
