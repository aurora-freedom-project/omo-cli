---
name: publish
description: MUST USE for publishing oh-my-opencode to npm via GitHub Actions. Handles version bumping, changelog, workflow trigger, and verification.
argument-hint: <patch|minor|major>
allowed-tools: Bash(gh:*) Bash(npm:*) Bash(git:*) Bash(node:*) TodoWrite TodoRead
---

# Publish Skill

> **Expertise**: Release management for oh-my-opencode npm package via GitHub Actions workflows.

You are the release manager. Execute the FULL publish workflow following a strict phase-based approach.

---

## 🚨 MANDATORY RULES

1. **Must have bump type**: `patch`, `minor`, or `major` argument required
2. **Use TodoWrite/TodoRead**: Track every step
3. **Use polling loops**: NOT sleep commands for workflow waits
4. **Zero content loss**: When updating release notes, PREPEND only - never modify existing
5. **Language**: Respond in English or Vietnamese

---

## PHASE 0: Pre-flight Analysis

### What to Analyze
Before ANYTHING, gather context:

```bash
# Published version
npm view oh-my-opencode version

# Local version
node -p "require('./package.json').version"

# Git status
git status --porcelain

# Commits since release (ANALYZE THE DIFFS, not just messages)
npm view oh-my-opencode version | xargs -I{} git log "v{}"..HEAD --oneline

# Unpushed commits
git log origin/master..HEAD --oneline
```

### Mandatory Output
Print a summary table:
```
| Check               | Value       | Status |
|---------------------|-------------|--------|
| Published version   | X.Y.Z       | ✓/✗    |
| Local version       | X.Y.Z       | ✓/✗    |
| Uncommitted changes | X files     | ✓/✗    |
| Unpushed commits    | X commits   | ✓/✗    |
| Suggested bump      | patch/minor | ✓/✗    |
```

### Decision Point
- If bump type not provided → **STOP and ask user**
- If uncommitted changes exist → warn user, ask to commit first
- If unpushed commits exist → proceed to sync in Phase 1

---

## PHASE 1: Sync & Prepare

### Create Todo List
```
TodoWrite:
- confirm-bump: Confirm version bump type (in_progress)
- sync-remote: Sync with remote (pending)
- run-workflow: Trigger GitHub Actions (pending)
- wait-workflow: Wait for completion (pending)
- verify-release: Verify GitHub release (pending)
- draft-notes: Draft release notes (pending)
- update-notes: Update release with notes (pending)
- verify-npm: Verify npm publication (pending)
- wait-platform: Wait for platform workflow (pending)
- verify-binaries: Verify platform binaries (pending)
- final: Report to user (pending)
```

### Sync with Remote
If there are unpushed commits:
```bash
git pull --rebase && git push
```

### Get User Confirmation
Ask: "Version bump type: `{bump}`. Proceed? (y/n)"

---

## PHASE 2: Trigger Workflow

### Run Publish Workflow
```bash
gh workflow run publish -f bump={bump_type}
```

Wait 3 seconds, then get run ID:
```bash
gh run list --workflow=publish --limit=1 --json databaseId,status --jq '.[0]'
```

### Poll Until Completion
Poll every 30 seconds:
```bash
gh run view {run_id} --json status,conclusion --jq '{status: .status, conclusion: .conclusion}'
```

Status flow: `queued` → `in_progress` → `completed`

If `failure`:
```bash
gh run view {run_id} --log-failed
```

---

## PHASE 3: Release Notes

### Fetch New Version
```bash
git pull --rebase
NEW_VERSION=$(node -p "require('./package.json').version")
gh release view "v${NEW_VERSION}"
```

### Draft Enhanced Notes

**For PATCH:**
```markdown
- {hash} {commit message}
```

**For MINOR:**
```markdown
## New Features
### Feature Name
- Description

## Bug Fixes
- fix(scope): description
```

**For MAJOR:**
```markdown
# v{version}
## Breaking Changes
- ...
## Features
- ...
## Migration Guide
...
```

### Update Release (ZERO CONTENT LOSS)

**CRITICAL**: Prepend your notes, keep existing content EXACTLY intact.

```bash
EXISTING_BODY=$(gh release view "v${NEW_VERSION}" --json body --jq '.body')

cat > /tmp/release-notes-v${NEW_VERSION}.md << 'EOF'
{your_enhanced_notes}

---

EOF

echo "$EXISTING_BODY" >> /tmp/release-notes-v${NEW_VERSION}.md

gh release edit "v${NEW_VERSION}" --notes-file /tmp/release-notes-v${NEW_VERSION}.md
```

---

## PHASE 4: Verification

### Verify npm
```bash
npm view oh-my-opencode version
```
Compare with expected. If not matching after 2 minutes, warn about propagation delay.

### Wait for Platform Workflow
```bash
gh run list --workflow=publish-platform --limit=1 --json databaseId,status,conclusion --jq '.[0]'
```
Poll every 30 seconds until completion.

### Verify All 7 Platform Binaries
```bash
PLATFORMS="darwin-arm64 darwin-x64 linux-x64 linux-arm64 linux-x64-musl linux-arm64-musl windows-x64"
for PLATFORM in $PLATFORMS; do
  npm view "oh-my-opencode-${PLATFORM}" version
done
```

Expected packages:
| Package | Platform |
|---------|----------|
| `oh-my-opencode-darwin-arm64` | macOS Apple Silicon |
| `oh-my-opencode-darwin-x64` | macOS Intel |
| `oh-my-opencode-linux-x64` | Linux x64 (glibc) |
| `oh-my-opencode-linux-arm64` | Linux ARM64 (glibc) |
| `oh-my-opencode-linux-x64-musl` | Linux x64 (musl/Alpine) |
| `oh-my-opencode-linux-arm64-musl` | Linux ARM64 (musl/Alpine) |
| `oh-my-opencode-windows-x64` | Windows x64 |

---

## PHASE 5: Report

### Final Confirmation
Report to user with:
- New version number
- GitHub release URL: `https://github.com/code-yeongyu/oh-my-opencode/releases/tag/v{version}`
- npm package URL: `https://www.npmjs.com/package/oh-my-opencode`
- Platform packages status table

---

## ERROR HANDLING

| Error | Action |
|-------|--------|
| Workflow fails | Show failed logs, suggest checking Actions tab |
| Release not found | Wait and retry (propagation delay) |
| npm not updated | npm takes 1-5 minutes, inform user |
| Permission denied | Re-authenticate: `gh auth login` |
| Platform workflow fails | Show logs, check which platform failed |
| Platform package missing | Re-run publish-platform manually |
