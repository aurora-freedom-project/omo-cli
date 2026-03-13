# Plan

Refactor coder.ts by extracting interview logic and prompt building into sub-modules.

## Scope

- In: Extract interview and prompt logic from coder.ts into separate modules
- Out: coder.ts stays as re-exporting factory, maintains all existing exports

## Action Items

[ ] Create .bak backup of coder.ts
[ ] Create src/agents/interview.ts - interview logic (intent classification, strategies)
[ ] Create src/agents/prompts/planner-prompts.ts - prompt building (templates, system prompts)
[ ] Refactor coder.ts to import from new modules and re-export factory
[ ] Verify exports match original (PLANNER_SYSTEM_PROMPT, PLANNER_PERMISSION)

## Validation

- Verify imports work correctly
- Verify exports are maintained
