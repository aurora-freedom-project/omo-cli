# PROJECT KNOWLEDGE BASE

**Updated:** 2026-02-28
**Version:** 3.2.14
**Branch:** dev

---

## **IMPORTANT: PULL REQUEST TARGET BRANCH**

> **ALL PULL REQUESTS MUST TARGET THE `dev` BRANCH.**
>
> **DO NOT CREATE PULL REQUESTS TARGETING `master` BRANCH.**
>
> PRs to `master` will be automatically rejected by CI.

---

## OVERVIEW

OpenCode plugin: multi-model agent orchestration (Claude Opus 4.6, Sonnet 4.5, Gemini 3 Pro, Minimax M2.1). 40+ lifecycle hooks, 20+ tools (LSP, AST-Grep, delegation), 10 specialized agents, full Claude Code compatibility. "oh-my-zsh" for OpenCode.

## STRUCTURE

```
omo-cli/
├── src/
│   ├── agents/        # 10 AI agents - see src/agents/AGENTS.md
│   ├── hooks/         # 40+ lifecycle hooks - see src/hooks/AGENTS.md
│   ├── tools/         # 20+ tools - see src/tools/AGENTS.md
│   ├── features/      # 17 feature modules - see src/features/AGENTS.md
│   ├── shared/        # 55 cross-cutting utilities - see src/shared/AGENTS.md
│   ├── cli/           # CLI installer, doctor - see src/cli/AGENTS.md
│   ├── mcp/           # Built-in MCPs - see src/mcp/AGENTS.md
│   ├── config/        # Zod schema, TypeScript types
│   └── index.ts       # Main plugin entry (736 lines)
├── profiles/          # Profile templates (mike, mike-local)
├── script/            # build-schema.ts, build-binaries.ts
├── bin/               # Platform launcher (omo-cli.js, platform.js)
└── dist/              # Build output (ESM + .d.ts)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add agent | `src/agents/` | Create .ts with factory, add to `agentSources` in utils.ts |
| Add hook | `src/hooks/` | Create dir with `createXXXHook()`, register in index.ts |
| Add tool | `src/tools/` | Dir with index/types/constants/tools.ts |
| Add MCP | `src/mcp/` | Create config, add to index.ts |
| Add skill | `src/features/builtin-skills/` | Create dir with SKILL.md |
| Add command | `src/features/builtin-commands/` | Add template + register in commands.ts |
| Config schema | `src/config/schema.ts` | Zod schema, run `bun run build:schema` |
| Background agents | `src/features/background-agent/` | manager.ts (1418 lines) |
| Orchestrator | `src/hooks/navigator/` | Main orchestration hook (757 lines) |

## TDD (Test-Driven Development)

**MANDATORY.** RED-GREEN-REFACTOR:
1. **RED**: Write test → `bun test` → FAIL
2. **GREEN**: Implement minimum → PASS
3. **REFACTOR**: Clean up → stay GREEN

**Rules:**
- NEVER write implementation before test
- NEVER delete failing tests - fix the code
- Test file: `*.test.ts` alongside source (141 test files)
- BDD comments: `//#given`, `//#when`, `//#then`

## CONVENTIONS

- **Package manager**: Bun only (`bun run`, `bun build`, `bunx`)
- **Types**: bun-types (NEVER @types/node)
- **Build**: `bun build` (ESM) + `tsc --emitDeclarationOnly`
- **Exports**: Barrel pattern via index.ts
- **Naming**: kebab-case dirs, `createXXXHook`/`createXXXTool` factories
- **Testing**: BDD comments, 141 test files
- **Temperature**: 0.1 for code agents, max 0.3

## ANTI-PATTERNS

| Category | Forbidden |
|----------|-----------|
| Package Manager | npm, yarn - Bun exclusively |
| Types | @types/node - use bun-types |
| File Ops | mkdir/touch/rm/cp/mv in code - use bash tool |
| Publishing | Direct `bun publish` - GitHub Actions only |
| Versioning | Local version bump - CI manages |
| Type Safety | `as any`, `@ts-ignore`, `@ts-expect-error` |
| Error Handling | Empty catch blocks |
| Testing | Deleting failing tests |
| Agent Calls | Sequential - use `delegate_task` parallel |
| Hook Logic | Heavy PreToolUse - slows every call |
| Commits | Giant (3+ files), separate test from impl |
| Temperature | >0.3 for code agents |
| Trust | Agent self-reports - ALWAYS verify |

