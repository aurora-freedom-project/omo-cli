import { describe, it, expect } from "bun:test"
import {
    createContextPlan,
    formatPlanHints,
} from "./index"

describe("Context Planner", () => {
    describe("createContextPlan", () => {
        it("activates all features for code tasks at low pressure", () => {
            const plan = createContextPlan("Implement JWT authentication with bcrypt")
            expect(plan.query.taskType).toBe("code")
            expect(plan.pressure).toBe("low")
            expect(plan.injectSkills).toBe(true)
            expect(plan.injectRag).toBe(true)
            expect(plan.recallTrajectories).toBe(true)
            expect(plan.extractAntiPatterns).toBe(true)
        })

        it("reduces features at high pressure", () => {
            const plan = createContextPlan("Implement JWT authentication", {
                contextWindow: 128000,
                currentUsageTokens: 70000, // > 50% → high pressure
            })
            expect(plan.pressure).toBe("high")
            expect(plan.injectSkills).toBe(true)
            expect(plan.injectRag).toBe(false) // Cut at high
            expect(plan.recallTrajectories).toBe(false) // Cut at high
        })

        it("minimal injection at critical pressure", () => {
            const plan = createContextPlan("Fix a bug", {
                contextWindow: 128000,
                currentUsageTokens: 100000, // > 75% → critical
            })
            expect(plan.pressure).toBe("critical")
            expect(plan.injectSkills).toBe(false) // Cut at critical
            expect(plan.injectRag).toBe(false)
        })

        it("skips RAG for research tasks", () => {
            const plan = createContextPlan("Research best practices for microservices")
            expect(plan.query.taskType).toBe("research")
            expect(plan.injectSkills).toBe(false)
            expect(plan.injectRag).toBe(false)
        })

        it("enables stream-chain for design tasks", () => {
            const plan = createContextPlan("Design the API architecture for the new service")
            expect(plan.query.taskType).toBe("design")
            expect(plan.enableStreamChain).toBe(true)
        })

        it("calculates maxContextTokens based on pressure", () => {
            const planLow = createContextPlan("code task", {
                contextWindow: 128000,
                currentUsageTokens: 0,
            })
            const planHigh = createContextPlan("code task", {
                contextWindow: 128000,
                currentUsageTokens: 70000,
            })
            expect(planLow.maxContextTokens).toBeGreaterThan(planHigh.maxContextTokens)
        })
    })

    describe("formatPlanHints", () => {
        it("returns null for no hints", () => {
            const plan = createContextPlan("implement something simple")
            plan.hints = []
            expect(formatPlanHints(plan)).toBeNull()
        })

        it("formats hints with task type and complexity", () => {
            const plan = createContextPlan("URGENT: fix the production auth bug in src/auth.ts")
            const formatted = formatPlanHints(plan)
            expect(formatted).not.toBeNull()
            expect(formatted).toContain("<context_plan>")
            expect(formatted).toContain("Task type:")
        })
    })
})
