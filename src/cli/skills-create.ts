/**
 * create-skill — Generate and validate new OMO skill SKILL.md files.
 *
 * Implements a 5-phase workflow (expanded from skill-generator's 8-phase pipeline):
 *   1. Generate SKILL.md content from name + description (phases 1-4 combined)
 *   2. Validate the generated content (frontmatter + structure)
 *   3. Save to the target directory
 *   4. Score the generated skill across 7 dimensions
 *   5. Display iteration guidance based on score
 *
 * Based on patterns from skill-generator (Anthropic fork).
 */

import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as os from "node:os"

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), ".config/_skills_")

// ───── Validation ─────

export interface ValidationResult {
    valid: boolean
    errors: string[]
}

/** Validate skill name — must be kebab-case. */
export function validateSkillName(name: string): ValidationResult {
    const errors: string[] = []
    if (!name || name.length === 0) errors.push("Name cannot be empty")
    if (name.length > 80) errors.push("Name must be 80 characters or less")
    if (!KEBAB_CASE_RE.test(name)) errors.push("Name must be kebab-case (e.g. my-skill-name)")
    return { valid: errors.length === 0, errors }
}

/** Validate SKILL.md content structure. */
export function validateSkillMd(content: string): ValidationResult {
    const errors: string[] = []
    const parts = content.split("---")
    if (parts.length < 3) {
        errors.push("Missing YAML frontmatter (need opening + closing ---)")
    } else {
        const frontmatter = parts[1]
        if (!frontmatter.match(/^name:/m)) errors.push("Missing 'name' in frontmatter")
        if (!frontmatter.match(/^description:/m)) errors.push("Missing 'description' in frontmatter")
    }
    if (!content.includes("# ")) errors.push("Missing at least one markdown heading")
    return { valid: errors.length === 0, errors }
}

// ───── Generation ─────

/** Generate SKILL.md content from name and description. */
export function generateSkillMd(name: string, description: string): string {
    const titleCase = name
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")

    return `---
name: ${name}
description: ${description}
---

# ${titleCase}

${description}

## Instructions

<!-- Phase 1: Define specific, actionable instructions for this skill.
     Be precise and include context about when to use this skill. -->

1. **Analyze** the context and determine applicability
2. **Apply** the skill's guidelines
3. **Verify** the result meets quality standards

## Context Detection

<!-- Phase 2: Define patterns that trigger this skill's activation.
     What signals in user input or codebase should activate this skill? -->

- Triggered when: <!-- describe trigger conditions -->
- Not applicable when: <!-- describe exclusion conditions -->

## Examples

<!-- Phase 3: Add concrete examples of correct and incorrect usage.
     Include code blocks, before/after comparisons. -->

### ✅ Correct Usage

\`\`\`
<!-- Add a concrete correct example -->
\`\`\`

### ❌ Incorrect Usage

\`\`\`
<!-- Add a concrete incorrect example -->
\`\`\`

## Anti-Patterns (NEVER)

<!-- Phase 4: Define explicit DO NOT rules.
     Format: "Don't X — because Y"
     These are critical for preventing common mistakes. -->

- **Don't** skip context analysis — applying a skill blindly leads to poor results
- **Don't** <!-- add more anti-patterns -->

## Edge Cases

<!-- Phase 5: Document tricky scenarios and how to handle them. -->

- When <!-- edge case 1 -->: <!-- handling strategy -->

## Quality Checklist

<!-- Phase 6: Self-evaluation checklist for skill authors.
     Based on skill-generator's 7-dimension scoring. -->

- [ ] Frontmatter has name + detailed description (>20 chars)
- [ ] Instructions are numbered and actionable
- [ ] At least 2 concrete examples with code blocks
- [ ] Anti-patterns section has ≥3 explicit DON'T rules
- [ ] Edge cases documented
- [ ] Content is specific (no vague words: maybe, possibly, various, etc.)
- [ ] Agent role context mentioned (which OMO agent uses this?)

## Iteration Notes

<!-- Phase 7-8: Track improvements across versions.
     Document what changed and why after each iteration. -->

- v1.0: Initial creation
`
}

// ───── File Operations ─────

export interface CreateSkillOptions {
    name: string
    description: string
    target?: string
    force?: boolean
}

export interface CreateSkillResult {
    path: string
    name: string
    created: boolean
}

/** Create a new skill directory with SKILL.md. */
export async function createSkill(options: CreateSkillOptions): Promise<CreateSkillResult> {
    const { name, description, target, force = false } = options

    // Validate name
    const nameValidation = validateSkillName(name)
    if (!nameValidation.valid) {
        throw new Error(`Invalid skill name: ${nameValidation.errors.join(", ")}`)
    }

    // Generate content
    const content = generateSkillMd(name, description)

    // Validate content
    const contentValidation = validateSkillMd(content)
    if (!contentValidation.valid) {
        throw new Error(`Generated invalid SKILL.md: ${contentValidation.errors.join(", ")}`)
    }

    // Determine target directory
    const skillDir = path.join(target ?? DEFAULT_SKILLS_DIR, name)
    const skillFile = path.join(skillDir, "SKILL.md")

    // Check existence
    let exists = false
    try {
        await fs.access(skillFile)
        exists = true
    } catch {
        // File doesn't exist — proceed to create
    }

    if (exists && !force) {
        throw new Error(`Skill already exists at ${skillFile}. Use --force to overwrite.`)
    }

    // Create directory + write file
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(skillFile, content, "utf-8")

    return { path: skillDir, name, created: true }
}

/** CLI handler for create-skill command. */
export async function runCreateSkill(
    name: string,
    options: { description?: string; target?: string; force?: boolean }
): Promise<number> {
    try {
        const description = options.description || `Skill for ${name}`
        const result = await createSkill({
            name,
            description,
            target: options.target,
            force: options.force,
        })

        console.log(`✅ Skill created: ${result.name}`)
        console.log(`   📁 ${result.path}/SKILL.md`)

        // Phase 4: Score the generated skill
        try {
            const { scoreSkill, formatScore } = await import("./skills-score")
            const { readFileSync } = await import("node:fs")
            const content = readFileSync(path.join(result.path, "SKILL.md"), "utf-8")
            const score = scoreSkill(result.name, content, path.join(result.path, "SKILL.md"))
            console.log(`\n${formatScore(score)}`)

            // Phase 5: Iteration guidance
            if (score.grade === "F" || score.grade === "D") {
                console.log(`\n   💡 Iteration guide:`)
                console.log(`   Fill in the template sections to improve your score.`)
                console.log(`   Focus on: Anti-Patterns, Examples, and Context Detection.`)
                console.log(`   Re-score: omo-cli scan-skills --min-score 70`)
            } else if (score.grade === "C") {
                console.log(`\n   💡 Good start! Add more examples and anti-patterns to reach grade B+.`)
            }
        } catch {
            // Scoring is optional — don't fail if import fails
        }

        console.log(`\n   Next steps:`)
        console.log(`   1. Edit ${result.path}/SKILL.md to fill in template sections`)
        console.log(`   2. Run 'omo-cli scan-skills' to validate quality`)
        console.log(`   3. Iterate until score reaches grade B or higher`)
        return 0
    } catch (err) {
        console.error(`❌ ${err instanceof Error ? err.message : String(err)}`)
        return 1
    }
}
