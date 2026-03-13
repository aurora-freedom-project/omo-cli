import { describe, test, expect } from "bun:test"
import { computeFileHash, getLanguage, parseFile } from "./code-parser"

describe("code-intel/code-parser exports", () => {
    describe("computeFileHash", () => {
        test("produces consistent hash for same content", () => {
            const h1 = computeFileHash("hello world")
            const h2 = computeFileHash("hello world")
            expect(h1).toBe(h2)
        })

        test("produces different hash for different content", () => {
            const h1 = computeFileHash("hello")
            const h2 = computeFileHash("world")
            expect(h1).not.toBe(h2)
        })

        test("returns a sha256 hex string", () => {
            const hash = computeFileHash("test")
            expect(hash).toMatch(/^[a-f0-9]+$/)
        })
    })

    describe("getLanguage", () => {
        test("detects typescript (.ts)", () => {
            expect(getLanguage("src/foo.ts")).toBe("typescript")
        })

        test("detects tsx", () => {
            expect(getLanguage("comp.tsx")).toBe("tsx")
        })

        test("detects javascript (.js)", () => {
            expect(getLanguage("lib.js")).toBe("javascript")
        })

        test("detects python (.py)", () => {
            expect(getLanguage("script.py")).toBe("python")
        })

        test("detects go (.go)", () => {
            expect(getLanguage("main.go")).toBe("go")
        })

        test("detects rust (.rs)", () => {
            expect(getLanguage("lib.rs")).toBe("rust")
        })

        test("returns null for unknown extension", () => {
            expect(getLanguage("data.xyz")).toBeNull()
        })

        test("returns null for no extension", () => {
            expect(getLanguage("Makefile")).toBeNull()
        })
    })
})
