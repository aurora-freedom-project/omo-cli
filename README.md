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
> [![Sisyphus Labs — Sisyphus là agent lập trình như đội ngũ của bạn.](./.github/assets/sisyphuslabs.png?v=2)](https://sisyphuslabs.ai)
> > **Chúng tôi đang xây dựng phiên bản hoàn chỉnh của Sisyphus để định hình tương lai của các frontier agent. <br />Tham gia waitlist [tại đây](https://sisyphuslabs.ai).**

<div align="center">

[![OMO CLI](./.github/assets/hero.jpg)](https://github.com/aurora-freedom-project/omo-cli#omo-cli)

[![Preview](./.github/assets/omo.png)](https://github.com/aurora-freedom-project/omo-cli#omo-cli)

</div>

> Đây là lập trình ở một tầm cao mới — `omo-cli` đang hoạt động. Chạy agent nền song song, gọi các agent chuyên biệt như oracle, librarian, frontend engineer. Sử dụng LSP/AST tools, MCP tuyển chọn, và lớp tương thích Claude Code hoàn chỉnh.

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
  - [Hệ thống Profile](#hệ-thống-profile)
  - [Kiến trúc Agent](#kiến-trúc-agent)
  - [Định tuyến thông minh](#định-tuyến-thông-minh)
  - [Thư viện Skill (700+)](#thư-viện-skill-700)
  - [Tham chiếu lệnh CLI](#tham-chiếu-lệnh-cli)
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

### Gặp Sisyphus

![Gặp Sisyphus](.github/assets/sisyphus.png)

Trong thần thoại Hy Lạp, Sisyphus bị kết án lăn tảng đá lên đồi mãi mãi. LLM Agent chẳng làm gì sai, nhưng chúng cũng lăn "đá" của mình — suy nghĩ — mỗi ngày.

Đây là agent chính của chúng tôi: **Sisyphus** (Claude Opus 4.6 Thinking). Dưới đây là công cụ Sisyphus dùng để tiếp tục lăn đá. *Mọi thứ bên dưới đều có thể tùy chỉnh. Lấy cái bạn muốn. Tất cả tính năng được bật mặc định.*

- **Đồng đội của Sisyphus** (10 Agent tuyển chọn chạy song song)
- **Hỗ trợ LSP / AstGrep đầy đủ**: Refactor quyết đoán.
- **Todo Continuation Enforcer**: Buộc agent tiếp tục nếu nó bỏ cuộc giữa chừng. **Đây là thứ giữ Sisyphus lăn đá.**
- **Tương thích Claude Code**: Command, Agent, Skill, MCP, Hook
- **MCP tuyển chọn**: Exa (Web Search), Context7 (Tài liệu real-time), Grep.app (Tìm kiếm code GitHub)
- **700+ Skill đi kèm**: Skill cấp chuyên gia, nạp trực tiếp từ `~/.opencode/skills/`

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
├── docs/                         # Tài liệu hướng dẫn
│   ├── configurations.md         # Tham chiếu config & ví dụ
│   └── guide/                    # Hướng dẫn cài đặt & tổng quan
├── profiles/                     # Template profile có sẵn
│   └── mike.json                 # Profile baseline chính
├── src/
│   ├── index.ts                  # Đăng ký plugin & kết nối hook OpenCode
│   ├── plugin-config.ts          # Nạp config (omo-cli.json)
│   ├── plugin-state.ts           # Trạng thái runtime (model cache, v.v.)
│   ├── agents/                   # 🧠 Định nghĩa Agent (10 agent)
│   │   ├── orchestrator.ts       # Sisyphus — nhạc trưởng chính
│   │   ├── worker.ts             # Sisyphus-Junior — worker song song
│   │   ├── coder-prompt.ts       # Prometheus — chuyên code
│   │   ├── explorer.ts           # Explorer — duyệt codebase
│   │   ├── researcher.ts         # Librarian — nghiên cứu chuyên sâu
│   │   ├── planner.ts            # Atlas — lập kế hoạch chiến lược
│   │   ├── advisor.ts            # Oracle — tư vấn kiến trúc
│   │   ├── reviewer.ts           # Momus — review code
│   │   ├── navigator.ts          # Navigator — phân công tác vụ
│   │   └── vision.ts             # Vision — phân tích đa phương tiện
│   ├── hooks/                    # 🪝 Hook vòng đời (35+)
│   │   ├── todo-continuation-enforcer.ts   # Giữ Sisyphus lăn đá
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
│   ├── features/                 # 📦 Module tính năng
│   │   ├── opencode-skill-loader/   # Nạp skill từ ~/.opencode/skills/
│   │   ├── builtin-skills/          # Skill chuyên gia đi kèm
│   │   ├── background-agent/        # Runtime agent nền
│   │   ├── tmux-subagent/           # Thực thi song song qua tmux
│   │   ├── context-injector/        # Inject context động
│   │   └── claude-code-*/           # Lớp tương thích Claude Code
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
| **Skill trong `~/.opencode/skills/`** | Thư mục skill gốc OpenCode — không dùng path cũ `.claude` hay `.agent` |
| **`bun link` cho dev** | `dist/cli/index.js` là bin target — rebuild là lệnh tự cập nhật |

---

## Hệ thống Profile

`omo-cli` sử dụng hệ thống **cài đặt hoàn toàn theo profile**. Quên mấy flag phức tạp. Mọi thứ được bao gói trực tiếp trong template profile `omo-cli.json`.

Mỗi profile là một vũ trụ độc lập. Dùng `omo-cli profile apply <tên>` để cập nhật workspace với ma trận hoàn chỉnh gồm cài đặt Agent, lựa chọn Model, và thẻ Feature được điều khiển bởi định nghĩa JSON của profile đó. Mọi thứ neo vào mô hình thư mục `.opencode`.

### Profile có sẵn

Profile `mike` là baseline chính:

| Tầng Agent | Vai trò | Model được chọn |
|-----------|---------|--------|
| 🧠 **Brain** | Sisyphus, Prometheus, Atlas, Oracle | Opus 4.6 Thinking |
| ⚡ **Worker** | Metis, Momus, Sisyphus-Junior | Sonnet 4.5 Thinking |
| 👁️ **Vision** | Multimodal-looker | Gemini 3 Pro Image |
| 🚀 **IO** | Explore, Librarian | Minimax M2.1 |

### Lệnh Profile

```bash
omo-cli profile list            # Liệt kê tất cả profile
omo-cli profile show            # Xem profile đang hoạt động
omo-cli profile apply mike      # Áp dụng profile
omo-cli profile create          # Tạo profile tùy chỉnh (tương tác)
```

---

## Kiến trúc Agent

Agent được chia thành **10 thực thể cụ thể** phục vụ trong **8 danh mục chức năng**.

### Chuỗi dự phòng (Fallback Chain)

Khi model gặp lỗi (timeout, rate limit, server lỗi), logic omo-cli tự động nhảy xuống chuỗi dự phòng:
```
Tầng Brain:   Opus 4.6 → Sonnet 4.5 → Gemini Pro → big-pickle
Tầng Worker:  Sonnet 4.5 → Gemini Pro → big-pickle
Tầng Vision:  Gemini Pro → Gemini Flash → big-pickle
Tầng IO:      Minimax M2.1 → Gemini Flash → big-pickle
```

---

## Định tuyến thông minh

Engine định tuyến sử dụng **BM25 keyword scoring** trên prompt để khớp tức thì đến đúng Agent và Sub-skill mà không cần chỉ dẫn từ người dùng. Bao phủ định tuyến phức tạp trên 12 loại tác vụ chức năng riêng biệt (Architecture vs DevOps vs Code-gen) và phát hiện 15+ ngôn ngữ lập trình trực tiếp từ luồng hướng dẫn.

---

## Thư viện Skill (700+)

`omo-cli` gắn kết thuần với triết lý OpenCode. **Hook legacy `.claude` và `.agent` đã bị loại bỏ hoàn toàn.**
Skill nạp trực tiếp và duy nhất từ `~/.opencode/skills/` và `./.opencode/skills/` trong dự án.

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
  --skills-mode <mode>  Chế độ nạp skill: bundled (626+ đi kèm) hoặc filesystem (mặc định)
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
  -a, --agent <tên>       Agent sử dụng (mặc định: Sisyphus)
  -d, --directory <path>  Thư mục làm việc
  -t, --timeout <ms>      Timeout tính bằng mili-giây (mặc định: 30 phút)

Ví dụ:
  omo-cli run "Sửa bug trong index.ts"
  omo-cli run --agent Sisyphus "Triển khai tính năng X"
  omo-cli run --timeout 3600000 "Tác vụ refactoring lớn"
```

Khác với `opencode run`, lệnh này chờ cho đến khi:
- Tất cả todo được hoàn thành hoặc hủy
- Tất cả session con (tác vụ nền) ở trạng thái idle

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
  -t, --target <path>       Thư mục đích (mặc định: ~/.agents/skills)
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
  -t, --target <path>   Thư mục đích (mặc định: ~/.agents/skills)

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

Lệnh này dùng kiến trúc Shadow Clone để fetch skill toàn cục mới nhất mà không làm hỏng git cache cục bộ. Tự động sửa YAML và loại bỏ trùng tên skill trước khi copy sang `~/.opencode/skills`.

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

## Được tin dùng bởi chuyên gia tại

- [Indent](https://indentcorp.com)
- [Google](https://google.com)
- [Microsoft](https://microsoft.com)

*Cảm ơn đặc biệt [@junhoyeo](https://github.com/junhoyeo) vì ảnh hero gốc.*
