import { describe, it, expect } from "bun:test"
import { isMarkdownFile, isSymbolicLink, resolveSymlink } from "./file-utils"

describe("file-utils", () => {
    describe("isMarkdownFile", () => {
        it("returns true for .md files", () => {
            const entry = { name: "README.md", isFile: () => true }
            expect(isMarkdownFile(entry)).toBe(true)
        })

        it("returns false for hidden .md files", () => {
            const entry = { name: ".hidden.md", isFile: () => true }
            expect(isMarkdownFile(entry)).toBe(false)
        })

        it("returns false for non-.md files", () => {
            const entry = { name: "file.ts", isFile: () => true }
            expect(isMarkdownFile(entry)).toBe(false)
        })

        it("returns false for directories", () => {
            const entry = { name: "docs.md", isFile: () => false }
            expect(isMarkdownFile(entry)).toBe(false)
        })
    })

    describe("isSymbolicLink", () => {
        it("returns false for non-existent path", () => {
            expect(isSymbolicLink("/nonexistent/path/abc123")).toBe(false)
        })

        it("returns false for regular files", () => {
            expect(isSymbolicLink(__filename)).toBe(false)
        })
    })

    describe("resolveSymlink", () => {
        it("returns same path for regular files", () => {
            expect(resolveSymlink(__filename)).toBe(__filename)
        })

        it("returns same path for non-existent files", () => {
            const fakePath = "/nonexistent/file.txt"
            expect(resolveSymlink(fakePath)).toBe(fakePath)
        })
    })
})
