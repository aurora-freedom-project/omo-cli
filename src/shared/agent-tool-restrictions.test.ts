import { describe, test, expect } from "bun:test"
import { getAgentToolRestrictions, hasAgentToolRestrictions } from "./agent-tool-restrictions"

describe("shared/agent-tool-restrictions", () => {
    describe("getAgentToolRestrictions", () => {
        test("returns constraints native checking variables bounding maps loops arrays bounds strings loop schema mappings", () => {
            const res = getAgentToolRestrictions("worker")
            expect(res).toEqual({ task: false, delegate_task: false })
        })

        test("returns empty tracking checking variables targets limits mapped variables missing loops loops", () => {
            const res = getAgentToolRestrictions("unknown")
            expect(res).toEqual({})
        })
    })

    describe("hasAgentToolRestrictions", () => {
        test("returns true mapping limits arrays string limit lists loop constraint checks variable bounding array logic limits", () => {
            expect(hasAgentToolRestrictions("worker")).toBe(true)
        })

        test("returns false bounds target limits variables arrays maps check checking logic strings bounded checks limits check array values", () => {
            expect(hasAgentToolRestrictions("unknown")).toBe(false)
        })
    })
})
