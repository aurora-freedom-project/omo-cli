# omo-cli Feature Roadmap

> Last updated: 2026-03-04

## 🔴 High Priority

### Agent Freeze Auto-Recovery
**Status**: Investigation complete, implementation pending
**Background**: OpenCode freezes when LLM providers return 400 Bad Request errors. The `provider-error-recovery` hook exists but doesn't cover all edge cases.
**Next**: Implement comprehensive provider error detection + auto-retry with exponential backoff.
**Ref**: Conversation `1feddf97`

### Remove Remaining `as any` Casts (Phase 2)
**Status**: Phase 1 done (205→180), need Phase 2 for remaining 180
**Next**: Create typed helpers for `look-at`, `plugin-config`, `auto-update-checker`, `question-label-truncator` (top 4 remaining by count).

---

## 🟡 Medium Priority

### Cost Metering Verification
**Status**: Implemented, enabled for `mike` and `mike-local` profiles
**Next**: Verify end-to-end cost tracking in production usage.
**Ref**: Conversation `41a00339`

### BM25 Search Enhancement
**Status**: Phase 5 of FastCode integration complete
**Next**: Tune tokenization, verify search relevance in production.
**Ref**: Conversation `4eb85714`

### Test `as any` Audit — Type-Safe Mock Interfaces
**Status**: Initial audit complete (205 casts categorized)
**Next**: Create proper interfaces for `OpencodeClient` mock subsets, `PluginInput` factory, config schema partials.
**Ref**: Conversation `8c2540fa`

---

## 🟢 Low Priority / Maintenance

### Bun `mock.module()` Workaround
**Status**: Documented as architectural limitation. `test-isolated.ts` provides full workaround.
**Impact**: 347 false failures only appear when running raw `bun test`. `bun run test` (via test-isolated.ts) shows 0 failures.

### Fix `fix-test-types.ts` Coverage
**Status**: Script covers 9 error patterns. Could add more automated patterns for remaining manual fixes.
**Next**: Add patterns for `toEqual` overload mismatches, ToolContext property completion.

---

## ✅ Recently Completed

| Feature | Date | Commit |
|---------|------|--------|
| Test tsc errors 189→0 | 2026-03-04 | `e08b13cc` |
| `fix-test-types.ts` +4 patterns | 2026-03-04 | `7e852286` |
| `test-helpers.ts` + Phase 1 refactor | 2026-03-04 | `6191c0fc` |
| Install command refactor | 2026-03-01 | — |
| Agent registration audit | 2026-02-27 | — |
| SurrealDB IPv6 fix | 2026-02-27 | — |
| FastCode Phase 5 (BM25) | 2026-02-27 | — |
| Cost metering implementation | 2026-02-28 | — |
