import { describe, test, expect } from "bun:test"
import { PLANNER_SYSTEM_PROMPT } from "./coder"

describe("PLANNER_SYSTEM_PROMPT Reviewer invocation policy", () => {
  test("planner prompt mentions Reviewer agent for plan review", () => {
    const prompt = PLANNER_SYSTEM_PROMPT
    expect(prompt).toContain("Reviewer")
    expect(prompt).toContain("review")
  })

  test("planner prompt includes delegate_task pattern for Reviewer", () => {
    const prompt = PLANNER_SYSTEM_PROMPT
    expect(prompt.toLowerCase()).toMatch(/reviewer.*only.*path|path.*only.*reviewer|delegate_task.*reviewer|reviewer.*plan/)
  })

  test("should forbid wrapping Reviewer invocation in explanations or markdown", () => {
    // #given
    const prompt = PLANNER_SYSTEM_PROMPT

    // #when / #then
    // Should mention not wrapping or using markdown for the path
    expect(prompt.toLowerCase()).toMatch(/not.*wrap|no.*explanation|no.*markdown/)
  })
})
