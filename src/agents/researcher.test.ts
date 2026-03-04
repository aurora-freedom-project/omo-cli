import { describe, expect, test } from "bun:test"
import { createResearcherAgent, RESEARCHER_PROMPT_METADATA } from "./researcher"

describe("researcher", () => {
    describe("createResearcherAgent", () => {
        test("returns AgentConfig with correct structure", () => {
            const agent = createResearcherAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.description).toContain("Researcher")
            expect(agent.mode).toBe("subagent")
            expect(agent.model).toBe("anthropic/claude-sonnet-4-20250514")
        })

        test("has read-only tool restrictions", () => {
            const agent = createResearcherAgent("anthropic/claude-sonnet-4-20250514")
            const tools = agent.tools as Record<string, boolean> | undefined
            const permission = agent.permission as Record<string, string> | undefined
            if (tools) {
                expect(tools.write).toBe(false)
                expect(tools.edit).toBe(false)
            }
            if (permission) {
                expect(permission.write).toBe("deny")
                expect(permission.edit).toBe("deny")
            }
        })

        test("has a prompt", () => {
            const agent = createResearcherAgent("anthropic/claude-sonnet-4-20250514")
            expect(typeof agent.prompt).toBe("string")
            expect(agent.prompt!.length).toBeGreaterThan(100)
        })
    })

    describe("RESEARCHER_PROMPT_METADATA", () => {
        test("has required metadata", () => {
            expect(RESEARCHER_PROMPT_METADATA.category).toBe("exploration")
            expect(RESEARCHER_PROMPT_METADATA.cost).toBe("CHEAP")
            expect(RESEARCHER_PROMPT_METADATA.promptAlias).toBe("Researcher")
        })

        test("has useWhen examples", () => {
            expect(RESEARCHER_PROMPT_METADATA.useWhen).toBeDefined()
            expect(RESEARCHER_PROMPT_METADATA.useWhen!.length).toBeGreaterThan(0)
        })
    })
})
