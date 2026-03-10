# OmniUltraAgent Architecture

`omni run` connects directly to SurrealDB + Ollama — **no API server needed**.

## Core Directives

1.  **Read Rules First**: Before starting any task, ALWAYS read `.agent/rules/*.md` and AGENTS.md.
2.  **Use `/bmad` Workflow**: The unified master workflow auto-routes to the right phase.
3.  **Plan → Act → Verify**: Write `implementation_plan.md` for major work. Run tests + linter to verify.
4.  **Context Budget**: `omni run` auto-compacts memory when context grows large.

## How to Use `omni run`

### Decision Tree — Pick ONE mode per task:

| Task Type | Command | When |
|-----------|---------|------|
| **File modifications** (edit code, fix bugs, replace text, refactor) | `omni run "<task>"` | Sub-agents have `write_file`, `replace_in_file`, `grep_search` tools |
| **Analysis only** (understand structure, find info, plan) | `omni run "<task>" --dry-run` | Just need skill search + memory, no file changes |
| **Non-code tasks** (screenshots, browser, git, deploy) | Native tools directly | `omni run` agents can't do browser/git/deploy |

### Rules:
- **DO NOT** run `--dry-run` then redo the same work with native tools. That defeats the purpose.
- **DO** use `omni run` (without `--dry-run`) when the task involves editing files — even simple edits. The sub-agents have file tools.
- **DO** fall back to native tools only if `omni run` fails (swarm error).
- `omni run` agents are Ollama-powered and have these tools: `read_file`, `write_file`, `replace_in_file`, `grep_search`, `list_directory`, `file_outline`, `skill_search`, `skill_content`.

```bash
# ✅ File edit — use full execution
omni run "Replace #F5F5F7 with #FAFAFA in all HTML files"

# ✅ Analysis — use dry-run
omni run "Analyze which files use deprecated API" --dry-run

# ✅ Custom plan
omni run --dag .agent/memory/dag-plan.json  # save DAGs here — auto-cleaned after execution

# ❌ WRONG — don't do this
omni run "fix colors" --dry-run   # then manually editing files yourself
```

## Three-Layer Architecture

```
You (Antigravity) ── the Brain: plan, decide, orchestrate
        │
        └── omni run ── the Hands: skill search, memory, swarm execution
                │
                └── Sub-Agents (Ollama) ── the Workers: ephemeral, have file tools
                        │
                        └── SurrealDB ── long-term Memory: skills, code index, memory
```

- **You** decide WHAT to do and WHEN to delegate
- **omni run** connects directly to SurrealDB/Ollama/Skills (no HTTP server)
- **Sub-agents** are born per-task with tools (read_file, write_file, replace_in_file, grep_search...), then destroyed
- **Memory** persists across sessions — `omni run` reads it at start, writes at end

## Important Notes

- **No API Server Required**: `omni run` connects to SurrealDB and Ollama directly.
- **Graceful Degradation**: If SurrealDB or Ollama are unreachable, `omni run` degrades gracefully.
- **Security**: All file operations have path traversal protection + .bak backups.
- Ride the lightning. ⚡

