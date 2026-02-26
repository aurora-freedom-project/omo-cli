# AGENTS KNOWLEDGE BASE

## OVERVIEW
10 AI agents for multi-model orchestration. Orchestrator (primary), Conductor (orchestrator), architect, researcher, explorer, multimodal-looker, Planner, Consultant, Reviewer, Orchestrator-Junior.

## STRUCTURE
```
agents/
├── conductor.ts                    # Master Orchestrator (holds todo list)
├── orchestrator.ts                 # Main prompt (SF Bay Area engineer identity)
├── orchestrator-junior.ts          # Delegated task executor (category-spawned)
├── architect.ts                   # Strategic advisor (GPT-5.2)
├── researcher.ts                # Multi-repo research (GitHub CLI, Context7)
├── explorer.ts                  # Fast contextual grep (Grok Code)
├── multimodal-looker.ts        # Media analyzer (Gemini 3 Flash)
├── planner-prompt.ts        # Planning (Interview/Consultant mode, 1196 lines)
├── consultant.ts                    # Pre-planning analysis (Gap detection)
├── reviewer.ts                    # Plan reviewer (Ruthless fault-finding)
├── dynamic-agent-prompt-builder.ts  # Dynamic prompt generation
├── types.ts                    # AgentModelConfig, AgentPromptMetadata
├── utils.ts                    # createBuiltinAgents(), resolveModelWithFallback()
└── index.ts                    # builtinAgents export
```

## AGENT MODELS (Recommended Configuration)
| Agent | Model | Temp | Purpose |
|-------|-------|------|---------| 
| Orchestrator | claude-opus-4-5-thinking (max) | 0.1 | Primary orchestrator, Thinking enabled |
| Conductor | claude-opus-4-5-thinking (max) | 0.1 | Master orchestrator, Thinking enabled |
| architect | claude-opus-4-5-thinking (max) | 0.1 | Consultation, debugging, code review |
| Planner | claude-opus-4-5-thinking (max) | 0.1 | Strategic planning, Thinking enabled |
| Consultant | claude-sonnet-4-5-thinking (max) | 0.3 | Pre-planning analysis, gap detection |
| Reviewer | claude-sonnet-4-5-thinking (max) | 0.1 | Plan validation |
| Orchestrator-Junior | claude-sonnet-4-5-thinking (max) | 0.1 | Category-spawned executor |
| multimodal-looker | gemini-3-pro (high) | 0.1 | PDF/image analysis |
| researcher | minimax-m2.1 (Ollama) | 0.1 | Docs, GitHub search (fast/cheap) |
| explorer | minimax-m2.1 (Ollama) | 0.1 | Fast contextual grep (fast/cheap) |

> Models configurable via `omo-cli.json`. Above = recommended cost/performance balance.

## HOW TO ADD
1. Create `src/agents/my-agent.ts` exporting factory + metadata.
2. Add to `agentSources` in `src/agents/utils.ts`.
3. Update `AgentNameSchema` in `src/config/schema.ts`.
4. Register in `src/index.ts` initialization.

## TOOL RESTRICTIONS
| Agent | Denied Tools |
|-------|-------------|
| architect | write, edit, task, delegate_task |
| researcher | write, edit, task, delegate_task, call_omo_agent |
| explorer | write, edit, task, delegate_task, call_omo_agent |
| multimodal-looker | Allowlist: read only |
| Orchestrator-Junior | task, delegate_task |

## PATTERNS
- **Factory**: `createXXXAgent(model: string): AgentConfig`
- **Metadata**: `XXX_PROMPT_METADATA` with category, cost, triggers.
- **Tool restrictions**: `createAgentToolRestrictions(tools)` or `createAgentToolAllowlist(tools)`.
- **Thinking**: 32k budget tokens for Orchestrator, Architect, Planner, Conductor.

## ANTI-PATTERNS
- **Trust reports**: NEVER trust "I'm done" - verify outputs.
- **High temp**: Don't use >0.3 for code agents.
- **Sequential calls**: Use `delegate_task` with `run_in_background` for exploration.
- **Planner writing code**: Planner only - never implements.
