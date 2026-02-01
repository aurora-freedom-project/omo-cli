# Hướng Dẫn Sử Dụng oh-my-opencode — Custom Setup

> Tài liệu hướng dẫn chi tiết cho cấu hình cá nhân với 5 models: Claude Opus 4.5, Claude Sonnet 4.5 Thinking, Gemini 3 Pro, Gemini 3 Flash, và Minimax M2.1 (Ollama Cloud).

---

## Tổng Quan Setup

### Plugins Đã Cài

```
~/.config/opencode/
├── opencode.json          # Plugin order + provider definitions
├── oh-my-opencode.json    # Agent model overrides
└── antigravity-accounts.json  # Multi-account config (tự động tạo)
```

### Phân Bổ Model

| Model | Mục Đích | Agents/Categories |
|-------|----------|-------------------|
| **Claude Opus 4.5 Thinking** | Heavy lifting, orchestration, planning | Sisyphus, Prometheus, unspecified-high |
| **Claude Sonnet 4.5 Thinking** | Deep analysis, architecture | oracle |
| **Gemini 3 Pro** | Multimodal, visual tasks | multimodal-looker, visual-engineering |
| **Gemini 3 Flash** | Quick one-off tasks | quick, writing |
| **Minimax M2.1** | Coding workhorse, exploration | librarian, Metis, explore, business-logic |

### New Features from ClaudeKit Integration
- **Coding Level**: Adjustable verbosity (1-10) for Sisyphus.
- **Privacy Awareness**: Auto-detect sensitive files.
- **Improved Planning**: Prometheus now uses 5 Mental Models (Decomposition, 5 Whys, etc.).
- **New Skills**: `/watzup` (Project Status), `/docs` (Doc Management).

---

## Luồng Xử Lý Agents

### Sơ Đồ Tổng Quan

```mermaid
flowchart TD
    subgraph USER["👤 User"]
        prompt[Nhập prompt]
    end

    subgraph MAIN["🎯 Main Agents (Chọn Trực Tiếp)"]
        sisyphus["<b>Sisyphus</b><br/>Opus 4.5 Thinking<br/>Main Orchestrator"]
        prometheus["<b>Prometheus</b><br/>Opus 4.5 Thinking<br/>Strategic Planner"]
    end

    subgraph PLANNING["📋 Planning Pipeline"]
        metis["<b>Metis</b><br/>Sonnet 4.5 Thinking<br/>Pre-Analysis"]
        momus["<b>Momus</b><br/>Sonnet 4.5 Thinking<br/>Plan Validation"]
    end

    subgraph SUBAGENTS["🔧 Subagents (Auto-delegate / @mention)"]
        oracle["<b>oracle</b><br/>Opus 4.5 Thinking<br/>Architecture Review"]
        librarian["<b>librarian</b><br/>Minimax M2.1<br/>Research & Docs"]
        explore["<b>explore</b><br/>Minimax M2.1<br/>Fast Grep"]
        multimodal["<b>multimodal-looker</b><br/>Gemini 3 Pro<br/>PDF/Image Analysis"]
    end

    subgraph ORCHESTRATION["⚡ Orchestration Mode"]
        atlas["<b>Atlas</b><br/>Opus 4.5 Thinking<br/>Todo List Executor"]
    end

    subgraph EXECUTION["🚀 Category Execution"]
        junior["<b>Sisyphus-Junior</b><br/>Category-spawned<br/>Task Executor"]
    end

    prompt --> sisyphus
    prompt -.->|Tab switch| prometheus

    sisyphus -->|"Complex plan"| atlas
    sisyphus -->|"@oracle"| oracle
    sisyphus -->|"@librarian"| librarian
    sisyphus -->|"@explore"| explore
    sisyphus -->|"Images/PDF"| multimodal
    sisyphus -->|"delegate_task(category)"| junior

    prometheus -->|"Pre-analysis"| metis
    prometheus -->|"Validate plan"| momus
    prometheus -->|"Plan approved"| sisyphus

    atlas -->|"delegate_task"| junior
    atlas -->|"Verify"| atlas

    junior -->|"Results"| sisyphus
    oracle -->|"Advice"| sisyphus
    librarian -->|"Research"| sisyphus
    explore -->|"Found files"| sisyphus
    multimodal -->|"Analysis"| sisyphus

    style sisyphus fill:#10B981,color:#fff
    style prometheus fill:#8B5CF6,color:#fff
    style atlas fill:#F59E0B,color:#fff
    style oracle fill:#3B82F6,color:#fff
    style librarian fill:#EC4899,color:#fff
    style explore fill:#06B6D4,color:#fff
    style multimodal fill:#EF4444,color:#fff
    style metis fill:#EC4899,color:#fff
    style momus fill:#6366F1,color:#fff
    style junior fill:#84CC16,color:#fff
```

