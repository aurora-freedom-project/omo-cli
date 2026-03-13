---
trigger: always_on
description: Guidelines for git conventions, commits, and PRs.
---

# Git Workflow

1.  **Atomic Commits**: Commits must represent a single, logical change.
2.  **Conventional Commits**: Use `type(scope): subject` (e.g. `feat(api): add auth endpoint`).
3.  **Branching**: Use `feature/X`, `bugfix/Y`, `chore/Z`. Never commit directly to `main` or `dev`.
4.  **No Force Pushes**: Do not force push to shared branches. Rebase locally before pushing.