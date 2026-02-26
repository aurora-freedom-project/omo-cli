import { describe, test, expect } from "bun:test"
import { CODER_SYSTEM_PROMPT } from "./coder-prompt"

describe("CODER_SYSTEM_PROMPT Reviewer invocation policy", () => {
  test("should direct providing ONLY the file path string when invoking Reviewer", () => {
    // #given
    const prompt = CODER_SYSTEM_PROMPT

    // #when / #then
    // Should mention Reviewer and providing only the path
    expect(prompt.toLowerCase()).toMatch(/reviewer.*only.*path|path.*only.*reviewer/)
  })

  test("should forbid wrapping Reviewer invocation in explanations or markdown", () => {
    // #given
    const prompt = CODER_SYSTEM_PROMPT

    // #when / #then
    // Should mention not wrapping or using markdown for the path
    expect(prompt.toLowerCase()).toMatch(/not.*wrap|no.*explanation|no.*markdown/)
  })
})
