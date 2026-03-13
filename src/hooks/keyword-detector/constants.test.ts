import { describe, test, expect } from "bun:test"
import { isPlannerAgent, getUltraworkMessage } from "./constants"

describe("keyword-detector/constants", () => {
    describe("isPlannerAgent", () => {
        test("returns false for undefined", () => {
            expect(isPlannerAgent(undefined)).toBe(false)
        })

        test("returns false for empty string", () => {
            expect(isPlannerAgent("")).toBe(false)
        })

        test("detects 'planner' agent", () => {
            expect(isPlannerAgent("planner")).toBe(true)
        })

        test("detects 'Planner' (case insensitive)", () => {
            expect(isPlannerAgent("Planner")).toBe(true)
        })

        test("detects agent name containing 'planner'", () => {
            expect(isPlannerAgent("my-planner-agent")).toBe(true)
        })

        test("detects 'coder' agent", () => {
            expect(isPlannerAgent("coder")).toBe(true)
        })

        test("detects 'plan' exact name", () => {
            expect(isPlannerAgent("plan")).toBe(true)
        })

        test("returns false for 'orchestrator'", () => {
            expect(isPlannerAgent("orchestrator")).toBe(false)
        })

        test("returns false for 'conductor'", () => {
            expect(isPlannerAgent("conductor")).toBe(false)
        })

        test("returns false for 'researcher'", () => {
            expect(isPlannerAgent("researcher")).toBe(false)
        })
    })

    describe("getUltraworkMessage", () => {
        test("returns string for undefined agent", () => {
            const msg = getUltraworkMessage(undefined)
            expect(typeof msg).toBe("string")
            expect(msg).toContain("ultrawork-mode")
            expect(msg).toContain("ULTRAWORK MODE ENABLED")
        })

        test("returns planner-specific message for planner agents", () => {
            const msg = getUltraworkMessage("planner")
            expect(msg).toContain("ultrawork-mode")
            expect(msg).toContain("PLANNER")
            expect(msg).toContain("NOT AN IMPLEMENTER")
        })

        test("returns implementation-focused message for non-planner agents", () => {
            const msg = getUltraworkMessage("orchestrator")
            expect(msg).toContain("ultrawork-mode")
            expect(msg).toContain("ABSOLUTE CERTAINTY REQUIRED")
            expect(msg).not.toContain("NOT AN IMPLEMENTER")
        })

        test("returns planner message for coder agent", () => {
            const msg = getUltraworkMessage("coder")
            expect(msg).toContain("NOT AN IMPLEMENTER")
        })

        test("returns non-planner message for conductor", () => {
            const msg = getUltraworkMessage("conductor")
            expect(msg).not.toContain("NOT AN IMPLEMENTER")
        })
    })
})
