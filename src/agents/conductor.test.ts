import { describe, expect, test } from "bun:test"
import { createConsultantAgent, consultantPromptMetadata } from "./conductor"

describe("conductor (Consultant agent)", () => {
    describe("createConsultantAgent", () => {
        test("returns AgentConfig with correct defaults", () => {
            const agent = createConsultantAgent("anthropic/claude-sonnet-4-20250514")

            expect(agent.description).toContain("Pre-planning consultant")
            expect(agent.description).toContain("Consultant")
            expect(agent.mode).toBe("subagent")
            expect(agent.model).toBe("anthropic/claude-sonnet-4-20250514")
            expect(agent.temperature).toBe(0.3)
        })

        test("uses thinking with budget tokens", () => {
            const agent = createConsultantAgent("anthropic/claude-sonnet-4-20250514")

            expect(agent.thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
        })

        test("has prompt content", () => {
            const agent = createConsultantAgent("anthropic/claude-sonnet-4-20250514")

            expect(agent.prompt).toBeDefined()
            expect(typeof agent.prompt).toBe("string")
            expect(agent.prompt!.length).toBeGreaterThan(100)
        })

        test("blocks write, edit, task, delegate_task tools", () => {
            const agent = createConsultantAgent("anthropic/claude-sonnet-4-20250514")
            const tools = agent.tools as Record<string, boolean> | undefined
            const permission = agent.permission as Record<string, string> | undefined

            if (tools) {
                expect(tools.write).toBe(false)
                expect(tools.edit).toBe(false)
                expect(tools.task).toBe(false)
                expect(tools.delegate_task).toBe(false)
            }
            if (permission) {
                expect(permission.write).toBe("deny")
                expect(permission.edit).toBe("deny")
                expect(permission.task).toBe("deny")
                expect(permission.delegate_task).toBe("deny")
            }
        })

        test("uses provided model string", () => {
            const agent = createConsultantAgent("openai/gpt-4o")

            expect(agent.model).toBe("openai/gpt-4o")
        })
    })

    describe("consultantPromptMetadata", () => {
        test("has required metadata fields", () => {
            expect(consultantPromptMetadata.category).toBe("advisor")
            expect(consultantPromptMetadata.cost).toBe("EXPENSIVE")
            expect(consultantPromptMetadata.promptAlias).toBe("Consultant")
        })

        test("has triggers with domain and trigger pairs", () => {
            expect(consultantPromptMetadata.triggers).toBeDefined()
            expect(consultantPromptMetadata.triggers!.length).toBeGreaterThan(0)
            const first = consultantPromptMetadata.triggers![0]
            expect(first.domain).toBeDefined()
            expect(first.trigger).toBeDefined()
        })

        test("has avoidWhen guidelines", () => {
            expect(consultantPromptMetadata.avoidWhen).toBeDefined()
            expect(consultantPromptMetadata.avoidWhen!.length).toBeGreaterThan(0)
        })

        test("has keyTrigger", () => {
            expect(consultantPromptMetadata.keyTrigger).toBeDefined()
            expect(typeof consultantPromptMetadata.keyTrigger).toBe("string")
        })
    })
})
