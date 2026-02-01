# Development Rules - oh-my-opencode

## Core Principles

### YAGNI (You Aren't Gonna Need It)
- **Don't build features before they're needed**
- Implement only what's required for current requirements
- Avoid speculative generality and premature abstraction
- Add complexity only when justified by real use cases

### KISS (Keep It Simple, Stupid)
- **Favor simplicity over cleverness**
- Use straightforward solutions over complex ones
- Write code that's easy to understand and maintain
- Avoid over-engineering and unnecessary abstractions

### DRY (Don't Repeat Yourself)
- **Eliminate duplication through abstraction**
- Extract common patterns into reusable functions
- Use composition and inheritance appropriately
- Maintain single source of truth for logic and data

---

## Code Quality Guidelines

### File Organization
- **File naming**: Use kebab-case for all files (`user-service.ts`, not `UserService.ts`)
- **File size**: Keep files under 200 lines when possible
- **Module structure**: One main export per file, related utilities co-located

### Code Style
- **TypeScript strict mode**: Always use strict TypeScript settings
- **Error handling**: Use explicit error types, avoid generic `catch (error)`
- **Type safety**: Prefer type inference, use explicit types for public APIs
- **Async/await**: Prefer async/await over raw Promises

### Testing
- **Test file naming**: Use `.test.ts` suffix
- **Test organization**: Group tests by feature/component
- **Test coverage**: Aim for critical path coverage, not 100% line coverage
- **Test isolation**: Each test should be independent

---

## Git Workflow

### Commit Messages
Follow Conventional Commits format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples**:
- `feat(auth): add JWT token validation`
- `fix(api): handle null response in user endpoint`
- `docs(readme): update installation instructions`

### Branch Naming
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates

---

## Pre-commit Checklist

Before committing code, ensure:
- [ ] Code passes TypeScript type check (`bun run typecheck`)
- [ ] Code passes linter (`bun run lint` or `biome check`)
- [ ] Unit tests pass (`bun test`)
- [ ] No hardcoded secrets or sensitive data
- [ ] Code follows naming conventions
- [ ] Complex logic has comments explaining "why"

---

## Pre-push Checklist

Before pushing to remote:
- [ ] All commits follow conventional commit format
- [ ] Branch is rebased on latest main/develop
- [ ] Integration tests pass (if applicable)
- [ ] Documentation is updated (if needed)
- [ ] Breaking changes are documented

---

## Anti-Patterns to Avoid

### Over-Engineering
❌ **Bad**: Creating abstract factory pattern for 2 implementations
✅ **Good**: Use simple conditional or strategy pattern

### Premature Optimization
❌ **Bad**: Caching everything "just in case"
✅ **Good**: Measure first, optimize bottlenecks

### God Objects
❌ **Bad**: 1000-line controller handling everything
✅ **Good**: Break down into focused, single-responsibility modules

### Magic Numbers
❌ **Bad**: `if (status === 429)`
✅ **Good**: `if (status === HttpStatus.TooManyRequests)`

---

## When to Break These Rules

Rules are guidelines, not laws. Break them when:
- External requirements demand it
- Performance critical path requires it
- Existing codebase conventions differ significantly
- Team consensus supports alternative approach

**But**: Document why you're breaking the rule in code comments.
