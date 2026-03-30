# omo-cli Feature Roadmap

> Last updated: 2026-03-25 (ALL ITEMS VERIFIED ✅)

## ✅ Recently Completed

| Feature | Date | Details |
|---------|------|---------|
| **Agentic Security Integration (P3 & P4)** | 2026-03-30 | Security Pipeline Wiring, 7 Hooks Exported, JSON Schema Gen |
| **Snowflake Arctic Vector Migration (P5 & P6)** | 2026-03-30 | Native Batch /api/embed, 768-D SurrealDB HNSW Schema Update |
| **Agentic Security Integration (P1 & P2)** | 2026-03-29 | Defense-in-Depth, 33 Vuln Fingerprints, Auto-Remediate, 121 tests pass |
| **All Previous ROADMAP items resolved** | 2026-03-25 | 7 phases complete, 940+ tests pass |
| Agent Freeze Auto-Recovery | 2026-03-25 | +2 modules (network.ts, watchdog.ts), 77 tests |
| `as any` elimination | 2026-03-25 | 0 source, 0 test casts (was 205→30→0) |
| Cost Metering verified | 2026-03-25 | 43 tests, normalizeModelID fix for ollama/ prefix |
| BM25 tokenizer enhanced | 2026-03-25 | camelCase/snake_case splitting, recall@5≥0.7 |
| fix-test-types.ts +2 patterns | 2026-03-25 | TS2554 toEqual, TS2339 missing property |
| PROJECT_KNOWLEDGE.md | 2026-03-25 | — |
| Test tsc errors 189→0 | 2026-03-04 | `e08b13cc` |
| `fix-test-types.ts` +4 patterns | 2026-03-04 | `7e852286` |
| `test-helpers.ts` + Phase 1 refactor | 2026-03-04 | `6191c0fc` |
| FastCode Phase 5 (BM25) | 2026-02-27 | — |
| Cost metering implementation | 2026-02-28 | — |

---

## 🟢 Maintenance Only

### Bun `mock.module()` Workaround
**Status**: Documented as architectural limitation. `test-isolated.ts` (60 LOC) provides full workaround.
**Impact**: False failures only appear when running raw `bun test`. `bun run test` (via test-isolated.ts) shows **227/227 pass, 0 fail**.

### Test Type Strictness
**Status**: ✅ `npx tsc --noEmit` = **0 errors**. Mock factories in `test-helpers.ts` return properly-typed `OpencodeClient`/`BackgroundManager`.
