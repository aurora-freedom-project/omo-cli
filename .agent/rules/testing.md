---
trigger: always_on
description: Mandatory testing procedures and philosophies.
---

# Testing Strategy

1.  **TDD Protocol**: Red (write failing test) -> Green (minimal code to pass) -> Refactor (clean up).
2.  **Coverage**: Aim for high coverage on core business logic.
3.  **Types of Tests**: 
    -   Unit: Small, pure, isolated. No network, no disk.
    -   Integration: Test boundaries (DB, API).
    -   E2E/System: Real user paths, running system.
4.  **Verification**: You **must** run `cargo test`, `npm test`, or equivalent before claiming work is finished.