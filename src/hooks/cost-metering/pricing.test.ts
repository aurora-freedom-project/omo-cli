import { describe, test, expect } from "bun:test"
import { createPricingEngine, normalizeModelID } from "./pricing"

describe("normalizeModelID", () => {
    test("strips antigravity- prefix", () => {
        expect(normalizeModelID("antigravity-claude-opus-4-5")).toBe("claude-opus-4-5")
    })

    test("strips -thinking suffix", () => {
        expect(normalizeModelID("claude-sonnet-4-5-thinking")).toBe("claude-sonnet-4-5")
    })

    test("strips :cloud suffix", () => {
        expect(normalizeModelID("glm-5:cloud")).toBe("glm-5")
    })

    test("strips :tag-cloud suffix", () => {
        expect(normalizeModelID("qwen3.5:397b-cloud")).toBe("qwen3.5")
    })

    test("strips all combined", () => {
        expect(normalizeModelID("antigravity-claude-opus-4-6-thinking")).toBe("claude-opus-4-6")
    })

    test("lowercases", () => {
        expect(normalizeModelID("Claude-Sonnet-4-5")).toBe("claude-sonnet-4-5")
    })

    test("passes through simple model IDs", () => {
        expect(normalizeModelID("gpt-5.2")).toBe("gpt-5.2")
    })
})

describe("createPricingEngine", () => {
    const engine = createPricingEngine()

    describe("matchModelPricing", () => {
        test("exact match for bundled model", () => {
            const price = engine.matchModelPricing("claude-opus-4-6")
            expect(price.input).toBe(15.00)
            expect(price.output).toBe(75.00)
        })

        test("fuzzy match after normalization", () => {
            const price = engine.matchModelPricing("antigravity-claude-opus-4-5-thinking")
            expect(price.input).toBe(15.00)
            expect(price.output).toBe(75.00)
        })

        test("matches gemini-3-flash", () => {
            const price = engine.matchModelPricing("antigravity-gemini-3-flash")
            expect(price.input).toBe(0.075)
            expect(price.output).toBe(0.30)
        })

        test("matches ollama cloud models", () => {
            const price = engine.matchModelPricing("minimax-m2.5:cloud")
            expect(price.input).toBe(0.30)
            expect(price.output).toBe(1.20)
        })

        test("matches qwen models with tag suffix", () => {
            const price = engine.matchModelPricing("qwen3.5:397b-cloud")
            expect(price.input).toBe(0.55)
            expect(price.output).toBe(3.50)
        })

        test("returns default for unknown model", () => {
            const price = engine.matchModelPricing("totally-unknown-model")
            expect(price.input).toBe(3.00)
            expect(price.output).toBe(15.00)
        })
    })

    describe("estimateCost", () => {
        test("calculates cost correctly", () => {
            // 1000 input tokens of claude-sonnet-4-5 ($3/M) = $0.003
            // 500 output tokens of claude-sonnet-4-5 ($15/M) = $0.0075
            const cost = engine.estimateCost("claude-sonnet-4-5", 1000, 500)
            expect(cost).toBeCloseTo(0.0105, 4)
        })

        test("includes reasoning tokens as output cost", () => {
            // 1000 input ($3/M) + 500 output + 200 reasoning ($15/M each)
            const cost = engine.estimateCost("claude-sonnet-4-5", 1000, 500, 200)
            expect(cost).toBeCloseTo(0.0135, 4)
        })

        test("zero tokens = zero cost", () => {
            expect(engine.estimateCost("claude-opus-4-5", 0, 0, 0)).toBe(0)
        })

        test("large token count", () => {
            // 1M input tokens of claude-opus ($15/M) + 1M output ($75/M) = $90
            const cost = engine.estimateCost("claude-opus-4-5", 1_000_000, 1_000_000)
            expect(cost).toBeCloseTo(90.0, 1)
        })
    })
})

describe("user pricing overrides", () => {
    test("user model_pricing overrides bundled defaults", () => {
        const engine = createPricingEngine({
            model_pricing: {
                "claude-sonnet-4-5": { input: 5.00, output: 25.00 },
            },
        })
        const price = engine.matchModelPricing("claude-sonnet-4-5")
        expect(price.input).toBe(5.00)
        expect(price.output).toBe(25.00)
    })

    test("user can add new models", () => {
        const engine = createPricingEngine({
            model_pricing: {
                "my-custom-model": { input: 0.01, output: 0.05 },
            },
        })
        const price = engine.matchModelPricing("my-custom-model")
        expect(price.input).toBe(0.01)
        expect(price.output).toBe(0.05)
    })

    test("user default_pricing overrides system default", () => {
        const engine = createPricingEngine({
            default_pricing: { input: 1.00, output: 5.00 },
        })
        const price = engine.matchModelPricing("totally-unknown")
        expect(price.input).toBe(1.00)
        expect(price.output).toBe(5.00)
    })

    test("bundled defaults still work when user adds only new models", () => {
        const engine = createPricingEngine({
            model_pricing: {
                "new-model": { input: 0.50, output: 2.00 },
            },
        })
        // Existing bundled model should still match
        const price = engine.matchModelPricing("claude-opus-4-6")
        expect(price.input).toBe(15.00)
        expect(price.output).toBe(75.00)
    })
})
