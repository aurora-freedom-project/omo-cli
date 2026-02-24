import { describe, test, expect } from "bun:test"
import { CODER_SYSTEM_PROMPT } from "./coder-prompt"

describe("CODER_SYSTEM_PROMPT Momus invocation policy", () => {
  test("should direct providing ONLY the file path string when invoking Momus", () => {
    // #given
    const prompt = CODER_SYSTEM_PROMPT

    // #when / #then
    // Should mention Momus and providing only the path
    expect(prompt.toLowerCase()).toMatch(/momus.*only.*path|path.*only.*momus/)
  })

  test("should forbid wrapping Momus invocation in explanations or markdown", () => {
    // #given
    const prompt = CODER_SYSTEM_PROMPT

    // #when / #then
    // Should mention not wrapping or using markdown for the path
    expect(prompt.toLowerCase()).toMatch(/not.*wrap|no.*explanation|no.*markdown/)
  })
})
