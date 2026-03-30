---
description: "Create new AI Skills from provided sources (URLs, docs, code). Adapts skill-generator's 8-phase pipeline."
---

// turbo-all

# /skill-create — Skill Generator Workflow

> Create production-quality SKILL.md files from any source material.

## Usage

Provide sources in your request:
- URLs (GitHub repos, docs, articles)
- Local files (code, READMEs, configs)
- Ideas/descriptions in natural language

Example: `/skill-create from https://github.com/example/project — create a skill for deploying with Docker`

---

## Phase 1: EXTRACT — Understand the Source

1. **Read all provided sources** using native tools:
   - URLs → `read_url_content` or `browser_subagent`
   - Local files → `view_file`
   - GitHub repos → read README, key source files, config
2. **Identify the core capability** — what does this teach an agent to DO?
3. **Extract structured components**:
   - Name (kebab-case, 2-4 words)
   - Description (1 sentence, what + when to use)
   - Prerequisites (tools, APIs, dependencies needed)
   - Step-by-step instructions
   - Common errors and troubleshooting
   - Anti-patterns (what NOT to do)

Document findings in a scratch note at `/tmp/skill-extract.md`.

---

## Phase 2: DETECT — Classify Complexity

Score the skill on these dimensions before generating:

| Dimension | Question | Score |
|-----------|----------|-------|
| Scope | How many distinct steps? | 1-5 |
| Dependencies | External tools/APIs required? | 1-5 |
| Error Surface | How many things can go wrong? | 1-5 |
| Domain Knowledge | Prior expertise needed? | 1-5 |

- **Sum ≤ 8** → Simple skill (800-1500 chars)
- **Sum 9-15** → Medium skill (1500-3500 chars)
- **Sum 16-20** → Complex skill (3500-5000 chars)

---

## Phase 3: GENERATE — Write the SKILL.md

Create the file at: `~/.config/_skills_/<skill-name>/SKILL.md`

Use this template:

```markdown
---
name: <skill-name>
description: <1-sentence description of what this skill teaches and when to use it>
---

# <Title>

<2-3 sentence overview of the capability>

## Prerequisites

- <tool/dependency 1>
- <tool/dependency 2>

## Usage

### Step 1: <Action>
<Clear instruction with code example>

```<language>
<code>
```

### Step 2: <Action>
...

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| <error msg> | <why> | <solution> |

## Anti-Patterns

- Do NOT <common mistake 1>
- Do NOT <common mistake 2>
- Do NOT <common mistake 3>

## Examples

### Basic Example
<minimal working example>

### Advanced Example
<production-ready example with error handling>
```

### Generation Rules:
- **Frontmatter is mandatory** — `name:` and `description:` in YAML
- **Code examples must be real** — no pseudocode, no placeholders
- **Anti-Patterns section is mandatory** — minimum 3 items
- **Error handling is mandatory** — at least 2 common errors
- **Size target**: use the score from Phase 2

---

## Phase 4: VALIDATE — Score Quality

Run the built-in validator:
```bash
omni skill validate ~/.config/_skills_/<skill-name>/SKILL.md
```

**Target score: ≥ 24/30 (Grade A)**

If score < 24, review the dimension breakdown and fix weak areas:

| Dimension | Fix if Low |
|-----------|-----------|
| Structure | Add/fix YAML frontmatter |
| Completeness | Add examples, error table, step-by-step |
| Clarity | Shorten lines, add headings |
| Safety | Remove dangerous commands (sudo, rm -rf) |
| Anti-Patterns | Add `## Anti-Patterns` with 3+ bullets |
| Size | Expand if < 500, trim if > 5000 |

---

## Phase 5: TEST — Dry Run Simulation

Simulate the skill by mentally walking through it:

1. **Can an agent follow this without additional context?**
   - Every step must be self-contained
   - No assumed knowledge not listed in Prerequisites
2. **Are the code examples copy-paste ready?**
   - No `<placeholder>` that agents can't resolve
   - Real file paths, real command syntax
3. **Do the Anti-Patterns prevent real mistakes?**
   - Each anti-pattern should describe a specific failure mode

If any check fails → go back to Phase 3 and fix.

---

## Phase 6: ITERATE — Compare and Improve

If creating a skill that overlaps with existing skills:

```bash
omni skill validate --all | grep "<related-keyword>"
```

Compare scores. The new skill should:
- Score higher than similar existing skills
- Not duplicate content already covered
- Add unique value (different approach, better examples, more error handling)

---

## Phase 7: FINALIZE — Register and Sync

1. Verify the file is at: `~/.config/_skills_/<skill-name>/SKILL.md`
2. Run final validation:
```bash
omni skill validate ~/.config/_skills_/<skill-name>/SKILL.md
```
3. Confirm Grade A (≥ 24/30)
4. Report to user:
   - Skill name and path
   - Final score and grade
   - Summary of what the skill teaches

---

## Flow Summary

```
Sources (URLs, files, ideas)
    │
    ▼
[1. EXTRACT] → understand source, identify components
    │
    ▼
[2. DETECT] → classify complexity (simple/medium/complex)
    │
    ▼
[3. GENERATE] → write SKILL.md with template
    │
    ▼
[4. VALIDATE] → omni skill validate → score ≥ 24?
    │                                      │
    │                                  (no) → fix → [3. GENERATE]
    │                                      │
    ▼                                  (yes)
[5. TEST] → dry run simulation
    │
    ▼
[6. ITERATE] → compare with existing skills
    │
    ▼
[7. FINALIZE] → register + report ✨
```

> **Quality Gate**: Never finalize a skill with Grade B or lower. Loop Phase 3-4 until Grade A.
