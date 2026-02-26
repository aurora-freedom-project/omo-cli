---
name: remove-deadcode
description: MUST USE for removing unused code. LSP-verified dead code detection and safe removal with atomic commits.
allowed-tools: LspFindReferences LspDocumentSymbols LspDiagnostics Bash(bun:*) Bash(git:*) TodoWrite TodoRead Edit Read
---

# Remove Deadcode Skill

> **Expertise**: Dead code removal specialist using LSP verification and AST-Grep scanning.

Your core weapon: **LSP FindReferences**. If a symbol has ZERO external references, it's dead. Remove it.

---

## 🚨 CRITICAL RULES

1. **LSP is law.** Never guess. Always verify with `LspFindReferences` before removing ANYTHING.
2. **One removal = one commit.** Every dead code removal gets its own atomic commit.
3. **Test after every removal.** Run `bun test` after each. If it fails, REVERT and skip.
4. **Leaf-first order.** Remove deepest unused symbols first, then work up the dependency chain.
5. **Never remove entry points.** `src/index.ts`, `src/cli/index.ts`, test files, config files are off-limits.

---

## PHASE 0: Register Todo List

Before ANYTHING else:

```
TodoWrite([
  {"id": "scan", "content": "PHASE 1: Scan for dead code candidates", "status": "pending"},
  {"id": "verify", "content": "PHASE 2: Verify with LspFindReferences", "status": "pending"},
  {"id": "plan", "content": "PHASE 3: Plan removal order (leaf-first)", "status": "pending"},
  {"id": "remove", "content": "PHASE 4: Remove one-by-one (remove → test → commit)", "status": "pending"},
  {"id": "final", "content": "PHASE 5: Final verification", "status": "pending"}
])
```

---

## PHASE 1: Scan for Dead Code Candidates

### Launch Parallel Explorer Agents

```
// Find all exported symbols
delegate_task(subagent_type="explorer", run_in_background=true,
  prompt="Find ALL exported symbols in src/. Return: file path, line, symbol name.")

// Find potentially unused files
delegate_task(subagent_type="explorer", run_in_background=true,
  prompt="Find files in src/ NOT imported by any other file.")

// Find unused imports
delegate_task(subagent_type="explorer", run_in_background=true,
  prompt="Find unused imports across src/**/*.ts.")
```

### AST-Grep Scans

```typescript
ast_grep_search(pattern="import { $NAME } from '$PATH'", lang="typescript", paths=["src/"])
ast_grep_search(pattern="export {}", lang="typescript", paths=["src/"])
```

### Compile Candidate List

```
| # | File | Line | Symbol | Type | Confidence |
|---|------|------|--------|------|------------|
| 1 | src/foo.ts | 42 | unusedFunc | function | HIGH |
```

---

## PHASE 2: LSP Verification (Zero False Positives)

For EVERY candidate:

```typescript
// Step 1: Get symbol position
LspDocumentSymbols(filePath)

// Step 2: Find ALL references (exclude declaration)
LspFindReferences(filePath, line, character, includeDeclaration=false)

// Step 3: Evaluate
// 0 references → CONFIRMED DEAD CODE
// 1+ references → NOT dead, remove from list
```

### False Positive Guards

**NEVER mark as dead if:**
- Symbol is in any `index.ts` entry point
- Symbol is referenced in test files
- Symbol has `@public` or `@api` JSDoc tags
- File is a command template, skill definition, or MCP config

---

## PHASE 3: Plan Removal Order

### Dependency Analysis

1. Check if removing exposes other dead code
2. Build removal dependency graph
3. Order by leaf-first

```
Removal Order:
1. [Leaf symbols - no other dead code depends on them]
2. [Intermediate symbols]
3. [Dead files]
```

---

## PHASE 4: Iterative Removal Loop

For EACH dead code item:

### 4.1 Pre-Removal Re-verify
```typescript
LspFindReferences(filePath, line, character, includeDeclaration=false)
// If references > 0 → SKIP
```

### 4.2 Remove the Code
```typescript
Edit(filePath, oldString="[dead code]", newString="")
```

### 4.3 Post-Removal Verification
```bash
bun test
bun run typecheck
```

### 4.4 Handle Failures
If verification fails:
1. REVERT: `git checkout -- [file]`
2. Mark todo as `cancelled`
3. Proceed to next

### 4.5 Commit
```bash
git add [files]
git commit -m "refactor: remove unused [symbolType] [symbolName]"
```

---

## PHASE 5: Final Verification

```bash
bun test
bun run typecheck
bun run build
```

### Summary Report

```markdown
## Dead Code Removal Complete

### Removed
| Symbol | File | Commit |
|--------|------|--------|
| unusedFunc | src/foo.ts | abc1234 |

### Verification
- Tests: PASSED
- Typecheck: CLEAN
- Build: SUCCESS
```

---

## SCOPE CONTROL

If `$ARGUMENTS` provided, narrow scan:
- File path: Only that file
- Directory: Only that directory
- "all" or empty: Full project

## ABORT CONDITIONS

STOP if:
- 3 consecutive removals cause failures
- Build breaks and cannot be fixed
- More than 50 candidates found (ask user to narrow scope)
