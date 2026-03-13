import { describe, test, expect } from "bun:test"
import { shouldApplyRule, isDuplicateByRealPath, createContentHash, isDuplicateByContentHash } from "./matcher"

describe("rules-injector/matcher", () => {
    describe("shouldApplyRule", () => {
        test("applies when alwaysApply is true", () => {
            const result = shouldApplyRule({ alwaysApply: true }, "/project/src/foo.ts", "/project")
            expect(result.applies).toBe(true)
            expect(result.reason).toBe("alwaysApply")
        })

        test("does not apply when no globs and alwaysApply is false", () => {
            const result = shouldApplyRule({ alwaysApply: false }, "/project/src/foo.ts", "/project")
            expect(result.applies).toBe(false)
        })

        test("does not apply when globs is undefined", () => {
            const result = shouldApplyRule({}, "/project/src/foo.ts", "/project")
            expect(result.applies).toBe(false)
        })

        test("applies when glob pattern matches (string glob)", () => {
            const result = shouldApplyRule({ globs: "**/*.ts" }, "/project/src/foo.ts", "/project")
            expect(result.applies).toBe(true)
            expect(result.reason).toContain("glob")
        })

        test("applies when glob pattern matches (array glob)", () => {
            const result = shouldApplyRule({ globs: ["**/*.py", "**/*.ts"] }, "/project/src/foo.ts", "/project")
            expect(result.applies).toBe(true)
        })

        test("does not apply when glob pattern does not match", () => {
            const result = shouldApplyRule({ globs: "**/*.py" }, "/project/src/foo.ts", "/project")
            expect(result.applies).toBe(false)
        })

        test("does not apply when globs array is empty", () => {
            const result = shouldApplyRule({ globs: [] }, "/project/src/foo.ts", "/project")
            expect(result.applies).toBe(false)
        })
    })

    describe("isDuplicateByRealPath", () => {
        test("returns true when path exists in cache", () => {
            const cache = new Set(["/real/path/a.md"])
            expect(isDuplicateByRealPath("/real/path/a.md", cache)).toBe(true)
        })

        test("returns false when path not in cache", () => {
            const cache = new Set(["/real/path/a.md"])
            expect(isDuplicateByRealPath("/real/path/b.md", cache)).toBe(false)
        })
    })

    describe("createContentHash", () => {
        test("produces consistent hash", () => {
            const h1 = createContentHash("test content")
            const h2 = createContentHash("test content")
            expect(h1).toBe(h2)
        })

        test("produces 16-char hex string", () => {
            const hash = createContentHash("hello")
            expect(hash).toMatch(/^[a-f0-9]{16}$/)
        })

        test("different content produces different hash", () => {
            expect(createContentHash("aaa")).not.toBe(createContentHash("bbb"))
        })
    })

    describe("isDuplicateByContentHash", () => {
        test("returns true when hash exists", () => {
            const hash = createContentHash("unique content")
            const cache = new Set([hash])
            expect(isDuplicateByContentHash(hash, cache)).toBe(true)
        })

        test("returns false when hash not in cache", () => {
            const cache = new Set(["abc123def456abcd"])
            expect(isDuplicateByContentHash("other_hash_value1", cache)).toBe(false)
        })
    })
})