### Luồng Chi Tiết

#### 1. Luồng Mặc Định (Sisyphus)

```mermaid
sequenceDiagram
    participant U as User
    participant S as Sisyphus
    participant E as explore
    participant L as librarian
    participant O as oracle
    participant J as Sisyphus-Junior

    U->>S: "Implement user auth"
    S->>E: Find existing auth code
    E-->>S: Found files
    S->>L: Research OAuth patterns
    L-->>S: Best practices
    S->>O: Review architecture
    O-->>S: Recommendations
    S->>J: delegate_task(category="business-logic")
    J-->>S: Implementation done
    S->>S: Verify with LSP
    S-->>U: ✅ Complete
```

#### 2. Luồng Planning (Prometheus)

```mermaid
sequenceDiagram
    participant U as User
    participant P as Prometheus
    participant M as Metis
    participant Mo as Momus
    participant S as Sisyphus

    U->>P: "Plan migration to GraphQL"
    P->>U: Interview questions
    U->>P: Answers
    P->>M: Pre-analysis
    M-->>P: Hidden requirements found
    P->>P: Create detailed plan
    P->>Mo: Validate plan
    Mo-->>P: Issues found
    P->>P: Update plan
    Mo-->>P: ✅ Plan approved
    P-->>U: Plan ready at .sisyphus/plans/
    U->>S: Execute plan
    S->>S: Atlas mode activated
```

#### 3. Luồng Orchestration (Atlas)

```mermaid
sequenceDiagram
    participant S as Sisyphus/Atlas
    participant J1 as Junior-1
    participant J2 as Junior-2
    participant J3 as Junior-3

    S->>S: Parse todo list
    S->>S: Identify parallel tasks
    
    par Parallel Execution
        S->>J1: Task 1
        S->>J2: Task 2
        S->>J3: Task 3
    end
    
    J1-->>S: Done
    J2-->>S: Done
    J3-->>S: Done
    
    S->>S: Verify all tasks
    S->>S: Update notepad
    S->>S: Next batch...
```

---

## Cách Sử Dụng

### 1. Bắt Đầu Làm Việc

Mở terminal và chạy:

```bash
opencode
```

Bạn sẽ thấy 2 agents có thể chọn trực tiếp:
- **Sisyphus** (default) — cho mọi task thông thường
- **Prometheus** — cho planning chi tiết với interview mode

### 2. Làm Việc Với Sisyphus (Default)

Chỉ cần chat bình thường. Sisyphus sẽ tự động:
- Phân tích yêu cầu
- Delegate cho subagents phù hợp
- Execute parallel khi có thể

```
# Ví dụ prompts
Implement a REST API for user authentication

Refactor this function to use async/await

Fix the memory leak in the database connection pool

ulw add dark mode to the settings page
```

> 💡 **Tip:** Thêm `ultrawork` hoặc `ulw` để kích hoạt maximum effort mode

### 3. Gọi Subagents Bằng @mention

#### @oracle — Strategic Advisor (Sonnet Thinking)

