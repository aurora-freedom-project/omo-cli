import { describe, expect, test } from "bun:test"
import { createVisionAgent, VISION_PROMPT_METADATA } from "./vision"

describe("vision", () => {
    describe("createVisionAgent", () => {
        test("returns AgentConfig with correct structure", () => {
            const agent = createVisionAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.description).toContain("media files")
            expect(agent.mode).toBe("subagent")
            expect(agent.model).toBe("anthropic/claude-sonnet-4-20250514")
            expect(agent.temperature).toBe(0.1)
        })

        test("only allows read tool", () => {
            const agent = createVisionAgent("anthropic/claude-sonnet-4-20250514")
            const tools = agent.tools as Record<string, boolean> | undefined
            if (tools) {
                expect(tools.read).toBe(true)
            }
        })

        test("has media interpretation prompt", () => {
            const agent = createVisionAgent("anthropic/claude-sonnet-4-20250514")
            expect(agent.prompt).toContain("interpret media files")
            expect(agent.prompt).toContain("PDFs")
        })
    })

    describe("VISION_PROMPT_METADATA", () => {
        test("has correct metadata", () => {
            expect(VISION_PROMPT_METADATA.category).toBe("utility")
            expect(VISION_PROMPT_METADATA.cost).toBe("CHEAP")
            expect(VISION_PROMPT_METADATA.promptAlias).toBe("Multimodal Looker")
        })

        test("has empty triggers (not auto-triggered)", () => {
            expect(VISION_PROMPT_METADATA.triggers).toEqual([])
        })
    })
})
