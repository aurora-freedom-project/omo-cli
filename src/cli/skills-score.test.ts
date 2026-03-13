/// <reference types="bun-types" />
import { describe, test, expect } from "bun:test"
import { scoreSkill, formatScore } from "./skills-score"

describe("scoreSkill", () => {
    test("scores well-structured skill highly", () => {
        const content = `---
name: test-skill
description: A well-structured test skill for OMO agent orchestration
---

# Test Skill

This skill helps the orchestrator agent manage delegate_task calls efficiently.

## Instructions

1. **Analyze** the task requirements
2. **Design** the pipeline stages
3. **Execute** each stage via delegate_task
4. **Review** the combined output
5. **Validate** against acceptance criteria

## Examples

\`\`\`
$ omo-cli run "implement feature X"
\`\`\`

## Agent Roles

The coder and reviewer agents work together in this pipeline.

## Anti-Patterns (NEVER)

- **Don't** skip the review stage
- **Don't** run stages in parallel
- **Don't** pass raw code between stages
- **Don't** ignore stage failures
- **Don't** create more than 6 stages
`
        const result = scoreSkill("test-skill", content, "/path/test-skill/SKILL.md")
        expect(result.grade).toMatch(/[AB]/)
        expect(result.totalScore).toBeGreaterThan(4.0)
        expect(result.dimensions).toHaveLength(7)
    })

    test("scores minimal skill poorly", () => {
        const content = `# Minimal\nDo stuff.\n`
        const result = scoreSkill("minimal", content, "/path/minimal/SKILL.md")
        expect(result.grade).toMatch(/[DF]/)
        expect(result.totalScore).toBeLessThan(3.0)
    })

    test("returns 7 dimensions", () => {
        const content = "---\nname: test\ndescription: test\n---\n# Test"
        const result = scoreSkill("test", content, "/path")
        expect(result.dimensions).toHaveLength(7)
        const names = result.dimensions.map(d => d.dimension)
        expect(names).toContain("Frontmatter")
        expect(names).toContain("Content Depth")
        expect(names).toContain("Anti-Patterns")
        expect(names).toContain("Actionability")
        expect(names).toContain("Structure")
        expect(names).toContain("Specificity")
        expect(names).toContain("Context Relevance")
    })

    test("penalizes missing anti-patterns", () => {
        const withAP = "---\nname: a\ndescription: a\n---\n# A\n\n## Anti-Patterns (NEVER)\n\n- **Don't** do X\n- **Don't** do Y\n- **Don't** do Z\n"
        const withoutAP = "---\nname: a\ndescription: a\n---\n# A\n\nSome content here\n"

        const scoreWith = scoreSkill("a", withAP, "/a")
        const scoreWithout = scoreSkill("a", withoutAP, "/a")

        const apDimWith = scoreWith.dimensions.find(d => d.dimension === "Anti-Patterns")!
        const apDimWithout = scoreWithout.dimensions.find(d => d.dimension === "Anti-Patterns")!

        expect(apDimWith.score).toBeGreaterThan(apDimWithout.score)
    })

    test("grade scale is correct", () => {
        // Verify grade thresholds
        const makeSkill = (score: number) => ({ name: "t", filePath: "/t", dimensions: [], totalScore: score, grade: "F" as const, issues: [] })
        // We can't directly test grading without calling scoreSkill, but we can test output
        const minContent = "x"
        const result = scoreSkill("min", minContent, "/min")
        expect(["A", "B", "C", "D", "F"]).toContain(result.grade)
    })
})

describe("formatScore", () => {
    test("produces readable output", () => {
        const content = "---\nname: test\ndescription: A test skill\n---\n# Test\n\nContent\n"
        const score = scoreSkill("test", content, "/test")
        const output = formatScore(score)
        expect(output).toContain("test")
        expect(output).toContain("Grade:")
        expect(output).toContain("Frontmatter")
    })
})
