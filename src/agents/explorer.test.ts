import { describe, expect, test } from "bun:test"
import { createExplorerAgent, EXPLORER_PROMPT_METADATA } from "./explorer"

describe("explorer", () => {
    describe("createExplorerAgent", () => {
        test("returns AgentConfig with correct structure", () => {
            const agent = createExplorerAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.description).toContain("Explorer")
            expect(agent.mode).toBe("subagent")
            expect(agent.model).toBe("anthropic/claude-sonnet-4-20250514")
            expect(agent.temperature).toBe(0.1)
        })

        test("blocks write, edit, task, delegate_task, call_omo_agent tools", () => {
            const agent = createExplorerAgent("anthropic/claude-sonnet-4-20250514")
            const tools = agent.tools as Record<string, boolean> | undefined
            const permission = agent.permission as Record<string, string> | undefined
            if (tools) {
                expect(tools.write).toBe(false)
                expect(tools.edit).toBe(false)
                expect(tools.task).toBe(false)
                expect(tools.delegate_task).toBe(false)
                expect(tools.call_omo_agent).toBe(false)
            }
            if (permission) {
                expect(permission.write).toBe("deny")
                expect(permission.edit).toBe("deny")
            }
        })

        test("has codebase search prompt content", () => {
            const agent = createExplorerAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.prompt).toContain("codebase search specialist")
            expect(agent.prompt).toContain("Read-only")
        })
    })

    describe("EXPLORER_PROMPT_METADATA", () => {
        test("has correct metadata", () => {
            expect(EXPLORER_PROMPT_METADATA.category).toBe("exploration")
            expect(EXPLORER_PROMPT_METADATA.cost).toBe("FREE")
            expect(EXPLORER_PROMPT_METADATA.promptAlias).toBe("Explorer")
        })

        test("has useWhen and avoidWhen", () => {
            expect(EXPLORER_PROMPT_METADATA.useWhen!.length).toBeGreaterThan(0)
            expect(EXPLORER_PROMPT_METADATA.avoidWhen!.length).toBeGreaterThan(0)
        })
    })
})
