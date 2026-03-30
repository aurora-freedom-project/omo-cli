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
| "build X", "design", "integrate", "what's the best way" | → **Phase 0: RESEARCH** → Phase 0.5 → Phase 0.7 → Phase 1 |
| "build X" (scope rõ, đã có spec/plan) | → **Phase 0.7: PLAN** → Phase 1 |
| "fix bug", "add field", "rename", "refactor" (scope nhỏ) | → Thẳng **Phase 1: BUILD** |
| "review", "check code", "PR" | → **Phase 3: REVIEW** (Two-Stage) |
| "deploy", "ship", "release" | → **Phase 4: DEPLOY** |

If unclear, default to **Phase 0.7: PLAN** → Phase 1.

---

## Phase 0: RESEARCH (Conditional Deep Research)

> **When:** Task involves building something new, integrating unknowns, or user explicitly requests research.
> **Skip when:** Scope is already clear, task is a simple fix/refactor, or user says "skip research".

1. **Web Research**: Use `search_web` and `read_url_content` to understand the landscape:
   - Existing frameworks, libraries, or patterns that solve this problem
   - Best practices and common pitfalls
   - Similar projects or prior art

2. **Codebase Analysis**: Use `omni run --dry-run` or native tools (`grep_search`, `list_dir`, `view_file`) to understand the current codebase state:
   - Existing patterns and conventions
   - Related components that will be affected
   - Technical constraints

3. **Knowledge Check**: Review Knowledge Items (KIs) for relevant past work.

4. **Output**: Save findings to a `research_notes.md` artifact for reference.

→ Proceed to **Phase 0.5: BRAINSTORM**

---

## Phase 0.5: BRAINSTORM (Socratic Design Refinement)

> **When:** After research, or when user says "brainstorm", "design", "let's think about..."
> **Skip when:** User already has a clear spec or says "just implement this".

**Rules:**
- Ask user **1 question per message** — never multiple questions at once
- Prefer **multiple choice** when possible (easier to answer)
- Max **5 questions** before presenting a design — don't over-ask
- **YAGNI ruthlessly** — cut features the user hasn't explicitly asked for

**Process:**

1. **Understand**: Ask focused questions to clarify purpose, constraints, success criteria
2. **Explore**: Propose 2-3 approaches with trade-offs. Lead with your recommendation and explain why.
3. **Present Design**: Present section by section, ask approval after each:
   - Architecture & components
   - Data flow & interfaces
   - Error handling & edge cases
   - Testing strategy
4. **Scope Check**: If the project is too large for a single plan, decompose into sub-projects. Each gets its own plan → implementation cycle.

→ Proceed to **Phase 0.7: PLAN**

---

## Phase 0.7: PLAN (Bite-Sized Implementation Plan)

> **When:** Before any BUILD phase. Always write a plan first.
> **Skip when:** Task is trivially small (< 5 lines changed, single file).

**Write `implementation_plan.md`** following bite-sized format:

Each task MUST have:
- **Exact file paths** (create/modify/delete)
- **Exact code or pseudo-code** (not "add validation")
- **Exact test commands** with expected output
- **2-5 minute** completion time per step

**Example task structure:**
```
### Task N: [Component Name]
Files: Create `src/foo.rs`, Modify `src/bar.rs:45-60`

- [ ] Step 1: Write failing test (exact test code here)
- [ ] Step 2: Run test → verify FAIL
- [ ] Step 3: Write minimal implementation (exact code here)
- [ ] Step 4: Run test → verify PASS
- [ ] Step 5: Commit
```

### Self-Critique Gate

Before sending the plan to the user for review, you MUST self-check:

1. **Granularity**: Can each task be completed in 2-5 minutes? If not → split further.
2. **Hallucination Check**: Does any code sample reference functions that don't exist? Verify with `grep_search`.
3. **Scope Creep**: Does the plan exceed what was agreed in brainstorming? If yes → trim.
4. Fix any issues found. Max 2 self-critique iterations.

Then send to user via `notify_user` for approval. Wait for LGTM before proceeding.

→ Proceed to **Phase 1: BUILD**

---

## Phase 1: DELEGATE TO SWARM — Swarm Does the Work, You Supervise

> **You are the Brain. Swarm agents are the Hands.**
> Delegate file modifications to `omni run`. Do NOT do the work yourself.

### For tasks involving file edits (build, fix, replace, refactor):
```bash
omni run "<user's task description here>"
```
This runs the full pipeline: skill search → memory recall (+ trajectory recall) → DAG planning → **swarm execution** (+ Stream-Chain) → DB logging (+ trajectory persist).

> **💡 Session Stability**: For parallel agent waves, use `tmux` to prevent terminal disconnects.
> Run `omni doctor` to check if tmux is available.

Sub-agents have tools: `write_file`, `replace_in_file`, `grep_search`, `read_file`, `list_directory`, `file_outline`, `skill_search`, `skill_content`, `web_query`, `http_request`, `dns_resolve`, `port_check`, `tls_inspect`, `sandbox_exec`, `web_crawl`, `pattern_scan`, `input_guard_test`, `prompt_test`, `query_callers`, `query_callees`, `query_hierarchy`.

> **Tip:** Use `--sandbox` for risky changes — creates isolated git worktree, auto-merges on success.

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

### Phase Transition Check
Before entering Phase 2, confirm:
- Swarm output accounts for ALL files mentioned in the task
- No partial implementations left (e.g., function declared but body missing)
- If swarm failed partially, document which tasks succeeded vs failed

