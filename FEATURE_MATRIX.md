# OMO-CLI Feature Matrix v3.3.0

> **"Oh My OpenCode"** — Batteries-included plugin for OpenCode AI IDE
> Zero patches to OpenCode core. Pure plugin API integration.

---

## 📊 Feature Comparison: Default OpenCode vs OMO-CLI

| Capability | Default OpenCode | + OMO-CLI | Multiplier |
|-----------|-----------------|-----------|------------|
| Agents | 2 primary + 2 subagents | **10 specialized** + tiered model routing | **2.5×** |
| Tools | 11 built-in | **28 tools** (LSP, AST, Session, Code-Intel, Orchestration, Security) | **2.5×** |
| Hooks | 6 lifecycle points | **53 hooks** across 9 categories | **8×** |
| Skills | Basic `.opencode/skills/` | **1243+ skills**, tiered import, security scanning | **100×** |
| MCP Servers | Manual config | **4 auto-configured** + Claude Code compat + skill-embedded | **3 tiers** |
| Commands | 5 built-in | **12+ commands** + auto-slash-command routing | **2.4×** |
| Recovery | None | **5 recovery systems** (session, crash, ralph-loop, delegate-retry, context-limit) | **∞** |
| Code Intelligence | LSP (experimental) | **AST-grep → SurrealDB** (BM25, 768-D Vector, Graph) | **Full stack** |
| Multi-model | Single model/agent | **Per-agent + per-category** with fallback chains | **Dynamic** |
| Background Agents | None | **Parallel tmux** + toast notifications + boulder state | **New** |
| Cost Tracking | None | **Token/USD metering** with daily/monthly budgets | **New** |
| Security | None | **Defense-in-Depth** (Input Guard + 33 vuln fingerprints + triage + remediation pipeline) | **New** |

---

## 🧠 Agent System (10 Agents)

| Agent | Role | Model Tier | Default Model (Cloud) | Description |
|-------|------|-----------|----------------------|-------------|
| **Orchestrator** | 🎯 Task Routing | 🧠 Brain | Claude Opus 4.6 Thinking | Top-level task decomposition & delegation |
| **Conductor** | 🎼 Orchestration | 🧠 Brain | Claude Opus 4.6 Thinking | Multi-agent workflow coordination |
| **Architect** | 🏗️ Design | 🧠 Brain | Claude Opus 4.6 Thinking | System design, no write tools |
| **Planner/Coder** | 📝 Planning | 🧠 Brain | Claude Opus 4.6 Thinking | Interview-mode planning (1319 LOC) |
| **Consultant** | 💡 Advisory | ⚡ Worker | Claude Sonnet 4.5 Thinking | Deep reasoning & analysis |
| **Reviewer** | 🔍 Quality | ⚡ Worker | Claude Sonnet 4.5 Thinking | Code review & security audit |
| **Worker** | ⚒️ Implementation | ⚡ Worker | Claude Sonnet 4.5 Thinking | General-purpose code generation |
| **Vision** | 👁️ Visual | 👁️ Vision | Gemini 3 Pro Image | Multimodal image/screenshot analysis |
| **Explorer** | 🔭 Read-only | 🚀 IO | Minimax M2.1 | Fast codebase exploration |
| **Researcher** | 📚 Research | 🚀 IO | Minimax M2.1 | Web research & documentation |

### Fallback Chains
```
Brain:   Opus 4.6 → Sonnet 4.5 → Gemini Pro → big-pickle
Worker:  Sonnet 4.5 → Gemini Pro → big-pickle
Vision:  Gemini Pro → Gemini Flash → big-pickle
IO:      Minimax M2.1 → Gemini Flash → big-pickle
```

### 4 Delegation Mechanisms

| Mechanism | Type | Use Case |
|-----------|------|----------|
| `delegate_task` | Sync | Child agent in sub-session → results return to parent |
| `pipeline_task` | Sync | Multi-stage DAG — chains agents sequentially |
| `call_omo_agent` | Sync | Call by name with BM25 auto-routing |
| `background_task` | Async | Parallel execution via tmux, toast on completion |

---

## 🔧 Tool System (28 Tools)

