import { describe, test, expect } from "bun:test"
import { Effect } from "effect"
import { getRegexEffect, isHookCommandDisabled } from "./config-loader"

describe("claude-code-hooks/config-loader", () => {
    describe("getRegexEffect", () => {
        test("compiles valid regex pattern", () => {
            // #given / #when
            const regex = Effect.runSync(getRegexEffect("Write|Edit"))

            // #then
            expect(regex).toBeInstanceOf(RegExp)
            expect(regex.test("WriteFile")).toBe(true)
            expect(regex.test("EditFile")).toBe(true)
            expect(regex.test("ReadFile")).toBe(false)
        })

        test("escapes invalid regex pattern as literal", () => {
            // #given — unbalanced bracket is invalid regex
            const regex = Effect.runSync(getRegexEffect("[invalid"))

            // #then — should work as escaped literal
            expect(regex).toBeInstanceOf(RegExp)
            expect(regex.test("[invalid")).toBe(true)
        })

        test("caches regex patterns", () => {
            // #given
            const regex1 = Effect.runSync(getRegexEffect("cached_pattern"))
            const regex2 = Effect.runSync(getRegexEffect("cached_pattern"))

            // #then — same reference
            expect(regex1).toBe(regex2)
        })
    })

    describe("isHookCommandDisabled", () => {
        test("returns false when no config", () => {
            expect(isHookCommandDisabled("PreToolUse", "some-cmd", null)).toBe(false)
        })

        test("returns false when no disabled hooks", () => {
            expect(isHookCommandDisabled("PreToolUse", "some-cmd", {})).toBe(false)
        })

        test("returns false when empty patterns", () => {
            const config = { disabledHooks: { PreToolUse: [] } }
            expect(isHookCommandDisabled("PreToolUse", "some-cmd", config)).toBe(false)
        })

        test("returns true when command matches pattern", () => {
            const config = { disabledHooks: { PreToolUse: ["lint-check"] } }
            expect(isHookCommandDisabled("PreToolUse", "lint-check", config)).toBe(true)
        })

        test("returns false for non-matching command", () => {
            const config = { disabledHooks: { PreToolUse: ["lint-check"] } }
            expect(isHookCommandDisabled("PreToolUse", "format-check", config)).toBe(false)
        })

        test("supports regex patterns", () => {
            const config = { disabledHooks: { PostToolUse: ["lint.*"] } }
            expect(isHookCommandDisabled("PostToolUse", "lint-js", config)).toBe(true)
            expect(isHookCommandDisabled("PostToolUse", "format-js", config)).toBe(false)
        })

        test("checks correct event type", () => {
            const config = { disabledHooks: { PreToolUse: ["cmd"], PostToolUse: [] } }
            expect(isHookCommandDisabled("PreToolUse", "cmd", config)).toBe(true)
            expect(isHookCommandDisabled("PostToolUse", "cmd", config)).toBe(false)
        })
    })
})
