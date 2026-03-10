---
description: "Master Workflow: One command to rule them all. Auto-routes to the right phase based on task type."
---

// turbo-all

# OmniBMAD — Unified Master Workflow

> `/bmad` is the only workflow you need. It auto-detects what to do.

## Step 0: DETECT & ROUTE

Classify the user's request into one of:

| Signal | Route To |
|--------|----------|
| "build X", "add feature", "implement", "fix", "replace", "refactor" | → **BUILD** (Phase 1-2) |
| "review", "check code", "PR" | → **REVIEW** (Phase 3) |
| "deploy", "ship", "release" | → **DEPLOY** (Phase 4) |

If unclear, default to **BUILD**.

---

## Phase 1: DELEGATE TO SWARM — Swarm Does the Work, You Supervise

> **You are the Brain. Swarm agents are the Hands.**
> Delegate file modifications to `omni run`. Do NOT do the work yourself.

### For tasks involving file edits (build, fix, replace, refactor):
```bash
omni run "<user's task description here>"
```
This runs the full pipeline: skill search → memory recall → DAG planning → **swarm execution** → DB logging.

> **💡 Session Stability**: For parallel agent waves, use `tmux` to prevent terminal disconnects.
> Run `omni doctor` to check if tmux is available.

Sub-agents have tools: `write_file`, `replace_in_file`, `grep_search`, `read_file`, `list_directory`.

**After swarm completes:**
- ✅ Swarm succeeded → Review its output → Phase 2 (VERIFY)
- ❌ Swarm failed → Fall back to native tools → Phase 2 (VERIFY)

### For analysis-only tasks (no file edits needed):
```bash
omni run "<task>" --dry-run
```
Use the output (skills, memory, DAG) to inform your analysis. No swarm execution.

### For non-code tasks (browser, git, deploy, screenshots):
Use native tools directly — swarm agents can't do these.

> **⚠️ RULE**: Do NOT run `--dry-run` then redo file edits with native tools.
> If files need editing, use `omni run` (full execution). Trust the swarm first.

---

## Phase 2: VERIFY (Build Gate)

1. Run build check: `cargo check` (or `npm run build`, `go build`).
2. Run test suite: `cargo test` (or `npm test`, `pytest`, `go test`).
3. Run linter: `cargo clippy -- -D warnings` (or `eslint`, `golangci-lint`).

- **All pass** → Done. ✨
- **Any fail** → Fix with native tools, then re-verify. Loop max 3 times.

### Post-Swarm Resilience Checks (Ouroboros)
- If `verify_after_write` is enabled in config (`agents.resilience.verify_after_write`), auto-run tests after each swarm result.
- Review drift stats in swarm output: if `drift_unrecoverable` stopping reason appears, escalate to user for manual review.
- Review escalation tracker: if PAL router escalated, note which tasks required heavier models.

---

## Phase 2.5: HANDOFF (Context Transfer)

> If the task spans multiple sessions, create a `HANDOFF.md` at project root.

```markdown
# HANDOFF.md
## What was done
- [summary of completed work]

## What's next
- [remaining tasks]

## Key decisions
- [important design choices made]

## Known issues
- [any blockers or gotchas]
```

This ensures the next session (or next agent) has full context without re-reading all code.

---

## Phase 3: REVIEW

> Auto-triggered after Phase 2 passes, or manually via "review" requests.

Run a review via swarm:
```bash
omni run "review code changes for security, correctness, and maintainability"
```

---

## Phase 4: DEPLOY (Ship It)

> Only triggered by explicit "deploy" / "ship" / "release" requests.

1. **Pre-flight**: `cargo build --release` (or `npm run build`).
2. **Deploy** (pick one):
   - **Docker**: `docker build -t app:latest . && docker run -p 3000:3000 app:latest`
   - **Cloud Run**: `gcloud builds submit && gcloud run deploy`
   - **Vercel**: `vercel deploy --prod`
3. **Smoke test**: `curl http://localhost:3000/health`.

---

## Flow Summary

```
User Input
    │
    ▼
[DETECT & ROUTE]
    │
    ├─ BUILD:
    │   Phase 1: omni run "<task>" → swarm does the work
    │       ↓ (you review output + drift stats)
    │   Phase 2: VERIFY (build + test + lint + resilience checks)
    │       │
    │   (fail) → fix with native tools → Phase 2 (retry, max 3)
    │       │
    │   (pass) → Phase 2.5 (HANDOFF if multi-session) → Done ✨
    │
    ├─ "review"  → Phase 3 (omni run "review ...")
    └─ "deploy"  → Phase 4
```

> Note: `omni run` automatically handles memory persistence and re-indexing.
> You do NOT need to call memory/reindex APIs manually.
