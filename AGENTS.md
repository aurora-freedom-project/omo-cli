# AGENTS.md — OmniUltraAgent Kit for Antigravity IDE

> Auto-detected by Antigravity IDE v1.16.5+

## Three-Layer Architecture

```
Layer 1: Antigravity IDE (Brain)
  → Model selection, Knowledge Items, Rules, Workflows, Browser, Sandbox
  → Handles: planning, research, DAG design, result interpretation

Layer 2: omni run CLI (Hands)
  → Enforces: skill search, memory recall, swarm execution, memory persistence
  → Cannot be skipped — runs as compiled Rust code

Layer 3: Ollama Sub-Agents (Workers)
  → Ephemeral: born per-task, destroyed after
  → Have tools: read_file, write_file, replace_in_file, grep_search, list_directory, file_outline, skill_search, skill_content
  → Multi-turn execution with auto tool-calling
```

## Agent Roles

Roles determine which model and system prompt each swarm agent receives.

| Role | Model (from config) | Purpose | Tools |
|------|---------------------|---------|-------|
| `coder` | `agents.coder_model` | Code generation, implementation | read_file, write_file, replace_in_file, grep, list_dir, file_outline, skill_search, skill_content |
| `analyzer` | `agents.analyzer_model` | Analysis, architecture | read_file, grep, list_dir, file_outline, skill_search |
| `reviewer` | `agents.analyzer_model` | Code review (OKAY/REJECT) | read_file, grep, file_outline |
| `tester` | `agents.coder_model` | Test writing, TDD | read_file, grep, list_dir |

Models are configured in `omni.config.yaml` — not hardcoded.

## How to Use (via `omni run`)

```bash
# Quick task — default DAG (analyzer → coder → reviewer)
omni run "add user authentication with JWT"

# Analysis only (no file edits) — use --dry-run
omni run "analyze which components use deprecated API" --dry-run

# Custom DAG designed by Antigravity
omni run --dag plan.json
```

### DAG Patterns

| Project Type | Typical DAG |
|-------------|-------------|
| **New feature** | `analyzer(design)` → `coder(implement)` → `tester(tests)` → `reviewer(review)` |
| **Bug fix** | `analyzer(diagnose)` → `coder(fix)` → `tester(regression tests)` |
| **Refactor** | `architect(plan)` → `coder(A)` ∥ `coder(B)` → `reviewer(review)` |

Tasks with no dependency on each other **run in parallel** (same wave).

### Custom DAG JSON Format

```json
{
  "tasks": [
    {
      "id": 1,
      "title": "Design auth architecture",
      "role": "analyzer",
      "depends_on": [],
      "tools": ["read_file", "grep_search", "skill_search"],
      "system_prompt": "Analyze the codebase and design JWT auth..."
    },
    {
      "id": 2,
      "title": "Implement JWT middleware",
      "role": "coder",
      "depends_on": [1],
      "tools": ["read_file", "grep_search", "skill_content"]
    }
  ],
  "project_root": "/path/to/project",
  "tdd": true,
  "auto_commit": false
}
```

### DAG File Lifecycle

Antigravity creates custom DAG files directly in `.agent/memory/`:
1. Write DAG JSON → `.agent/memory/dag-<name>.json`
2. Run `omni run --dag .agent/memory/dag-<name>.json`
3. Omni auto-deletes the DAG from `.agent/memory/` after completion

> **Rule**: Never create DAG files in `/tmp/`. Always use `.agent/memory/`.

### Sizing Guidelines

| Scope | Agents | Example |
|-------|--------|---------|
| Small fix | 1-2 | `coder → tester` |
| Feature | 3-5 | `architect → coders → tester → reviewer` |
| Major refactor | 5-10 | `architect → many coders (parallel) → tester → reviewer` |
| **Don't overdo it** | >10 | Split into separate `omni run` calls |

## Complexity-Based Routing (ModelRouter)

The swarm engine auto-selects models per role from `omni.config.yaml`:

| Role | Config Key | Default |
|------|-----------| --------|
| `coder` | `agents.coder_model` | minimax-m2.5:cloud |
| `analyzer` | `agents.analyzer_model` | glm-5:cloud |

## Workflow

Single unified workflow: **`/bmad`** — auto-detects task type and routes to the right phase. See `.agent/workflows/bmad.md`.

## Skills

Skills are synced globally to `~/.config/_skills_/` (1900+ skills). Sub-agents can search skills autonomously via their `skill_search` tool. **Never load all skills at once — agents search on demand.**

## Platform Format

Antigravity uses whatever model the user selects from the IDE UI for high-level planning. Ollama agents are used for swarm execution via `omni run`.
