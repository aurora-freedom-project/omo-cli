---
trigger: always_on
description: How agents communicate, load skills, and utilize external models.
---

# Agent Protocol

1.  **Orchestrator Role**: The main Antigravity IDE agent acts as the Planner/Architect. It evaluates requests and decides the execution strategy.
2.  **Skill & Memory Access**: Use `omni run` CLI to automatically search skills, recall memory, and execute swarm tasks:
    ```bash
    omni run "<task description>"           # Full execution
    omni run "<task description>" --dry-run # Preview DAG without executing
    omni run --dag custom_plan.json         # Custom DAG from Antigravity
    # Always save DAGs to .agent/memory/ — auto-cleaned after execution
    ```
3.  **Delegation (Sub-Agents)**: Complex multi-file tasks are delegated to Ollama sub-agents via swarm. Sub-agents are ephemeral (created per-task, destroyed after). They receive tools (`read_file`, `grep_search`, `skill_search`, etc.) and execute autonomously.
4.  **Context Memory**: `omni run` automatically stores task summaries to SurrealDB. Memory is recalled at the start of each new run to provide continuity across sessions.