Dùng cho: architecture decisions, debugging strategy, code review

```
Ask @oracle to review this architecture and identify potential issues

Ask @oracle why is this function causing memory leaks?

Ask @oracle should I use Redux or Context for state management?
```

#### @librarian — Research (Minimax M2.1)

Dùng cho: documentation lookup, OSS examples, codebase understanding

```
Ask @librarian how other projects implement OAuth2 refresh token rotation

Ask @librarian find examples of rate limiting in Express.js

Ask @librarian what's the best practice for error handling in this codebase?
```

#### @explore — Fast Grep (Gemini 3 Flash)

Dùng cho: quick codebase exploration, finding files/functions

```
Ask @explore where is authentication implemented?

Ask @explore find all usages of the deprecated API

Ask @explore what files handle payment processing?
```

#### @multimodal-looker — Visual Content (Gemini 3 Pro)

Dùng cho: PDF, images, diagrams, screenshots

```
Ask @multimodal-looker analyze this screenshot and describe the UI layout

Ask @multimodal-looker extract text from this PDF diagram

Ask @multimodal-looker what's wrong with this error screenshot?
```

### 4. Planning Mode với Prometheus

Switch sang Prometheus bằng Tab, sau đó:

```
Create a detailed plan for migrating from REST to GraphQL

Plan the implementation of a real-time notification system

Design the database schema for a multi-tenant SaaS application
```

Prometheus sẽ:
1. Phỏng vấn để làm rõ yêu cầu
2. Gọi **Metis** (M2.1) để phân tích trước
3. Tạo plan chi tiết vào `.sisyphus/plans/`
4. Gọi **Momus** để validate plan

### 5. Background Execution

Chạy tasks song song trong khi tiếp tục làm việc:

```
# Spawn background agent
delegate_task(
  agent="explore",
  background=true,
  prompt="Find all files using deprecated v1 API"
)

# Continue working...

# Check results when ready
background_output(task_id="bg_abc123")
```

**Use cases:**
- GPT debug trong khi Claude thử approaches khác
- Gemini viết frontend song song Claude làm backend
- Massive parallel searches

### 6. Category-Based Delegation

Thay vì chỉ định agent, delegate theo category:

```
# Quick tasks → Gemini 3 Flash
delegate_task(category="quick", prompt="Check if tests pass")

# Complex reasoning → Sonnet Thinking
delegate_task(category="ultrabrain", prompt="Analyze complex algorithm")

# Backend coding → Minimax M2.1
delegate_task(category="business-logic", prompt="Implement the payment service")

# UI tasks → Gemini 3 Pro
delegate_task(category="visual-engineering", prompt="Create a responsive navbar")

# Documentation → Gemini 3 Flash
delegate_task(category="writing", prompt="Write API documentation")
```

---

## Skills

### playwright — Browser Automation

Tự động trigger cho browser tasks:

```
Take a screenshot of the login page and verify the layout

Run browser tests for the checkout flow

Scrape product data from this e-commerce page
```

### git-master — Git Operations

**PHẢI** dùng cho mọi git operations:

```
Commit these changes with proper atomic commits

Squash the last 3 commits into one

Find when this bug was introduced using git bisect

Rebase this branch onto main
```

### frontend-ui-ux — Design-to-Code

Designer persona cho stunning UI:

```
Create a stunning landing page with modern aesthetics

Improve the visual hierarchy of this dashboard

Design a mobile-first responsive layout
```

### Skills Library — 600+ Skills Tích Hợp

Oh My OpenCode cung cấp **600+ skills được tuyển chọn** từ antigravity-awesome-skills.

**Import nhanh:**
```bash
# Quét bảo mật tất cả skills
bunx oh-my-opencode scan-skills

# Phân loại theo agent và tier
bunx oh-my-opencode categorize-skills

# Cài đặt Tier 1 + 2 (479 skills, khuyến nghị)
bunx oh-my-opencode adapt-skills --max-tier 2
```

