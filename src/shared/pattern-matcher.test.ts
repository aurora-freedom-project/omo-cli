import { describe, test, expect } from "bun:test"
import { matchesToolMatcher, findMatchingHooks } from "./pattern-matcher"
import type { ClaudeHooksConfig } from "../hooks/claude-code-hooks/types"

describe("pattern-matcher", () => {
    describe("matchesToolMatcher", () => {
        test("returns true if matcher is empty or undefined", () => {
            expect(matchesToolMatcher("anyTool", "")).toBe(true)
            expect(matchesToolMatcher("anyTool", undefined as any)).toBe(true)
        })

        test("returns true for exact case-insensitive match", () => {
            expect(matchesToolMatcher("MyTool", "mytool")).toBe(true)
            expect(matchesToolMatcher("mytool", "MyTool")).toBe(true)
            expect(matchesToolMatcher("mytool", "mytool")).toBe(true)
        })

        test("returns false for non-matching exact string", () => {
            expect(matchesToolMatcher("MyTool", "OtherTool")).toBe(false)
        })

        test("supports pipe-separated matchers (OR logic)", () => {
            expect(matchesToolMatcher("ToolA", "ToolB | ToolA")).toBe(true)
            expect(matchesToolMatcher("ToolC", "ToolB | ToolA")).toBe(false)
        })

        test("supports wildcard matchers", () => {
            expect(matchesToolMatcher("ReadTool", "*Tool")).toBe(true)
            expect(matchesToolMatcher("ReadTool", "Read*")).toBe(true)
            expect(matchesToolMatcher("DataReadTool", "*Read*")).toBe(true)
            expect(matchesToolMatcher("Unrelated", "*Read*")).toBe(false)
        })

        test("handles wildcard matches case-insensitively", () => {
            expect(matchesToolMatcher("ReadTool", "*tool")).toBe(true)
        })
    })

    describe("findMatchingHooks", () => {
        const mockConfig: ClaudeHooksConfig = {
            preToolUse: [
                { matcher: "Read*", commands: ["echo pre-read"] },
                { matcher: "Write*", commands: ["echo pre-write"] },
            ],
            postToolUse: [
                { matcher: "*", commands: ["echo post-all"] }
            ]
        } as unknown as ClaudeHooksConfig

        test("returns empty array if eventName does not exist in config", () => {
            expect(findMatchingHooks(mockConfig, "missingEvent" as any, "ReadTool")).toEqual([])
        })

        test("returns all event hooks if toolName is not provided", () => {
            const results = findMatchingHooks(mockConfig, "preToolUse")
            expect(results.length).toBe(2)
            expect(results[0].matcher).toBe("Read*")
            expect(results[1].matcher).toBe("Write*")
        })

        test("filters hooks matching the provided toolName", () => {
            const results = findMatchingHooks(mockConfig, "preToolUse", "ReadDataTool")
            expect(results.length).toBe(1)
            expect(results[0].matcher).toBe("Read*")
        })

        test("returns empty array if toolName matches no hooks", () => {
            const results = findMatchingHooks(mockConfig, "preToolUse", "DeleteTool")
            expect(results.length).toBe(0)
        })

        test("returns all matching hooks for heavily wildcarded event", () => {
            const results = findMatchingHooks(mockConfig, "postToolUse", "AnyRandomTool")
            expect(results.length).toBe(1)
            expect(results[0].matcher).toBe("*")
        })
    })
})
