import { describe, it, expect } from "bun:test"
import { sanitizeModelField } from "./model-sanitizer"

describe("model-sanitizer", () => {
    it("returns undefined for claude-code source", () => {
        expect(sanitizeModelField("some-model", "claude-code")).toBeUndefined()
    })

    it("returns undefined for claude-code source (default)", () => {
        expect(sanitizeModelField("some-model")).toBeUndefined()
    })

    it("returns trimmed model for opencode source", () => {
        expect(sanitizeModelField("  gpt-5.2  ", "opencode")).toBe("gpt-5.2")
    })

    it("returns undefined for non-string model", () => {
        expect(sanitizeModelField(123, "opencode")).toBeUndefined()
    })

    it("returns undefined for empty string", () => {
        expect(sanitizeModelField("   ", "opencode")).toBeUndefined()
    })

    it("returns undefined for null/undefined", () => {
        expect(sanitizeModelField(null, "opencode")).toBeUndefined()
        expect(sanitizeModelField(undefined, "opencode")).toBeUndefined()
    })
})
