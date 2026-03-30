# OMO-CLI PROJECT KNOWLEDGE BASE

**Project**: omo-cli (Oh My OpenCode)
**Version**: 3.3.0
**Branch**: dev
**Runtime**: Bun ≥ 1.1.0 (NOT Node.js)
**License**: SUL-1.0
**Repo**: https://github.com/aurora-freedom-project/omo-cli

> **ALL PULL REQUESTS MUST TARGET `dev` BRANCH. PRs to `master` are auto-rejected by CI.**

---

## 1.5 OPENCODE ARCHITECTURAL SYNERGY (HOW OMO-CLI EMPOWERS OPENCODE)

OpenCode is designed as a powerful but generic terminal IDE chat interface. It has specific architectural boundaries that limit large-scale autonomous enterprise use:
1. **Linear Workflow Execution:** OpenCode processes queries sequentially in single chat sessions.
2. **Stateless Context:** When a session is compacted or deleted, OpenCode's awareness drops. It has no long-term memory of codebase structure.
3. **Naive Tool Execution:** OpenCode relies on LLM decisions and user permission dialogs, but inherently lacks content-aware egress/ingress filtering (e.g., executing adversarial Bash or rendering malicious MCP JSON).

**`omo-cli` fundamentally transforms OpenCode from a simple AI Chat to an Autonomous Orchestration Engine:**
- **Persistent Graph RAG (SurrealDB + Snowflake Arctic):** By integrating `snowflake-arctic-embed2:568m` (768-D native batch embeddings) directly into OpenCode via tools and completion hooks, `omo-cli` grants OpenCode long-term Graph RAG. OpenCode agents no longer start with blank slates; they cross-reference AST relations (`calls`, `imports`, `extends`) via SurrealDB BM25 and Vector Similarity *before* editing code.
- **7-Layer Agentic Security Firewall:** By hooking into OpenCode's `tool.execute.before` and `tool.execute.after`, `omo-cli` intercepts dangerous payloads (prompt injection, malicious Bash, MCP data exfil) *before* OpenCode executes them. This is the Defense-in-Depth pipeline (Auto-remediate, Jailbreak-Eval, MCP-Audit, etc.).
- **Multi-Agent Async Orchestration:** OpenCode supports basic subagents (`@explore`), but `omo-cli` bypasses this by implementing `tmux` background runners, DAG pipeline orchestrators, and auto-slash-commands. This allows background conceptual tasks (research, security scanning) to run concurrently without blocking the IDE's primary chat.

> [!WARNING]
> **Vector Dimension Data Migration Alert:** If shifting embedding models or dimensional space (e.g., from 384 to 768), agents must know that existing SurrealDB instances will throw mapping errors. Instruct developers to run `omni purge` and `omni sync --force` (or `omo-cli memory reset` and `omo-cli index`) to recreate the HNSW schemas.

---

## 1. WHAT IS OMO-CLI

