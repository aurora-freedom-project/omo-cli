import { describe, test, expect, beforeEach } from "bun:test"
import {
    getConfigLoadErrors,
    clearConfigLoadErrors,
    addConfigLoadError,
} from "./config-errors"

describe("config-errors", () => {
    beforeEach(() => {
        // Ensure state is clean before each test
        clearConfigLoadErrors()
    })

    test("starts with empty errors array", () => {
        const errors = getConfigLoadErrors()
        expect(errors).toEqual([])
    })

    test("can add an error and retrieve it", () => {
        const mockError = { path: "/path/to/config.json", error: "Invalid JSON" }
        addConfigLoadError(mockError)

        const errors = getConfigLoadErrors()
        expect(errors).toHaveLength(1)
        expect(errors[0]).toEqual(mockError)
    })

    test("can clear errors", () => {
        addConfigLoadError({ path: "/test1", error: "Error 1" })
        addConfigLoadError({ path: "/test2", error: "Error 2" })

        expect(getConfigLoadErrors()).toHaveLength(2)

        clearConfigLoadErrors()

        expect(getConfigLoadErrors()).toHaveLength(0)
        expect(getConfigLoadErrors()).toEqual([])
    })
})
