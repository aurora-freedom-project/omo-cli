import { describe, expect, test } from "bun:test"
import { createArchitectAgent, ARCHITECT_PROMPT_METADATA } from "./architect"

describe("architect", () => {
    describe("createArchitectAgent", () => {
        test("returns AgentConfig with correct structure", () => {
            const agent = createArchitectAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.description).toContain("Architect")
            expect(agent.mode).toBe("subagent")
            expect(agent.model).toBe("anthropic/claude-sonnet-4-20250514")
            expect(agent.temperature).toBe(0.1)
        })

        test("uses thinking for non-GPT models", () => {
            const agent = createArchitectAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
        })

        test("uses reasoningEffort for GPT models", () => {
            const agent = createArchitectAgent("openai/gpt-4o")
            expect((agent as Record<string, unknown>).reasoningEffort).toBe("medium")
            expect(agent.thinking).toBeUndefined()
        })

        test("blocks write, edit, task, delegate_task tools", () => {
            const agent = createArchitectAgent("anthropic/claude-sonnet-4-20250514")
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
            }
        })

        test("has system prompt content", () => {
            const agent = createArchitectAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.prompt).toContain("strategic technical advisor")
        })
    })

    describe("ARCHITECT_PROMPT_METADATA", () => {
        test("has correct metadata", () => {
            expect(ARCHITECT_PROMPT_METADATA.category).toBe("advisor")
            expect(ARCHITECT_PROMPT_METADATA.cost).toBe("EXPENSIVE")
            expect(ARCHITECT_PROMPT_METADATA.promptAlias).toBe("Architect")
        })

        test("has triggers and avoidWhen", () => {
            expect(ARCHITECT_PROMPT_METADATA.triggers!.length).toBeGreaterThan(0)
            expect(ARCHITECT_PROMPT_METADATA.avoidWhen!.length).toBeGreaterThan(0)
        })
    })
})