### LSP Tools (6)
| Tool | Description |
|------|-------------|
| `lsp_goto_definition` | Jump to symbol definition |
| `lsp_find_references` | Find all references to a symbol |
| `lsp_symbols` | List workspace/document symbols |
| `lsp_diagnostics` | Get compiler errors/warnings |
| `lsp_prepare_rename` | Check if rename is safe |
| `lsp_rename` | Rename symbol across files |

### AST Tools (2)
| Tool | Description |
|------|-------------|
| `ast_grep_search` | Structure-based AST pattern search |
| `ast_grep_replace` | AST-aware code replacement |

### Session Management (4)
| Tool | Description |
|------|-------------|
| `session_list` | List all sessions |
| `session_read` | Read session messages |
| `session_search` | Full-text search across sessions |
| `session_info` | Session metadata & stats |

### Code Intelligence (4)
| Tool | Description |
|------|-------------|
| `code_search` | BM25 + vector search via SurrealDB |
| `code_callers` | Find upstream callers of a function |
| `code_deps` | Find downstream dependencies |
| `code_overview` | File/module structure overview |

### Orchestration (5)
| Tool | Description |
|------|-------------|
| `delegate_task` | Spawn child agent with category routing |
| `pipeline_task` | Multi-stage sequential agent chain |
| `call_omo_agent` | Invoke agent by name |
| `background_output` | Read background task results |
| `background_cancel` | Cancel running background tasks |

### Security (6)
| Tool | Description |
|------|-------------|
| `pattern_scan` | Scan project for anti-patterns — legacy (17 patterns) + fingerprint DB (33 patterns) with CWE refs. Modes: `legacy`/`fingerprint`/`all` |
| `input_guard_test` | Test payload against 28 prompt injection detectors |
| `vulnerability_triage` | **NEW** — Score findings by `(Impact × Exploitability) / DetectionTime`. Returns P0-P3 urgency classification |
| `fingerprint_stats` | **NEW** — Show Vulnerability Fingerprint DB statistics (33 patterns across 10 categories) |
| `prompt_test` | LLM-driven adversarial testing via Ollama — refusal heuristics detection |
| `fact_extract` | Entity/fact extraction from text via LLM |

### Utility (5)
| Tool | Description |
|------|-------------|
| `look_at` | Multimodal visual analysis (screenshots) |
| `skill` | Load/inject skills into agent context |
| `skill_mcp` | Manage skill-embedded MCP servers |
| `slashcommand` | Execute slash commands programmatically |
| `interactive_bash` | Persistent bash sessions (stateful) |

---

## 🪝 Hook System (53 Hooks)

### Lifecycle Points
```
chat.message → tool.execute.before → [tool runs] → tool.execute.after
                                                           ↓
event (session.created/deleted/error/idle, message.updated, file.edited)
                                                           ↓
experimental.chat.messages.transform → experimental.session.compacting
```

### By Category

#### 🔒 Persistence (3)
| Hook | Description |
|------|-------------|
| `todo-continuation-enforcer` | Auto-continue when AI stops with incomplete todos |
| `session-recovery` | Auto-retry on transient provider errors |
| `boulder-state` | Persist task state across sessions |

#### 🛡️ Security (7) - NEW
| Hook | Description |
|------|-------------|
| `auto-remediate` | Automated vulnerability triage and remediation pipeline |
| `jailbreak-eval` | Post-session LLM refusal detection |
| `output-guard` | Output sanitization firewall for MCP responses |
| `sandbox-server` | Containerizes dangerous exec invocations |
| `provider-probe` | Monitors adversarial payloads via external probes |
| `mcp-audit` | Audits high-risk MCP network egress |
| `variant-hunter` | Triage variations of legacy and fingerprint DB anti-patterns |

#### ✅ Quality (5)
| Hook | Description |
|------|-------------|
| `comment-checker` | Detect AI-generated placeholder/lazy comments |
| `thinking-block-validator` | Validate extended thinking block format |
| `edit-error-recovery` | Auto-fix file edit failures (retry with context) |
| `coder-md-only` | Enforce markdown-only responses for planner |
| `workpad-tracker` | Track session artifacts & scratch files |

