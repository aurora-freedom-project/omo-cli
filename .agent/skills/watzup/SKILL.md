---
name: watzup
description: Project status overview - shows todos, recent changes, open issues, and pending work
triggers:
  - "what's up"
  - "project status"
  - "watzup"
---

# Project Status Workflow

Display a quick status overview of the project.

## Automated Status Collection

Run these commands in parallel to gather project status:

### 1. Check TODO Items
```bash
# If todoread tool available, use it
todoread
```

### 2. Recent Git Activity
```bash
git log -5 --oneline --decorate 2>/dev/null || echo "No git history"
```

### 3. Uncommitted Changes
```bash
git status --short 2>/dev/null || echo "Not a git repo"
```

### 4. Open Issues (if GitHub)
```bash
gh issue list --limit 5 2>/dev/null || echo "No GitHub CLI or not a GitHub repo"
```

### 5. Current Branch
```bash
git branch --show-current 2>/dev/null || echo "No git"
```

## Format Report

Present the collected information in this format:

```markdown
## 📊 Project Status

### 🎯 Active TODOs
[List from todoread]

### 📝 Recent Changes (Last 5 Commits)
[Git log output]

### 📂 Uncommitted Changes
[Git status output]

### 🐛 Open Issues
[GitHub issues if available]

### 🌿 Current Branch
[Branch name]
```

## Quick Actions

After showing status, offer these quick actions:
1. **Continue work** - Pick up the first incomplete TODO
2. **Commit changes** - If uncommitted changes exist
3. **Start fresh** - Create a new TODO list

## Usage

Simply type `/watzup` or say "what's up" to get the project status.
