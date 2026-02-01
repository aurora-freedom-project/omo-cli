---
name: docs
description: Documentation management workflow - update codebase summary, sync API docs, verify README accuracy
triggers:
  - "update docs"
  - "sync documentation"
  - "docs"
---

# Documentation Management Workflow

Maintain project documentation in sync with codebase.

## Documentation Tasks

### 1. Refresh Codebase Summary

Update or create a codebase summary file:

```bash
# Find existing summary files
find . -name "CODEBASE*.md" -o -name "ARCHITECTURE*.md" 2>/dev/null | head -5
```

If no summary exists, create one at `docs/CODEBASE-SUMMARY.md` with:
- Project structure overview
- Key modules and their purposes
- Entry points and main flows

### 2. Sync API Documentation

For TypeScript/JavaScript projects:
```bash
# Check for existing API docs
ls -la docs/api/ 2>/dev/null || echo "No API docs directory"
```

For Python projects:
```bash
# Check for docstrings
find . -name "*.py" -exec grep -l '"""' {} \; 2>/dev/null | head -5
```

### 3. Verify README Accuracy

Check README.md against actual project state:
- Verify installation instructions work
- Confirm listed features exist
- Update version numbers if needed

```bash
# Check README exists
cat README.md 2>/dev/null | head -30 || echo "No README.md"
```

### 4. Update CHANGELOG

If project uses semantic versioning:
```bash
cat CHANGELOG.md 2>/dev/null | head -20 || echo "No CHANGELOG"
```

## Output Format

```markdown
## 📚 Documentation Status

### ✅ Up-to-date
- [List of current docs]

### ⚠️ Needs Update
- [Outdated docs with reason]

### ❌ Missing
- [Recommended docs to create]

### 🔄 Actions Taken
- [What was updated]
```

## Best Practices

1. **Keep docs close to code** - Store API docs near source
2. **Use JSDoc/TSDoc** - For inline API documentation
3. **Automate where possible** - Generate docs from code
4. **Version docs** - Sync with release versions
