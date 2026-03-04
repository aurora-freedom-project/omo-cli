import { describe, it, expect } from "bun:test"
import { resolveFileReferencesInText } from "./file-reference-resolver"
import { join } from "path"
import { writeFileSync, mkdirSync, rmSync } from "fs"
import { tmpdir } from "os"

describe("file-reference-resolver", () => {
    const testDir = join(tmpdir(), "fr-resolver-test-" + Date.now())

    // Setup temp files
    const setup = () => {
        mkdirSync(testDir, { recursive: true })
        writeFileSync(join(testDir, "hello.txt"), "Hello World")
        writeFileSync(join(testDir, "nested.txt"), "Content of nested")
    }

    const teardown = () => {
        try { rmSync(testDir, { recursive: true }) } catch { }
    }

    it("returns text unchanged when no @ references", async () => {
        const result = await resolveFileReferencesInText("plain text", "/tmp")
        expect(result).toBe("plain text")
    })

    it("resolves @file references to file content", async () => {
        setup()
        try {
            const result = await resolveFileReferencesInText(
                `Check @${join(testDir, "hello.txt")} for info`,
                testDir
            )
            expect(result).toContain("Hello World")
        } finally {
            teardown()
        }
    })

    it("shows error for missing files", async () => {
        const result = await resolveFileReferencesInText(
            "See @/nonexistent/file.txt here",
            "/tmp"
        )
        expect(result).toContain("[file not found:")
    })

    it("respects maxDepth to prevent infinite recursion", async () => {
        const result = await resolveFileReferencesInText(
            "text @something",
            "/tmp",
            0,
            0  // maxDepth=0 means no resolution
        )
        expect(result).toBe("text @something")
    })
})
