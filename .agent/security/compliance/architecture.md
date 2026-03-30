# Architecture — OmniUltraAgent Kit

> Version: 1.0 | Last Updated: 2026-03-29

## System Overview

OmniUltraAgent Kit is a three-layer AI agent orchestration system that combines a powerful IDE brain with local Ollama-powered sub-agents for autonomous code generation, analysis, and review.

```mermaid
graph TB
    subgraph "Layer 1: Antigravity IDE - Brain"
        IDE["IDE Agent - Model Selection, Planning"]
        KI["Knowledge Items"]
        Rules[".agent/rules/*.md"]
    end

    subgraph "Layer 2: omni run CLI - Hands"
        CLI["omni run"]
        SkillSearch["BM25 Skill Search"]
        Memory["Memory Recall"]
        DAG["DAG Planner"]
        Index["Code Indexer"]
    end

    subgraph "Layer 3: Ollama Sub-Agents - Workers"
        Coder["Coder Agent - minimax-m2.7"]
        Analyzer["Analyzer Agent - glm-5"]
        Reviewer["Reviewer Agent - glm-5"]
        Tester["Tester Agent - minimax-m2.7"]
    end

    subgraph "Infrastructure"
        Ollama["Ollama Server :11434"]
        SurrealDB["SurrealDB :18000"]
        FS["File System"]
    end

    IDE --> CLI
    CLI --> SkillSearch
    CLI --> Memory
    CLI --> DAG
    DAG --> Coder & Analyzer & Reviewer & Tester
    Coder & Analyzer & Reviewer & Tester --> Ollama
    Memory --> SurrealDB
    Index --> SurrealDB
    Coder --> FS
```

## Data Flow: Request to Response

```mermaid
sequenceDiagram
    participant User
    participant IDE as Antigravity IDE
    participant CLI as omni run
    participant Guard as InputGuard
    participant Swarm as Swarm Engine
    participant Agent as Sub-Agent
    participant Sanitizer as OutputSanitizer
    participant DB as SurrealDB

    User->>IDE: Task description
    IDE->>CLI: omni run task
    CLI->>Guard: scan task_input
    Guard-->>CLI: OK or BLOCK
    CLI->>DB: Memory recall
    CLI->>CLI: Skill search BM25
    CLI->>Swarm: execute DAG
    
    loop Each Wave
        Swarm->>Agent: spawn task
        Agent->>Agent: Tool calls
        Agent-->>Swarm: response + status
    end
    
    Swarm->>Sanitizer: redact_all response
    Sanitizer-->>Swarm: sanitized response
    Swarm->>DB: Persist memory + trajectory
    Swarm-->>CLI: SwarmResult
    CLI-->>IDE: Final output
    IDE-->>User: Display result
```

## Trust Boundaries

```mermaid
graph LR
    subgraph "TRUSTED - Local System"
        IDE["IDE Agent"]
        CLI["CLI Engine"]
        FS["File System"]
        SDB["SurrealDB"]
    end

    subgraph "SEMI-TRUSTED - Local AI"
        Ollama["Ollama Models"]
        Agents["Sub-Agents"]
    end

    subgraph "UNTRUSTED - External"
        Web["Internet/Web"]
        Skills["Skill Repository"]
        UserInput["User Input"]
    end

    UserInput -->|InputGuard| CLI
    Web -->|validate_url| CLI
    Skills -->|SecurityScanner| CLI
    Agents -->|OutputSanitizer| CLI
    CLI -->|Path Traversal Guard| FS
    CLI -->|Auth| SDB
```

### Security Layers by Trust Boundary

| Boundary | Guard | Controls |
|----------|-------|----------|
| User to System | **InputGuard** | 41 patterns, encoding normalization, CJK detection, padding detection |
| Agent to User | **OutputSanitizer** | Credential redaction, PII detection, path disclosure, markdown exfil |
| Agent to File System | **Path Traversal** | Project root scoping, .. blocking, .bak backups |
| Agent to Network | **URL Validator** | Localhost/private IP blocking, query param exfil detection |
| Agent to Agent | **LoopGuard** | Rate limiting, ping-pong detection, tool chaining guard |
| Skill to Agent | **SecurityScanner** | 5-category scan: injection, secrets, file ops, network, privesc |
| DAG to Swarm | **DAG Validator** | Max 25 tasks, cycle detection, concurrency limiter max 3 |
| Agent to Brain | **DriftTracker** | Cosine drift detection, consecutive escalation |

## Component Architecture

| Component | File | Purpose |
|-----------|------|---------|
| InputGuard | src/core/input_guard.rs | Pre-processing defense: normalize + pattern scan |
| OutputSanitizer | src/core/output_sanitizer.rs | Post-processing defense: credential + PII + exfil redaction |
| LoopGuard | src/agents/loop_guard.rs | Runtime defense: dedup, rate limit, tool chaining |
| DriftTracker | src/agents/drift.rs | Semantic defense: multi-turn topic drift detection |
| SecurityScanner | src/skills/security_scanner.rs | Supply chain defense: 5-category skill scanning |
| Swarm Engine | src/agents/swarm.rs | DAG execution: wave resolution, concurrency control |
| AgenticRunner | src/agents/runner/ | Individual agent lifecycle: prompt to tool loop to response |
| BM25Engine | src/skills/search.rs | Skill retrieval: tokenization, BM25 scoring, diversity |
| SurrealClient | src/db/surreal.rs | Brain persistence: memory, trajectories, code elements |
| Regression | src/core/regression.rs | Automated testing: 26-vector adversarial suite |

---

*See also: .agent/security/compliance/ai-policy.md | .agent/security/compliance/risk-register.md | .agent/security/blue/compliance-report.md*
