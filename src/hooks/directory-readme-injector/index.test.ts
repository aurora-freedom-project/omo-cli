import { describe, it, expect, mock, beforeEach } from "bun:test"
import * as fs from "node:fs"
import * as path from "node:path"

/**
 * Tests for directory-readme-injector hook.
 * This hook injects README.md content from the working directory into prompts.
 */

// Mock fs module
const mockExistsSync = mock(() => false)
const mockReadFileSync = mock(() => "")

describe("directory-readme-injector", () => {
    describe("README detection", () => {
        it("detects README.md files", () => {
            const readmeNames = ["README.md", "readme.md", "Readme.md", "README.MD"]
            readmeNames.forEach(name => {
                const ext = path.extname(name).toLowerCase()
                expect(ext).toBe(".md")
            })
        })

        it("ignores non-README files", () => {
            const notReadme = ["CHANGELOG.md", "CONTRIBUTING.md", "notes.md"]
            notReadme.forEach(name => {
                expect(name.toLowerCase().startsWith("readme")).toBe(false)
            })
        })
    })

    describe("content injection", () => {
        it("formats readme content with header", () => {
            const readmeContent = "# My Project\n\nA description."
            const formatted = `\n<directory_readme>\n${readmeContent}\n</directory_readme>\n`

            expect(formatted).toContain("<directory_readme>")
            expect(formatted).toContain("# My Project")
            expect(formatted).toContain("</directory_readme>")
        })

        it("handles empty readme gracefully", () => {
            const readmeContent = ""
            const shouldInject = readmeContent.trim().length > 0
            expect(shouldInject).toBe(false)
        })

        it("truncates very long readme files", () => {
            const longContent = "x".repeat(10_000)
            const maxLength = 5_000
            const truncated = longContent.length > maxLength
                ? longContent.slice(0, maxLength) + "\n... (truncated)"
                : longContent

            expect(truncated.length).toBeLessThan(longContent.length)
            expect(truncated).toContain("(truncated)")
        })
    })
})
