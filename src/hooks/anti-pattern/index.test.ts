import { describe, it, expect } from "bun:test"
import {
    extractAntiPatterns,
    formatAntiPatternGuidance,
    processSkillWithAntiPatterns,
    extractReferenceHints,
    findBestReference,
} from "./index"

describe("Anti-Pattern Extractor", () => {
    describe("extractAntiPatterns", () => {
        it("extracts anti-patterns section", () => {
            const content = `# My Skill

## Instructions
Do something useful.

## Anti-Patterns
- Don't use eval()
- Don't hardcode credentials
- Avoid global state

## Examples
Some examples here.`
            const result = extractAntiPatterns(content)
            expect(result).not.toBeNull()
            expect(result).toContain("Don't use eval()")
            expect(result).toContain("Don't hardcode credentials")
            expect(result).toContain("Avoid global state")
        })

        it("returns null when no anti-patterns section", () => {
            const content = `# Skill\n## Instructions\nDo stuff.\n## Examples\nExamples.`
            expect(extractAntiPatterns(content)).toBeNull()
        })

        it("handles anti-patterns at end of file", () => {
            const content = `# Skill\n## Anti-Patterns\n- Bad practice A\n- Bad practice B`
            const result = extractAntiPatterns(content)
            expect(result).toContain("Bad practice A")
            expect(result).toContain("Bad practice B")
        })

        it("returns null for empty anti-patterns section", () => {
            const content = `# Skill\n## Anti-Patterns\n\n## Next`
            expect(extractAntiPatterns(content)).toBeNull()
        })
    })

    describe("formatAntiPatternGuidance", () => {
        it("wraps in xml tags with skill name", () => {
            const result = formatAntiPatternGuidance("- Don't use eval()", "security-auditor")
            expect(result).toContain("<anti_patterns")
            expect(result).toContain('skill="security-auditor"')
            expect(result).toContain("Don't use eval()")
            expect(result).toContain("ANTI-PATTERNS")
        })
    })

    describe("processSkillWithAntiPatterns", () => {
        it("prepends guidance when anti-patterns found", () => {
            const content = `# Skill\n## Anti-Patterns\n- Bad thing\n\n## Instructions\nDo good.`
            const result = processSkillWithAntiPatterns(content, "test-skill")
            expect(result.hasAntiPatterns).toBe(true)
            expect(result.content).toContain("<anti_patterns")
            expect(result.content.indexOf("<anti_patterns")).toBeLessThan(
                result.content.indexOf("# Skill")
            )
        })

        it("returns original content when no anti-patterns", () => {
            const content = `# Skill\n## Instructions\nDo good.`
            const result = processSkillWithAntiPatterns(content, "test-skill")
            expect(result.hasAntiPatterns).toBe(false)
            expect(result.content).toBe(content)
        })
    })

    describe("extractReferenceHints", () => {
        it("extracts markdown link references", () => {
            const content = `# Skill\n## References\n- [Guide](reference/guide.md)\n- [API](reference/api.ts)\n## Next`
            const refs = extractReferenceHints(content)
            expect(refs).toContain("reference/guide.md")
            expect(refs).toContain("reference/api.ts")
        })

        it("extracts backtick-enclosed file paths", () => {
            const content = "# Skill\n## References\nSee `reference/setup.md` and `reference/config.yaml`.\n## Next"
            const refs = extractReferenceHints(content)
            expect(refs).toContain("reference/setup.md")
            expect(refs).toContain("reference/config.yaml")
        })

        it("returns empty for no references section", () => {
            expect(extractReferenceHints("# Skill\n## Instructions\nFoo")).toEqual([])
        })
    })

    describe("findBestReference", () => {
        it("matches by keyword overlap", () => {
            const candidates = ["auth-setup.md", "database-config.md", "deploy-guide.md"]
            const result = findBestReference(["auth", "jwt", "token"], candidates)
            expect(result).toBe("auth-setup.md")
        })

        it("returns null for no matches", () => {
            const result = findBestReference(["zzz", "xxx"], ["auth.md", "deploy.md"])
            expect(result).toBeNull()
        })

        it("returns null for empty inputs", () => {
            expect(findBestReference([], ["a.md"])).toBeNull()
            expect(findBestReference(["test"], [])).toBeNull()
        })
    })
})
