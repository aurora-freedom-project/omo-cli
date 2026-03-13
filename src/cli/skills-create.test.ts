/// <reference types="bun-types" />
import { describe, test, expect, afterEach } from "bun:test"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"
import { validateSkillName, validateSkillMd, generateSkillMd, createSkill } from "./skills-create"

// ───── Validation Tests ─────

describe("validateSkillName", () => {
    test("valid kebab-case names", () => {
        expect(validateSkillName("my-skill").valid).toBe(true)
        expect(validateSkillName("api-design").valid).toBe(true)
        expect(validateSkillName("a").valid).toBe(true)
        expect(validateSkillName("skill123").valid).toBe(true)
        expect(validateSkillName("my-longer-skill-name").valid).toBe(true)
    })

    test("rejects empty name", () => {
        const result = validateSkillName("")
        expect(result.valid).toBe(false)
        expect(result.errors).toContain("Name cannot be empty")
    })

    test("rejects non-kebab-case names", () => {
        expect(validateSkillName("MySkill").valid).toBe(false)
        expect(validateSkillName("my_skill").valid).toBe(false)
        expect(validateSkillName("my skill").valid).toBe(false)
        expect(validateSkillName("123skill").valid).toBe(false)
        expect(validateSkillName("-leading").valid).toBe(false)
    })

    test("rejects names over 80 chars", () => {
        const longName = "a-" + "b".repeat(80)
        const result = validateSkillName(longName)
        expect(result.valid).toBe(false)
    })
})

describe("validateSkillMd", () => {
    test("valid SKILL.md content", () => {
        const content = `---
name: test-skill
description: A test skill
---

# Test Skill

Some content here.
`
        expect(validateSkillMd(content).valid).toBe(true)
    })

    test("rejects content without frontmatter", () => {
        const result = validateSkillMd("# Just a heading\nSome content")
        expect(result.valid).toBe(false)
    })

    test("rejects frontmatter missing name", () => {
        const content = "---\ndescription: test\n---\n# Heading"
        const result = validateSkillMd(content)
        expect(result.valid).toBe(false)
        expect(result.errors).toContain("Missing 'name' in frontmatter")
    })

    test("rejects frontmatter missing description", () => {
        const content = "---\nname: test\n---\n# Heading"
        const result = validateSkillMd(content)
        expect(result.valid).toBe(false)
        expect(result.errors).toContain("Missing 'description' in frontmatter")
    })
})

// ───── Generation Tests ─────

describe("generateSkillMd", () => {
    test("generates valid SKILL.md with frontmatter", () => {
        const content = generateSkillMd("api-design", "REST API design patterns")
        const validation = validateSkillMd(content)
        expect(validation.valid).toBe(true)
    })

    test("includes name in frontmatter", () => {
        const content = generateSkillMd("my-skill", "test")
        expect(content).toContain("name: my-skill")
    })

    test("includes description in frontmatter", () => {
        const content = generateSkillMd("my-skill", "A detailed description")
        expect(content).toContain("description: A detailed description")
    })

    test("includes anti-patterns section", () => {
        const content = generateSkillMd("my-skill", "test")
        expect(content).toContain("## Anti-Patterns (NEVER)")
    })

    test("converts kebab-case to title case in heading", () => {
        const content = generateSkillMd("api-design-patterns", "test")
        expect(content).toContain("# Api Design Patterns")
    })
})

// ───── Create Skill (File Operations) ─────

describe("createSkill", () => {
    const tmpDir = path.join(os.tmpdir(), `omo-test-skills-${Date.now()}`)

    afterEach(async () => {
        try { await fs.rm(tmpDir, { recursive: true }) } catch {}
    })

    test("creates skill directory and SKILL.md", async () => {
        const result = await createSkill({
            name: "test-skill",
            description: "A test skill",
            target: tmpDir,
        })

        expect(result.created).toBe(true)
        expect(result.name).toBe("test-skill")

        const content = await fs.readFile(path.join(result.path, "SKILL.md"), "utf-8")
        expect(content).toContain("name: test-skill")
        expect(content).toContain("description: A test skill")
    })

    test("rejects invalid skill name", async () => {
        expect(
            createSkill({ name: "BadName", description: "test", target: tmpDir })
        ).rejects.toThrow("Invalid skill name")
    })

    test("rejects overwrite without --force", async () => {
        // Create first
        await createSkill({ name: "existing-skill", description: "v1", target: tmpDir })
        // Try to create again
        expect(
            createSkill({ name: "existing-skill", description: "v2", target: tmpDir })
        ).rejects.toThrow("--force")
    })

    test("allows overwrite with --force", async () => {
        await createSkill({ name: "overwrite-skill", description: "v1", target: tmpDir })
        const result = await createSkill({
            name: "overwrite-skill",
            description: "v2",
            target: tmpDir,
            force: true,
        })

        expect(result.created).toBe(true)
        const content = await fs.readFile(path.join(result.path, "SKILL.md"), "utf-8")
        expect(content).toContain("description: v2")
    })
})