#### 📦 Context Management (7)
| Hook | Description |
|------|-------------|
| `context-injector` | Dynamic context injection into thread |
| `compaction-context-injector` | Inject context during compaction |
| `rules-injector` | Inject `.agent/rules/*.md` into context |
| `directory-agents-injector` | Inject directory-specific agent configs |
| `directory-readme-injector` | Inject README.md into context |
| `memory-capture` | Auto-capture decisions to SurrealDB |
| `preflight-skill-injector` | Auto-inject relevant skills to system prompt based on user query |

#### 🧭 Routing (6)
| Hook | Description |
|------|-------------|
| `keyword-detector` | Detect `ultrawork`/`ulw` activation keywords |
| `auto-slash-command` | Route messages to slash commands |
| `conductor` | Multi-agent workflow orchestration |
| `category-skill-reminder` | Remind agents of available skills |
| `agent-usage-reminder` | Remind agents of delegation tools |
| `claude-code-hooks` | Claude Code compatibility hooks |

#### 🔄 Recovery (5)
| Hook | Description |
|------|-------------|
| `ralph-loop` | Self-healing retry loop with exponential backoff |
| `anthropic-context-window-limit-recovery` | Handle context window overflow |
| `delegate-task-retry` | Retry failed sub-agent tasks |
| `context-window-monitor` | Track context usage, warn on limits |
| `provider-error-recovery` | Handle provider API errors gracefully |

#### 🎨 UX (14)
| Hook | Description |
|------|-------------|
| `session-notification` | Desktop notification on session events |
| `background-notification` | Toast alerts for background tasks |
| `auto-update-checker` | Check for new omo-cli versions |
| `startup-toast` | Show startup info toast |
| `think-mode` | Extended thinking mode toggle |
| `start-work` | Initialize work session context |
| `worker-notepad` | Per-worker scratch memory |
| `question-label-truncator` | Truncate long question labels in TUI |
| `subagent-question-blocker` | Prevent subagents from asking questions |
| `non-interactive-env` | Handle non-interactive terminal |
| `interactive-bash-session` | Manage persistent bash sessions |
| `tool-output-truncator` | Prevent context overflow from tool output |
| `empty-task-response-detector` | Detect when agent returns empty response |
| `task-resume-info` | Inject task resume context |

#### 💰 Metering (1)
| Hook | Description |
|------|-------------|
| `cost-metering` | Token usage tracking with daily/monthly USD budgets |

#### 🛡️ Security (4)
| Hook | Description |
|------|-------------|
| `input-guard` | 28 multi-word prompt injection pattern detectors across 6 categories |
| `auto-remediate` | **ENHANCED** — Full pipeline: Scan → Triage → CodeFix → Validate → PR. Pipeline mode: `review` (default) / `auto`. Includes CWE mapping, patch generation, and structured PR body generator |
| `jailbreak-eval` | 100+ curated jailbreak test cases across 8 categories with quantitative scoring engine (security posture: 🔴/🟡/🟢) |
| `output-guard` | Output content filtering and system prompt leakage prevention |

---

## 🎯 Category System (8 Categories)

| Category | Purpose | Cloud Model | Local Model |
|----------|---------|-------------|-------------|
| `frontend` | UI/UX, CSS, HTML | Gemini 3 Pro Image (high) | Qwen 3.5 397B |
| `backend` | Server-side code | Minimax M2.1 | Qwen3-coder-next |
| `complex` | Multi-file features | Opus 4.6 Thinking (max) | Qwen 3.5 397B |
| `deep-reasoning` | Complex analysis | Sonnet 4.5 Thinking (max) | Qwen 3.5 397B |
| `creative` | Design, branding | Gemini 3 Pro Image (max) | Qwen 3.5 397B |
| `quick` | Simple/fast tasks | Gemini 3 Flash (minimal) | Minimax M2.7 |
| `simple` | Trivial edits | Minimax M2.1 | Minimax M2.7 |
| `docs` | Documentation | Gemini 3 Flash (low) | GLM-5 |

---

## 🌐 MCP Server Architecture (3 Tiers)

| Tier | Type | Servers |
|------|------|---------|
| **Built-in** | Auto-configured | `websearch` (Exa), `context7` (real-time docs), `grep_app` (GitHub code search), `agentql` (web data extraction) |
| **Claude Code Compat** | From `.mcp.json` | Supports `${VAR}` env variable expansion |
| **Skill-embedded** | From SKILL.md | YAML-defined per skill in frontmatter |

---

## 💻 CLI Commands (16)

