import { describe, test, expect } from "bun:test"
import {
    HOOK_NAME,
    DEFAULT_STATE_FILE,
    COMPLETION_TAG_PATTERN,
    DEFAULT_MAX_ITERATIONS,
    DEFAULT_COMPLETION_PROMISE,
} from "./constants"

describe("ralph-loop/constants", () => {
    test("HOOK_NAME is ralph-loop", () => {
        expect(HOOK_NAME).toBe("ralph-loop")
    })

    test("DEFAULT_STATE_FILE points to .opencode directory", () => {
        expect(DEFAULT_STATE_FILE).toContain(".opencode")
        expect(DEFAULT_STATE_FILE).toContain("ralph-loop")
    })

    test("COMPLETION_TAG_PATTERN matches promise tags", () => {
        // #given
        const text = "Task done! <promise>DONE</promise>"

        // #when
        const match = text.match(COMPLETION_TAG_PATTERN)

        // #then
        expect(match).not.toBeNull()
        expect(match![1]).toBe("DONE")
    })

    test("COMPLETION_TAG_PATTERN is case-insensitive", () => {
        // #given
        const text = "<PROMISE>completed</PROMISE>"

        // #when
        const match = text.match(COMPLETION_TAG_PATTERN)

        // #then
        expect(match).not.toBeNull()
        expect(match![1]).toBe("completed")
    })

    test("DEFAULT_MAX_ITERATIONS is reasonable", () => {
        expect(DEFAULT_MAX_ITERATIONS).toBeGreaterThanOrEqual(10)
        expect(DEFAULT_MAX_ITERATIONS).toBeLessThanOrEqual(1000)
    })

    test("DEFAULT_COMPLETION_PROMISE is DONE", () => {
        expect(DEFAULT_COMPLETION_PROMISE).toBe("DONE")
    })
})
