import { describe, test, expect } from "bun:test"
import {
    DEFAULT_CATEGORIES,
    CATEGORY_PROMPT_APPENDS,
    CATEGORY_DESCRIPTIONS,
    isPlanAgent,
    PLAN_AGENT_NAMES,
    PLAN_AGENT_SYSTEM_PREPEND,
} from "./constants"

describe("constants", () => {
    describe("DEFAULT_CATEGORIES", () => {
        test("has all 7 expected categories", () => {
            // #given / #when
            const categoryNames = Object.keys(DEFAULT_CATEGORIES)

            // #then
            expect(categoryNames).toContain("unspecified-low")
            expect(categoryNames).toContain("unspecified-high")
            expect(categoryNames).toContain("quick")
            expect(categoryNames).toContain("visual-engineering")
            expect(categoryNames).toContain("ultrabrain")
            expect(categoryNames).toContain("artistry")
            expect(categoryNames).toContain("writing")
        })

        test("each category has a model", () => {
            // #given / #when / #then
            for (const [name, config] of Object.entries(DEFAULT_CATEGORIES)) {
                expect(config.model).toBeDefined()
                expect(typeof config.model).toBe("string")
                expect(config.model!.length).toBeGreaterThan(0)
            }
        })

        test("visual-engineering uses gemini", () => {
            // #given / #when
            const config = DEFAULT_CATEGORIES["visual-engineering"]

            // #then
            expect(config.model).toContain("gemini")
        })

        test("ultrabrain has variant", () => {
            // #given / #when
            const config = DEFAULT_CATEGORIES["ultrabrain"]

            // #then
            expect(config.variant).toBeDefined()
        })

        test("unspecified-high has variant max", () => {
            // #given / #when
            const config = DEFAULT_CATEGORIES["unspecified-high"]

            // #then
            expect(config.variant).toBe("max")
        })
    })

    describe("CATEGORY_PROMPT_APPENDS", () => {
        test("has prompt append for visual-engineering", () => {
            // #given / #when
            const append = CATEGORY_PROMPT_APPENDS["visual-engineering"]

            // #then
            expect(append).toBeDefined()
            expect(append.length).toBeGreaterThan(50) // substantial prompt
        })

        test("has prompt append for ultrabrain", () => {
            // #given / #when
            const append = CATEGORY_PROMPT_APPENDS["ultrabrain"]

            // #then
            expect(append).toBeDefined()
            expect(append.length).toBeGreaterThan(50)
        })

        test("has prompt append for writing", () => {
            // #given / #when
            const append = CATEGORY_PROMPT_APPENDS["writing"]

            // #then
            expect(append).toBeDefined()
            expect(append.length).toBeGreaterThan(50)
        })
    })

    describe("CATEGORY_DESCRIPTIONS", () => {
        test("has description for every default category", () => {
            // #given
            const categoryNames = Object.keys(DEFAULT_CATEGORIES)

            // #when / #then
            for (const name of categoryNames) {
                expect(CATEGORY_DESCRIPTIONS[name]).toBeDefined()
                expect(CATEGORY_DESCRIPTIONS[name].length).toBeGreaterThan(0)
            }
        })

        test("descriptions are human-readable strings", () => {
            // #given / #when / #then
            for (const [, desc] of Object.entries(CATEGORY_DESCRIPTIONS)) {
                expect(typeof desc).toBe("string")
                expect(desc.length).toBeGreaterThan(5)
            }
        })
    })

    describe("isPlanAgent", () => {
        test("returns true for all PLAN_AGENT_NAMES", () => {
            // #given / #when / #then
            for (const name of PLAN_AGENT_NAMES) {
                expect(isPlanAgent(name)).toBe(true)
            }
        })

        test("is case-insensitive", () => {
            // #given / #when / #then
            expect(isPlanAgent("PLAN")).toBe(true)
            expect(isPlanAgent("Plan")).toBe(true)
            expect(isPlanAgent("PLANNER")).toBe(true)
        })

        test("returns false for non-plan agents", () => {
            // #given / #when / #then
            expect(isPlanAgent("explorer")).toBe(false)
            expect(isPlanAgent("architect")).toBe(false)
            expect(isPlanAgent("worker")).toBe(false)
            expect(isPlanAgent("coder")).toBe(false)
        })

        test("returns false for undefined and empty", () => {
            // #given / #when / #then
            expect(isPlanAgent(undefined)).toBe(false)
            expect(isPlanAgent("")).toBe(false)
        })
    })

    describe("PLAN_AGENT_SYSTEM_PREPEND", () => {
        test("is a non-empty string", () => {
            // #given / #when / #then
            expect(typeof PLAN_AGENT_SYSTEM_PREPEND).toBe("string")
            expect(PLAN_AGENT_SYSTEM_PREPEND.length).toBeGreaterThan(100)
        })

        test("contains plan-related instructions", () => {
            // #given / #when / #then
            expect(PLAN_AGENT_SYSTEM_PREPEND.toLowerCase()).toContain("plan")
        })
    })
})