| Command | Description |
|---------|-------------|
| `omo-cli install` | Install plugin (interactive profile selection) |
| `omo-cli run <message>` | Run OpenCode with todo/background enforcement |
| `omo-cli doctor` | Health check (installation, config, auth, deps, tools, updates) |
| `omo-cli memory start` | Start SurrealDB container |
| `omo-cli memory stop` | Stop SurrealDB container |
| `omo-cli memory status` | Check SurrealDB connection status |
| `omo-cli memory reset` | Wipe all memories, restart fresh |
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

## 📦 Feature Modules (21)

| Module | LOC | Description |
|--------|-----|-------------|
| `background-agent` | 1463 | Parallel task lifecycle, concurrent limits, tmux integration |
| `boulder-state` | — | "Rolling boulder" state persistence across sessions |
| `builtin-commands` | — | 10+ design commands (/design-audit, /design-polish, etc.) |
| `builtin-skills` | 2087 | Built-in expert skill definitions |
| `claim-release` | — | Exclusive resource locking |
| `claude-code-agent-loader` | — | Load agents from .claude config |
| `claude-code-command-loader` | — | Load commands from .claude config |
| `claude-code-mcp-loader` | — | Load MCPs from .claude/.mcp.json |
| `claude-code-plugin-loader` | — | Load plugins from .claude config |
| `claude-code-session-state` | — | Session state management |
| `code-intel` | — | AST-grep → SurrealDB indexing, BM25 search, graph |
| `context-injector` | — | Dynamic context injection into thread |
| `hook-message-injector` | — | Inject hook messages into conversation |
| `mcp-oauth` | — | OAuth flow for MCP servers |
| `opencode-skill-loader` | — | Load skills from ~/.config/_skills_/ |
| `perf-benchmark` | — | Performance benchmarks (p50/p95/p99) |
| `reasoning-bank` | — | Pattern learning & trajectory tracking |
| `skill-mcp-manager` | — | MCP server management for skills |
| `task-toast-manager` | — | Background task toast notifications |
| `tmux-subagent` | — | Parallel execution via tmux panes |
| `workflow-unifier` | — | WORKFLOW.md discovery & unification |

---

## ⚙️ Configuration System

### Profile System
```bash
omo-cli profile list              # List all profiles
omo-cli profile show              # Show active profile
omo-cli profile apply mike        # Apply cloud profile
omo-cli profile apply mike-local  # Apply local profile
```

### Config Schema (`omo-cli.json`) — 25+ Top-Level Keys

| Key | Type | Description |
|-----|------|-------------|
| `agents` | `Record<AgentName, Override>` | Per-agent model & variant overrides |
| `categories` | `Record<Category, Config>` | Task-type → model routing |
| `disabled_hooks` | `HookName[]` | Disable specific hooks |
| `disabled_agents` | `AgentName[]` | Disable specific agents |
| `disabled_skills` | `SkillName[]` | Disable built-in skills |
| `disabled_commands` | `CommandName[]` | Disable specific commands |
| `disabled_mcps` | `string[]` | Disable MCP servers |
| `memory` | `MemoryConfig` | SurrealDB settings (mode, port, namespace) |
| `tmux` | `TmuxConfig` | Tmux layout (enabled, layout, pane size) |
| `background_task` | `BackgroundTaskConfig` | Concurrent task limits |
| `ralph_loop` | `RalphLoopConfig` | Self-healing retry config |
| `experimental` | `ExperimentalConfig` | Feature flags |
| `cost_metering` | `CostMeteringConfig` | Token/cost tracking with budgets |
| `notification` | `NotificationConfig` | Notification settings |
| `auto_update` | `boolean` | Auto-check for updates |
| `comment_checker` | `CommentCheckerConfig` | Anti-AI-slop config |
| `input_guard` | `InputGuardConfig` | Prompt injection defense |
| `safety` | `SafetyConfig` | Loop limits, delegation depth, circuit breaker |
| `privacy` | `PrivacyConfig` | Privacy awareness |
| `coding_level` | `1-10` | Response verbosity |
| `skills` | `Skill[]` | Skill definitions (array or record) |
| `claude_code` | `ClaudeCodeConfig` | Claude Code compatibility |
| `orchestrator` | `OrchestratorConfig` | Orchestrator-specific config |
| `logging` | `LoggingConfig` | File logging & transcript recording |
| `browser_automation_engine` | `string` | playwright \| agent-browser \| dev-browser |
| `git_master` | `GitMasterConfig` | Git commit message config |

