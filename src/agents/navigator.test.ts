import { describe, expect, test } from "bun:test"
import { createConductorAgent, conductorPromptMetadata } from "./navigator"

describe("navigator (Conductor agent)", () => {
    describe("createConductorAgent", () => {
        test("returns AgentConfig with correct defaults", () => {
            const agent = createConductorAgent({ model: "anthropic/claude-sonnet-4-20250514" })

            expect(agent.description).toContain("Orchestrates work")
            expect(agent.model).toBe("anthropic/claude-sonnet-4-20250514")
            expect(agent.temperature).toBe(0.1)
            expect(agent.color).toBe("#10B981")
        })

        test("uses thinking with budget tokens", () => {
            const agent = createConductorAgent({ model: "anthropic/claude-sonnet-4-20250514" })
            expect(agent.thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
        })

        test("omits model when not provided in context", () => {
            const agent = createConductorAgent({})
            expect(agent.model).toBeUndefined()
        })

        test("blocks task and call_omo_agent tools", () => {
            const agent = createConductorAgent({ model: "anthropic/claude-sonnet-4-20250514" })
            const tools = agent.tools as Record<string, boolean> | undefined
            const permission = agent.permission as Record<string, string> | undefined
            if (tools) {
                expect(tools.task).toBe(false)
                expect(tools.call_omo_agent).toBe(false)
            }
            if (permission) {
                expect(permission.task).toBe("deny")
                expect(permission.call_omo_agent).toBe("deny")
            }
        })

        test("includes dynamic prompt based on context", () => {
            const agent = createConductorAgent({
                model: "anthropic/claude-sonnet-4-20250514",
                availableAgents: [{ name: "coder", description: "Writes code." }] as never[],
            })
            expect(agent.prompt).toContain("Conductor")
        })
    })

    describe("conductorPromptMetadata", () => {
        test("has required metadata fields", () => {
            expect(conductorPromptMetadata.category).toBe("advisor")
            expect(conductorPromptMetadata.cost).toBe("EXPENSIVE")
            expect(conductorPromptMetadata.promptAlias).toBe("Conductor")
            expect(conductorPromptMetadata.triggers!.length).toBeGreaterThan(0)
        })

        test("has avoidWhen and keyTrigger", () => {
            expect(conductorPromptMetadata.avoidWhen!.length).toBeGreaterThan(0)
            expect(conductorPromptMetadata.keyTrigger!.length).toBeGreaterThan(0)
        })
    })
})
