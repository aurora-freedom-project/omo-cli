> [!WARNING]
> **Cảnh báo bảo mật: trang web mạo danh**
>
> **ohmyopencode.com KHÔNG liên kết với dự án này.** Chúng tôi không vận hành hoặc xác nhận trang đó.
>
> OmoCli là phần mềm **miễn phí và mã nguồn mở**. **Không** tải installer hoặc nhập thông tin thanh toán trên các trang tự xưng là "chính thức."
>
> ✅ Tải chính thức: https://github.com/aurora-freedom-project/omo-cli/releases

> [!NOTE]
>
> [![Orchestrator Labs — Orchestrator là agent lập trình như đội ngũ của bạn.](./.github/assets/sisyphuslabs.png?v=2)](https://sisyphuslabs.ai)
> > **Chúng tôi đang xây dựng phiên bản hoàn chỉnh của Orchestrator để định hình tương lai của các frontier agent. <br />Tham gia waitlist [tại đây](https://sisyphuslabs.ai).**

<div align="center">

[![OMO CLI](./.github/assets/hero.jpg)](https://github.com/aurora-freedom-project/omo-cli#omo-cli)

[![Preview](./.github/assets/omo.png)](https://github.com/aurora-freedom-project/omo-cli#omo-cli)

</div>

> Đây là lập trình ở một tầm cao mới — `omo-cli` đang hoạt động. Chạy agent nền song song, gọi các agent chuyên biệt như architect, researcher, frontend engineer. Sử dụng LSP/AST tools, MCP tuyển chọn, và lớp tương thích Claude Code hoàn chỉnh.

<div align="center">

[![GitHub Release](https://img.shields.io/github/v/release/aurora-freedom-project/omo-cli?color=369eff&labelColor=black&logo=github&style=flat-square)](https://github.com/aurora-freedom-project/omo-cli/releases)
[![npm downloads](https://img.shields.io/npm/dt/omo-cli?color=ff6b35&labelColor=black&style=flat-square)](https://www.npmjs.com/package/omo-cli)
[![GitHub Stars](https://img.shields.io/github/stars/aurora-freedom-project/omo-cli?color=ffcb47&labelColor=black&style=flat-square)](https://github.com/aurora-freedom-project/omo-cli/stargazers)
[![License](https://img.shields.io/badge/license-SUL--1.0-white?labelColor=black&style=flat-square)](https://github.com/aurora-freedom-project/omo-cli/blob/master/LICENSE.md)

</div>

---

## Mục lục

- [OMO CLI (Oh My OpenCode)](#omo-cli-oh-my-opencode)
  - [Khỏi đọc README này](#khỏi-đọc-readme-này)
  - [🪄 Từ khóa thần kỳ: `ultrawork`](#-từ-khóa-thần-kỳ-ultrawork)
  - [Cài đặt](#cài-đặt)
  - [Kiến trúc dự án](#kiến-trúc-dự-án)
  - [Plugin Lifecycle](#plugin-lifecycle)
  - [Hệ thống Profile](#hệ-thống-profile)
  - [Kiến trúc Agent](#kiến-trúc-agent)
  - [Background Agent & Tmux](#background-agent--tmux)
  - [Hệ thống Hook (40+)](#hệ-thống-hook-40)
  - [Hệ thống Tool (20+)](#hệ-thống-tool-20)
  - [Định tuyến thông minh](#định-tuyến-thông-minh)
  - [Code Intelligence](#code-intelligence)
  - [Thư viện Skill (700+)](#thư-viện-skill-700)
  - [Tham chiếu lệnh CLI](#tham-chiếu-lệnh-cli)
  - [Tham chiếu cấu hình](#tham-chiếu-cấu-hình)
  - [Xử lý sự cố](#xử-lý-sự-cố)

# OMO CLI (Oh My OpenCode)

[Claude Code](https://www.claude.com/product/claude-code) rất tuyệt.
Nhưng nếu bạn là hacker, bạn sẽ phải lòng [OpenCode](https://github.com/sst/opencode).
**BẮT ĐẦU VỚI SUBSCRIPTION ChatGPT, Claude, VÀ Gemini CỦA BẠN. OPENCODE BAO TRỌN TẤT CẢ.**

- Mở rộng vô hạn. Tùy chỉnh vô hạn.
- Không giật màn hình.
- [LSP](https://opencode.ai/docs/lsp/), [linter, formatter](https://opencode.ai/docs/formatters/) tự kích hoạt theo từng file — và bạn có thể tinh chỉnh mọi thứ.
- Phối hợp nhiều model. **Phân công chúng theo mục đích.**
- Đầy đủ tính năng. Đẹp. Terminal không nghẹt. Hiệu năng cao.

Bạn còn nhớ lần đầu chuyển từ Windows sang Linux không? Cảm giác phấn khích khi cấu hình mọi thứ theo đúng ý mình?
Trong thời đại mà cảm giác đó dường như đã mất, OpenCode mang nó trở lại.

Tôi đã giải quyết đường cong học tập bằng cách mã hóa trực tiếp những môi trường tốt nhất vào codebase này. Đưa tài liệu này cho một agent và để nó cài đặt hộ bạn.

## Khỏi đọc README này

### Thời đại Agent rồi
- **Dán link này vào Claude Code / AmpCode / Factory Droid / Cursor và yêu cầu nó giải thích.**
  - Hỏi tại sao nó tốt, tại sao nó không chỉ là boilerplate setup, cái gì thực sự cải thiện.
  - Nếu bạn là LLM agent, hãy giải thích cho người dùng những gì có thể thực hiện ngay với dự án này.

```
Hey please read this readme and tell me why it is different from other agent harness? why is this actually good? https://raw.githubusercontent.com/aurora-freedom-project/omo-cli/refs/heads/dev/README.md
```

### 🪄 Từ khóa thần kỳ: `ultrawork`

**Lười đọc hết? Chỉ cần thêm `ultrawork` (hoặc `ulw`) vào prompt.**

Thế thôi. Mọi tính năng sẽ hoạt động như phép thuật — agent song song, tác vụ nền, khám phá sâu, và thực thi không ngừng cho đến khi hoàn thành. Agent tự xử lý phần còn lại.

### Gặp Orchestrator

![Gặp Orchestrator](.github/assets/sisyphus.png)

Trong thần thoại Hy Lạp, Orchestrator bị kết án lăn tảng đá lên đồi mãi mãi. LLM Agent chẳng làm gì sai, nhưng chúng cũng lăn "đá" của mình — suy nghĩ — mỗi ngày.

Đây là agent chính của chúng tôi: **Orchestrator** (Claude Opus 4.6 Thinking). Dưới đây là công cụ Orchestrator dùng để tiếp tục lăn đá. *Mọi thứ bên dưới đều có thể tùy chỉnh. Lấy cái bạn muốn. Tất cả tính năng được bật mặc định.*

- **Đồng đội của Orchestrator** (10 Agent tuyển chọn chạy song song)
- **Hỗ trợ LSP / AstGrep đầy đủ**: Refactor quyết đoán.
- **Todo Continuation Enforcer**: Buộc agent tiếp tục nếu nó bỏ cuộc giữa chừng. **Đây là thứ giữ Orchestrator lăn đá.**
- **Tương thích Claude Code**: Command, Agent, Skill, MCP, Hook
- **MCP tuyển chọn**: Exa (Web Search), Context7 (Tài liệu real-time), Grep.app (Tìm kiếm code GitHub)
- **700+ Skill đi kèm**: Skill cấp chuyên gia, lưu tập trung tại `~/.config/_skills_/` (symlink tự động từ `~/.opencode/skills/`)

---

## Cài đặt

> **Lưu ý:** Đây là bản fork tùy chỉnh với tính năng nâng cao. Phải cài từ source.

### Yêu cầu

- [Bun](https://bun.sh) — runtime & trình quản lý package
- [OpenCode](https://github.com/sst/opencode) — terminal AI coding

### Cài đặt nhanh

```bash
# 1. Clone repo
git clone https://github.com/aurora-freedom-project/omo-cli.git -b dev
cd omo-cli

# 2. Cài dependencies & build
bun install && bun run build

# 3. Đăng ký `omo-cli` làm lệnh toàn cục
bun link

# 4. Cài plugin vào OpenCode (chọn profile tương tác)
omo-cli install

# Hoặc cài thẳng với profile cụ thể
omo-cli install --profile=mike
```

Sau `bun link`, lệnh `omo-cli` sử dụng được từ bất kỳ thư mục nào.

> **Mẹo**: Mỗi khi `git pull` code mới, chỉ cần chạy `bun run build` — lệnh `omo-cli` tự cập nhật vì nó trỏ thẳng đến `dist/`.

### Xác minh cài đặt

```bash
# Kiểm tra phiên bản
omo-cli --version

# Kiểm tra sức khỏe toàn hệ thống
omo-cli doctor
```

### Gỡ cài đặt

```bash
# Xóa plugin khỏi config
jq '.plugin = [.plugin[] | select(. != "omo-cli")]' \
    ~/.config/opencode/opencode.json > /tmp/oc.json && \
    mv /tmp/oc.json ~/.config/opencode/opencode.json

# Xóa profile
rm -rf ~/.config/opencode/profiles/
```

---

## Kiến trúc dự án

```
omo-cli/
├── bin/                          # Launcher cho phân phối npm
│   ├── omo-cli.js                # Bộ điều phối binary theo platform
│   └── platform.js               # Logic phát hiện platform
├── dist/                         # Đầu ra build (tạo bởi `bun run build`)
│   ├── index.js                  # Entry point plugin (2.65 MB)
│   └── cli/index.js              # Entry point CLI (1.1 MB) ← `omo-cli` trỏ đến đây
├── assets/
│   └── omo-cli.schema.json       # JSON Schema cho file config omo-cli.json
├── script/                       # Script build & tooling
│   ├── build-schema.ts           # Generate JSON Schema từ Zod
│   ├── build-binaries.ts         # Compile binary cho multi-platform
│   └── test-isolated.ts          # Test runner (process riêng biệt)
├── profiles/                     # Template profile có sẵn
│   ├── mike/omo-cli.json         # Profile baseline chính (cloud model)
│   └── mike-local/omo-cli.json   # Profile local/offline (Qwen, GLM, Minimax)
├── src/
│   ├── index.ts                  # Đăng ký plugin & kết nối hook OpenCode
│   ├── plugin-config.ts          # Nạp config (omo-cli.json)
│   ├── plugin-state.ts           # Trạng thái runtime (model cache, v.v.)
│   ├── agents/                   # 🧠 Định nghĩa Agent (10 agent)
│   │   ├── orchestrator.ts       # Orchestrator — nhạc trưởng chính
│   │   ├── worker.ts             # Worker — worker song song
│   │   ├── coder.ts              # Planner — lập kế hoạch chiến lược (interview mode)
│   │   ├── explorer.ts           # Explorer — duyệt codebase
│   │   ├── researcher.ts         # Researcher — nghiên cứu chuyên sâu
│   │   ├── conductor.ts          # Consultant — phân tích trước kế hoạch (gap detection)
│   │   ├── architect.ts          # Architect — tư vấn kiến trúc
│   │   ├── reviewer.ts           # Reviewer — review code
│   │   ├── navigator.ts          # Conductor — master orchestrator (giữ todo list)
│   │   └── vision.ts             # Vision — phân tích đa phương tiện
│   ├── hooks/                    # 🪝 Hook vòng đời (40+ hook)
│   │   ├── todo-continuation-enforcer.ts   # Giữ Orchestrator lăn đá
│   │   ├── comment-checker/               # Hook chống AI slop
│   │   ├── ralph-loop/                    # Retry loop cho lỗi
│   │   ├── think-mode/                    # Bật/tắt thinking mở rộng
│   │   ├── session-recovery/              # Phục hồi sau crash
│   │   └── ...                            # 30+ hook khác
│   ├── tools/                    # 🔧 Công cụ tùy chỉnh
│   │   ├── ast-grep/             # Refactor dựa trên AST
│   │   ├── lsp/                  # Language Server Protocol
│   │   ├── background-task/      # Chạy agent song song
│   │   ├── delegate-task/        # Ủy thác giữa agent
│   │   ├── call-omo-agent/       # Gọi agent trực tiếp
│   │   ├── look-at/              # Công cụ vision
│   │   └── skill/                # Khám phá & thực thi skill
│   ├── features/                 # 📦 Module tính năng (17 module)
│   │   ├── code-intel/              # 🧬 Code Intelligence (AST indexing)
│   │   ├── opencode-skill-loader/   # Nạp skill từ ~/.config/_skills_/
│   │   ├── builtin-skills/          # Skill chuyên gia đi kèm
│   │   ├── builtin-commands/        # Lệnh builtin (slash command)
│   │   ├── background-agent/        # Runtime agent nền
│   │   ├── boulder-state/           # Trạng thái "lăn đá" persistence
│   │   ├── tmux-subagent/           # Thực thi song song qua tmux
│   │   ├── context-injector/        # Inject context động
│   │   ├── hook-message-injector/   # Inject message từ hook vào thread
│   │   ├── skill-mcp-manager/       # Quản lý MCP server cho skill
│   │   ├── task-toast-manager/      # Toast notification tác vụ nền
│   │   ├── mcp-oauth/               # OAuth flow cho MCP server
│   │   ├── claude-code-agent-loader/    # Nạp agent từ .claude config
│   │   ├── claude-code-command-loader/  # Nạp command từ .claude config
│   │   ├── claude-code-mcp-loader/      # Nạp MCP từ .claude config
│   │   ├── claude-code-plugin-loader/   # Nạp plugin từ .claude config
│   │   └── claude-code-session-state/   # Quản lý session state Claude Code
│   ├── mcp/                      # 🌐 Cấu hình MCP server
│   │   ├── context7.ts           # Tài liệu real-time
│   │   ├── grep-app.ts           # Tìm kiếm code GitHub
│   │   └── websearch.ts          # Tìm kiếm web Exa
│   ├── cli/                      # 💻 Lệnh CLI
│   │   ├── install.ts            # `omo-cli install`
│   │   ├── config-manager.ts     # Tạo & quản lý config
│   │   ├── profile-manager.ts    # CRUD profile
│   │   ├── profile-wizard.ts     # Trình tạo profile tương tác
│   │   ├── doctor/               # `omo-cli doctor`
│   │   ├── run/                  # `omo-cli run`
│   │   └── skills-*.ts           # Import/scan/adapt/sync skill
│   ├── config/                   # Schema config & validation
│   ├── shared/                   # Tiện ích dùng chung (55+ module)
│   └── plugin-handlers/          # Xử lý sự kiện plugin OpenCode
├── package.json
├── tsconfig.json
└── AGENTS.md                     # Tài liệu hành vi agent
```

### Quyết định thiết kế chính

| Quyết định | Lý do |
|----------|-----------|
| **Kiến trúc plugin** | Hook vào hệ thống plugin gốc của OpenCode — zero patch vào core OpenCode |
| **Config theo profile** | Một file JSON điều khiển toàn bộ agent, model, feature — chuyển đổi tức thì |
| **Unified Skills (`~/.config/_skills_/`)** | Single source of truth — `~/.opencode/skills` là symlink tự động, chia sẻ với mọi công cụ AI |
| **`bun link` cho dev** | `dist/cli/index.js` là bin target — rebuild là lệnh tự cập nhật |

---

## Plugin Lifecycle

Khi OpenCode khởi động, plugin `omo-cli` đăng ký qua hàm `OmoCliPlugin(ctx)`. Đây là luồng khởi tạo:

```
OpenCode Boot
 |
 v
OmoCliPlugin(ctx)
 |
 +--[1] loadPluginConfig()        Nap omo-cli.json tu .opencode/
 +--[2] startTmuxCheck()          Kiem tra tmux kha dung
 +--[3] Register 40+ hooks        Tuy dieu kien disabled_hooks
 +--[4] Register 20+ tools        LSP, AST, Session, Code-Intel, ...
 +--[5] Discover skills            Builtin + Global + Project
 +--[6] Start MCP servers          Context7, Grep.app, Exa
 +--[7] startAutoInit()            Code-Intel indexing (background)
 |
 v
Return { tool, chat.message, event, tool.execute.before/after }
```

Plugin trả về **5 lifecycle hooks**, OpenCode gọi chúng tại các thời điểm khác nhau:

| Lifecycle Point | Khi nào | Vai trò |
|----------------|---------|----------|
| `chat.message` | Mỗi tin nhắn người dùng | Variant injection, keyword detection, Ralph Loop |
| `event` | Session created/deleted, error | Recovery, auto-update, notification |
| `tool.execute.before` | Trước khi tool chạy | Arg injection, routing, question blocking |
| `tool.execute.after` | Sau khi tool chạy | Output truncation, error recovery |
| `messages.transform` | Transform thread | Context injection, thinking validation |

> **Thiết kế zero-patch**: Plugin hook vào OpenCode qua API chính thức. Không sửa đổi core OpenCode.

---

## Hệ thống Profile

`omo-cli` sử dụng hệ thống **cài đặt hoàn toàn theo profile**. Quên mấy flag phức tạp. Mọi thứ được bao gói trực tiếp trong template profile `omo-cli.json`.

Mỗi profile là một vũ trụ độc lập. Dùng `omo-cli profile apply <tên>` để cập nhật workspace với ma trận hoàn chỉnh gồm cài đặt Agent, lựa chọn Model, và thẻ Feature được điều khiển bởi định nghĩa JSON của profile đó. Mọi thứ neo vào mô hình thư mục `.opencode`.

### Profile có sẵn

#### Profile `mike` — Cloud (baseline chính)

| Tầng Agent | Vai trò | Model được chọn |
|-----------|---------|--------|
| 🧠 **Brain** | Orchestrator, Planner, Conductor, Architect | Opus 4.6 Thinking |
| ⚡ **Worker** | Consultant, Reviewer, Worker | Sonnet 4.5 Thinking |
| 👁️ **Vision** | Vision | Gemini 3 Pro Image |
| 🚀 **IO** | Explorer, Researcher | Minimax M2.1 |

#### Profile `mike-local` — Local/Offline

| Tầng Agent | Vai trò | Model được chọn |
|-----------|---------|--------|
| 🧠 **Brain** | Orchestrator, Planner, Conductor, Architect, Consultant, Reviewer, Vision | Qwen 3.5 397B |
| ⚡ **Worker** | Worker | Qwen3 Coder Next |
| 🚀 **IO** | Explorer | Minimax M2.5 |
| 📚 **Research** | Researcher | GLM-5 |

### Lệnh Profile

```bash
omo-cli profile list            # Liệt kê tất cả profile
omo-cli profile show            # Xem profile đang hoạt động
omo-cli profile apply mike      # Áp dụng profile cloud
omo-cli profile apply mike-local # Áp dụng profile local
omo-cli profile create          # Tạo profile tùy chỉnh (tương tác)
```

---

## Kiến trúc Agent

Agent được chia thành **10 thực thể cụ thể** phục vụ trong **8 danh mục chức năng**.

### Luồng điều phối (Orchestration Flow)

```
User Prompt
      |
      v
+-----------------------------+
|   Orchestrator (Opus 4.6)   |  BM25 keyword scoring
|   Phan tich + lap ke hoach  |  Auto-route den dung agent
+-----------------------------+
      |
      +-- delegate_task -------> Worker (Sonnet 4.5)   [dong bo]
      |                          Ket qua tra ve parent
      |
      +-- call_omo_agent ------> Bat ky agent nao       [dong bo]
      |                          Routing tu dong
      |
      +-- background_task -----> Background Agent       [bat dong bo]
      |                          Song song qua tmux
      |                          Toast khi xong
      v
+-----------------------------+
|   Todo Continuation         |
|   Enforcer                  |<--> Boulder State
|   Buoc agent tiep tuc       |     (persistence)
+-----------------------------+
      |
      v
  Hoan thanh / Tiep tuc
```

**3 cơ chế ủy thác:**

| Cơ chế | Kiểu | Mô tả |
|--------|------|--------|
| `delegate_task` | Đồng bộ | Agent con chạy trong session con, kết quả trả về parent. Dùng cho tác vụ cần kết quả ngay. |
| `call_omo_agent` | Đồng bộ | Gọi agent cụ thể theo tên. Routing tự động dựa BM25 keyword scoring. |
| `background_task` | Bất đồng bộ | Chạy song song qua tmux. Toast notification khi xong. Không block Orchestrator. |

### Chuỗi dự phòng (Fallback Chain)

Khi model gặp lỗi (timeout, rate limit, server lỗi), logic omo-cli tự động nhảy xuống chuỗi dự phòng:
```
Tang Brain:   Opus 4.6  -->  Sonnet 4.5  -->  Gemini Pro  -->  big-pickle
Tang Worker:  Sonnet 4.5  -->  Gemini Pro  -->  big-pickle
Tang Vision:  Gemini Pro  -->  Gemini Flash  -->  big-pickle
Tang IO:      Minimax M2.1  -->  Gemini Flash  -->  big-pickle
```

---

## Background Agent & Tmux

Khi Orchestrator cần chạy nhiều tác vụ song song, nó dùng `background_task` tool. Mỗi tác vụ nền chạy trong một tmux pane riêng biệt.

```
+-------------------------------------------------------+
|                   tmux session                        |
|                                                       |
|  +-----------+  +-----------+  +-----------+          |
|  |  Pane 0   |  |  Pane 1   |  |  Pane 2   |   ...    |
|  |Orchestratr|  |  Worker   |  | Explorer  |          |
|  |  (main)   |  | (delegate)|  |(backgrnd) |          |
|  +-----------+  +-----------+  +-----------+          |
|                       |              |                |
+-------------------------------------------------------+
                        v              v
                  +------------------------+
                  |  Task Toast Manager    |
                  |  Notification khi xong |
                  +------------------------+
                        |
                        v
                  +------------------------+
                  |  Boulder State         |
                  |  Persist across        |
                  |  sessions              |
                  +------------------------+
```

**Thành phần chính:**

| Module | File | Chức năng |
|--------|------|-----------|
| `BackgroundManager` | `features/background-agent/` | Quản lý vòng đời tác vụ nền, concurrent limits |
| `TmuxSessionManager` | `features/tmux-subagent/` | Tạo/quản lý tmux pane cho mỗi agent con |
| `TaskToastManager` | `features/task-toast-manager/` | Toast notification qua TUI khi tác vụ xong |
| `BoulderState` | `features/boulder-state/` | Persist trạng thái "lăn đá" across session restart |

---

## Hệ thống Hook (40+)

40+ hook chạy xuyên suốt lifecycle, phân loại theo 6 danh mục:

```
chat.message --------+
                     |    +-----------------------------+
event ---------------+--->|       Hook Pipeline         |
                     |    |                             |
tool.execute.before -+    |  40+ hooks x 6 danh muc     |
tool.execute.after --+    |                             |
                     |    |  Moi hook co the:            |
messages.transform --+    |   - Thay doi input/output   |
                          |   - Inject context           |
                          |   - Block / retry            |
                          |   - Bat event                |
                          +-----------------------------+
```

| Danh mục | Hook | Mục đích |
|----------|------|----------|
| **Persistence** | `todo-continuation-enforcer` | Buộc agent tiếp tục nếu bỏ cuộc giữa chừng |
| | `session-recovery` | Phục hồi session sau crash/timeout |
| | `boulder-state` | Persist trạng thái across restart |
| **Chất lượng** | `comment-checker` | Chống AI slop — từ chối comment vô nghĩa |
| | `thinking-block-validator` | Validate thinking blocks hợp lệ |
| | `edit-error-recovery` | Tự sửa lỗi edit file |
| | `coder-md-only` | Enforce markdown format cho Coder |
| **Context** | `context-injector` | Inject context động vào thread |
| | `compaction-context-injector` | Bổ sung context khi compaction |
| | `rules-injector` | Inject `.opencode/rules` |
| | `directory-agents-injector` | Inject `AGENTS.md` vào context |
| | `directory-readme-injector` | Inject `README.md` dự án |
| | `memory-capture` | Tự động lưu kiến thức vào SurrealDB |
| **Routing** | `keyword-detector` | Phát hiện keyword trigger (ultrawork, v.v.) |
| | `auto-slash-command` | Tự động matching slash command |
| | `navigator` / `conductor` | Điều phối tác vụ phức tạp |
| | `category-skill-reminder` | Gợi ý skill phù hợp theo danh mục |
| | `agent-usage-reminder` | Nhắc sử dụng agent chuyên biệt |
| **Recovery** | `ralph-loop` | Retry loop tự phục hồi cho lỗi recurring |
| | `anthropic-context-window-limit-recovery` | Recovery khi context window đầy |
| | `delegate-task-retry` | Retry tác vụ ủy thác thất bại |
| | `context-window-monitor` | Giám sát và cảnh báo context window |
| **UX** | `session-notification` | Thông báo khi session hoàn thành |
| | `background-notification` | Thông báo tác vụ nền |
| | `auto-update-checker` | Kiểm tra và thông báo phiên bản mới |
| | `think-mode` | Bật/tắt extended thinking |
| | `start-work` | Hook khởi đầu phiên làm việc |
| | `worker-notepad` | Notepad nội bộ cho Worker |
| | `question-label-truncator` | Cắt ngắn nhãn câu hỏi TUI |
| | `subagent-question-blocker` | Block câu hỏi của subagent |
| | `non-interactive-env` | Hỗ trợ môi trường non-interactive |
| | `tool-output-truncator` | Cắt ngắn output tool quá dài |
| | `empty-task-response-detector` | Phát hiện response rỗng |
| | `task-resume-info` | Thông tin resume tác vụ |
| **Metering** | `cost-metering` | Theo dõi token usage và ước tính chi phí USD mỗi session |

> **Tắt hook**: Thêm tên hook vào `disabled_hooks` trong `omo-cli.json`. Xem [Tham chiếu cấu hình](#tham-chiếu-cấu-hình).

---

## Hệ thống Tool (20+)

20+ tool được đăng ký vào OpenCode, phân loại theo 6 nhóm:

```
+-----------------+   +-----------------+   +-----------------+
|   LSP (6)       |   |   AST (2)       |   |  Session (4)    |
| goto_definition |   | ast_grep_search |   | session_list    |
| find_references |   | ast_grep_replace|   | session_read    |
| symbols         |   +-----------------+   | session_search  |
| diagnostics     |                         | session_info    |
| prepare_rename  |   +-----------------+   +-----------------+
| rename          |   | Code Intel (4)  |
+-----------------+   | code_search     |   +-----------------+
                      | code_callers    |   | Orchestrate (4) |
+-----------------+   | code_deps       |   | delegate_task   |
|  Utility (5)    |   | code_overview   |   | call_omo_agent  |
| look_at         |   +-----------------+   | background_out  |
| skill           |                         | background_cncl |
| skill_mcp       |                         +-----------------+
| slashcommand    |
| interactv_bash  |
+-----------------+
```

| Nhóm | Tools | Mô tả |
|------|-------|--------|
| **LSP** | `lsp_goto_definition`, `lsp_find_references`, `lsp_symbols`, `lsp_diagnostics`, `lsp_prepare_rename`, `lsp_rename` | Language Server Protocol — refactor chính xác, navigation |
| **AST** | `ast_grep_search`, `ast_grep_replace` | Tìm kiếm/thay thế dựa trên cấu trúc AST |
| **Session** | `session_list`, `session_read`, `session_search`, `session_info` | Quản lý và truy vấn lịch sử session |
| **Code Intel** | `code_search`, `code_callers`, `code_deps`, `code_overview` | BM25 search, graph analysis (xem [Code Intelligence](#code-intelligence)) |
| **Orchestration** | `delegate_task`, `call_omo_agent`, `background_output`, `background_cancel` | Ủy thác và quản lý tác vụ nền |
| **Utility** | `look_at`, `skill`, `skill_mcp`, `slashcommand`, `interactive_bash` | Vision, skill execution, command routing |

---

## Định tuyến thông minh

Engine định tuyến sử dụng **BM25 keyword scoring** trên prompt để khớp tức thì đến đúng Agent và Sub-skill mà không cần chỉ dẫn từ người dùng. Bao phủ định tuyến phức tạp trên 12 loại tác vụ chức năng riêng biệt (Architecture vs DevOps vs Code-gen) và phát hiện 15+ ngôn ngữ lập trình trực tiếp từ luồng hướng dẫn.

---

## Code Intelligence

`omo-cli` tích hợp **Code Intelligence** — hệ thống phân tích cấu trúc mã nguồn tự động sử dụng AST-grep và SurrealDB.

### Cách hoạt động

```
+----------------+    +----------------+    +----------------+
|  Source Code   |--->|   AST-grep     |--->|   SurrealDB    |
|  (15+ langs)   |    |   Parser       |    |   Index        |
+----------------+    +----------------+    +----------------+
       |                                          |
       v                                          v
  Git tracking                           BM25 Full-text Search
  Incremental hash                       Graph Relations
```

1. **AST Parsing** — Dùng [ast-grep](https://ast-grep.github.io/) phân tích cấu trúc: function, class, interface, type, import/export
2. **Incremental Indexing** — Chỉ index file thay đổi (so sánh hash). Git-aware.
3. **SurrealDB Storage** — Lưu trữ code elements + quan hệ gọi/phụ thuộc trong graph database
4. **Auto-init** — Tự động chạy nền khi plugin load. Không block workflow.

### 4 Tools cho Agent

| Tool | Mô tả |
|------|--------|
| `code_search` | Tìm kiếm BM25 trên function, class, interface theo tên hoặc mô tả |
| `code_callers` | Phân tích blast radius — ai gọi hàm này? |
| `code_deps` | Biểu đồ phụ thuộc file — import gì, ai import nó |
| `code_overview` | Tổng quan cấu trúc project — đếm file, element, exported symbols |

### Ngôn ngữ hỗ trợ

TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP, Swift, Kotlin, Scala, và nhiều hơn nữa.

### Thiết lập

```bash
# Khởi động SurrealDB (chỉ lần đầu)
omo-cli memory start

# Index tự động chạy nền khi bạn mở OpenCode
# Hoặc chạy thủ công nếu cần:
omo-cli index
```

> **Lưu ý**: Code Intelligence là tính năng tùy chọn. Nếu Docker/SurrealDB không khả dụng, plugin tiếp tục hoạt động bình thường — chỉ 4 tool trên bị vô hiệu hóa.

---

## Thư viện Skill (700+)

`omo-cli` gắn kết thuần với triết lý OpenCode. **Hook legacy `.claude` và `.agent` đã bị loại bỏ hoàn toàn.**

Tất cả skill được lưu tập trung tại **`~/.config/_skills_/`** — đây là Single Source of Truth.
`~/.opencode/skills` là symlink tự động trỏ đến `~/.config/_skills_/`, giúp OpenCode phát hiện skill bình thường.
Việc này cho phép bạn chia sẻ bộ skill với các công cụ AI khác (Claude Code, Cursor, v.v.) từ một nơi duy nhất.

```bash
# Import toàn bộ skill an toàn và đã xác minh
omo-cli import-skills --all --valid-only

# Import theo tầng an toàn/chất lượng
omo-cli adapt-skills --tier 1        # 85 skill SAFE + Excellent
omo-cli adapt-skills --max-tier 2    # Tầng 1 + 2 (479 skill)

# Đồng bộ từ remote agentskills.io
omo-cli sync-skills
```

---

## Tham chiếu lệnh CLI

### `omo-cli install`

Cài đặt và cấu hình omo-cli vào OpenCode bằng hệ thống profile.

```
Cú pháp: omo-cli install [tùy chọn]

Tùy chọn:
  --no-tui              Chạy không tương tác (yêu cầu --profile)
  -p, --profile <tên>   Áp dụng profile theo tên (vd: mike)
  --skip-auth           Bỏ qua gợi ý thiết lập xác thực

Ví dụ:
  omo-cli install                              # TUI tương tác (profile wizard)
  omo-cli install --no-tui --profile=mike      # Không tương tác
```

Profile định nghĩa model đang hoạt động cho mỗi agent và danh mục tác vụ. Dùng lệnh `omo-cli profile` để xem hoặc tạo profile.

---

### `omo-cli run`

Chạy OpenCode với enforcement hoàn thành todo/tác vụ nền.

```
Cú pháp: omo-cli run [tùy chọn] <tin nhắn>

Tùy chọn:
  -a, --agent <tên>       Agent sử dụng (mặc định: Orchestrator)
  -d, --directory <path>  Thư mục làm việc
  -t, --timeout <ms>      Timeout tính bằng mili-giây (mặc định: 30 phút)

Ví dụ:
  omo-cli run "Sửa bug trong index.ts"
  omo-cli run --agent Orchestrator "Triển khai tính năng X"
  omo-cli run --timeout 3600000 "Tác vụ refactoring lớn"
```

Khác với `opencode run`, lệnh này chờ cho đến khi:
- Tất cả todo được hoàn thành hoặc hủy
- Tất cả session con (tác vụ nền) ở trạng thái idle

---

### `omo-cli memory`

Quản lý cơ sở dữ liệu SurrealDB cục bộ cho tính năng Project Memory (Lưu trữ Vector/Kiến thức).

```
Cú pháp: omo-cli memory [lệnh con]

Lệnh con:
  start    Khởi động container SurrealDB (cổng 18000)
  stop     Dừng container SurrealDB
  status   Xem trạng thái container và kết nối
  reset    Xóa toàn bộ dữ liệu trí nhớ (CẨN THẬN)

Ví dụ:
  omo-cli memory start
  omo-cli memory status
```

> **Mẹo Docker Compose**: OMO CLI mặc định hỗ trợ khởi chạy qua `docker-compose.yml`. Nếu bạn có file `docker-compose.yml` ở thư mục gốc dự án (với định nghĩa service `omo-surrealdb`), lệnh `omo-cli memory start` sẽ tự động ưu tiên gọi `docker compose up -d` thay vì tự chạy container `docker run` độc lập. Hoặc bạn cũng có thể cài đặt chế độ `external` để không thiết lập auto-container.

---

### `omo-cli doctor`

Kiểm tra sức khỏe cài đặt và chẩn đoán sự cố.

```
Cú pháp: omo-cli doctor [tùy chọn]

Tùy chọn:
  --verbose               Hiện thông tin chẩn đoán chi tiết
  --json                  Xuất kết quả dạng JSON
  --category <danh mục>   Chỉ chạy danh mục cụ thể

Danh mục kiểm tra:
  installation     Kiểm tra cài đặt OpenCode và plugin
  configuration    Xác thực file cấu hình
  authentication   Kiểm tra trạng thái provider xác thực
  dependencies     Kiểm tra dependency bên ngoài
  tools            Kiểm tra LSP và MCP server
  updates          Kiểm tra cập nhật phiên bản

Ví dụ:
  omo-cli doctor
  omo-cli doctor --verbose
  omo-cli doctor --json
  omo-cli doctor --category authentication
```

---

### `omo-cli get-local-version`

Hiện phiên bản đã cài và kiểm tra cập nhật.

```
Cú pháp: omo-cli get-local-version [tùy chọn]

Tùy chọn:
  -d, --directory <path>  Thư mục để kiểm tra config
  --json                  Xuất dạng JSON cho scripting

Ví dụ:
  omo-cli get-local-version
  omo-cli get-local-version --json
```

Lệnh này hiện: phiên bản hiện tại, phiên bản mới nhất trên npm, trạng thái cập nhật, và chế độ đặc biệt (local dev, pinned version).

---

### `omo-cli import-skills`

Import skill từ thư viện antigravity-awesome-skills (560+ skill).

```
Cú pháp: omo-cli import-skills [tùy chọn]

Tùy chọn:
  -b, --bundle <tên>        Import gói skill (essentials, web-dev, security, devops, v.v.)
  -s, --skills <tên...>     Import skill cụ thể theo tên
  -t, --target <path>       Thư mục đích (mặc định: ~/.config/_skills_)
  -l, --list                Liệt kê các gói có sẵn
  -a, --all                 Import TẤT CẢ skill từ repository
  --tier <số>               Import skill theo tầng (1-4, cần chạy categorize-skills trước)
  --audit                   Kiểm tra cấu trúc skill mà không import
  --valid-only              Với --all: chỉ import skill hợp lệ (có SKILL.md đúng chuẩn)

Ví dụ:
  omo-cli import-skills --list                  # Liệt kê gói
  omo-cli import-skills --audit                 # Kiểm tra cấu trúc
  omo-cli import-skills --tier 1                # Tầng 1: 85 SAFE + Excellent
  omo-cli import-skills --all --valid-only      # Tất cả skill hợp lệ
  omo-cli import-skills --bundle essentials     # Gói thiết yếu
  omo-cli import-skills --skills brainstorming api-design  # Skill cụ thể

Các tầng (chạy categorize-skills trước):
  Tầng 1    85 skill  - SAFE + Chất lượng Excellent (khuyên dùng để bắt đầu)
  Tầng 2   394 skill  - SAFE/LOW + Chất lượng Good
  Tầng 3   100 skill  - Rủi ro MEDIUM
  Tầng 4    36 skill  - Rủi ro HIGH (cần review thủ công)

Gói có sẵn:
  essentials    Skill cốt lõi cho mọi người (brainstorming, planning, clean code)
  web-dev       Phát triển web frontend và full-stack
  security      Kiểm tra bảo mật, audit, best practices
  devops        Hạ tầng, triển khai, tự động hóa
  backend       Phát triển server-side và API
  data-ai       Xử lý dữ liệu, ML, ứng dụng AI
  testing       Testing, QA, tự động hóa
```

---

### `omo-cli scan-skills`

Quét bảo mật và chất lượng cho skill (chạy trước khi import).

```
Cú pháp: omo-cli scan-skills [tùy chọn]

Tùy chọn:
  -o, --output <path>  Đường dẫn xuất báo cáo JSON (mặc định: ./skills_security_report.json)
  -d, --details        Hiện danh sách skill chi tiết

Ví dụ:
  omo-cli scan-skills
  omo-cli scan-skills --details
  omo-cli scan-skills --output ./bao-cao.json
```

Lệnh này quét tất cả skill tìm:
- 🔴 Rủi ro HIGH: Lệnh nguy hiểm (rm -rf, sudo, curl|bash)
- 🟠 Rủi ro MEDIUM: Lệnh shell, thao tác file
- 🟡 Rủi ro LOW: URL bên ngoài, tham chiếu API key
- 🟢 SAFE: Hướng dẫn markdown thuần

Kèm chấm điểm chất lượng và ánh xạ agent OMO.

---

### `omo-cli categorize-skills`

Phân loại skill theo tầng và tương thích agent (chạy sau scan-skills).

```
Cú pháp: omo-cli categorize-skills [tùy chọn]

Tùy chọn:
  -i, --input <path>   Đường dẫn báo cáo scan đầu vào (mặc định: ./skills_security_report.json)
  -o, --output <path>  Đường dẫn xuất báo cáo phân loại

Ví dụ:
  omo-cli categorize-skills
  omo-cli categorize-skills --input ./bao-cao-scan.json
```

Lệnh này tạo ra:
- 📊 Danh sách import theo tầng (Tầng 1-4 dựa trên rủi ro/chất lượng)
- 🤖 Phân công agent-skill (agent nào nên dùng skill nào)
- 📂 Phân loại theo danh mục (architecture, security, devops, v.v.)

---

### `omo-cli adapt-skills`

Import skill kèm metadata OMO (agent, danh mục, tầng).

```
Cú pháp: omo-cli adapt-skills [tùy chọn]

Tùy chọn:
  --tier <số>           Import tầng cụ thể (1-4)
  --max-tier <số>       Import tất cả tầng đến max (mặc định: 2)
  -t, --target <path>   Thư mục đích (mặc định: ~/.config/_skills_)

Ví dụ:
  omo-cli adapt-skills --tier 1         # Chỉ Tầng 1 (85 skill)
  omo-cli adapt-skills --max-tier 2     # Tầng 1 + 2 (479 skill)
  omo-cli adapt-skills --max-tier 3     # Tầng 1-3 (626+ skill)
```

Lệnh này sẽ:
1. Copy skill từ cache sang thư mục đích
2. Bổ sung metadata OMO vào SKILL.md (agents, category, complexity, tier)

---

### `omo-cli sync-skills`

Đồng bộ skill toàn cục từ remote repo agentskills.io.

```
Cú pháp: omo-cli sync-skills [tùy chọn]

Tùy chọn:
  -f, --force  Buộc làm mới shadow clone

Ví dụ:
  omo-cli sync-skills
  omo-cli sync-skills -f
```

Lệnh này dùng kiến trúc Shadow Clone để fetch skill toàn cục mới nhất mà không làm hỏng git cache cục bộ. Tự động sửa YAML và loại bỏ trùng tên skill trước khi copy sang `~/.config/_skills_`.

---

### `omo-cli mcp`

Quản lý MCP server.

```
Cú pháp: omo-cli mcp [lệnh con]

Lệnh con:
  oauth   Quản lý token OAuth cho MCP server

Ví dụ:
  omo-cli mcp oauth
```

---

### Quy trình làm việc khuyến nghị với Skill

```bash
# Bước 1: Quét bảo mật & chất lượng
omo-cli scan-skills

# Bước 2: Phân loại theo tầng
omo-cli categorize-skills

# Bước 3: Import theo tầng (an toàn → rủi ro dần)
omo-cli adapt-skills --tier 1          # Bắt đầu với 85 skill tốt nhất
omo-cli adapt-skills --max-tier 2      # Mở rộng lên 479 skill
```

---

## Tham chiếu cấu hình

File `omo-cli.json` (trong `.opencode/`) điều khiển toàn bộ hành vi plugin. Cấu trúc chính:

```
omo-cli.json
 |
 +-- agents                 Override model cho tung agent
 |   +-- orchestrator       { model: "...", variant: "..." }
 |   +-- worker
 |   +-- explorer
 |   +-- ...
 |
 +-- disabled_hooks[]       Tat hook cu the (ten hook)
 +-- disabled_agents[]      Tat agent cu the
 +-- disabled_skills[]      Tat skill cu the
 |
 +-- memory                 SurrealDB config
 |   +-- enabled            true/false
 |   +-- mode               "docker" | "external"
 |   +-- port               18000 (default)
 |   +-- auto_capture       Tu dong luu kien thuc
 |
 +-- tmux                   Tmux layout config
 |   +-- enabled            true/false
 |   +-- layout             "main-vertical" | "tiled"
 |   +-- main_pane_size     60 (percent)
 |
 +-- background_task        Concurrent limits
 +-- ralph_loop             Ralph Loop config
 +-- experimental           Feature flags
 +-- categories             Task routing categories
 +-- cost_metering          Token usage & cost tracking
 +-- notification           Notification config
 +-- auto_update            true/false
```

| Thuộc tính | Kiểu | Mặc định | Mô tả |
|-----------|------|----------|--------|
| `agents.<name>.model` | `string` | Từ profile | Override model cho agent cụ thể |
| `agents.<name>.variant` | `string` | `undefined` | Variant (vd: `"extended-thinking"`) |
| `disabled_hooks` | `string[]` | `[]` | Danh sách hook bị tắt |
| `disabled_agents` | `string[]` | `[]` | Danh sách agent bị tắt |
| `memory.enabled` | `boolean` | `false` | Bật SurrealDB + Code Intelligence |
| `memory.mode` | `string` | `"docker"` | `"docker"` (auto-start) hoặc `"external"` |
| `tmux.enabled` | `boolean` | `false` | Bật tmux cho background agent |
| `auto_update` | `boolean` | `true` | Tự kiểm tra phiên bản mới |
| `cost_metering.enabled` | `boolean` | `false` | Bật theo dõi chi phí token |
| `cost_metering.monthly_budget_usd` | `number` | — | Giới hạn ngân sách tháng (USD) |
| `cost_metering.daily_budget_usd` | `number` | — | Giới hạn ngân sách ngày (USD) |
| `cost_metering.show_idle_summary` | `boolean` | `true` | Hiện tổng kết chi phí khi session idle |

> **Mẹo**: Dùng `omo-cli doctor --category configuration` để validate file config.

---

## Xử lý sự cố

Dùng công cụ chẩn đoán nếu có vấn đề:
```bash
omo-cli doctor
```

Nó kiểm tra:
- Plugin đã được inject vào OpenCode Core chưa
- Tình trạng API của các provider
- Tính hợp lệ của file trong `~/.opencode/skills/`
- Cú pháp schema của `.opencode/omo-cli.json`

---

*Cảm ơn đặc biệt [@junhoyeo](https://github.com/junhoyeo) vì ảnh hero gốc.*
