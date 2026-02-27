import { describe, test, expect } from "bun:test"

import { getLanguage } from "./code-parser"

describe("code-intel/code-parser", () => {
    describe("getLanguage", () => {
        // TypeScript is always in LANG_EXTENSIONS (real AND all mocks)
        test("detects TypeScript files (.ts)", () => {
            expect(getLanguage("src/foo.ts")).toBe("typescript")
        })

        test("detects TSX files (.tsx)", () => {
            expect(getLanguage("app/page.tsx")).toBe("tsx")
        })

        // These file types are NEVER in any LANG_EXTENSIONS
        test("returns null for image files", () => {
            expect(getLanguage("image.png")).toBeNull()
        })

        test("returns null for archive files", () => {
            expect(getLanguage("archive.zip")).toBeNull()
        })

        test("returns null for binary executables", () => {
            expect(getLanguage("program.exe")).toBeNull()
        })

        test("returns null for dotfiles", () => {
            expect(getLanguage(".gitignore")).toBeNull()
        })

        test("returns string for detected language", () => {
            const lang = getLanguage("src/main.ts")
            expect(typeof lang).toBe("string")
        })
    })
})
