---
name: openspec-workflow
description: "Spec-driven development workflow. Use /opsx:propose, /opsx:apply, /opsx:archive to manage feature specs as persistent documents in .opencode/specs/"
---

# OpenSpec Workflow

Spec-driven development: capture requirements → plan → implement → archive. All specs live in `.opencode/specs/<name>/`.

## Slash Commands

### `/opsx:propose <spec-name>`
Create a new spec for `<spec-name>`. Runs automatically when you type `/opsx:propose`.

**Creates:**
```
.opencode/specs/<name>/
├── proposal.md   ← User request + problem statement
├── specs.md      ← Technical specification (API contracts, schemas, acceptance criteria)
├── design.md     ← Architecture decisions + approach rationale
└── tasks.md      ← Checklist of implementation tasks ([ ] format)
```

**Template for proposal.md:**
```markdown
# Spec: <name>
Created: <date>
Status: proposed

## Problem Statement
[What problem does this solve?]

## User Request
[Exact user request, verbatim]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

**Template for tasks.md:**
```markdown
# Tasks: <name>
Status: pending

## Implementation Tasks
- [ ] Task 1
- [ ] Task 2

## Verification
- [ ] Tests pass
- [ ] Acceptance criteria met
```

**Action:** Create the directory and all 4 files. Report the paths created.

---

### `/opsx:apply <spec-name>`
Start implementing the spec at `.opencode/specs/<name>/`.

**Process:**
1. Read `proposal.md`, `specs.md`, `design.md`, `tasks.md`
2. Confirm understanding of scope
3. Execute tasks from `tasks.md` one by one, marking `[x]` as completed
4. Update `tasks.md` status to `in-progress` → `complete`

**Action:** Read spec files, implement tasks, update checkboxes.

---

### `/opsx:archive <spec-name>`
Archive a completed spec.

**Process:**
1. Verify `tasks.md` has all tasks `[x]`
2. Update `proposal.md` Status → `archived`
3. Move `.opencode/specs/<name>/` → `.opencode/specs/archive/<name>/`

**Action:** Move directory, confirm archive location.

---

## Directory Structure

```
.opencode/specs/
├── active-feature/
│   ├── proposal.md
│   ├── specs.md
│   ├── design.md
│   └── tasks.md
└── archive/
    └── completed-feature/
        └── ...
```

## Rules
- Spec names: lowercase-kebab-case
- Always create all 4 files on `/opsx:propose`
- Never modify archived specs
- Link related specs in `design.md`
