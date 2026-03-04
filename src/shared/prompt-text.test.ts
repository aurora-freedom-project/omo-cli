import { describe, it, expect } from "bun:test"
import { extractPromptText } from "./prompt-text"

describe("prompt-text", () => {
    it("extracts text from string content parts", () => {
        const content = [
            { type: "text", text: "Hello" },
            { type: "text", text: "World" },
        ]
        // Default separator is " " (space)
        expect(extractPromptText(content)).toBe("Hello World")
    })

    it("returns empty string for empty array", () => {
        expect(extractPromptText([])).toBe("")
    })

    it("skips non-text parts", () => {
        const content = [
            { type: "text", text: "Hello" },
            { type: "image", data: "base64..." } as { type: string; text?: string },
            { type: "text", text: "World" },
        ]
        expect(extractPromptText(content)).toBe("Hello World")
    })

    it("uses custom separator", () => {
        const content = [
            { type: "text", text: "Hello" },
            { type: "text", text: "World" },
        ]
        expect(extractPromptText(content, "")).toBe("HelloWorld")
        expect(extractPromptText(content, "\n")).toBe("Hello\nWorld")
    })

    it("handles non-array input gracefully", () => {
        expect(extractPromptText(null as never)).toBe("")
        expect(extractPromptText(undefined as any)).toBe("")
    })

    it("handles parts with missing text field", () => {
        const content = [
            { type: "text" },
            { type: "text", text: "Hello" },
        ]
        expect(extractPromptText(content)).toBe(" Hello")
    })
})