**Skill Tiers:**
| Tier | Skills | Chất lượng | Độ an toàn |
|------|--------|------------|------------|
| 1 | 85 | Xuất sắc | An toàn |
| 2 | 394 | Tốt | An toàn/Thấp |
| 3 | 100 | Trung bình | Trung bình |
| 4 | 36 | Cần review | Cao |

**Categories:** Architecture, DevOps, Frontend, Backend, AI/ML, Testing, Security, Documentation

---

## Tmux Integration

Nếu bạn dùng tmux, background agents sẽ hiển thị trong separate panes:

```bash
# Khởi động OpenCode trong tmux session
tmux new-session -s opencode
opencode
```

Xem multiple agents work real-time!

---

## Ollama Cloud — Minimax M2.1

Setup của bạn sử dụng Ollama client local gọi đến Ollama Cloud:

```bash
# Verify Ollama đang chạy
curl http://localhost:11434/api/tags | jq '.models[] | select(.name=="minimax-m2.1:cloud")'
```

**Lưu ý:**
- Compute xử lý ở cloud, không dùng GPU local
- Không có rate-limit như Anthropic/Google APIs
- Lý tưởng cho background tasks song song

---

## Anti-Patterns (Tránh Làm)

| ❌ Không | ✅ Nên |
|----------|--------|
| Trust "I'm done" reports | Verify outputs manually |
| Call Prometheus to write code | Let Sisyphus implement |
| Pick agents manually cho mọi task | Let Sisyphus orchestrate |
| Sequential exploration calls | Use background parallel delegates |
| Use high temperature (>0.3) | Keep low for code agents |

---

## Quick Reference

```bash
# Default work
[Chat với Sisyphus bình thường]

# Maximum effort
ulw [your prompt]

# Need planning
[Tab → Prometheus] hoặc @Prometheus create plan for [feature]

# Architecture review
Ask @oracle to review [topic]

# Research/examples
Ask @librarian how to [implement X]

# Find code
Ask @explore where is [feature]

# Analyze image/PDF
Ask @multimodal-looker what does this [image] show

# Background task
delegate_task(agent="explore", background=true, prompt="...")

# Category-based
delegate_task(category="quick", prompt="...")
delegate_task(category="business-logic", prompt="...")
delegate_task(category="visual-engineering", prompt="...")
```

---

## Troubleshooting

### Ollama Connection Error

```bash
# Check Ollama status
curl http://localhost:11434/api/tags

# Restart Ollama nếu cần
ollama serve
```

### Agent Not Found

Tên agent phải chính xác:
- PascalCase: `Sisyphus`, `Prometheus`, `Metis`, `Momus`, `Atlas`
- lowercase: `oracle`, `librarian`, `explore`, `multimodal-looker`

### Rate Limit Issues

Setup của bạn có multi-account rotation tự động. Nếu vẫn gặp issues:
- Chuyển tasks sang Minimax M2.1 (không rate-limit)
- Giảm `defaultConcurrency` trong `background_task`

---

## Config Files

### ~/.config/opencode/opencode.json

```json
{
  "plugin": ["opencode-antigravity-auth@latest", "oh-my-opencode@latest"],
  "provider": {
    "google": { "models": { ... } },
    "ollama": { "baseURL": "http://localhost:11434/v1", "models": { ... } }
  }
}
```

### ~/.config/opencode/oh-my-opencode.json

```json
{
  "google_auth": false,
  "agents": {
    "Sisyphus": { "model": "google/claude-opus-4-5" },
    "oracle": { "model": "google/claude-sonnet-4-5-thinking", "variant": "max" },
    "librarian": { "model": "ollama/minimax-m2.1:cloud", "stream": false },
    ...
  },
  "categories": { ... },
  "background_task": { "defaultConcurrency": 5 },
  "tmux": { "enabled": true }
}
```

---

*Tài liệu custom cho setup cá nhân • 2026-01-31*
