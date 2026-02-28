# AGENTS KNOWLEDGE BASE

## OVERVIEW
10 AI agents for multi-model orchestration. Orchestrator (primary), Conductor (master orchestrator), Architect, Researcher, Explorer, Vision, Planner, Consultant, Reviewer, Worker.

## STRUCTURE
```
agents/
├── orchestrator.ts                  # Main agent (SF Bay Area engineer identity)
├── navigator.ts                     # Conductor - Master Orchestrator (holds todo list)
├── conductor.ts                     # Consultant - Pre-planning analysis (Gap detection)
├── architect.ts                     # Architect - Strategic advisor
├── coder.ts                         # Planner - Strategic Planning (Interview/Consultant mode, 1320 lines)
├── worker.ts                        # Worker - Delegated task executor (category-spawned)
├── researcher.ts                    # Researcher - Multi-repo research (GitHub CLI, Context7)
├── explorer.ts                      # Explorer - Fast contextual grep
├── vision.ts                        # Vision - Media analyzer (Gemini 3 Flash)
├── reviewer.ts                      # Reviewer - Plan reviewer (Ruthless fault-finding)
├── dynamic-agent-prompt-builder.ts  # Dynamic prompt generation
├── types.ts                         # AgentModelConfig, AgentPromptMetadata
├── utils.ts                         # createBuiltinAgents(), agent registration
└── index.ts                         # Barrel exports
```

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

## AGENT MODELS (Recommended)
| Agent | Model | Temp | Purpose |
|-------|-------|------|---------|
| Orchestrator | claude-opus-4-5 (max) | 0.1 | Primary orchestrator, Thinking enabled |
| Conductor | claude-sonnet-4-5 | 0.1 | Master orchestrator, Thinking enabled |
| Architect | gpt-5.2 (high) | 0.1 | Consultation, debugging, code review |
| Planner | claude-opus-4-5 (max) | 0.1 | Strategic planning, Thinking enabled |
| Consultant | claude-opus-4-5 (max) | 0.3 | Pre-planning analysis, gap detection |
| Reviewer | gpt-5.2 (medium) | 0.1 | Plan validation |
| Worker | claude-sonnet-4-5 | 0.1 | Category-spawned executor |
| Vision | gemini-3-flash | 0.1 | PDF/image analysis |
| Researcher | glm-4.7 | 0.1 | Docs, GitHub search |
| Explorer | claude-haiku-4-5 | 0.1 | Fast contextual grep |

## TOOL RESTRICTIONS
| Agent | Denied Tools |
|-------|-------------|
| Architect | write, edit, task, delegate_task |
| Researcher | write, edit, task, delegate_task, call_omo_agent |
| Explorer | write, edit, task, delegate_task, call_omo_agent |
| Vision | Allowlist: read only |
| Worker | task, delegate_task |

## PATTERNS
- **Factory**: `create*Agent(model: string): AgentConfig`
- **Metadata**: `*PromptMetadata` with category, cost, triggers.
- **Tool restrictions**: `createAgentToolRestrictions(tools)` or `createAgentToolAllowlist(tools)`.
- **Thinking**: 32k budget tokens for Orchestrator, Architect, Planner, Conductor.
