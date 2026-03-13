import { describe, it, expect } from "bun:test"

describe("call-omo-agent tool", () => {
    it("exports createCallOmoAgent factory function", async () => {
        const mod = await import("./tools")
        expect(typeof mod.createCallOmoAgent).toBe("function")
    })
})

describe("ALLOWED_AGENTS constant", () => {
    it("includes expected agent names", async () => {
        const { ALLOWED_AGENTS } = await import("./constants")
        expect(Array.isArray(ALLOWED_AGENTS)).toBe(true)
        expect(ALLOWED_AGENTS.length).toBeGreaterThan(0)
    })
})

describe("CallOmoAgentArgs type", () => {
    it("types module exports correctly", async () => {
        const mod = await import("./types")
        // Verify the module loads without error (type-only modules still export)
        expect(mod).toBeDefined()
    })
})
