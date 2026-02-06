> [!WARNING]
> **Cảnh báo bảo mật: website giả mạo**
>
> **ohmyopencode.com KHÔNG liên quan đến project này.** Chúng tôi không vận hành hoặc xác nhận website đó.
>
> OhMyOpenCode là **miễn phí và mã nguồn mở**. **KHÔNG** tải installers hoặc nhập thông tin thanh toán trên các website bên thứ ba tự xưng là "official."
>
> ✅ Downloads chính thức: https://github.com/code-yeongyu/oh-my-opencode/releases

<div align="center">

[![Oh My OpenCode](./.github/assets/hero.jpg)](https://github.com/code-yeongyu/oh-my-opencode#oh-my-opencode)

[![GitHub Release](https://img.shields.io/github/v/release/code-yeongyu/oh-my-opencode?color=369eff&labelColor=black&logo=github&style=flat-square)](https://github.com/code-yeongyu/oh-my-opencode/releases)
[![npm downloads](https://img.shields.io/npm/dt/oh-my-opencode?color=ff6b35&labelColor=black&style=flat-square)](https://www.npmjs.com/package/oh-my-opencode)

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-cn.md) | **Tiếng Việt**

</div>

---

# Oh My OpenCode

> Đây là coding trên steroids — `oh-my-opencode` trong hành động. Chạy background agents, gọi agents chuyên biệt như oracle, librarian, và frontend engineer. Sử dụng các công cụ LSP/AST tinh chỉnh, MCPs được tuyển chọn, và layer tương thích Claude Code đầy đủ.

## Mục Lục

- [Giới Thiệu](#giới-thiệu)
- [Cài Đặt](#cài-đặt)
- [Gỡ Cài Đặt](#gỡ-cài-đặt)
- [Tính Năng](#tính-năng)
- [Các Agents](#các-agents)
- [Hướng Dẫn Sử Dụng Agents](#hướng-dẫn-sử-dụng-agents)
- [Skills](#skills)
- [Cấu Hình](#cấu-hình)
- [Tích Hợp với opencode-antigravity-auth](#tích-hợp-với-opencode-antigravity-auth)
- [Lưu Ý Quan Trọng](#lưu-ý-quan-trọng)

---

## Giới Thiệu

[Claude Code](https://www.claude.com/product/claude-code) tuyệt vời. Nhưng nếu bạn là hacker, bạn sẽ phải lòng [OpenCode](https://github.com/sst/opencode).

**BẮT ĐẦU VỚI SUBSCRIPTIONS CHATGPT, CLAUDE, GEMINI CỦA BẠN. OPENCODE HỖ TRỢ TẤT CẢ.**

- Mở rộng vô tận. Tùy chỉnh vô tận.
- Không nhấp nháy màn hình.
- [LSP](https://opencode.ai/docs/lsp/), linters, formatters tự động kích hoạt theo file.
- Mix và match models. **Điều phối chúng theo mục đích.**
- Nhiều tính năng. Đẹp. Terminal không lag. Hiệu suất cao.

### 🪄 Từ Khóa Ma Thuật: `ultrawork`

**Không muốn đọc hết? Chỉ cần thêm `ultrawork` (hoặc `ulw`) vào prompt.**

Thế là xong. Tất cả tính năng sẽ hoạt động như magic — parallel agents, background tasks, deep exploration, và execution không ngừng cho đến khi hoàn thành.

---

## Cài Đặt

> **Note:** Đây là bản custom fork. Phải cài từ source, không dùng được `bunx oh-my-opencode` từ npm.

### Quick Start

```bash
# Clone repo
git clone https://github.com/aurora-freedom-project/oh-my-opencode.git -b dev
cd oh-my-opencode

# Build
bun install && bun run build

# Install với preset
bun dist/cli/index.js install --preset=mike-full     # 🚀 Khuyến nghị
bun dist/cli/index.js install --preset=claude-only   # Claude only
```

### Interactive Install (TUI)

```bash
bun dist/cli/index.js install
# → Chọn preset trong menu
```

### OpenCode Config

Sau khi install, cấu hình `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-antigravity-auth@latest",
    "/path/to/oh-my-opencode"  // Đường dẫn folder đã clone
  ],
  "provider": {
    "google": { /* Antigravity models */ },
    "ollama": { /* Minimax M2.1 */ }
  }
}
```

> Xem full config example trong [README.md](README.md#opencode-config-example).

---

## Gỡ Cài Đặt

1. **Xóa plugin khỏi OpenCode config**

   ```bash
   jq '.plugin = [.plugin[] | select(. != "oh-my-opencode")]' \
       ~/.config/opencode/opencode.json > /tmp/oc.json && \
       mv /tmp/oc.json ~/.config/opencode/opencode.json
   ```

2. **Xóa config files (tùy chọn)**

   ```bash
   rm -f ~/.config/opencode/oh-my-opencode.json
   rm -f .opencode/oh-my-opencode.json
   ```

---

## Tính Năng

- **Agents**: Sisyphus (main), Prometheus (planner), Oracle (architecture), Librarian (docs), Explore (grep), Multimodal Looker
- **Background Agents**: Chạy nhiều agents song song như dev team thực
- **LSP & AST Tools**: Refactoring, rename, diagnostics, AST-aware code search
- **Context Injection**: Auto-inject AGENTS.md, README.md, conditional rules
- **Claude Code Compatibility**: Full hook system, commands, skills, agents, MCPs
- **Built-in MCPs**: websearch (Exa), context7 (docs), grep_app (GitHub search)
- **Skills Library**: 600+ skills có thể import từ antigravity-awesome-skills
- **Session Tools**: List, read, search, analyze session history
- **Cải tiến từ ClaudeKit**:
  - **Coding Level (1-10)**: Điều chỉnh độ chi tiết phản hồi từ ngắn gọn (1-3) đến giáo dục (7-10)
  - **Privacy Awareness**: Tự động cảnh báo khi truy cập file nhạy cảm (.env, *.key, *.pem)
  - **Mental Models**: Prometheus sử dụng Decomposition, 5 Whys, 80/20 Rule, Second-Order Thinking
  - **Skills**: `/watzup` (trạng thái dự án), `/docs` (quản lý tài liệu)

### Skills Library

Oh My OpenCode cung cấp quyền truy cập **626+ skills được tuyển chọn** từ [antigravity-awesome-skills](https://github.com/PierrunoYT/antigravity-awesome-skills). Skills được bundle sẵn (không cần import) + hỗ trợ filesystem discovery.

**Import nhanh:**
```bash
# Quét bảo mật tất cả skills
bunx oh-my-opencode scan-skills

# Phân loại theo agent và tier chất lượng
bunx oh-my-opencode categorize-skills

# Cài đặt Tier 1 (85 skills an toàn + chất lượng cao)
bunx oh-my-opencode adapt-skills --tier 1

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

**Categories:**
- Architecture, DevOps, Frontend, Backend
- AI/ML, Testing, Security, Documentation
- Performance, Cloud, Mobile, Workflow

---

## Các Agents

oh-my-opencode cung cấp **10 AI agents chuyên biệt**:

### Core Agents

| Agent | Model | Mục Đích |
|-------|-------|----------|
| **Sisyphus** | `claude-opus-4-5-thinking` (max) | **Orchestrator mặc định.** Plans, delegates, executes với parallel execution. Extended thinking 32k. |
| **oracle** | `claude-opus-4-5-thinking` (max) | Architecture decisions, code review, debugging. Read-only - reasoning logic sâu. |
| **librarian** | `minimax-m2.1` (Ollama) | Multi-repo analysis, documentation lookup, OSS examples. |
| **explore** | `minimax-m2.1` (Ollama) | Fast codebase exploration và contextual grep. Không rate-limit. |
| **multimodal-looker** | `gemini-3-pro` (high) | PDF, images, diagrams analysis. |

### Planning Agents

| Agent | Model | Mục Đích |
|-------|-------|----------|
| **Prometheus** | `claude-opus-4-5-thinking` (max) | Strategic planner với interview mode. Tạo plans chi tiết. |
| **Metis** | `claude-sonnet-4-5-thinking` (max) | Plan consultant - phân tích trước. Tìm hidden requirements. |
| **Momus** | `claude-sonnet-4-5` | Plan reviewer - validate plans. |

### Tool Restrictions

| Agent | Restrictions |
|-------|-------------|
| oracle | Read-only: không write, edit, delegate |
| librarian | Không write, edit, delegate |
| explore | Không write, edit, delegate |
| multimodal-looker | Allowlist only: read, glob, grep |

---

## Hướng Dẫn Sử Dụng Agents

### 1. Hai Agents Chính (Chọn Trực Tiếp)

| Agent | Khi Nào Dùng |
|-------|--------------|
| **Sisyphus** | Default. Mọi task thông thường - implementation, debugging, refactoring |
| **Prometheus** | Cần lập kế hoạch chi tiết với interview mode |

### 2. Gọi Subagents Bằng @mention

```
# oracle (Strategic Advisor)
Ask @oracle to review this architecture and identify potential issues
Ask @oracle why is this function causing memory leaks?

# librarian (Research)
Ask @librarian how other projects implement OAuth2 refresh token rotation
Ask @librarian find examples of rate limiting in Express.js

# explore (Fast Grep)
Ask @explore where is authentication implemented?
Ask @explore find all usages of the deprecated API

# multimodal-looker (Visual Content)
Ask @multimodal-looker analyze this screenshot and describe the UI layout
Ask @multimodal-looker extract text from this PDF diagram
```

### 3. Background Execution

```
# Spawn background agent
delegate_task(
  agent="explore",
  background=true,
  prompt="Find all files using deprecated v1 API"
)

# Continue working...

# Check results
background_output(task_id="bg_abc123")
```

### 4. Category-Based Delegation

```
delegate_task(category="quick", prompt="Check if tests pass")
delegate_task(category="ultrabrain", prompt="Analyze complex algorithm")
```

| Category | Use Case |
|----------|----------|
| `quick` | Trivial tasks, checks |
| `visual-engineering` | UI/UX tasks |
| `ultrabrain` | Complex reasoning |
| `business-logic` | Backend coding |
| `writing` | Documentation |

### 5. Anti-Patterns (Tránh Làm)

| ❌ Không | ✅ Nên |
|----------|--------|
| Trust "I'm done" reports | Verify outputs manually |
| Call Prometheus to write code | Let Sisyphus implement |
| Pick agents manually | Let Sisyphus orchestrate |
| Sequential exploration calls | Use background parallel delegates |

---

## Skills

Built-in skills với MCP servers:

| Skill | Trigger | Mô Tả |
|-------|---------|-------|
| **playwright** | Browser tasks, testing | Browser automation. PHẢI dùng cho browser-related tasks. |
| **frontend-ui-ux** | UI/UX tasks | Designer persona. Crafts stunning UI/UX. |
| **git-master** | commit, rebase, squash | PHẢI dùng cho mọi git operations. Atomic commits. |

---

## Cấu Hình

### Config File Locations

1. `.opencode/oh-my-opencode.json` (project)
2. `~/.config/opencode/oh-my-opencode.json` (user)

---

## Tích Hợp với opencode-antigravity-auth

> [!TIP]
> **Khuyến nghị:** Sử dụng [`opencode-antigravity-auth`](https://github.com/NoeFabris/opencode-antigravity-auth) để truy cập các model premium miễn phí qua Google OAuth.

### Lợi Ích

| Trước (Paid API) | Sau (Antigravity) |
|------------------|-------------------|
| Claude Opus API ($$$) | Antigravity quota (FREE) |
| Gemini API | Antigravity Gemini 3 (FREE) |
| Claude Haiku API | Gemini 3 Flash minimal (FREE) |

### Bước 1: opencode.json

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-antigravity-auth@latest",
    "oh-my-opencode@latest"
  ],
  "provider": {
    "google": {
      "models": {
        "claude-opus-4-5": {
          "name": "Claude Opus 4.5 (Antigravity)",
          "limit": { "context": 200000, "output": 64000 }
        },
        "claude-sonnet-4-5-thinking": {
          "name": "Claude Sonnet 4.5 Thinking",
          "limit": { "context": 200000, "output": 64000 },
          "variants": {
            "low": { "thinkingConfig": { "thinkingBudget": 8192 } },
            "max": { "thinkingConfig": { "thinkingBudget": 32768 } }
          }
        },
        "gemini-3-pro": {
          "name": "Gemini 3 Pro",
          "limit": { "context": 1048576, "output": 65535 },
          "variants": {
            "low": { "thinkingLevel": "low" },
            "high": { "thinkingLevel": "high" }
          }
        },
        "gemini-3-flash": {
          "name": "Gemini 3 Flash",
          "limit": { "context": 1048576, "output": 65536 },
          "variants": {
            "minimal": { "thinkingLevel": "minimal" },
            "low": { "thinkingLevel": "low" },
            "medium": { "thinkingLevel": "medium" },
            "high": { "thinkingLevel": "high" }
          }
        }
      }
    },
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": {
        "minimax-m2.1:cloud": {
          "name": "Minimax M2.1 (Ollama Cloud)"
        }
      }
    }
  }
}
```

### Bước 2: oh-my-opencode.json với Minimax M2.1

#### Tại Sao Dùng Minimax M2.1?

| Metric | Minimax M2.1 | So Sánh |
|--------|--------------|---------|
| **SWE-bench Verified** | 74.0% | Gần Claude Opus (77.5%) |
| **SWE-bench Multilingual** | 72.5% | Tốt hơn Claude Sonnet |
| **Speed** | +26% faster | So với Gemini 3 Pro |
| **Architecture** | MoE 230B/10B active | Hiệu quả cao |

> [!TIP]
> **Minimax M2.1 lý tưởng cho:**
> - Coding tasks cần tốc độ và accuracy
> - Multilingual code (Rust, Go, Java, không chỉ Python)
> - Background tasks song song (không rate-limit)

#### Cấu Hình Đề Xuất (5 Models)

| Agent | Model | Lý Do |
|-------|-------|-------|
| **Sisyphus** | claude-opus-4-5 | Main orchestrator cần model mạnh nhất |
| **oracle** | claude-sonnet-4-5-thinking (max) | Deep debugging cần extended thinking |
| **librarian** | minimax-m2.1:cloud | Code research - M2.1 giỏi đọc code |
| **explore** | minimax-m2.1:cloud | Fast grep - M2.1 no rate limit |
| **multimodal-looker** | gemini-3-pro (high) | PDF/image analysis |
| **Prometheus** | claude-opus-4-5-thinking (max) | Strategic planning |
| **Metis** | minimax-m2.1:cloud | Pre-analysis - M2.1 nhanh |

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/master/assets/oh-my-opencode.schema.json",
  
  "google_auth": false,  // QUAN TRỌNG: Disable nếu dùng antigravity-auth
  
  "agents": {
    "Sisyphus": { "model": "google/claude-opus-4-5-thinking", "variant": "max" },
    "oracle": { "model": "google/claude-sonnet-4-5-thinking", "variant": "max" },
    "Prometheus": { "model": "google/claude-opus-4-5-thinking", "variant": "max" },
    "multimodal-looker": { "model": "google/gemini-3-pro", "variant": "high" },
    "explore": { "model": "ollama/minimax-m2.1:cloud", "stream": false },
    "librarian": { "model": "ollama/minimax-m2.1:cloud", "stream": false },
    "Metis": { "model": "google/claude-sonnet-4-5-thinking", "variant": "max" }
  },
  
  "categories": {
    "visual-engineering": { "model": "google/gemini-3-pro", "variant": "high" },
    "quick": { "model": "google/gemini-3-flash", "variant": "minimal" },
    "ultrabrain": { "model": "google/claude-sonnet-4-5-thinking", "variant": "max" },
    "business-logic": { "model": "ollama/minimax-m2.1:cloud", "stream": false },
    "writing": { "model": "google/gemini-3-flash", "variant": "low" }
  },
  
  "background_task": { "defaultConcurrency": 5 },
  
  "tmux": { "enabled": true, "layout": "main-vertical" }
}
```

### Ollama Provider

> [!IMPORTANT]
> Khi dùng Ollama, **PHẢI** disable streaming:
> ```json
> { "model": "ollama/model-name", "stream": false }
> ```

---

## Lưu Ý Quan Trọng

### Claude OAuth Access

Kể từ tháng 1/2026, Anthropic đã hạn chế third-party OAuth access. oh-my-opencode không có custom OAuth implementations.

### Cảnh Báo

- Productivity có thể tăng đột biến. Đừng để đồng nghiệp phát hiện 😄
- Nếu dùng OpenCode version ≤ 1.0.132, có thể gặp bug config. Hãy update lên version mới hơn.

---

## Đánh Giá Từ Người Dùng

> "Nó khiến tôi hủy subscription Cursor. Những điều không thể tin được đang xảy ra trong cộng đồng mã nguồn mở." — Arthur Guiot

> "Nếu Claude Code làm trong 7 ngày những gì con người làm trong 3 tháng, Sisyphus làm trong 1 giờ." — B, Quant Researcher

> "Knocked out 8000 eslint warnings với Oh My Opencode, chỉ trong một ngày" — Jacob Ferrari

---

## Được Yêu Thích Bởi Professionals Tại

- [Indent](https://indentcorp.com)
- [Google](https://google.com)
- [Microsoft](https://microsoft.com)

---

*Tài liệu được dịch và bổ sung bởi cộng đồng Việt Nam • 2026-02-05*
