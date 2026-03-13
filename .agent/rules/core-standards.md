---
trigger: always_on
description: Universal standards for code quality, functional architecture, and error handling.
---

# Core Engineering Standards

1.  **Code Quality**: Write explicit, readable, modular code. Avoid magic numbers and implicit side effects.
2.  **Functional Architecture**: Immutability over mutation. Use pure functions. Data flows down, actions flow up.
3.  **Error Handling**: Handle errors as values (`Result`, `Option`, `Either`). Never swallow errors silently. Fail fast, log comprehensively.
4.  **Modularization**: Keep functions small and single-purpose. Separate business logic from I/O and side effects.