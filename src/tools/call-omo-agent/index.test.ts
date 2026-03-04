import { describe, it, expect } from "bun:test"
import {
    ALLOWED_AGENTS,
    CALL_OMO_AGENT_DESCRIPTION,
} from "./constants"

describe("call-omo-agent", () => {
    describe("constants", () => {
        it("ALLOWED_AGENTS includes explorer and researcher", () => {
            expect(ALLOWED_AGENTS).toContain("explorer")
            expect(ALLOWED_AGENTS).toContain("researcher")
        })

        it("ALLOWED_AGENTS is readonly tuple", () => {
            expect(ALLOWED_AGENTS.length).toBeGreaterThan(0)
        })

        it("description explains agent spawning", () => {
            expect(CALL_OMO_AGENT_DESCRIPTION.length).toBeGreaterThan(20)
            expect(CALL_OMO_AGENT_DESCRIPTION).toContain("explorer")
            expect(CALL_OMO_AGENT_DESCRIPTION).toContain("researcher")
        })
    })

    describe("tool factory", () => {
        it("createCallOmoAgent is a function", () => {
            const { createCallOmoAgent } = require("./tools")
            expect(typeof createCallOmoAgent).toBe("function")
        })
    })
})
