import { describe, test, expect } from "bun:test"
import {
    BACKGROUND_TASK_DESCRIPTION,
    BACKGROUND_OUTPUT_DESCRIPTION,
    BACKGROUND_CANCEL_DESCRIPTION,
} from "./constants"

describe("background-task constants", () => {
    test("BACKGROUND_TASK_DESCRIPTION mentions background", () => {
        // #given / #when / #then
        expect(BACKGROUND_TASK_DESCRIPTION).toBeDefined()
        expect(BACKGROUND_TASK_DESCRIPTION.length).toBeGreaterThan(10)
        expect(BACKGROUND_TASK_DESCRIPTION.toLowerCase()).toContain("background")
    })

    test("BACKGROUND_TASK_DESCRIPTION mentions English requirement", () => {
        // #given / #when / #then
        expect(BACKGROUND_TASK_DESCRIPTION).toContain("English")
    })

    test("BACKGROUND_TASK_DESCRIPTION mentions background_output", () => {
        // #given / #when / #then
        expect(BACKGROUND_TASK_DESCRIPTION).toContain("background_output")
    })

    test("BACKGROUND_OUTPUT_DESCRIPTION mentions block", () => {
        // #given / #when / #then
        expect(BACKGROUND_OUTPUT_DESCRIPTION).toBeDefined()
        expect(BACKGROUND_OUTPUT_DESCRIPTION).toContain("block")
    })

    test("BACKGROUND_CANCEL_DESCRIPTION mentions all=true", () => {
        // #given / #when / #then
        expect(BACKGROUND_CANCEL_DESCRIPTION).toBeDefined()
        expect(BACKGROUND_CANCEL_DESCRIPTION).toContain("all=true")
    })

    test("all descriptions are non-empty strings", () => {
        // #given / #when / #then
        for (const desc of [BACKGROUND_TASK_DESCRIPTION, BACKGROUND_OUTPUT_DESCRIPTION, BACKGROUND_CANCEL_DESCRIPTION]) {
            expect(typeof desc).toBe("string")
            expect(desc.length).toBeGreaterThan(20)
        }
    })
})