## AGENT → FILE → FACTORY MAP

| Config Key | Display Name | File | Factory |
|-----------|-------------|------|---------|
| orchestrator | Orchestrator | orchestrator.ts | `createOrchestratorAgent` |
| conductor | Conductor | navigator.ts | `createConductorAgent` |
| consultant | Consultant | conductor.ts | `createConsultantAgent` |
| architect | Architect | architect.ts | `createArchitectAgent` |
| planner/coder | Planner | coder.ts | registered in config-handler.ts |
| worker | Worker | worker.ts | `createWorkerAgentWithOverrides` |
| researcher | Researcher | researcher.ts | `createResearcherAgent` |
| explorer | Explorer | explorer.ts | `createExplorerAgent` |
| vision | Vision | vision.ts | `createVisionAgent` |
| reviewer | Reviewer | reviewer.ts | `createReviewerAgent` |

## AGENT MODELS (Recommended Configuration)

| Agent | Model | Purpose |
|-------|-------|---------|
| orchestrator | claude-opus-4-6-thinking (max) | Primary orchestrator, Thinking mode enabled |
| conductor | claude-opus-4-6-thinking (max) | Master orchestrator, Thinking mode enabled |
| architect | claude-opus-4-6-thinking (max) | Consultation, debugging, code review |
| planner | claude-opus-4-6-thinking (max) | Strategic planning, Thinking mode enabled |
| consultant | claude-sonnet-4-5-thinking (max) | Pre-planning analysis, gap detection |
| reviewer | claude-sonnet-4-5-thinking (max) | Plan validation |
| worker | claude-sonnet-4-5-thinking (max) | Category-spawned executor |
| vision | gemini-3-pro-image (high) | PDF/image analysis |
| researcher | minimax-m2.1 (Ollama) | Docs, GitHub search (fast/cheap) |
| explorer | minimax-m2.1 (Ollama) | Fast codebase grep (fast/cheap) |

> **Note**: Models are dynamically resolved via `omo-cli.json`. The above represents the recommended configuration for optimal cost/performance balance.

## COMMANDS

```bash
bun run typecheck      # Type check
bun run build          # ESM + declarations + schema
bun run clean          # Remove dist/
bun test               # 141 test files
```

## DEPLOYMENT

**GitHub Actions workflow_dispatch ONLY**
1. Commit & push changes
2. Trigger: `gh workflow run publish -f bump=patch`
3. Never `bun publish` directly, never bump version locally

## COMPLEXITY HOTSPOTS

| File | Lines | Description |
|------|-------|-------------|
| `src/features/builtin-skills/skills.ts` | 1901 | Skill definitions |
| `src/features/background-agent/manager.ts` | 1418 | Task lifecycle, concurrency |
| `src/agents/coder.ts` | 1319 | Planner agent (interview mode) |
| `src/tools/delegate-task/tools.ts` | 1128 | Category-based delegation |
| `src/hooks/navigator/index.ts` | 757 | Conductor orchestration hook |
| `src/index.ts` | 736 | Main plugin entry |
| `src/cli/config-manager.ts` | 691 | JSONC config parsing |
| `src/features/builtin-commands/templates/refactor.ts` | 619 | Refactor command template |

## MCP ARCHITECTURE

Three-tier system:
1. **Built-in**: websearch (Exa), context7 (docs), grep_app (GitHub)
2. **Claude Code compat**: .mcp.json with `${VAR}` expansion
3. **Skill-embedded**: YAML frontmatter in skills

## CONFIG SYSTEM

- **Zod validation**: `src/config/schema.ts`
- **JSONC support**: Comments, trailing commas
- **Multi-level**: Project (`.opencode/`) → User (`~/.config/opencode/`)

## NOTES

- **OpenCode**: Requires >= 1.0.150
- **Flaky tests**: ralph-loop (CI timeout), session-state (parallel pollution)
- **Trusted deps**: @ast-grep/cli, @ast-grep/napi, @code-yeongyu/comment-checker
