import { describe, it, expect } from "bun:test"
import { tokenizeCommand } from "./tools"

describe("tokenizeCommand", () => {
    it("splits simple space-separated tokens", () => {
        expect(tokenizeCommand("new-session -s test")).toEqual(["new-session", "-s", "test"])
    })

    it("handles single-quoted strings", () => {
        expect(tokenizeCommand("send-keys -t main 'echo hello' Enter")).toEqual([
            "send-keys", "-t", "main", "echo hello", "Enter"
        ])
    })

    it("handles double-quoted strings", () => {
        expect(tokenizeCommand('send-keys -t main "echo hello world"')).toEqual([
            "send-keys", "-t", "main", "echo hello world"
        ])
    })

    it("handles backslash escapes", () => {
        expect(tokenizeCommand("send-keys echo\\ hello")).toEqual(["send-keys", "echo hello"])
    })

    it("returns empty array for empty string", () => {
        expect(tokenizeCommand("")).toEqual([])
    })

    it("handles multiple spaces between tokens", () => {
        expect(tokenizeCommand("  new-session   -s   test  ")).toEqual(["new-session", "-s", "test"])
    })

    it("handles mixed quotes", () => {
        expect(tokenizeCommand(`send-keys "hello 'world'"`)).toEqual(["send-keys", "hello 'world'"])
    })
})

describe("interactive_bash tool", () => {
    it("exports a tool definition", async () => {
        const { interactive_bash } = await import("./tools")
        expect(interactive_bash).toBeDefined()
    })
})