---

## 🛡️ Security Features

### Defense-in-Depth Architecture

| Layer | Feature | Description |
|-------|---------|-------------|
| **L1: Input** | **Input Guard** | 28 multi-word prompt injection detectors across 6 categories (instruction override, jailbreak, role switch, context manipulation, encoding bypass, PII leak) |
| **L2: Scan** | **Pattern Scan** | 17 legacy + 33 fingerprint patterns with CWE references. Categories: secrets, command injection, file ops, network exfil, privilege escalation, agent security, code injection, auth bypass, crypto misuse, SSRF, container security |
| **L3: Triage** | **Vulnerability Triage** | Priority scoring: `(Impact × Exploitability) / DetectionTime`. Urgency: P0-NOW, P1-TODAY, P2-WEEK, P3-BACKLOG |
| **L4: Fix** | **Auto-Remediate Pipeline** | Scan → Triage → CodeFix → Validate → PR. 8 strategy categories with CWE→fix mapping. Default: `review` mode (human-in-the-loop) |
| **L5: Eval** | **Jailbreak Eval Suite** | 100+ curated test cases across 8 attack categories. Quantitative security posture scoring (0-100) |
| **L6: Output** | **Output Guard** | Content filtering and system prompt leakage prevention |

### Vulnerability Fingerprint Database (33 Patterns)

| Layer | Count | Categories | Source |
|-------|-------|------------|--------|
| **Agent Security** | 12 | prompt_injection, jailbreak, data_exfil, tool_abuse | AI-Infra-Guard, OpenFang, OWASP LLM Top 10 |
| **Code-Level** | 11 | sql_injection, xss, command_injection, auth_bypass, crypto_misuse, deserialization | OWASP, CWE |
| **Infrastructure** | 10 | ssrf, path_traversal, secrets_exposure, container_security | OpenFang, best practices |

### Additional Security Features

| Feature | Description |
|---------|-------------|
| **Skill Security Scanning** | 5-category security scan (command injection, secrets, file ops, network exfil, privilege escalation) |
| **Skill Tiering** | Tier 1 (SAFE+Excellent) → Tier 4 (HIGH risk) classification |
| **Privacy Awareness** | Configurable privacy detection |
| **Circuit Breaker** | Max loop iterations, delegation depth limits |
| **Resource Locking** | Exclusive claim-release for shared resources |

---

## 📊 Codebase Statistics

| Metric | Value |
|--------|-------|
| Source files (`.ts`) | 397 |
| Test files (`.test.ts`) | 230 |
| Total lines of code | ~109,000 |
| Security test cases | **121** (auto-remediate: 55, vuln-fingerprints: 32, jailbreak-eval: 20, security-tools: 14) |
| Test pass rate | **100%** (230/230 suites) |
| TSC errors | **0** |
| Vulnerability fingerprints | **33** (12 agent + 11 code + 10 infra) |
| Dependencies (key) | 10 (OpenCode SDK, AST-grep, Effect, Zod, MCP SDK, Transformers) |
| Platforms (binaries) | 7 (darwin-arm64/x64, linux-x64/arm64/musl, windows-x64) |

---

## 🔮 Plugin Lifecycle

```
OpenCode Boot
  │
  ├─[1] loadPluginConfig()        # Load omo-cli.json
  ├─[2] startTmuxCheck()          # Check tmux availability
  ├─[3] Register 46 hooks         # Conditional on disabled_hooks
  ├─[4] Register 28 tools         # LSP, AST, Session, Code-Intel, Security, etc.
  ├─[5] Load 33 vuln fingerprints # Agent + Code + Infra security patterns
  ├─[6] Discover 1243+ skills     # Builtin + Global + Project (merged)
  ├─[7] Start MCP servers         # Context7, Grep.app, Exa, AgentQL
  ├─[8] startAutoInit()           # Code-Intel indexing (background)
  │
  ▼
Return { tool, chat.message, event, tool.execute.before/after,
         config, experimental.chat.messages.transform }
```

---

*Generated from codebase analysis — omo-cli v3.3.0 | 2026-03-29*
