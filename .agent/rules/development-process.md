---
trigger: always_on
description: Spec-driven approaches and proper documentation management.
---

# Development Process

1.  **Spec-Driven**: Do NOT write code without a specification. `implementation_plan.md` MUST be written and reviewed first.
2.  **Documentation**: Keep `README.md` and codebase wikis updated alongside code changes. Document *why*, not *what*.
3.  **Project Conventions**: Every repository has idiomatic structures. Respect the existing setup (e.g., placing tests in the right directory, matching file naming conventions).
4.  **No Hallucinations**: Verify missing context via `grep` or file system reads before making assumptions about schemas or architectures.