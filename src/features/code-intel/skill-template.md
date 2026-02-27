---
name: code-navigation
description: Smart codebase navigation using pre-indexed structural data and impact analysis
---

## When to use

Use these tools for efficient code exploration and impact analysis. They query a pre-built index (via `omo-cli index`) and are **faster than grep** for finding code elements.

### Available tools

| Tool | Use when... |
|------|------------|
| `code_search` | Finding functions, classes, types by name or description |
| `code_callers` | Checking who calls a function before modifying it |
| `code_deps` | Understanding module import/export relationships |
| `code_overview` | Getting project structure overview at session start |

### Strategy

1. **Session start**: Run `code_overview` to understand project shape
2. **Finding code**: Use `code_search` instead of grep for structural queries
3. **Before editing**: ALWAYS run `code_callers` to check blast radius
4. **Module boundaries**: Use `code_deps` to understand import structure
5. **Fallback**: Use grep/glob for runtime patterns, string matches, or configuration values

### Prerequisites

- SurrealDB must be running: `omo-cli memory start`
- Index must be built: `omo-cli index`
- For semantic search: `omo-cli index --vector`
