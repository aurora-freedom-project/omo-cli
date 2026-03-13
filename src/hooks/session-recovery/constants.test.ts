import { describe, test, expect } from "bun:test"
import {
    OPENCODE_STORAGE,
    MESSAGE_STORAGE,
    PART_STORAGE,
    THINKING_TYPES,
    META_TYPES,
    CONTENT_TYPES,
} from "./constants"

describe("session-recovery/constants", () => {
    test("storage paths are derived from OPENCODE_STORAGE", () => {
        // #given / #when / #then
        expect(MESSAGE_STORAGE).toContain("message")
        expect(PART_STORAGE).toContain("part")
    })

    test("THINKING_TYPES contains expected types", () => {
        // #given / #when / #then
        expect(THINKING_TYPES.has("thinking")).toBe(true)
        expect(THINKING_TYPES.has("redacted_thinking")).toBe(true)
        expect(THINKING_TYPES.has("reasoning")).toBe(true)
        expect(THINKING_TYPES.has("text")).toBe(false)
    })

    test("META_TYPES contains step markers", () => {
        // #given / #when / #then
        expect(META_TYPES.has("step-start")).toBe(true)
        expect(META_TYPES.has("step-finish")).toBe(true)
        expect(META_TYPES.has("text")).toBe(false)
    })

    test("CONTENT_TYPES contains user-visible types", () => {
        // #given / #when / #then
        expect(CONTENT_TYPES.has("text")).toBe(true)
        expect(CONTENT_TYPES.has("tool")).toBe(true)
        expect(CONTENT_TYPES.has("tool_use")).toBe(true)
        expect(CONTENT_TYPES.has("tool_result")).toBe(true)
        expect(CONTENT_TYPES.has("thinking")).toBe(false)
    })

    test("type sets are mutually exclusive", () => {
        // #given — no type should appear in more than one set
        for (const type of THINKING_TYPES) {
            expect(META_TYPES.has(type)).toBe(false)
            expect(CONTENT_TYPES.has(type)).toBe(false)
        }
        for (const type of META_TYPES) {
            expect(THINKING_TYPES.has(type)).toBe(false)
            expect(CONTENT_TYPES.has(type)).toBe(false)
        }
    })
})
