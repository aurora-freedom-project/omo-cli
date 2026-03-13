import { describe, test, expect } from "bun:test"
import { tokenizeCommand } from "./tools"

describe("interactive-bash/tokenizeCommand", () => {
    test("splits simple command", () => {
        expect(tokenizeCommand("send-keys hello")).toEqual(["send-keys", "hello"])
    })

    test("splits command with multiple args", () => {
        expect(tokenizeCommand("send-keys -t omo-session Enter")).toEqual([
            "send-keys", "-t", "omo-session", "Enter",
        ])
    })

    test("handles double-quoted strings", () => {
        expect(tokenizeCommand('send-keys "hello world" Enter')).toEqual([
            "send-keys", "hello world", "Enter",
        ])
    })

    test("handles single-quoted strings", () => {
        expect(tokenizeCommand("send-keys 'hello world' Enter")).toEqual([
            "send-keys", "hello world", "Enter",
        ])
    })

    test("handles backslash escapes", () => {
        expect(tokenizeCommand("send-keys hello\\ world")).toEqual([
            "send-keys", "hello world",
        ])
    })

    test("handles escaped quotes", () => {
        expect(tokenizeCommand('send-keys \\"hello\\"')).toEqual([
            "send-keys", '"hello"',
        ])
    })

    test("handles multiple spaces between tokens", () => {
        expect(tokenizeCommand("send-keys   -t   session")).toEqual([
            "send-keys", "-t", "session",
        ])
    })

    test("handles empty string", () => {
        expect(tokenizeCommand("")).toEqual([])
    })

    test("handles single token", () => {
        expect(tokenizeCommand("ls")).toEqual(["ls"])
    })

    test("handles nested quotes (single inside double)", () => {
        expect(tokenizeCommand("send-keys \"it's here\" Enter")).toEqual([
            "send-keys", "it's here", "Enter",
        ])
    })

    test("handles leading and trailing spaces", () => {
        expect(tokenizeCommand("  send-keys hello  ")).toEqual([
            "send-keys", "hello",
        ])
    })

    test("handles complex tmux command", () => {
        expect(tokenizeCommand("new-session -d -s mysession -n mywindow")).toEqual([
            "new-session", "-d", "-s", "mysession", "-n", "mywindow",
        ])
    })

    test("handles quoted path", () => {
        expect(tokenizeCommand('send-keys "/path/with spaces/file" Enter')).toEqual([
            "send-keys", "/path/with spaces/file", "Enter",
        ])
    })
})
