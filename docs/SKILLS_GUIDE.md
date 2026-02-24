# 🎯 Hướng Dẫn Skills - omo-cli

## Mục Lục
- [Skills là gì?](#skills-là-gì)
- [Sơ đồ luồng hoạt động](#sơ-đồ-luồng-hoạt-động)
- [Cách sử dụng Skills](#cách-sử-dụng-skills)
- [Phân loại Skills](#phân-loại-skills)
- [Danh sách đầy đủ (579 skills)](#danh-sách-đầy-đủ-579-skills)

---

## Skills là gì?

**Skills** là các mẫu hướng dẫn AI có thể tái sử dụng, giúp nâng cao khả năng của trợ lý lập trình AI. Mỗi skill chứa:

```yaml
---
name: api-design-principles
description: Thiết kế REST và GraphQL API chuyên nghiệp...
agents:              # Agent nào của OMO có thể dùng skill này
  - prometheus
  - sisyphus
category: architecture
complexity: low
tier: 2
---

# Nội dung hướng dẫn
Khi thiết kế API...
```

---

## Sơ đồ luồng hoạt động

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        KHÁM PHÁ SKILLS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │  ~/.claude/     │    │  ~/.config/     │    │  ~/.agent/      │     │
│  │  skills/        │    │  opencode/      │    │  skills/        │     │
│  │                 │    │  skills/        │    │                 │     │
│  │ (Claude Code)   │    │ (OpenCode)      │    │ (DÙNG CHUNG)    │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│           └──────────────────────┼──────────────────────┘               │
│                                  │                                      │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                         │
│                    │   discoverAllSkills()   │                         │
│                    │   ────────────────────  │                         │
│                    │   Tải 579 skills        │                         │
│                    └───────────┬─────────────┘                         │
│                                │                                        │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         GỌI SKILL                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ INPUT TỪ NGƯỜI DÙNG                                              │   │
│   │ ─────────────────────────────────────────────────────────────── │   │
│   │                                                                  │   │
│   │  Cách 1: Lệnh Slash                                              │   │
│   │  ┌──────────────────────────────────────────────────────────┐   │   │
│   │  │ > /api-design-principles Thiết kế REST API cho e-commerce│   │   │
│   │  └──────────────────────────────────────────────────────────┘   │   │
│   │                                                                  │   │
│   │  Cách 2: Ngôn ngữ tự nhiên (Tự động phát hiện)                  │   │
│   │  ┌──────────────────────────────────────────────────────────┐   │   │
│   │  │ > Giúp tôi thiết kế REST API cho quản lý user            │   │   │
│   │  │   ^-- từ khóa "API" kích hoạt skill api-design-principles│   │   │
│   │  └──────────────────────────────────────────────────────────┘   │   │
│   │                                                                  │   │
│   │  Cách 3: Agent tự động ủy quyền                                  │   │
│   │  ┌──────────────────────────────────────────────────────────┐   │   │
│   │  │ Agent Prometheus tự động tải skills phù hợp dựa trên     │   │   │
│   │  │ phân tích category và độ phức tạp của task               │   │   │
│   │  └──────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        THỰC THI SKILL                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────┐ │
│   │  Tải Skill   │───▶│  Inject vào  │───▶│  AI phản hồi với        │ │
│   │  Template    │    │  System      │    │  kiến thức từ Skill     │ │
│   │              │    │  Prompt      │    │                         │ │
│   └──────────────┘    └──────────────┘    └──────────────────────────┘ │
│                                                                         │
│   Ví dụ: /api-design-principles                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ System Prompt + Skill Template:                                  │   │
│   │ ─────────────────────────────────────────────────────────────── │   │
│   │ "Khi thiết kế API, bạn PHẢI:                                    │   │
│   │  1. Xác định consumers, use cases, và constraints               │   │
│   │  2. Chọn API style và model resources                           │   │
│   │  3. Định nghĩa errors, versioning, pagination..."               │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Cách sử dụng Skills

### OpenCode CLI

```bash
# Liệt kê skills có sẵn
opencode /skills

# Dùng skill qua lệnh slash
opencode
> /typescript-best-practices Xem lại code này

# Skills tự động tải theo context
> Giúp tôi viết unit tests
# ^-- tự động tải: test-driven-development, testing-patterns
```

### Claude Code CLI

```bash
# Tương tự - skills trong ~/.agents/skills/ hoạt động cho cả hai
claude
> /api-design-principles

# Hoặc ngôn ngữ tự nhiên
> Thiết kế GraphQL schema cho blog
# ^-- tự động phát hiện và tải: graphql, api-design-principles
```

---

## Phân loại Skills

| Loại | Số lượng | Mô tả |
|------|----------|-------|
| **architecture** | 87 | Thiết kế hệ thống, patterns, microservices |
| **testing** | 45 | TDD, unit testing, integration tests |
| **frontend** | 52 | React, Vue, UI/UX, CSS |
| **backend** | 38 | APIs, databases, servers |
| **devops** | 41 | CI/CD, Docker, Kubernetes |
| **security** | 35 | Pen testing, OWASP, compliance |
| **ai-ml** | 28 | LLM, ML ops, prompt engineering |
| **performance** | 22 | Tối ưu hóa, profiling |
| **documentation** | 18 | API docs, tutorials |
| **workflow** | 15 | Tự động hóa, productivity |
| **general** | 198 | Các skills chuyên biệt khác |

---

## Danh sách đầy đủ (579 skills)

### A (50 skills)
| Skill | Loại | Mô tả |
|-------|------|-------|
| `3d-web-experience` | frontend | Trải nghiệm 3D web với Three.js |
| `ab-test-setup` | testing | Patterns thiết lập A/B testing |
| `accessibility-compliance-accessibility-audit` | frontend | Kiểm tra WCAG accessibility |
| `address-github-comments` | workflow | Xử lý comments trên GitHub PR |
| `agent-evaluation` | ai-ml | Patterns đánh giá AI agent |
| `agent-manager-skill` | ai-ml | Quản lý multi-agent |
| `agent-memory-mcp` | ai-ml | Tích hợp MCP memory |
| `agent-memory-systems` | ai-ml | Kiến trúc memory cho agent |
| `agent-orchestration-improve-agent` | ai-ml | Patterns cải thiện agent |
| `agent-orchestration-multi-agent-optimize` | ai-ml | Tối ưu multi-agent |
| `agent-tool-builder` | ai-ml | Xây dựng tools cho AI agent |
| `ai-agents-architect` | architecture | Thiết kế hệ thống AI agent |
| `ai-engineer` | ai-ml | Best practices AI engineering |
| `ai-product` | ai-ml | Phát triển sản phẩm AI |
| `ai-wrapper-product` | ai-ml | Thiết kế AI wrapper product |
| `airflow-dag-patterns` | devops | Apache Airflow DAG patterns |
| `algolia-search` | backend | Tích hợp Algolia search |
| `algorithmic-art` | frontend | Generative art patterns |
| `analytics-tracking` | frontend | Triển khai analytics |
| `angular-migration` | frontend | Hướng dẫn migration Angular |
| `anti-reversing-techniques` | security | Kỹ thuật chống reverse engineering |
| `api-design-principles` | architecture | Thiết kế REST/GraphQL API |
| `api-documentation-generator` | documentation | Tạo API docs |
| `api-documenter` | documentation | Viết tài liệu API |
| `api-fuzzing-bug-bounty` | security | Kỹ thuật API fuzzing |
| `api-patterns` | architecture | API design patterns |
| `api-security-best-practices` | security | Best practices bảo mật API |
| `api-testing-observability-api-mock` | testing | API mocking |
| `app-builder` | frontend | Patterns phát triển app |
| `app-store-optimization` | workflow | Chiến lược ASO |
| `application-performance-performance-optimization` | performance | Hiệu năng app |
| `architect-review` | architecture | Review kiến trúc |
| `architecture` | architecture | Kiến trúc phần mềm |
| `architecture-decision-records` | documentation | ADR patterns |
| `architecture-patterns` | architecture | Design patterns |
| `arm-cortex-expert` | backend | Phát triển ARM |
| `async-python-patterns` | backend | Python async patterns |
| `attack-tree-construction` | security | Phân tích attack tree |
| `auth-implementation-patterns` | security | Triển khai authentication |
| `automate-whatsapp` | workflow | Tự động hóa WhatsApp |
| `autonomous-agent-patterns` | ai-ml | Autonomous AI agents |
| `autonomous-agents` | ai-ml | Agent autonomy |
| `avalonia-layout-zafiro` | frontend | Avalonia layouts |
| `avalonia-viewmodels-zafiro` | frontend | Avalonia VMs |
| `avalonia-zafiro-development` | frontend | Avalonia dev |
| `aws-serverless` | devops | AWS serverless |
| `aws-skills` | devops | AWS best practices |
| `azure-functions` | devops | Azure Functions |
| `backend-architect` | architecture | Kiến trúc backend |
| `backend-dev-guidelines` | backend | Hướng dẫn backend |

### B-C (48 skills)
| Skill | Loại |
|-------|------|
| `bash-linux` | devops |
| `blockrun` | devops |
| `c4-code` | architecture |
| `canvas-design` | frontend |
| `cc-skill-continuous-learning` | ai-ml |
| `claude-ally-health` | frontend |
| `claude-scientific-skills` | ai-ml |
| `claude-speed-reader` | workflow |
| `code-refactoring-context-restore` | architecture |
| `create-pr` | workflow |

### D-F (65 skills)
| Skill | Loại |
|-------|------|
| `data-engineer` | architecture |
| `data-engineering-data-pipeline` | architecture |
| `debugging-strategies` | architecture |
| `dependency-upgrade` | devops |
| `deployment-pipeline-design` | devops |
| `deployment-procedures` | devops |
| `design-md` | documentation |
| `docker-expert` | devops |
| `email-sequence` | workflow |
| `fal-platform` | devops |
| `fal-upscale` | ai-ml |
| `ffuf-claude-skill` | security |
| `firecrawl-scraper` | devops |
| `fix-review` | workflow |
| `flutter-expert` | frontend |
| `form-cro` | frontend |
| `fp-ts-errors` | backend |
| `fp-ts-pragmatic` | backend |
| `fp-ts-react` | frontend |
| `framework-migration-*` | devops |
| `free-tool-strategy` | workflow |
| `frontend-design` | frontend |
| `frontend-dev-guidelines` | frontend |
| `frontend-developer` | frontend |
| `full-stack-orchestration-*` | architecture |

### G-L (85 skills)
| Nhóm | Skills |
|------|--------|
| Git/GitHub | `git-advanced-workflows`, `git-pr-workflows-*`, `git-pushing`, `github-actions-templates`, `gitlab-ci-patterns` |
| Go | `go-concurrency-patterns`, `golang-pro` |
| Game Dev | `game-development`, `godot-gdscript-patterns`, `unity-*`, `unreal-engine-cpp-pro` |
| GraphQL | `graphql` |
| Kubernetes | `k8s-manifest-generator`, `k8s-security-policies`, `kubernetes-architect` |
| LLM/AI | `langchain-architecture`, `langfuse`, `llm-application-dev-*` |

### M-P (92 skills)
| Nhóm | Skills |
|------|--------|
| Machine Learning | `machine-learning-ops-ml-pipeline`, `ml-engineer`, `ml-pipeline-workflow`, `mlops-engineer` |
| Microservices | `microservices-patterns`, `service-mesh-*` |
| Payment | `payment-integration`, `paypal-integration`, `stripe-integration` |
| Performance | `performance-engineer`, `performance-profiling`, `performance-testing-*` |
| Python | `python-*` (12 skills) |
| Postgres | `postgres-best-practices`, `postgresql`, `neon-postgres` |
| Prompt | `prompt-*` (5 skills) |

### R-S (128 skills)
| Nhóm | Skills |
|------|--------|
| React | `react-best-practices`, `react-modernization`, `react-native-architecture`, `react-patterns`, `react-state-management`, `react-ui-patterns` |
| Security | `security-*` (15 skills), `sast-configuration`, `sql-injection-testing`, `top-web-vulnerabilities` |
| SEO | `seo-*` (12 skills) |
| Startup | `startup-*` (6 skills) |

### T-Z (111 skills)
| Nhóm | Skills |
|------|--------|
| Testing | `tdd-*` (6 skills), `test-*` (4 skills), `testing-patterns` |
| TypeScript | `typescript-advanced-types`, `typescript-expert`, `typescript-pro` |
| Terraform | `terraform-*` (3 skills) |
| Voice AI | `voice-*` (3 skills) |
| Web | `web-*` (4 skills) |
| Workflow | `workflow-*` (3 skills) |

---

## Ánh xạ Agent-Skill

Skills tự động có sẵn cho các agent OMO tương ứng:

```
┌─────────────────────────────────────────────────────────────────┐
│                   BẢN ĐỒ AGENT-SKILL OMO                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Prometheus  │──▶ architecture, ai-ml, planning               │
│  │  (Lập kế     │    159 skills                                  │
│  │   hoạch)     │                                                │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Sisyphus    │──▶ backend, devops, testing, đa năng           │
│  │  (Thực thi)  │    312 skills                                  │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Oracle      │──▶ security, performance, phân tích            │
│  │  (Phân tích) │    87 skills                                   │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Librarian   │──▶ documentation, nghiên cứu                   │
│  │  (Tài liệu)  │    45 skills                                   │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Atlas       │──▶ workflow, tự động hóa                       │
│  │  (Quy trình) │    98 skills                                   │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────┐                                                │
│  │  Momus       │──▶ testing, chất lượng                         │
│  │  (Kiểm thử)  │    67 skills                                   │
│  └──────────────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quản lý Skills

```bash
# Cài đặt tất cả skills (max tier 3)
bun run src/cli/index.ts adapt-skills --max-tier 3

# Kiểm tra số skills đã cài
ls ~/.agents/skills/ | wc -l

# Xem chi tiết một skill
cat ~/.agents/skills/api-design-principles/SKILL.md
```

---

## Tạo Skill tùy chỉnh

Tạo file `~/.agents/skills/my-skill/SKILL.md`:

```yaml
---
name: my-custom-skill
description: Skill tùy chỉnh của tôi cho XYZ
agents:
  - sisyphus
  - prometheus
category: backend
complexity: medium
tier: 1
---

# Skill Tùy Chỉnh Của Tôi

Hướng dẫn cho AI...
```

Skill sẽ được tự động phát hiện và có sẵn trong cả OpenCode và Claude Code CLI.

---

## Tóm tắt

| Thông tin | Giá trị |
|-----------|---------|
| Tổng số skills | **579** |
| Thư mục chung | `~/.agents/skills/` |
| CLI hỗ trợ | OpenCode, Claude Code |
| Cách gọi | Slash command, ngôn ngữ tự nhiên, agent delegation |
| Categories | 11 loại chính |
| Agents | 6 agents OMO |