### ⚠️ Pty Safety (Terminal Crash Prevention)
> See `.agent/rules/terminal-safety.md` for full rules (auto-loaded for all agents).

**Before running ANY terminal command in Phase 2:**
- **ALWAYS** truncate output: `cargo check 2>&1 | tail -5`, `cargo test 2>&1 | tail -30`
- **NEVER** dump code blocks to terminal — use `write_file` or `view_file` tools
- **If Pty Host crashes** (terminal becomes unresponsive):
  1. Terminate the dead terminal
  2. Open a new terminal
  3. Re-run the last command with output truncation
  4. Do NOT wait indefinitely — the response will never come

---

## Phase 2: VERIFY (Build Gate + RALPH Loop)

> Inspired by [BMALPH](https://github.com/LarsCowe/bmalph): structured failure recovery.
> **Config**: `ralph_max_cycles` from `omni.config.yaml` → `agents.resilience.ralph_max_cycles` (default: 3).
> **Read config**: `omni run --capabilities "_"` → JSON `.resilience.ralph_max_cycles`.

1. Run build check: `cargo check` (or `npm run build`, `go build`).
2. Run test suite: `cargo test` (or `npm test`, `pytest`, `go test`).
3. Run linter: `cargo clippy -- -D warnings` (or `eslint`, `golangci-lint`).
4. Reindex modified code: `omni index --no-embeddings`.

- **All pass** → Done. ✨
- **Any fail** → Enter **RALPH Loop** (max `ralph_max_cycles` cycles, default 3):

### RALPH Loop (Retry → Adapt → Learn → Persist → Halt)

```
Cycle N:
  R — RETRY: Re-run the failed check after applying a fix
  A — ADAPT: If same error recurs, change approach:
              - Cycle 1: Fix the obvious error
              - Cycle 2: Try alternative implementation strategy
              - Cycle 3: Simplify — remove the failing feature, reduce scope
  L — LEARN: Log the failure pattern:
              - What failed (exact error message)
              - What fix was attempted
              - Whether it worked
  P — PERSIST: Save lesson to ReasoningBank for future swarm runs
              (omni run auto-persists trajectories)
  H — HALT: After ralph_max_cycles cycles, STOP and escalate to user:
              - Show all 3 attempts + error messages
              - Recommend: revert, simplify, or redesign
```

**Cycle escalation strategy:**
| Cycle | Fix Strategy | Tool |
|-------|-------------|------|
| 1 | Direct fix — address the exact error | Native tools |
| 2 | Alternative approach — different implementation | Native tools or `omni run` |
| 3 | Scope reduction — simplify or split the task | Manual decision |
| 4+ | **HALT** — escalate to user with full context | — |

### Post-Swarm Resilience Checks (Ouroboros)
- If `verify_after_write` is enabled in config (`agents.resilience.verify_after_write`), auto-run tests after each swarm result.
- Review drift stats in swarm output: if `drift_unrecoverable` stopping reason appears, escalate to user for manual review.
- Review escalation tracker: if PAL router escalated, note which tasks required heavier models.

### Output Quality Gate
Before proceeding to Phase 2.5, verify:
- [ ] No unresolved `TODO`, `FIXME`, or `TBD` left in modified files
- [ ] No hardcoded secrets, credentials, or private IPs in code
- [ ] New public APIs have documentation or doc-comments
- [ ] Error messages are user-friendly, not raw stack traces or panics
- [ ] File naming follows project conventions

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

## Phase 3: REVIEW (Two-Stage)

> Auto-triggered after Phase 2 passes, or manually via "review" requests.

### Stage 1: Spec Compliance Check
Create `.agent/memory/dag-review.json`:
```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Spec compliance: verify code changes match implementation_plan.md requirements",
      "role": "analyzer",
      "depends_on": []
    },
    {
      "id": 2,
      "title": "Code quality review: check patterns, bugs, security, maintainability",
      "role": "reviewer",
      "depends_on": [1]
    }
  ],
  "project_root": ".",
  "tdd": false,
  "auto_commit": false
}
```

### Stage 2: Execute Review DAG
```bash
omni run --dag .agent/memory/dag-review.json
```

If reviewer outputs `[REJECT]` → fix issues → re-run review DAG.

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
    ├─ "build/design/integrate":
    │   Phase 0:   RESEARCH (web + codebase + KIs)
    │       ↓
    │   Phase 0.5: BRAINSTORM (Socratic, 1 question/msg, max 5)
    │       ↓
    │   Phase 0.7: PLAN (bite-sized tasks + Self-Critique Gate)
    │       ↓ (user approves plan)
    │   Phase 1:   BUILD (omni run → swarm)
    │       ↓
    │   Phase 2:   VERIFY (build + test + lint + RALPH loop)
    │       │
    │   (fail) → RALPH: Retry→Adapt→Learn→Persist (max 3 cycles)
    │       │
    │   (halt) → Escalate to user with full context
    │
    ├─ "fix/refactor" (small scope):
    │   Phase 1 → Phase 2 → Done ✨
    │
    ├─ "review"  → Phase 3 (Two-Stage: spec check → quality review)
    └─ "deploy"  → Phase 4
```

> Note: `omni run` automatically handles memory persistence and re-indexing.
> You do NOT need to call memory/reindex APIs manually.
