import { describe, test, expect } from "bun:test"
import { detectThinkKeyword, extractPromptText } from "./detector"

describe("think-mode/detector", () => {
    describe("detectThinkKeyword", () => {
        test("detects 'think' in plain text", () => {
            expect(detectThinkKeyword("please think about this")).toBe(true)
        })

        test("detects 'ultrathink' keyword", () => {
            expect(detectThinkKeyword("ultrathink before answering")).toBe(true)
        })

        test("is case insensitive for English", () => {
            expect(detectThinkKeyword("THINK carefully")).toBe(true)
            expect(detectThinkKeyword("UltraThink")).toBe(true)
        })

        test("does NOT detect 'think' inside code blocks", () => {
            expect(detectThinkKeyword("```\nthink about this\n```")).toBe(false)
        })

        test("does NOT detect 'think' inside inline code", () => {
            expect(detectThinkKeyword("use the `think` command")).toBe(false)
        })

        test("detects keyword outside code blocks even when code blocks present", () => {
            expect(detectThinkKeyword("think about ```some code```")).toBe(true)
        })

        test("returns false for text without think keywords", () => {
            expect(detectThinkKeyword("hello world")).toBe(false)
            expect(detectThinkKeyword("please fix this bug")).toBe(false)
        })

        test("returns false for empty string", () => {
            expect(detectThinkKeyword("")).toBe(false)
        })

        // Multilingual tests
        test("detects Vietnamese 'suy nghĩ'", () => {
            expect(detectThinkKeyword("suy nghĩ kỹ trước khi trả lời")).toBe(true)
        })

        test("detects Vietnamese 'cân nhắc'", () => {
            expect(detectThinkKeyword("cân nhắc kỹ vấn đề này")).toBe(true)
        })

        test("detects Korean '생각'", () => {
            expect(detectThinkKeyword("이것에 대해 생각해봐")).toBe(true)
        })

        test("detects Chinese '思考'", () => {
            expect(detectThinkKeyword("请仔细思考")).toBe(true)
        })

        test("detects Japanese '考え'", () => {
            expect(detectThinkKeyword("よく考えてから答えて")).toBe(true)
        })

        test("detects Russian 'думать'", () => {
            expect(detectThinkKeyword("думать внимательно")).toBe(true)
        })

        test("detects German 'nachdenken'", () => {
            expect(detectThinkKeyword("bitte nachdenken")).toBe(true)
        })

        test("detects Spanish 'pensar'", () => {
            expect(detectThinkKeyword("pensar antes de actuar")).toBe(true)
        })

        test("detects French 'réfléchir'", () => {
            expect(detectThinkKeyword("réfléchir avant de répondre")).toBe(true)
        })

        test("does NOT detect multilingual keywords inside code blocks", () => {
            expect(detectThinkKeyword("```\n思考\n```")).toBe(false)
            expect(detectThinkKeyword("`suy nghĩ`")).toBe(false)
        })
    })

    describe("extractPromptText", () => {
        test("extracts text from text parts", () => {
            const parts = [
                { type: "text", text: "hello" },
                { type: "text", text: " world" },
            ]
            expect(extractPromptText(parts)).toBe("hello world")
        })

        test("filters out non-text parts", () => {
            const parts = [
                { type: "text", text: "hello" },
                { type: "image", text: "data:image/png" },
                { type: "text", text: " world" },
            ]
            expect(extractPromptText(parts)).toBe("hello world")
        })

        test("handles empty parts array", () => {
            expect(extractPromptText([])).toBe("")
        })

        test("handles parts without text field", () => {
            const parts = [{ type: "text" }, { type: "text", text: "hello" }]
            expect(extractPromptText(parts)).toBe("hello")
        })

        test("joins with empty string (no space)", () => {
            const parts = [
                { type: "text", text: "a" },
                { type: "text", text: "b" },
            ]
            // think-mode joins with "" (no space), unlike keyword-detector which joins with " "
            expect(extractPromptText(parts)).toBe("ab")
        })
    })
})
