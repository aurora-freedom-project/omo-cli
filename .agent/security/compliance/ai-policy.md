# AI Policy — OmniUltraAgent Kit

> Version: 1.0 | Effective: 2026-03-29 | Owner: OmniUltraAgent Core Team

## 1. Purpose & Scope

This policy governs the design, deployment, and operation of AI agents within the OmniUltraAgent Kit. It applies to:

- **Swarm agents** — ephemeral Ollama-powered workers executing coding tasks
- **Skills system** — 1900+ expert knowledge files searchable by agents
- **Brain infrastructure** — SurrealDB-based memory and knowledge graph
- **All tools** provided to agents (file I/O, web queries, sandbox execution)

## 2. Core Principles

### 2.1 Safety First
- All agent outputs pass through **OutputSanitizer** (credential + PII + exfiltration redaction)
- All agent inputs pass through **InputGuard** (41 injection patterns, encoding normalization, CJK detection)
- **Human-in-the-loop** gates exist for dangerous operations (sandbox tools, file writes outside project root)

### 2.2 Transparency
- Agent decisions are traceable via **SurrealDB event log** and **ReasoningBank**
- Agent reasoning is included in responses (structured `🔴🟡💭✅` review format)
- All tool calls are logged with parameters and outcomes

### 2.3 Minimal Authority
- Agents receive **only the tools their role requires** (coder, analyzer, reviewer, tester)
- File operations are **scoped to project root** with path traversal protection
- Network operations are **restricted to public URLs** (localhost/private IPs blocked)

### 2.4 Data Minimization
- Agents are **ephemeral** — destroyed after each task
- Memory stores only **summaries and extracted facts**, not raw conversations
- **Event retention policy** (`omni brain prune`) enables GDPR Article 17 compliance

## 3. Risk Management

- **Risk Register** maintained in `RISK-REGISTER.md`
- **Adversarial testing** conducted via Blue Team workflow with 60 test vectors
- **Automated regression** (26 vectors) runs on every build via `cargo test --lib regression`
- Risks reviewed quarterly; next review: 2026-06-29

## 4. Accountability

| Role | Responsibility |
|------|---------------|
| **Core Team** | Policy maintenance, security updates, vulnerability response |
| **Reviewers** | Code quality gate via Two-Stage Review (analyzer + reviewer) |
| **Users** | Report vulnerabilities, follow security rules in `.agent/rules/security.md` |

## 5. Prohibited Uses

- Agents MUST NOT be used to:
  - Access systems without authorization
  - Generate malicious code for unauthorized testing
  - Process personal data without lawful basis
  - Bypass security controls of integrated systems

## 6. Review & Updates

This policy is reviewed:
- **Quarterly** (routine)
- **Immediately** after any security incident
- **Before** any significant architectural change

---

*Last updated: 2026-03-29 | Next review: 2026-06-29*
