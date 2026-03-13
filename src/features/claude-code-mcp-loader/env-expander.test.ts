import { describe, test, expect } from "bun:test"
import { expandEnvVars, expandEnvVarsInObject } from "./env-expander"

describe("claude-code-mcp-loader/env-expander", () => {
    describe("expandEnvVars", () => {
        test("expands known env var", () => {
            // #given — PATH is always defined
            const result = expandEnvVars("prefix:${PATH}:suffix")

            // #then
            expect(result).toContain("prefix:")
            expect(result).toContain(":suffix")
            expect(result).not.toContain("${PATH}")
        })

        test("uses default value for missing var", () => {
            // #given
            const result = expandEnvVars("${DEFINITELY_NOT_SET_12345:-fallback}")

            // #then
            expect(result).toBe("fallback")
        })

        test("returns empty for missing var without default", () => {
            // #given
            const result = expandEnvVars("${DEFINITELY_NOT_SET_12345}")

            // #then
            expect(result).toBe("")
        })

        test("handles multiple vars in one string", () => {
            // #given
            const result = expandEnvVars("${DEFINITELY_NOT_SET_12345:-a}:${DEFINITELY_NOT_SET_67890:-b}")

            // #then
            expect(result).toBe("a:b")
        })

        test("preserves text without vars", () => {
            // #given
            const result = expandEnvVars("plain text")

            // #then
            expect(result).toBe("plain text")
        })
    })

    describe("expandEnvVarsInObject", () => {
        test("expands strings in objects recursively", () => {
            // #given
            const obj = {
                key: "${DEFINITELY_NOT_SET_12345:-value}",
                nested: { deep: "${DEFINITELY_NOT_SET_12345:-deep_val}" },
            }

            // #when
            const result = expandEnvVarsInObject(obj)

            // #then
            expect(result.key).toBe("value")
            expect(result.nested.deep).toBe("deep_val")
        })

        test("expands strings in arrays", () => {
            // #given
            const arr = ["${DEFINITELY_NOT_SET_12345:-a}", "${DEFINITELY_NOT_SET_12345:-b}"]

            // #when
            const result = expandEnvVarsInObject(arr)

            // #then
            expect(result).toEqual(["a", "b"])
        })

        test("preserves null and undefined", () => {
            expect(expandEnvVarsInObject(null)).toBeNull()
            expect(expandEnvVarsInObject(undefined)).toBeUndefined()
        })

        test("preserves numbers and booleans", () => {
            expect(expandEnvVarsInObject(42)).toBe(42)
            expect(expandEnvVarsInObject(true)).toBe(true)
        })
    })
})