OMO-CLI is a **batteries-included plugin for [OpenCode](https://github.com/sst/opencode)** — a terminal-based AI coding agent. Think of it as "oh-my-zsh for OpenCode." It hooks into OpenCode's official plugin API with **zero patches to OpenCode core**.

### What Default OpenCode Provides

| Feature | Default OpenCode |
|---------|-----------------|
| **Agents** | 2 primary (Build, Plan) + 2 subagents (General, Explore) |
| **Tools** | 11 built-in (bash, edit, write, read, grep, glob, list, lsp*, patch, skill, todowrite/todoread, webfetch, question) |
| **Skills** | Basic SKILL.md discovery from `.opencode/skills/` and `~/.config/opencode/skills/` |
| **MCP** | Manual configuration via `opencode.json` |
| **Hooks** | Plugin API: `chat.message`, `event`, `tool.execute.before`, `tool.execute.after`, `experimental.chat.messages.transform`, `experimental.session.compacting` |
| **Commands** | `/init`, `/undo`, `/redo`, `/share`, `/help` + custom via `.opencode/commands/` |
| **Config** | `opencode.json` with model, provider, theme, tools, agents, commands |
| **Recovery** | None |
| **Code Intelligence** | LSP (experimental, env var gated) |
| **Multi-model** | Single model per config or per agent |

### What OMO-CLI Adds On Top

| Feature | OMO-CLI Enhancement |
|---------|-------------------|
| **Agents** | 10 specialized agents with tiered model assignment (Brain/Worker/Vision/IO) |
| **Tools** | 28 tools: full LSP suite (6), AST-grep (2), session management (4), code intelligence (4), security (6), orchestration (5), utility (5) |
| **Skills** | 1243+ built-in skills, centralized at `~/.config/_skills_/`, tier-based import, security scanning |
| **MCP** | 4 curated MCPs auto-configured (Exa, Context7, Grep.app, AgentQL) |
| **Hooks** | 46 lifecycle hooks across 7 categories (Persistence, Quality, Context, Routing, Recovery, UX, Security, Metering) |
| **Commands** | 12 builtin commands (init-deep, start-work, 10 design commands), auto-slash-command routing, keyword detection (`ultrawork`/`ulw`) |
| **Config** | Profile-driven system (`omo-cli.json`), instant profile switching |
| **Recovery** | Session recovery, crash recovery, Ralph Loop (self-healing retry), delegate task retry, context window limit recovery |
| **Code Intelligence** | AST-grep indexing → SurrealDB → BM25 full-text + vector search + graph relations |
| **Multi-model** | Per-agent model assignment with fallback chains, variant support (extended-thinking) |
| **Background Agents** | Parallel execution via tmux, toast notifications, boulder state persistence |
| **Cost Metering** | Token usage tracking, daily/monthly budget limits |
| **Security** | 6-Layer Defense-in-Depth (Input Guard, 33 Vuln Fingerprints, Triage, Auto-Remediate Pipeline, Output Guard) |

---

## 2. PROJECT STRUCTURE

```
omo-cli/
├── src/
│   ├── index.ts                  # Main plugin entry (780 lines) — OmoCliPlugin(ctx)
│   ├── plugin-config.ts          # Config loading (omo-cli.json from .opencode/)
│   ├── plugin-state.ts           # Runtime state (model cache, context limits)
│   ├── plugin-handlers/          # OpenCode plugin event handlers (config handler)
│   ├── e2e/                      # End-to-end tests
│   ├── agents/                   # 🧠 10 AI agent definitions
│   ├── hooks/                    # 🪝 46 lifecycle hooks (Security, Persistence, Quality, Context, Routing, Recovery, UX)
│   ├── tools/                    # 🔧 28 custom tools (LSP, Session, Intel, Security, Orchestration)
│   ├── features/                 # 📦 24 feature modules
│   ├── security/                 # 🛡️ Defense-in-Depth (33 Vuln Fingerprints, Jailbreak Eval)
│   ├── mcp/                      # 🌐 4 built-in MCP server configs
│   ├── cli/                      # 💻 CLI commands (install, doctor, run, memory, skills)
│   ├── config/                   # Zod schema & TypeScript types
│   ├── shared/                   # 45 modules + 4 sub-dirs (constants/, effect/, tmux/, types/)
│   └── types/                    # Type definitions
├── profiles/                     # Profile templates
│   ├── mike/omo-cli.json         # Cloud baseline (Opus 4.6 Thinking, Sonnet 4.5 Thinking, Gemini 3 Pro Image, Minimax M2.1)
│   └── mike-local/omo-cli.json   # Local/Ollama Cloud (Qwen 3.5 397B, Qwen3-coder-next, Minimax M2.7, GLM-5)
├── script/                       # Build & tooling scripts
├── bin/                          # Platform-specific binary launcher
├── dist/                         # Build output (ESM + .d.ts)
├── package.json                  # Bun project config
├── tsconfig.json                 # TypeScript config
├── docker-compose.yml            # SurrealDB container
└── opencode.json.example         # Example OpenCode config with provider definitions
```

---

## 3. AGENT SYSTEM (10 AGENTS)

### Agent → File → Factory → Model Map

| Config Key | Display Name | File | Factory | Recommended Model |
|-----------|-------------|------|---------|-------------------|
| `orchestrator` | Orchestrator | `orchestrator.ts` | `createOrchestratorAgent` | Claude Opus 4.6 Thinking (max) |
| `conductor` | Conductor | `navigator.ts` | `createConductorAgent` | Claude Opus 4.6 Thinking (max) |
| `consultant` | Consultant | `conductor.ts` | `createConsultantAgent` | Claude Sonnet 4.5 Thinking (max) |
| `architect` | Architect | `architect.ts` | `createArchitectAgent` | Claude Opus 4.6 Thinking (max) |
| `planner`/`coder` | Planner | `coder.ts` | registered in config-handler.ts | Claude Opus 4.6 Thinking (max) |
| `worker` | Worker | `worker.ts` | `createWorkerAgentWithOverrides` | Claude Sonnet 4.5 Thinking (max) |
| `researcher` | Researcher | `researcher.ts` | `createResearcherAgent` | Minimax M2.1 (fast/cheap) |
| `explorer` | Explorer | `explorer.ts` | `createExplorerAgent` | Minimax M2.1 (fast/cheap) |
| `vision` | Vision | `vision.ts` | `createVisionAgent` | Gemini 3 Pro Image (high) |
| `reviewer` | Reviewer | `reviewer.ts` | `createReviewerAgent` | Claude Sonnet 4.5 Thinking (max) |

### Model Tiers

| Tier | Agents | Model (Cloud Profile) |
|------|--------|----------------------|
| 🧠 Brain | Orchestrator, Planner, Conductor, Architect | Opus 4.6 Thinking |
| ⚡ Worker | Consultant, Reviewer, Worker | Sonnet 4.5 Thinking |
| 👁️ Vision | Vision | Gemini 3 Pro Image |
| 🚀 IO | Explorer, Researcher | Minimax M2.1 |

### Fallback Chain

```
Brain:   Opus 4.6 → Sonnet 4.5 → Gemini Pro → big-pickle
Worker:  Sonnet 4.5 → Gemini Pro → big-pickle
Vision:  Gemini Pro → Gemini Flash → big-pickle
IO:      Minimax M2.1 → Gemini Flash → big-pickle
```

### 4 Delegation Mechanisms

| Mechanism | Type | Description |
|-----------|------|-------------|
| `delegate_task` | Sync | Child agent runs in sub-session, results return to parent |
| `pipeline_task` | Sync | Multi-stage DAG — chains agents sequentially |
| `call_omo_agent` | Sync | Call by name with BM25 auto-routing |
| `background_task` | Async | Runs in parallel via tmux, toast on completion |

---

## 4. CATEGORY SYSTEM (TASK ROUTING)

Categories enable model-per-task-type routing. Delegation tools auto-select the optimal model based on task category.

### 8 Built-in Categories

| Category | Purpose | Cloud Model | Local Model |
|----------|---------|-------------|-------------|
| `frontend` | UI/UX, CSS, HTML | Gemini 3 Pro Image (high) | Qwen 3.5 397B |
| `quick` | Simple/fast tasks | Gemini 3 Flash (minimal) | Minimax M2.7 |
| `deep-reasoning` | Complex analysis | Sonnet 4.5 Thinking (max) | Qwen 3.5 397B |
| `backend` | Server-side code | Minimax M2.1 | Qwen3-coder-next |
| `docs` | Documentation | Gemini 3 Flash (low) | GLM-5 |
| `complex` | Multi-file features | Opus 4.6 Thinking (max) | Qwen 3.5 397B |
| `simple` | Trivial edits | Minimax M2.1 | Minimax M2.7 |
| `creative` | Design, branding | Gemini 3 Pro Image (max) | Qwen 3.5 397B |

> Categories are configurable per-profile in `omo-cli.json` under `categories`.

---

## 5. TOOL SYSTEM (26 TOOLS)

| Group | Tools | Description |
|-------|-------|-------------|
| **LSP (6)** | `lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`, `lsp_diagnostics`, `lsp_prepare_rename`, `lsp_rename` | Full Language Server Protocol |
| **AST (2)** | `ast_grep_search`, `ast_grep_replace` | Structure-based AST search/replace |
| **Session (4)** | `session_list`, `session_read`, `session_search`, `session_info` | Cross-session query |
| **Code Intel (4)** | `code_search`, `code_callers`, `code_deps`, `code_overview` | BM25 + graph analysis via SurrealDB |
| **Security (6)** | `pattern_scan`, `input_guard_test`, `vulnerability_triage`, `fingerprint_stats`, `prompt_test`, `fact_extract` | Agentic Security scanning & scoring |
| **Orchestration (5)** | `delegate_task`, `pipeline_task`, `call_omo_agent`, `background_output`, `background_cancel` | Multi-agent orchestration |
| **Utility (5)** | `look_at`, `skill`, `skill_mcp`, `slashcommand`, `interactive_bash` | Vision, skills, commands |

---

## 6. HOOK SYSTEM (46 HOOKS)

Hooks run at 5 lifecycle points: `chat.message`, `event`, `tool.execute.before`, `tool.execute.after`, `experimental.chat.messages.transform`.

| Category | Hooks | Purpose |
|----------|-------|---------|
| **Persistence** | `todo-continuation-enforcer`, `session-recovery`, `boulder-state` | Keep agent rolling, crash recovery |
| **Quality** | `comment-checker`, `thinking-block-validator`, `edit-error-recovery`, `coder-md-only`, `workpad-tracker` | Anti-AI-slop, format enforcement, session artifact tracking |
| **Context** | `context-injector`, `compaction-context-injector`, `rules-injector`, `directory-agents-injector`, `directory-readme-injector`, `memory-capture` | Dynamic context injection |
| **Routing** | `keyword-detector`, `auto-slash-command`, `navigator`/`conductor`, `category-skill-reminder`, `agent-usage-reminder`, `claude-code-hooks` | Smart task routing, Claude Code compatibility |
| **Recovery** | `ralph-loop`, `anthropic-context-window-limit-recovery`, `delegate-task-retry`, `context-window-monitor`, `provider-error-recovery` | Self-healing, retry loops |
| **UX** | `session-notification`, `background-notification`, `auto-update-checker`, `startup-toast`, `think-mode`, `start-work`, `worker-notepad`, `question-label-truncator`, `subagent-question-blocker`, `non-interactive-env`, `interactive-bash-session`, `tool-output-truncator`, `empty-task-response-detector`, `task-resume-info` | Notifications, UX improvements |
| **Metering** | `cost-metering` | Token usage & USD cost tracking |
| **Security** | `input-guard`, `auto-remediate`, `jailbreak-eval`, `output-guard`, `sandbox-server`, `provider-probe`, `mcp-audit`, `variant-hunter` | Defense-in-Depth, Prompt injection, Triage, Auto-Fix |

> **46 hooks** registered in `HookNameSchema`
> **Disable hooks**: Add hook names to `disabled_hooks[]` in `omo-cli.json`.

---

## 7. FEATURE MODULES (24 MODULES)

| Module | Directory | Purpose |
|--------|-----------|---------|
| `background-agent` | `features/background-agent/` | Background task lifecycle, concurrent limits (1463 LOC) |
| `boulder-state` | `features/boulder-state/` | "Rolling boulder" state persistence across sessions |
| `builtin-commands` | `features/builtin-commands/` | 10+ design commands (/design-audit, /design-polish, etc.) |
| `builtin-skills` | `features/builtin-skills/` | 2087 LOC of built-in expert skill definitions |
| `claim-release` | `features/claim-release/` | Exclusive resource locking |
| `claude-code-agent-loader` | `features/claude-code-agent-loader/` | Load agents from .claude config (Claude Code compat) |
| `claude-code-command-loader` | `features/claude-code-command-loader/` | Load commands from .claude config |
| `claude-code-mcp-loader` | `features/claude-code-mcp-loader/` | Load MCPs from .claude/.mcp.json |
| `claude-code-plugin-loader` | `features/claude-code-plugin-loader/` | Load plugins from .claude config |
| `claude-code-session-state` | `features/claude-code-session-state/` | Session state management |
| `code-intel` | `features/code-intel/` | AST-grep indexing → SurrealDB, auto-init, BM25 search |
| `context-injector` | `features/context-injector/` | Dynamic context injection into thread |
| `hook-message-injector` | `features/hook-message-injector/` | Inject hook messages into conversation |
| `mcp-oauth` | `features/mcp-oauth/` | OAuth flow for MCP servers |
| `opencode-skill-loader` | `features/opencode-skill-loader/` | Load skills from ~/.config/_skills_/ |
| `perf-benchmark` | `features/perf-benchmark/` | Performance benchmarks (p50/p95/p99) |
| `reasoning-bank` | `features/reasoning-bank/` | Pattern learning & trajectory tracking |
| `skill-mcp-manager` | `features/skill-mcp-manager/` | MCP server management for skills |
| `task-toast-manager` | `features/task-toast-manager/` | Background task toast notifications |
| `tmux-subagent` | `features/tmux-subagent/` | Parallel execution via tmux panes |
| `workflow-unifier` | `features/workflow-unifier/` | WORKFLOW.md discovery & unification |

---

## 8. MCP SERVERS (3-TIER ARCHITECTURE)

| Tier | Type | Servers |
|------|------|---------|
| **Built-in** | Auto-configured | `websearch` (Exa), `context7` (real-time docs), `grep_app` (GitHub code search), `agentql` (web data extraction) |
| **Claude Code Compat** | From `.mcp.json` | Supports `${VAR}` env variable expansion |
| **Skill-embedded** | From SKILL.md frontmatter | YAML-defined per skill |

---

## 9. CONFIGURATION SYSTEM

### Profile System

Each profile is a complete `omo-cli.json` controlling agents, models, hooks, features.

```bash
omo-cli profile list              # List all profiles
omo-cli profile show              # Show active profile
omo-cli profile apply mike        # Apply cloud profile
omo-cli profile apply mike-local  # Apply local profile
omo-cli profile create            # Interactive wizard
```

### Config Schema (`omo-cli.json`)

```
omo-cli.json
├── agents                        # Per-agent model & variant overrides
│   ├── orchestrator: { model, variant }
│   ├── worker: { model, variant }
│   └── ...
├── categories                    # Task-type → model routing
│   ├── frontend: { model, variant }
│   ├── backend: { model }
│   └── ... (8 built-in categories)
├── disabled_hooks[]              # Hook names to disable
├── disabled_agents[]             # Agent names to disable
├── disabled_skills[]             # Skill names to disable
├── disabled_commands[]           # Command names to disable
├── disabled_mcps[]               # MCP server names to disable
├── memory                        # SurrealDB config
│   ├── enabled: bool
│   ├── mode: "managed" | "external"
│   ├── port: 18000
│   ├── namespace: "omo"
│   ├── database: "memory"
│   └── auto_capture: bool
├── tmux                          # Tmux layout config
│   ├── enabled: bool
│   ├── layout: "main-vertical" | "tiled"
│   └── main_pane_size: 60%
├── background_task               # Concurrent task limits
├── ralph_loop                    # Self-healing retry config
├── experimental                  # Feature flags
├── cost_metering                 # Token/cost tracking
│   ├── enabled: bool
│   ├── show_idle_summary: bool
│   ├── monthly_budget_usd
│   └── daily_budget_usd
├── notification                  # Notification config
├── auto_update: bool             # Auto-check for updates
├── comment_checker               # Anti-AI-slop config
├── input_guard                   # Prompt injection defense config
├── safety                        # Loop limits, delegation depth, circuit breaker
├── privacy                       # Privacy awareness config
├── coding_level: 1-10            # Agent response verbosity (1=terse, 10=detailed)
├── skills                        # Skill definitions (array or record format)
├── claude_code                   # Claude Code compatibility config
├── sisyphus_agent                # Legacy agent behavior config
├── git_master                    # Git commit message config
├── browser_automation_engine     # Browser: playwright | agent-browser | dev-browser
├── orchestrator                  # Orchestrator-specific config
└── logging                       # File logging & transcript recording
```

### Config Validation

- **Zod schema**: `src/config/schema.ts` → run `bun run build:schema` to regenerate JSON Schema
- **JSONC support**: Comments and trailing commas allowed
- **Multi-level**: Project (`.opencode/`) → User (`~/.config/opencode/`)

---

## 10. CLI COMMANDS

| Command | Purpose |
|---------|---------|
| `omo-cli install` | Install plugin into OpenCode (interactive profile selection) |
| `omo-cli run <message>` | Run OpenCode with todo/background completion enforcement |
| `omo-cli doctor` | Health check (installation, config, auth, dependencies, tools, updates) |
| `omo-cli memory start/stop/status/reset` | Manage SurrealDB container |
| `omo-cli index` | Manual code intelligence indexing |
| `omo-cli profile list/show/apply/create` | Profile management |
| `omo-cli import-skills` | Import skills from antigravity-awesome-skills |
| `omo-cli scan-skills` | Security & quality scan for skills |
| `omo-cli categorize-skills` | Categorize skills by tier |
| `omo-cli adapt-skills` | Import skills with OMO metadata by tier |
| `omo-cli sync-skills` | Sync from remote agentskills.io |
| `omo-cli create-skill <name>` | Create new skill (8-section template + auto-scoring) |
| `omo-cli mcp oauth` | Manage OAuth tokens for MCP servers |
| `omo-cli get-local-version` | Show version and check for updates |

---

## 11. PLUGIN LIFECYCLE

```
OpenCode Boot
 │
 ▼
OmoCliPlugin(ctx)
 │
 ├── [1] loadPluginConfig()        # Load omo-cli.json from .opencode/
 ├── [2] startTmuxCheck()          # Check tmux availability
 ├── [3] Register 46 hooks         # Conditional on disabled_hooks
 ├── [4] Register 28 tools         # LSP, AST, Session, Code-Intel, Security...
 ├── [5] Load 33 vuln fingerprints # Agent + Code + Infra security patterns
 ├── [6] Discover skills            # Builtin + Global + Project (merged)
 ├── [7] Start MCP servers          # Context7, Grep.app, Exa
 ├── [8] startAutoInit()            # Code-Intel indexing (background)
 │
 ▼
Return { tool, chat.message, event, tool.execute.before/after, config, experimental.chat.messages.transform }
```

---

## 12. CODE INTELLIGENCE (OPTIONAL)

Requires Docker + SurrealDB. Auto-starts when `memory.enabled = true`.

```
Source Code (15+ langs) → AST-grep Parser → SurrealDB Index
                                              ├── BM25 Full-text Search
                                              ├── Graph Relations (calls, deps)
                                              └── Incremental Hash (git-aware)
```

4 Tools: `code_search`, `code_callers`, `code_deps`, `code_overview`

SurrealDB Brain Integration: BM25 + Vector embedding + RRF fusion, graceful fallback to filesystem.

---

## 13. SKILL LIBRARY

- **1243+ skills** centralized at `~/.config/_skills_/`
- `~/.opencode/skills` → auto-symlink to `~/.config/_skills_/` (shared with Claude Code, Cursor, etc.)
- **4 Tiers**: Tier 1 (85 SAFE+Excellent), Tier 2 (394 SAFE/LOW+Good), Tier 3 (100 MEDIUM), Tier 4 (36 HIGH risk)
- **Import workflow**: `scan-skills` → `categorize-skills` → `adapt-skills --tier N`

---

## 14. DEVELOPMENT CONVENTIONS

| Convention | Rule |
|-----------|------|
| **Package Manager** | Bun exclusively (NEVER npm/yarn) |
| **Types** | bun-types (NEVER @types/node) |
| **Build** | `bun build` (ESM) + `tsc --emitDeclarationOnly` |
| **Exports** | Barrel pattern via index.ts |
| **Naming** | kebab-case dirs, `createXXXHook`/`createXXXTool` factories |
| **Testing** | BDD comments (`//#given`, `//#when`, `//#then`), 223 test files |
| **Temperature** | 0.1 for code agents, max 0.3 |
| **TDD** | MANDATORY: RED → GREEN → REFACTOR |
| **Test Files** | `*.test.ts` alongside source |
| **Commits** | Atomic, Conventional Commits (`type(scope): subject`) |
| **Branching** | `feature/X`, `bugfix/Y`, `chore/Z` — never commit to `main`/`dev` directly |
| **Deployment** | GitHub Actions `workflow_dispatch` ONLY — never `bun publish` directly |

### Build Commands

```bash
bun run typecheck      # Type check
bun run build          # ESM + declarations + schema
bun run clean          # Remove dist/
bun run test           # Run tests (via test-isolated.ts)
```

---

## 15. ANTI-PATTERNS (FORBIDDEN)

| Category | Forbidden |
|----------|-----------|
| Package Manager | npm, yarn — Bun exclusively |
| Types | @types/node — use bun-types |
| File Ops | mkdir/touch/rm/cp/mv in code — use bash tool |
| Publishing | Direct `bun publish` — GitHub Actions only |
| Versioning | Local version bump — CI manages |
| Type Safety | `as any`, `@ts-ignore`, `@ts-expect-error` |
| Error Handling | Empty catch blocks |
| Testing | Deleting failing tests |
| Agent Calls | Sequential — use `delegate_task` parallel |
| Hook Logic | Heavy PreToolUse — slows every call |
| Commits | Giant (3+ files), separate test from impl |
| Temperature | >0.3 for code agents |
| Trust | Agent self-reports — ALWAYS verify |

---

## 16. COMPLEXITY HOTSPOTS

| File | Lines | Description |
|------|-------|-------------|
| `src/features/builtin-skills/skills.ts` | 2087 | Skill definitions |
| `src/features/background-agent/manager.ts` | 1463 | Task lifecycle, concurrency |
| `src/agents/coder.ts` | 1319 | Planner agent (interview mode) |
| `src/config/schema.ts` | 745 | Zod config schema |
| `src/index.ts` | 780 | Main plugin entry |
| `src/hooks/navigator/index.ts` | 769 | Conductor orchestration hook |
| `src/tools/delegate-task/tools.ts` | 683 | Category-based delegation |
| `src/cli/config-manager.ts` | 435 | JSONC config parsing |

---

## 17. WHERE TO LOOK (TASK → FILE)

| Task | Location | Notes |
|------|----------|-------|
| Add agent | `src/agents/` | Create .ts with factory, add to `agentSources` in utils.ts |
| Add hook | `src/hooks/` | Create dir with `createXXXHook()`, register in index.ts |
| Add tool | `src/tools/` | Dir with index/types/constants/tools.ts |
| Add MCP | `src/mcp/` | Create config, add to index.ts |
| Add skill | `src/features/builtin-skills/` | Create dir with SKILL.md |
| Add command | `src/features/builtin-commands/` | Add template + register in commands.ts |
| Config schema | `src/config/schema.ts` | Zod schema, run `bun run build:schema` |
| Background agents | `src/features/background-agent/` | manager.ts (1463 lines) |
| Orchestrator | `src/hooks/navigator/` | Main orchestration hook (769 lines) |

---

## 18. DEPENDENCIES (KEY)

| Package | Purpose |
|---------|---------|
| `@opencode-ai/plugin` | OpenCode plugin API types |
| `@opencode-ai/sdk` | OpenCode SDK client |
| `@ast-grep/napi` | AST-grep native binding (code intelligence) |
| `@modelcontextprotocol/sdk` | MCP protocol |
| `@xenova/transformers` | Vector embeddings (local) |
| `effect` / `@effect/platform` / `@effect/schema` | Functional effect system |
| `zod` | Schema validation |
| `commander` | CLI framework |
| `vscode-jsonrpc` | LSP communication |
| `picocolors` | Terminal colors |

---

## 19. ROADMAP (CURRENT)

### 🔴 High Priority
- **Agent Freeze Auto-Recovery**: Comprehensive provider error detection + auto-retry w/ exponential backoff
- **Remove `as any` Casts (Phase 2)**: 180 remaining casts to eliminate

### 🟡 Medium Priority
- **Cost Metering Verification**: Verify end-to-end in production
- **BM25 Search Enhancement**: Tune tokenization, verify relevance
- **Test `as any` Audit**: Create proper interfaces for mock types

---

## 20. NOTES FOR AI AGENTS

1. **omo-cli is a PLUGIN, not a fork** — it extends OpenCode via the official plugin API
2. **AGENTS.md** in project root is from the omni toolchain (NOT project docs) — project docs are in **AGENTS.md.bak**
3. **The magic word `ultrawork`** (or `ulw`) activates all features including parallel agents, deep exploration, and relentless execution
4. **Models are dynamically resolved** via `omo-cli.json` — the profile system controls everything
5. **OpenCode ≥ 1.0.150 required** as the base runtime
6. **SurrealDB is optional** — without it, only 4 code intelligence tools are disabled; everything else works
7. **Tmux is optional** — without it, background_task tool is unavailable; delegate_task still works synchronously
8. **223 test files** use BDD-style comments and `bun run test` (via `test-isolated.ts`; raw `bun test` has false failures)
9. **Flaky tests**: ralph-loop (CI timeout), session-state (parallel pollution)
10. **Trusted deps** requiring compilation: `@ast-grep/cli`, `@ast-grep/napi`, `@code-yeongyu/comment-checker`
