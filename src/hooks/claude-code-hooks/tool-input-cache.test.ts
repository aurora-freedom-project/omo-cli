import { describe, test, expect, beforeEach } from "bun:test"
import { cacheToolInput, getToolInput, cleanupToolInputCacheForSession } from "./tool-input-cache"

describe("claude-code-hooks/tool-input-cache", () => {
    beforeEach(() => {
        // Clean up any leftovers
        cleanupToolInputCacheForSession("test-session")
        cleanupToolInputCacheForSession("other-session")
    })

    test("caches and retrieves tool input", () => {
        // #given
        const input = { command: "ls", directory: "/tmp" }
        cacheToolInput("test-session", "Bash", "inv-1", input)

        // #when
        const result = getToolInput("test-session", "Bash", "inv-1")

        // #then
        expect(result).toEqual(input)
    })

    test("returns null for missing key", () => {
        // #given / #when
        const result = getToolInput("test-session", "Bash", "nonexistent")

        // #then
        expect(result).toBeNull()
    })

    test("deletes entry after retrieval (one-time read)", () => {
        // #given
        cacheToolInput("test-session", "Bash", "inv-2", { x: 1 })
        getToolInput("test-session", "Bash", "inv-2") // first read consumes

        // #when
        const result = getToolInput("test-session", "Bash", "inv-2")

        // #then
        expect(result).toBeNull()
    })

    test("cleanupToolInputCacheForSession removes all session entries", () => {
        // #given
        cacheToolInput("test-session", "Bash", "inv-1", { a: 1 })
        cacheToolInput("test-session", "Write", "inv-2", { b: 2 })
        cacheToolInput("other-session", "Bash", "inv-3", { c: 3 })

        // #when
        cleanupToolInputCacheForSession("test-session")

        // #then
        expect(getToolInput("test-session", "Bash", "inv-1")).toBeNull()
        expect(getToolInput("test-session", "Write", "inv-2")).toBeNull()
        expect(getToolInput("other-session", "Bash", "inv-3")).toEqual({ c: 3 })
    })

    test("different tool names create separate entries", () => {
        // #given
        cacheToolInput("test-session", "Bash", "inv-1", { tool: "bash" })
        cacheToolInput("test-session", "Write", "inv-1", { tool: "write" })

        // #when / #then
        expect(getToolInput("test-session", "Bash", "inv-1")).toEqual({ tool: "bash" })
        expect(getToolInput("test-session", "Write", "inv-1")).toEqual({ tool: "write" })
    })
})
