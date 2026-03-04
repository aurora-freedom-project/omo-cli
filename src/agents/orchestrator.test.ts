import { describe, expect, test } from "bun:test"
import { createOrchestratorAgent } from "./orchestrator"

describe("orchestrator", () => {
    describe("createOrchestratorAgent", () => {
        test("returns AgentConfig with correct structure", () => {
            const agent = createOrchestratorAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.description).toContain("orchestrator")
            expect(agent.mode).toBe("primary")
            expect(agent.model).toBe("anthropic/claude-sonnet-4-20250514")
            expect(agent.maxTokens).toBe(64000)
            expect(agent.color).toBe("#00CED1")
        })

        test("uses thinking for non-GPT models", () => {
            const agent = createOrchestratorAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.thinking).toEqual({ type: "enabled", budgetTokens: 32000 })
            expect((agent as Record<string, unknown>).reasoningEffort).toBeUndefined()
        })

        test("uses reasoningEffort for GPT models", () => {
            const agent = createOrchestratorAgent("openai/gpt-4o")
            expect((agent as Record<string, unknown>).reasoningEffort).toBe("medium")
            expect(agent.thinking).toBeUndefined()
        })

        test("blocks call_omo_agent and allows question", () => {
            const agent = createOrchestratorAgent("anthropic/claude-sonnet-4-20250514")
            const permission = agent.permission as Record<string, string>
            expect(permission.call_omo_agent).toBe("deny")
            expect(permission.question).toBe("allow")
        })

        test("includes agent names in prompt when provided", () => {
            const agents = [
                { name: "Coder", description: "Writes and edits code.", metadata: { category: "coding", cost: "CHEAP", promptAlias: "Coder", triggers: [] } },
                { name: "Explorer", description: "Explores codebase.", metadata: { category: "exploration", cost: "FREE", promptAlias: "Explorer", triggers: [] } },
            ] as never[]
            const agent = createOrchestratorAgent("anthropic/claude-sonnet-4-20250514", agents)
            expect(agent.prompt).toContain("Coder")
            expect(agent.prompt).toContain("Explorer")
        })

        test("handles empty agents gracefully", () => {
            const agent = createOrchestratorAgent("anthropic/claude-sonnet-4-20250514", [])
            expect(agent.prompt).toBeDefined()
            expect(typeof agent.prompt).toBe("string")
        })
    })
})
