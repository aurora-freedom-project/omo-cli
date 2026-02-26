---
name: thoughts-scaffold
description: "Scaffold the .opencode/thoughts/ directory for organized thinking. Creates architecture, research, plans, and reviews subdirectories with README templates."
---

# Thoughts Scaffold

When activated, creates or ensures the `.opencode/thoughts/` directory structure exists in the current project.

## Directory Structure Created

```
.opencode/thoughts/
├── README.md           ← Overview of the thoughts system
├── architecture/       ← Long-lived architectural decisions and system design notes
│   └── .gitkeep
├── research/           ← Research notes, comparisons, explorations
│   └── .gitkeep
├── plans/              ← Implementation plans, roadmaps, phased work
│   └── .gitkeep
└── reviews/            ← Code review notes, audit results, retrospectives
    └── .gitkeep
```

## Usage

When you need this structure, create it with:

```bash
mkdir -p .opencode/thoughts/{architecture,research,plans,reviews}
touch .opencode/thoughts/{architecture,research,plans,reviews}/.gitkeep
```

Then create `.opencode/thoughts/README.md`:

```markdown
# Project Thoughts

This directory contains structured thinking documents for this project.

## Directories

| Directory | Purpose |
|-----------|---------|
| `architecture/` | System design decisions, ADRs, architectural notes |
| `research/` | Technology evaluations, comparisons, spike notes |
| `plans/` | Implementation plans, feature roadmaps, phased work |
| `reviews/` | Code review notes, security audits, retrospectives |

## Conventions
- Files: `YYYY-MM-DD-topic.md` (e.g. `2026-02-26-database-choice.md`)
- Brief title + date in frontmatter
- Link related thoughts between documents
```

## Rules
- Always scaffold if `.opencode/thoughts/` doesn't exist before creating thought documents
- Add `.gitkeep` to preserve empty directories in git
- Use ISO date prefix in filenames: `YYYY-MM-DD-topic.md`
