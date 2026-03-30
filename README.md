> [!WARNING]
> **Security Warning: Impersonation Website**
>
> **ohmyopencode.com is NOT affiliated with this project.** We do not operate or endorse that site.
>
> OmoCli is **free and open-source** software. **Do not** download installers or enter payment information on sites claiming to be "official."
>
> ✅ Official downloads: https://github.com/aurora-freedom-project/omo-cli/releases

> [!NOTE]
>
> [![Orchestrator Labs — Orchestrator is a coding agent like your team.](./.github/assets/sisyphuslabs.png?v=2)](https://sisyphuslabs.ai)
> > **We're building the full version of Orchestrator to shape the future of frontier agents. <br />Join the waitlist [here](https://sisyphuslabs.ai).**

<div align="center">

[![OMO CLI](./.github/assets/hero.jpg)](https://github.com/aurora-freedom-project/omo-cli#omo-cli)

[![Preview](./.github/assets/omo.png)](https://github.com/aurora-freedom-project/omo-cli#omo-cli)

</div>

> This is coding at a whole new level — `omo-cli` in action. Run parallel background agents, call specialized agents like architect, researcher, frontend engineer. Use LSP/AST tools, curated MCPs, and full Claude Code compatibility layer.

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/aurora-freedom-project/omo-cli?color=369eff&labelColor=black&logo=github&style=flat-square)](https://github.com/aurora-freedom-project/omo-cli/releases)
[![npm downloads](https://img.shields.io/npm/dt/omo-cli?color=ff6b35&labelColor=black&style=flat-square)](https://www.npmjs.com/package/omo-cli)
[![GitHub Stars](https://img.shields.io/github/stars/aurora-freedom-project/omo-cli?color=ffcb47&labelColor=black&style=flat-square)](https://github.com/aurora-freedom-project/omo-cli/stargazers)
[![License](https://img.shields.io/badge/license-SUL--1.0-white?labelColor=black&style=flat-square)](https://github.com/aurora-freedom-project/omo-cli/blob/master/LICENSE.md)

**[🇻🇳 Phiên bản tiếng Việt](README.vi.md)**

</div>

---

## Table of Contents

- [OMO CLI (Oh My OpenCode)](#omo-cli-oh-my-opencode)
  - [Skip This README](#skip-this-readme)
  - [🪄 The Magic Word: `ultrawork`](#-the-magic-word-ultrawork)
  - [Installation](#installation)
  - [Project Architecture](#project-architecture)
  - [Plugin Lifecycle](#plugin-lifecycle)
  - [Profile System](#profile-system)
  - [Agent Architecture](#agent-architecture)
  - [Background Agent & Tmux](#background-agent--tmux)
  - [Hook System (40+)](#hook-system-40)
  - [Tool System (20+)](#tool-system-20)
  - [Smart Routing](#smart-routing)
  - [Code Intelligence](#code-intelligence)
  - [Skill Library (1243+)](#skill-library-1243)
  - [CLI Reference](#cli-reference)
  - [Configuration Reference](#configuration-reference)
  - [Troubleshooting](#troubleshooting)

# OMO CLI (Oh My OpenCode)

[Claude Code](https://www.claude.com/product/claude-code) is great.
But if you're a hacker, you'll fall in love with [OpenCode](https://github.com/sst/opencode).
**START WITH YOUR ChatGPT, Claude, AND Gemini SUBSCRIPTIONS. OPENCODE COVERS THEM ALL.**

- Infinitely extensible. Infinitely customizable.
- No screen tearing.
- [LSP](https://opencode.ai/docs/lsp/), [linter, formatter](https://opencode.ai/docs/formatters/) auto-activate per file — and you can fine-tune everything.
- Multi-model coordination. **Assign them by purpose.**
- Full-featured. Beautiful. No terminal lag. High performance.

Remember the first time you switched from Windows to Linux? That thrill of configuring everything exactly how you wanted?
In an era where that feeling seemed lost, OpenCode brings it back.

I've solved the learning curve by encoding the best environments directly into this codebase. Hand this documentation to an agent and let it install for you.

## Skip This README

### It's the Agent Era
- **Paste this link into Claude Code / AmpCode / Factory Droid / Cursor and ask it to explain.**
  - Ask why it's good, why it's not just boilerplate setup, what actually improves.
  - If you're an LLM agent, explain to the user what they can do right now with this project.

```
Hey please read this readme and tell me why it is different from other agent harness? why is this actually good? https://raw.githubusercontent.com/aurora-freedom-project/omo-cli/refs/heads/dev/README.md
```

### 🪄 The Magic Word: `ultrawork`

**Too lazy to read everything? Just add `ultrawork` (or `ulw`) to your prompt.**

That's it. Every feature activates like magic — parallel agents, background tasks, deep exploration, and relentless execution until completion. The agent handles the rest.

### Meet Orchestrator

![Meet Orchestrator](.github/assets/sisyphus.png)

In Greek mythology, Sisyphus was condemned to roll a boulder uphill forever. LLM Agents did nothing wrong, but they too roll their "boulder" — thinking — every day.

This is our primary agent: **Orchestrator** (Claude Opus 4.6 Thinking). Below are the tools Orchestrator uses to keep rolling. *Everything below is customizable. Take what you want. All features enabled by default.*

- **Orchestrator's Teammates** (10 curated Agents running in parallel)
- **Full LSP / AstGrep Support**: Decisive refactoring.
- **Todo Continuation Enforcer**: Forces the agent to continue if it gives up mid-task. **This is what keeps Orchestrator rolling.**
- **Claude Code Compatible**: Commands, Agents, Skills, MCP, Hooks
- **Curated MCPs**: Exa (Web Search), Context7 (Real-time docs), Grep.app (GitHub code search), AgentQL (Web data extraction)
- **1243+ Built-in Skills**: Expert-level skills, centrally stored at `~/.config/_skills_/` (auto-symlinked from `~/.opencode/skills/`)
- **Pipeline Task**: Multi-stage DAG execution — chain agents in sequence (analyst → architect → coder → reviewer)
- **10 Design Commands**: `/design-audit`, `/design-polish`, `/design-critique`, and 7 more steering commands

---

## Installation

> **Note:** This is a custom fork with advanced features. Must install from source.

### Prerequisites

- [Bun](https://bun.sh) — runtime & package manager
- [OpenCode](https://github.com/sst/opencode) — terminal AI coding

### Quick Install

```bash
# 1. Clone repo
git clone https://github.com/aurora-freedom-project/omo-cli.git -b dev
cd omo-cli

# 2. Install dependencies & build
bun install && bun run build

# 3. Register `omo-cli` as a global command
bun link

# 4. Install plugin into OpenCode (interactive profile selection)
omo-cli install

# Or install directly with a specific profile
omo-cli install --profile=mike
```

After `bun link`, the `omo-cli` command is available from any directory.

> **Tip**: Whenever you `git pull` new code, just run `bun run build` — the `omo-cli` command auto-updates since it points directly to `dist/`.

### Verify Installation

```bash
# Check version
omo-cli --version

# Full system health check
omo-cli doctor
```

### Uninstall

```bash
# Remove plugin from config
jq '.plugin = [.plugin[] | select(. != "omo-cli")]' \
    ~/.config/opencode/opencode.json > /tmp/oc.json && \
    mv /tmp/oc.json ~/.config/opencode/opencode.json

# Remove profiles
rm -rf ~/.config/opencode/profiles/
```

---

## Project Architecture

```
omo-cli/
├── bin/                          # Launcher for npm distribution
│   ├── omo-cli.js                # Platform-specific binary dispatcher
│   └── platform.js               # Platform detection logic
├── dist/                         # Build output (created by `bun run build`)
│   ├── index.js                  # Plugin entry point (2.65 MB)
│   └── cli/index.js              # CLI entry point (1.1 MB) ← `omo-cli` points here
├── assets/
│   └── omo-cli.schema.json       # JSON Schema for omo-cli.json config file
├── script/                       # Build & tooling scripts
│   ├── build-schema.ts           # Generate JSON Schema from Zod
│   ├── build-binaries.ts         # Compile binaries for multi-platform
│   ├── fix-test-types.ts         # Auto-fix tsc errors in test files
│   └── test-isolated.ts          # Test runner (isolated process)
├── profiles/                     # Built-in profile templates
│   ├── mike/omo-cli.json         # Main baseline profile (cloud models)
│   └── mike-local/omo-cli.json   # Local/offline profile (Qwen, GLM, Minimax)
├── src/
│   ├── index.ts                  # Plugin registration & OpenCode hook wiring
│   ├── plugin-config.ts          # Config loading (omo-cli.json)
│   ├── plugin-state.ts           # Runtime state (model cache, etc.)
│   ├── agents/                   # 🧠 Agent Definitions (10 agents)
│   │   ├── orchestrator.ts       # Orchestrator — primary conductor
│   │   ├── worker.ts             # Worker — parallel worker
│   │   ├── coder.ts              # Planner — strategic planning (interview mode)
│   │   ├── explorer.ts           # Explorer — codebase traversal
│   │   ├── researcher.ts         # Researcher — deep research
│   │   ├── conductor.ts          # Consultant — pre-plan analysis (gap detection)
│   │   ├── architect.ts          # Architect — architecture consulting
│   │   ├── reviewer.ts           # Reviewer — code review
│   │   ├── navigator.ts          # Conductor — master orchestrator (todo list keeper)
│   │   └── vision.ts             # Vision — multimodal analysis
│   ├── hooks/                    # 🪝 Lifecycle Hooks (40+ hooks)
│   │   ├── todo-continuation-enforcer.ts   # Keeps Orchestrator rolling
│   │   ├── comment-checker/               # Anti-AI-slop hook
│   │   ├── ralph-loop/                    # Retry loop for errors
│   │   ├── think-mode/                    # Toggle extended thinking
│   │   ├── session-recovery/              # Crash recovery
│   │   ├── workpad-tracker.ts         # Session artifact tracking
│   │   └── ...                            # (see hook list below)
│   ├── tools/                    # 🔧 Custom Tools
│   │   ├── ast-grep/             # AST-based refactoring
│   │   ├── lsp/                  # Language Server Protocol
│   │   ├── background-task/      # Run agents in parallel
│   │   ├── delegate-task/        # Inter-agent delegation
│   │   ├── pipeline-task/        # Multi-stage DAG execution
│   │   ├── call-omo-agent/       # Direct agent invocation
│   │   ├── look-at/              # Vision tool
│   │   └── skill/                # Skill discovery & execution
│   ├── features/                 # 📦 Feature Modules (22 modules)
│   │   ├── code-intel/              # 🧬 Code Intelligence (AST indexing)
│   │   ├── opencode-skill-loader/   # Load skills from ~/.config/_skills_/
│   │   ├── builtin-skills/          # Built-in expert skills
│   │   ├── builtin-commands/        # Built-in commands (slash commands)
│   │   ├── background-agent/        # Background agent runtime
│   │   ├── boulder-state/           # "Rolling boulder" state persistence
│   │   ├── tmux-subagent/           # Parallel execution via tmux
│   │   ├── context-injector/        # Dynamic context injection
│   │   ├── hook-message-injector/   # Inject hook messages into thread
│   │   ├── skill-mcp-manager/       # MCP server management for skills
│   │   ├── task-toast-manager/      # Background task toast notifications
│   │   ├── mcp-oauth/               # OAuth flow for MCP servers
│   │   ├── claude-code-agent-loader/    # Load agents from .claude config
│   │   ├── claude-code-command-loader/  # Load commands from .claude config
│   │   ├── claude-code-mcp-loader/      # Load MCPs from .claude config
│   │   ├── claude-code-plugin-loader/   # Load plugins from .claude config
│   │   ├── claude-code-session-state/   # Claude Code session state management
│   │   ├── reasoning-bank/          # Pattern learning & trajectory tracking
│   │   ├── perf-benchmark/           # Performance benchmarks (p50/p95/p99)
│   │   ├── claim-release/            # Exclusive resource locking
│   │   └── workflow-unifier/         # WORKFLOW.md discovery & unification
│   ├── mcp/                      # 🌐 MCP Server Configuration
│   │   ├── agentql.ts            # Web data extraction (AgentQL)
│   │   ├── context7.ts           # Real-time documentation
│   │   ├── grep-app.ts           # GitHub code search
│   │   └── websearch.ts          # Exa web search
│   ├── cli/                      # 💻 CLI Commands
│   │   ├── install.ts            # `omo-cli install`
│   │   ├── config-manager.ts     # Config creation & management
│   │   ├── profile-manager.ts    # Profile CRUD
│   │   ├── profile-wizard.ts     # Interactive profile wizard
│   │   ├── doctor/               # `omo-cli doctor`
│   │   ├── run/                  # `omo-cli run`
│   │   └── skills-*.ts           # Import/scan/adapt/sync skills
│   ├── config/                   # Config schema & validation
│   ├── shared/                   # Cross-cutting utilities (57+ modules)
│   │   └── skills-brain-query.ts # SurrealDB Brain query (hybrid search, BM25)
│   └── plugin-handlers/          # OpenCode plugin event handlers
├── package.json
├── tsconfig.json
└── AGENTS.md                     # Agent behavior documentation
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Plugin architecture** | Hooks into OpenCode's native plugin system — zero patches to OpenCode core |
| **Profile-based config** | One JSON file controls all agents, models, features — instant switching |
| **Unified Skills (`~/.config/_skills_/`)** | Single source of truth — `~/.opencode/skills` auto-symlinks, shared with all AI tools |
| **`bun link` for dev** | `dist/cli/index.js` is the bin target — rebuild = command auto-updates |

---

## Plugin Lifecycle

When OpenCode starts, the `omo-cli` plugin registers via `OmoCliPlugin(ctx)`. Here's the initialization flow:

```
OpenCode Boot
 |
 v
OmoCliPlugin(ctx)
 |
 +--[1] loadPluginConfig()        Load omo-cli.json from .opencode/
 +--[2] startTmuxCheck()          Check tmux availability
 +--[3] Register 40+ hooks        Conditional on disabled_hooks
 +--[4] Register 20+ tools        LSP, AST, Session, Code-Intel, ...
 +--[5] Discover skills            Builtin + Global + Project
 +--[6] Start MCP servers          Context7, Grep.app, Exa
 +--[7] startAutoInit()            Code-Intel indexing (background)
 |
 v
Return { tool, chat.message, event, tool.execute.before/after }
```

The plugin returns **5 lifecycle hooks**, called by OpenCode at different points:

| Lifecycle Point | When | Purpose |
|----------------|------|---------|
| `chat.message` | Every user message | Variant injection, keyword detection, Ralph Loop |
| `event` | Session created/deleted, error | Recovery, auto-update, notification |
| `tool.execute.before` | Before tool runs | Arg injection, routing, question blocking |
| `tool.execute.after` | After tool runs | Output truncation, error recovery |
| `messages.transform` | Thread transform | Context injection, thinking validation |

> **Zero-patch design**: Plugin hooks into OpenCode via official API. No modifications to OpenCode core.

---

## Profile System

`omo-cli` uses a fully **profile-driven configuration** system. Forget complex flags. Everything is packaged directly in the `omo-cli.json` profile template.

Each profile is an independent universe. Use `omo-cli profile apply <name>` to update your workspace with a complete matrix of Agent settings, Model selection, and Feature flags driven by that profile's JSON definition. Everything anchors to the `.opencode` directory model.

### Built-in Profiles

#### Profile `mike` — Cloud (main baseline)

| Agent Tier | Roles | Selected Model |
|-----------|-------|----------------|
| 🧠 **Brain** | Orchestrator, Planner, Conductor, Architect | Opus 4.6 Thinking |
| ⚡ **Worker** | Consultant, Reviewer, Worker | Sonnet 4.5 Thinking |
| 👁️ **Vision** | Vision | Gemini 3 Pro Image |
| 🚀 **IO** | Explorer, Researcher | Minimax M2.1 |

#### Profile `mike-local` — Local/Offline

| Agent Tier | Roles | Selected Model |
|-----------|-------|----------------|
| 🧠 **Brain** | Orchestrator, Planner, Conductor, Architect, Consultant, Reviewer, Vision | Qwen 3.5 397B |
| ⚡ **Worker** | Worker | Qwen3 Coder Next |
| 🚀 **IO** | Explorer | Minimax M2.5 |
| 📚 **Research** | Researcher | GLM-5 |

### Profile Commands

```bash
omo-cli profile list            # List all profiles
omo-cli profile show            # Show active profile
omo-cli profile apply mike      # Apply cloud profile
omo-cli profile apply mike-local # Apply local profile
omo-cli profile create          # Create custom profile (interactive)
```

---

## Agent Architecture

Agents are divided into **10 specific entities** serving **8 functional categories**.

### Orchestration Flow

```
User Prompt
      |
      v
+-----------------------------+
|   Orchestrator (Opus 4.6)   |  BM25 keyword scoring
|   Analyze + plan            |  Auto-route to right agent
+-----------------------------+
      |
      +-- delegate_task -------> Worker (Sonnet 4.5)   [sync]
      |                          Results return to parent
      |
      +-- call_omo_agent ------> Any agent              [sync]
      |                          Auto-routing
      |
      +-- background_task -----> Background Agent       [async]
      |                          Parallel via tmux
      |                          Toast on completion
      v
+-----------------------------+
|   Todo Continuation         |
|   Enforcer                  |<--> Boulder State
|   Forces agent to continue  |     (persistence)
+-----------------------------+
      |
      v
   Complete / Continue
```

**4 delegation mechanisms:**

| Mechanism | Type | Description |
|-----------|------|-------------|
| `delegate_task` | Sync | Child agent runs in sub-session, results return to parent. For tasks needing immediate results. |
| `pipeline_task` | Sync | Multi-stage DAG — chains agents sequentially (analyst → architect → coder → reviewer). Output of stage N feeds into stage N+1. |
| `call_omo_agent` | Sync | Call specific agent by name. Auto-routing via BM25 keyword scoring. |
| `background_task` | Async | Runs in parallel via tmux. Toast notification on completion. Doesn't block Orchestrator. |

### Fallback Chain

When a model encounters errors (timeout, rate limit, server error), omo-cli automatically falls through the fallback chain:
```
Brain Tier:   Opus 4.6  -->  Sonnet 4.5  -->  Gemini Pro  -->  big-pickle
Worker Tier:  Sonnet 4.5  -->  Gemini Pro  -->  big-pickle
Vision Tier:  Gemini Pro  -->  Gemini Flash  -->  big-pickle
IO Tier:      Minimax M2.1  -->  Gemini Flash  -->  big-pickle
```

---

## Background Agent & Tmux

When Orchestrator needs to run multiple tasks in parallel, it uses the `background_task` tool. Each background task runs in a separate tmux pane.

```
+-------------------------------------------------------+
|                   tmux session                        |
|                                                       |
|  +-----------+  +-----------+  +-----------+          |
|  |  Pane 0   |  |  Pane 1   |  |  Pane 2   |   ...    |
|  |Orchestratr|  |  Worker   |  | Explorer  |          |
|  |  (main)   |  | (delegate)|  |(backgrnd) |          |
|  +-----------+  +-----------+  +-----------+          |
|                       |              |                |
+-------------------------------------------------------+
                        v              v
                  +------------------------+
                  |  Task Toast Manager    |
                  |  Notification on done  |
                  +------------------------+
                        |
                        v
                  +------------------------+
                  |  Boulder State         |
                  |  Persist across        |
                  |  sessions              |
                  +------------------------+
```

**Key components:**

| Module | File | Function |
|--------|------|----------|
| `BackgroundManager` | `features/background-agent/` | Background task lifecycle management, concurrent limits |
| `TmuxSessionManager` | `features/tmux-subagent/` | Create/manage tmux panes for each sub-agent |
| `TaskToastManager` | `features/task-toast-manager/` | Toast notifications via TUI when tasks complete |
| `BoulderState` | `features/boulder-state/` | Persist "rolling boulder" state across session restarts |

---

## Hook System (50+)

50+ hooks run throughout the lifecycle, categorized into 8 groups:

```
chat.message --------+
                     |    +-----------------------------+
event ---------------+---->|       Hook Pipeline         |
                     |    |                             |
tool.execute.before -+    |  40+ hooks x 6 categories  |
tool.execute.after --+    |                             |
                     |    |  Each hook can:              |
messages.transform --+    |   - Modify input/output     |
                          |   - Inject context           |
                          |   - Block / retry            |
                          |   - Fire events              |
                          +-----------------------------+
```

| Category | Hook | Purpose |
|----------|------|---------|
| **Persistence** | `todo-continuation-enforcer` | Forces agent to continue if it gives up mid-task |
| | `session-recovery` | Recover session after crash/timeout |
| | `boulder-state` | Persist state across restarts |
| **Quality** | `comment-checker` | Anti-AI-slop — rejects meaningless comments |
| | `thinking-block-validator` | Validate thinking blocks are valid |
| | `edit-error-recovery` | Auto-fix file edit errors |
| | `coder-md-only` | Enforce markdown format for Coder |
| **Context** | `context-injector` | Dynamic context injection into thread |
| | `compaction-context-injector` | Supplement context during compaction |
| | `rules-injector` | Inject `.opencode/rules` |
| | `directory-agents-injector` | Inject `AGENTS.md` into context |
| | `directory-readme-injector` | Inject project `README.md` |
| | `memory-capture` | Auto-save knowledge to SurrealDB |
| **Routing** | `keyword-detector` | Detect keyword triggers (ultrawork, etc.) |
| | `auto-slash-command` | Auto-match slash commands |
| | `navigator` / `conductor` | Complex task orchestration |
| | `category-skill-reminder` | Suggest relevant skills by category |
| | `agent-usage-reminder` | Remind to use specialized agents |
| **Recovery** | `ralph-loop` | Self-healing retry loop for recurring errors |
| | `anthropic-context-window-limit-recovery` | Recovery when context window is full |
| | `delegate-task-retry` | Retry failed delegation tasks |
| | `context-window-monitor` | Monitor and warn about context window |
| **UX** | `session-notification` | Notify when session completes |
| | `background-notification` | Background task notifications |
| | `auto-update-checker` | Check and notify about new versions |
| | `think-mode` | Toggle extended thinking |
| | `start-work` | Work session start hook |
| | `worker-notepad` | Internal notepad for Worker |
| | `question-label-truncator` | Truncate TUI question labels |
| | `subagent-question-blocker` | Block subagent questions |
| | `non-interactive-env` | Non-interactive environment support |
| | `tool-output-truncator` | Truncate long tool output |
| | `empty-task-response-detector` | Detect empty responses |
| | `task-resume-info` | Task resume information |
| **Security** | `input-guard` | Detects prompt injection (9 layers) |
| | `auto-remediate` | Automated vulnerability triage and remediation |
| | `jailbreak-eval` | Post-session LLM refusal detection |
| | `output-guard` | Sanitizes malicious MCP payload returns |
| | `sandbox-server` | Containerizes dangerous exec invocations |
| | `provider-probe` | Monitors adversarial payloads via external probes |
| | `mcp-audit` | Audits high-risk MCP network egress |
| | `variant-hunter` | Triage variations of legacy and fingerprint DB anti-patterns |
| **Metering** | `cost-metering` | Track token usage and estimate USD cost per session |

> **Disable hooks**: Add hook names to `disabled_hooks` in `omo-cli.json`. See [Configuration Reference](#configuration-reference).

---

## Tool System (20+)

20+ tools registered into OpenCode, categorized into 6 groups:

```
+-----------------+   +-----------------+   +-----------------+
|   LSP (6)       |   |   AST (2)       |   |  Session (4)    |
| goto_definition |   | ast_grep_search |   | session_list    |
| find_references |   | ast_grep_replace|   | session_read    |
| symbols         |   +-----------------+   | session_search  |
| diagnostics     |                         | session_info    |
| prepare_rename  |   +-----------------+   +-----------------+
| rename          |   | Code Intel (4)  |
+-----------------+   | code_search     |   +-----------------+
                      | code_callers    |   | Orchestrate (5) |
+-----------------+   | code_deps       |   | delegate_task   |
|  Utility (5)    |   | code_overview   |   | pipeline_task   |
| look_at         |   +-----------------+   | call_omo_agent  |
| skill           |                         | background_out  |
| skill_mcp       |                         | background_cncl |
| slashcommand    |                         +-----------------+
| interactv_bash  |
+-----------------+
```

| Group | Tools | Description |
|-------|-------|-------------|
| **LSP** | `lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`, `lsp_diagnostics`, `lsp_prepare_rename`, `lsp_rename` | Language Server Protocol — precise refactoring, navigation |
| **AST** | `ast_grep_search`, `ast_grep_replace` | Structure-based AST search/replace |
| **Session** | `session_list`, `session_read`, `session_search`, `session_info` | Manage and query session history |
| **Code Intel** | `code_search`, `code_callers`, `code_deps`, `code_overview` | BM25 search, graph analysis (see [Code Intelligence](#code-intelligence)) |
| **Orchestration** | `delegate_task`, `pipeline_task`, `call_omo_agent`, `background_output`, `background_cancel` | Delegation, multi-stage pipelines, and background task management |
| **Utility** | `look_at`, `skill`, `skill_mcp`, `slashcommand`, `interactive_bash` | Vision, skill execution, command routing |

---

## Smart Routing

The routing engine uses **BM25 keyword scoring** on the prompt to instantly match the right Agent and Sub-skill without user guidance. Covers complex routing across 12 distinct functional task types (Architecture vs DevOps vs Code-gen) and detects 15+ programming languages directly from the instruction flow.

---

## Code Intelligence

`omo-cli` integrates **Code Intelligence** — an automatic code structure analysis system using AST-grep and SurrealDB.

### How It Works

```
+----------------+    +----------------+    +----------------+
|  Source Code   |--->|   AST-grep     |--->|   SurrealDB    |
|  (15+ langs)   |    |   Parser       |    |   Index        |
+----------------+    +----------------+    +----------------+
       |                                          |
       v                                          v
  Git tracking                           BM25 Full-text Search
  Incremental hash                       Graph Relations
```

1. **AST Parsing** — Uses [ast-grep](https://ast-grep.github.io/) for structure analysis: functions, classes, interfaces, types, imports/exports
2. **Incremental Indexing** — Only indexes changed files (hash comparison). Git-aware.
3. **SurrealDB Storage** — Stores code elements + call/dependency relationships in graph database
4. **Auto-init** — Runs automatically in background when plugin loads. Non-blocking.

### 4 Tools for Agents

| Tool | Description |
|------|-------------|
| `code_search` | BM25 search on functions, classes, interfaces by name or description |
| `code_callers` | Blast radius analysis — who calls this function? |
| `code_deps` | File dependency graph — what it imports, who imports it |
| `code_overview` | Project structure overview — file, element, exported symbol counts |

### Supported Languages

TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP, Swift, Kotlin, Scala, and more.

### Setup

```bash
# Start SurrealDB (first time only)
omo-cli memory start

# Auto-indexing runs in background when you open OpenCode
# Or run manually if needed:
omo-cli index
```

> **Note**: Code Intelligence is optional. If Docker/SurrealDB is unavailable, the plugin continues working normally — only the 4 tools above are disabled.

### SurrealDB Brain Integration

omo-cli integrates with **Omni Brain** (SurrealDB) for enhanced hybrid skill search:

| Feature | Description |
|---------|-------------|
| **Hybrid Search** | BM25 full-text + Vector embedding + RRF fusion |
| **Graceful Fallback** | Brain unavailable → auto-fallback to filesystem |
| **Content Hash** | Smart reconciliation — only syncs changed skills |
| **Event Sourcing** | `execution_event` schema for audit trail |

Configuration in `omo-cli.json`:
```json
{
  "memory": {
    "enabled": true,
    "mode": "managed",
    "port": 18000,
    "namespace": "omo",
    "database": "memory"
  }
}
```

> **Modes**: `"managed"` (auto Docker) or `"external"` (pre-existing SurrealDB).

---

## Skill Library (1243+)

`omo-cli` aligns purely with OpenCode philosophy. **Legacy `.claude` and `.agent` hooks have been completely removed.**

All skills are centrally stored at **`~/.config/_skills_/`** — this is the Single Source of Truth.
`~/.opencode/skills` is an auto-symlink pointing to `~/.config/_skills_/`, allowing OpenCode to discover skills normally.
This lets you share your skill library with other AI tools (Claude Code, Cursor, etc.) from a single location.

```bash
# Import all safe and verified skills
omo-cli import-skills --all --valid-only

# Import by safety/quality tier
omo-cli adapt-skills --tier 1        # 85 SAFE + Excellent skills
omo-cli adapt-skills --max-tier 2    # Tiers 1 + 2 (479 skills)

# Sync from remote agentskills.io
omo-cli sync-skills
```

---

## CLI Reference

### `omo-cli install`

Install and configure omo-cli into OpenCode using the profile system.

```
Usage: omo-cli install [options]

Options:
  --no-tui              Run non-interactively (requires --profile)
  -p, --profile <name>  Apply profile by name (e.g., mike)
  --skip-auth           Skip authentication setup prompts

Examples:
  omo-cli install                              # Interactive TUI (profile wizard)
  omo-cli install --no-tui --profile=mike      # Non-interactive
```

---

### `omo-cli run`

Run OpenCode with todo/background task completion enforcement.

```
Usage: omo-cli run [options] <message>

Options:
  -a, --agent <name>       Agent to use (default: Orchestrator)
  -d, --directory <path>   Working directory
  -t, --timeout <ms>       Timeout in milliseconds (default: 30 min)

Examples:
  omo-cli run "Fix bug in index.ts"
  omo-cli run --agent Orchestrator "Implement feature X"
  omo-cli run --timeout 3600000 "Large refactoring task"
```

Unlike `opencode run`, this command waits until:
- All todos are completed or cancelled
- All child sessions (background tasks) are idle

---

### `omo-cli memory`

Manage the local SurrealDB database for Project Memory (Vector/Knowledge storage).

```
Usage: omo-cli memory [subcommand]

Subcommands:
  start    Start SurrealDB container (port 18000)
  stop     Stop SurrealDB container
  status   View container and connection status
  reset    Delete all memory data (CAUTION)

Examples:
  omo-cli memory start
  omo-cli memory status
```

> **Docker Compose Tip**: OMO CLI supports launching via `docker-compose.yml` by default. If you have a `docker-compose.yml` at your project root (with an `omo-surrealdb` service definition), `omo-cli memory start` will automatically prefer `docker compose up -d` instead of running a standalone `docker run` container. Or you can configure `external` mode to skip auto-container setup.

---

### `omo-cli doctor`

Health check installation and diagnose issues.

```
Usage: omo-cli doctor [options]

Options:
  --verbose               Show detailed diagnostic information
  --json                  Output results as JSON
  --category <category>   Run specific category only

Check categories:
  installation     Check OpenCode and plugin installation
  configuration    Validate configuration files
  authentication   Check provider authentication status
  dependencies     Check external dependencies
  tools            Check LSP and MCP servers
  updates          Check for version updates

Examples:
  omo-cli doctor
  omo-cli doctor --verbose
  omo-cli doctor --json
  omo-cli doctor --category authentication
```

---

### `omo-cli get-local-version`

Show installed version and check for updates.

```
Usage: omo-cli get-local-version [options]

Options:
  -d, --directory <path>  Directory to check config
  --json                  Output as JSON for scripting

Examples:
  omo-cli get-local-version
  omo-cli get-local-version --json
```

---

### `omo-cli import-skills`

Import skills from the antigravity-awesome-skills library (560+ skills).

```
Usage: omo-cli import-skills [options]

Options:
  -b, --bundle <name>        Import skill bundle (essentials, web-dev, security, devops, etc.)
  -s, --skills <name...>     Import specific skills by name
  -t, --target <path>        Target directory (default: ~/.config/_skills_)
  -l, --list                 List available bundles
  -a, --all                  Import ALL skills from repository
  --tier <number>            Import skills by tier (1-4, requires categorize-skills first)
  --audit                    Check skill structure without importing
  --valid-only               With --all: only import valid skills (proper SKILL.md)

Tiers (run categorize-skills first):
  Tier 1    85 skills  - SAFE + Excellent quality (recommended to start)
  Tier 2   394 skills  - SAFE/LOW + Good quality
  Tier 3   100 skills  - MEDIUM risk
  Tier 4    36 skills  - HIGH risk (requires manual review)

Available bundles:
  essentials    Core skills for everyone (brainstorming, planning, clean code)
  web-dev       Frontend and full-stack web development
  security      Security auditing, best practices
  devops        Infrastructure, deployment, automation
  backend       Server-side and API development
  data-ai       Data processing, ML, AI applications
  testing       Testing, QA, automation
```

---

### `omo-cli scan-skills`

Security and quality scan for skills (run before importing). Supports CI/CD gating.

```
Usage: omo-cli scan-skills [options]

Options:
  -o, --output <path>      Report output path (default: ./skills_security_report.json)
  -d, --details            Show detailed skill list
  --min-score <number>     Minimum quality score threshold (0-100)
  --strict                 Exit with code 1 if any skill falls below --min-score (CI/CD gate)

Examples:
  omo-cli scan-skills                              # Standard scan
  omo-cli scan-skills --min-score 70 --strict      # CI/CD gate: fail if score < 70
  omo-cli scan-skills --details --output report.json
```

---

### `omo-cli categorize-skills`

Categorize skills by tier and agent compatibility (run after scan-skills).

```
Usage: omo-cli categorize-skills [options]

Options:
  -i, --input <path>   Input scan report path (default: ./skills_security_report.json)
  -o, --output <path>  Output categorization report path
```

---

### `omo-cli adapt-skills`

Import skills with OMO metadata (agent, category, tier).

```
Usage: omo-cli adapt-skills [options]

Options:
  --tier <number>        Import specific tier (1-4)
  --max-tier <number>    Import all tiers up to max (default: 2)
  -t, --target <path>    Target directory (default: ~/.config/_skills_)
```

---

### `omo-cli sync-skills`

Sync global skills from remote agentskills.io repo.

```
Usage: omo-cli sync-skills [options]

Options:
  -f, --force  Force refresh shadow clone
```

---

### `omo-cli mcp`

Manage MCP servers.

```
Usage: omo-cli mcp [subcommand]

Subcommands:
  oauth   Manage OAuth tokens for MCP servers
```

---

### `omo-cli create-skill`

Create a new skill with an 8-section template and automatic quality scoring.

```
Usage: omo-cli create-skill <name> [options]

Options:
  --description <text>   Skill description
  -t, --target <path>    Target directory (default: ~/.config/_skills_)
  -f, --force            Overwrite existing skill

Examples:
  omo-cli create-skill api-design --description "REST API design patterns"
  omo-cli create-skill my-skill --target ./skills --force
```

The generated SKILL.md includes 8 sections: Instructions, Context Detection, Examples,
Anti-Patterns, Edge Cases, Quality Checklist, Iteration Notes, and Metadata.
After creation, the skill is automatically scored across 7 quality dimensions.

---

### Recommended Skill Workflow

```bash
# Step 1: Create a new skill
omo-cli create-skill my-skill --description "My custom skill"

# Step 2: Fill in the 8-section template (edit SKILL.md)

# Step 3: Security & quality scan
omo-cli scan-skills

# Step 4: Categorize by tier
omo-cli categorize-skills

# Step 5: Import by tier (safe → riskier)
omo-cli adapt-skills --tier 1          # Start with 85 best skills
omo-cli adapt-skills --max-tier 2      # Expand to 479 skills
```

---

## Configuration Reference

The `omo-cli.json` file (in `.opencode/`) controls all plugin behavior. Main structure:

```
omo-cli.json
 |
 +-- agents                 Override model per agent
 |   +-- orchestrator       { model: "...", variant: "..." }
 |   +-- worker
 |   +-- explorer
 |   +-- ...
 |
 +-- disabled_hooks[]       Disable specific hooks (by name)
 +-- disabled_agents[]      Disable specific agents
 +-- disabled_skills[]      Disable specific skills
 |
 +-- memory                 SurrealDB config
 |   +-- enabled            true/false
 |   +-- mode               "managed" | "external"
 |   +-- port               18000 (default)
 |   +-- namespace          "omo" (default)
 |   +-- database           "memory" (default)
 |   +-- auto_capture       Auto-save knowledge
 |
 +-- tmux                   Tmux layout config
 |   +-- enabled            true/false
 |   +-- layout             "main-vertical" | "tiled"
 |   +-- main_pane_size     60 (percent)
 |
 +-- background_task        Concurrent limits
 +-- ralph_loop             Ralph Loop config
 +-- experimental           Feature flags
 +-- categories             Task routing categories
 +-- cost_metering          Token usage & cost tracking
 +-- notification           Notification config
 +-- auto_update            true/false
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `agents.<name>.model` | `string` | From profile | Override model for specific agent |
| `agents.<name>.variant` | `string` | `undefined` | Variant (e.g., `"extended-thinking"`) |
| `disabled_hooks` | `string[]` | `[]` | List of disabled hooks |
| `disabled_agents` | `string[]` | `[]` | List of disabled agents |
| `memory.enabled` | `boolean` | `false` | Enable SurrealDB + Code Intelligence |
| `memory.mode` | `string` | `"managed"` | `"managed"` (auto Docker) or `"external"` (pre-existing SurrealDB) |
| `tmux.enabled` | `boolean` | `false` | Enable tmux for background agents |
| `auto_update` | `boolean` | `true` | Auto-check for new versions |
| `cost_metering.enabled` | `boolean` | `false` | Enable token cost tracking |
| `cost_metering.monthly_budget_usd` | `number` | — | Monthly budget limit (USD) |
| `cost_metering.daily_budget_usd` | `number` | — | Daily budget limit (USD) |
| `cost_metering.show_idle_summary` | `boolean` | `true` | Show cost summary when session is idle |

> **Tip**: Use `omo-cli doctor --category configuration` to validate your config file.

---

## Troubleshooting

Use the diagnostic tool if you have issues:
```bash
omo-cli doctor
```

It checks:
- Whether the plugin is injected into OpenCode Core
- Provider API status
- Validity of files in `~/.opencode/skills/`
- Schema syntax of `.opencode/omo-cli.json`

---

*Special thanks to [@junhoyeo](https://github.com/junhoyeo) for the original hero image.*
