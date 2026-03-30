---
description: Explore codebase architecture via knowledge graph and impact analysis
---
// turbo-all

# /explore — Knowledge Graph Exploration

> Understand any codebase by generating and exploring its knowledge graph.

## Step 1: Ensure Code is Indexed

```bash
omni index --project $(basename $PWD)
```

If already indexed recently, skip this step.

## Step 2: Export Knowledge Graph

```bash
omni graph --project $(basename $PWD) --output .omni/knowledge-graph.json
```

This queries SurrealDB for all `code_element`, `calls`, `imports`, `extends` records and exports them as a JSON node/edge graph.

## Step 3: Architecture Analysis

Use `omni run` to have an analyzer agent summarize the graph:

```bash
omni run "Read .omni/knowledge-graph.json and produce an architecture summary: identify layers (API, Service, Data, UI, Utility), top entry points, key dependencies, and any circular dependency warnings. Write output to .omni/architecture-summary.md" --dry-run
```

If the output looks good, run without `--dry-run` to persist the summary.

## Step 4: Impact Analysis (Optional)

To understand how a specific file affects the system:

```bash
omni impact src/commands/run.rs
```

This performs BFS traversal on the code graph to show all directly and transitively affected files.

## Step 5: Review

Read `.omni/architecture-summary.md` and the impact output. Use this to:
- Plan refactoring safely
- Onboard new team members
- Identify high-risk files (many callers)
- Find dead code (no callers)

## Step 6: Security Graph (Optional)

To visualize security vulnerabilities and attack chains:

```bash
omni security scan --project $(basename $PWD)
omni security graph --project $(basename $PWD) --output .omni/attack-graph.json
```

This creates an attack chain graph showing how vulnerabilities connect. Use with `omni security report` for a markdown summary.
