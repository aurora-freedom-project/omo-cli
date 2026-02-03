# Resume AI - Hệ thống Tuyển dụng & Đánh giá Ứng viên Thông minh

Tài liệu này tổng hợp ý tưởng, kiến trúc và tính năng chi tiết để xây dựng một hệ thống quản lý tuyển dụng tương tự như Resume AI. Hệ thống tập trung vào việc áp dụng AI (Large Language Models) để tự động hóa và nâng cao chất lượng quy trình tuyển dụng.

## 1. Tổng quan Dự án

**Goal**: Xây dựng một nền tảng tuyển dụng all-in-one giúp kết nối ứng viên và nhà tuyển dụng một cách thông minh, khách quan và hiệu quả.

**Key Value Propositions**:
- **Tự động hóa**: Trích xuất thông tin CV, matching job description (JD) tự động.
- **AI Analytics**: Đánh giá chuyên sâu năng lực ứng viên dựa trên dữ liệu, không chỉ dựa trên keywords.
- **Interactive Interview**: Hỗ trợ phỏng vấn giả định hoặc gợi ý câu hỏi phỏng vấn sát thực tế.

## 2. Các Tính năng Cốt lõi (Core Features)

### 2.1. Phân hệ Ứng viên (Candidate Portal)
* **Smart CV Builder & Upload**:
    * Upload CV (PDF/Docx) -> Hệ thống tự động parse và điền vào profile.
    * AI gợi ý chỉnh sửa nội dung CV để tối ưu hóa cho từng vị trí ứng tuyển.
* **Job Matching**:
    * Nhận danh sách việc làm phù hợp (Recommendation) dựa trên kỹ năng, kinh nghiệm và mong muốn.
    * Xem điểm phù hợp (Match Score) chi tiết với từng JD.
* **Skill Gap Analysis**:
    * AI phân tích những kỹ năng còn thiếu so với thị trường/vị trí mong muốn và gợi ý lộ trình học tập.
* **Interview Practice**:
    * Phỏng vấn thử với AI Bot (Text/Voice), nhận feedback ngay lập tức về câu trả lời và thái độ.

### 2.2. Phân hệ Nhà tuyển dụng (HR/Recruiter Portal)
* **Smart JD Management**:
    * Tạo JD nhanh chóng với sự hỗ trợ của AI (Suggest requirements, responsibilities).
    * Phân tích JD để xác định các keyword trọng yếu.
* **CV Screening & Ranking**:
    * Tự động chấm điểm (Scoring) và xếp hạng hàng loạt hồ sơ.
    * **Semantic Search**: Tìm kiếm ứng viên theo ngữ nghĩa (ví dụ: "Tìm dev rành backend rust kinh nghiệm 3 năm") thay vì chỉ keyword match.
* **Detailed Assessment**:
    * AI tạo báo cáo đánh giá chi tiết từng ứng viên: Điểm mạnh, điểm yếu, rủi ro tiềm ẩn.
* **Interview Assistant**:
    * Gợi ý bộ câu hỏi phỏng vấn (Technical, Behavioral) được cá nhân hóa cho từng CV.
* **Dashboard & Analytics**:
    * Thống kê hiệu quả tuyển dụng, chất lượng nguồn ứng viên.

### 2.3. Phân hệ Quản trị (Admin)
* Quản lý người dùng, phân quyền (RBAC).
* Cấu hình các tham số AI, prompt templates.
* Giám sát hệ thống (System Health, AI Token usage).

## 3. Kiến trúc Kỹ thuật (Technical Architecture)

Hệ thống nên được xây dựng theo mô hình Microservices hoặc Modular Monolith để dễ dàng mở rộng và bảo trì.

### 3.1. Tech Stack Đề xuất
* **Backend Core**: Sử dụng ngôn ngữ hiệu năng cao, type-safe.
    * **Rust (Axum/Actix)**: Cho performance, safety và concurrency cao. Xử lý business logic chính, API Gateway.
* **AI Service**: Tách biệt để dễ dàng tích hợp các thư viện Python AI.
    * **Python (FastAPI)**: Xử lý các tác vụ NLP, gọi LLM, xử lý hình ảnh/PDF.
* **Database**:
    * **SurrealDB**: Multi-model database (Document + Graph), cực kỳ mạnh mẽ cho việc lưu trữ quan hệ phức tạp giữa Candidate - Skill - Job và thực hiện các query graph deep link.
* **Caching & Queue**:
    * **Dragonfly (Redis compatible)**: Caching session, job queue cho các tác vụ AI tốn thời gian.
* **Frontend**:
    * **Flutter Web** (hoặc React/Next.js): Xây dựng giao diện app-like, trải nghiệm mượt mà.
* **Authentication**:
    * **Ory Kratos & Hydra**: Giải pháp Identity & Access Management (IAM) cloud-native, bảo mật cao.

### 3.2. AI Architecture (Hybrid Approach)
Sử dụng chiến lược **Smart Router** để tối ưu chi phí và hiệu năng:

* **Router Layer**: Một model nhỏ hoặc logic code để phân loại request.
* **Local Models (Ollama Local)**:
    * Chạy các model nhỏ (ví dụ: Gemma, Llama 3 8B, Phi-3).
    * **Task**: Trích xuất thông tin đơn giản (Entity Extraction), Function Calling, PII Redaction (che thông tin nhạy cảm).
    * **Ưu điểm**: Nhanh, miễn phí, bảo mật dữ liệu cao.
* **Cloud Models (Ollama Cloud / OpenAI / Anthropic)**:
    * Chạy các model lớn (ví dụ: Qwen, GPT-4, Claude 3.5 Sonnet).
    * **Task**: Suy luận phức tạp (Complex Reasoning), Đánh giá chuyên sâu (Assessment), Tóm tắt văn bản dài, Tạo câu hỏi phỏng vấn.
    * **Ưu điểm**: Thông minh, hiểu ngữ cảnh tốt.

## 4. Luồng Dữ liệu (Data Flow) - Ví dụ: Xử lý CV

1.  **Upload**: User upload PDF -> Backend lưu file -> Gửi event "CV_UPLOADED" vào Queue.
2.  **Processing (AI Service)**:
    *   Worker nhận job -> Dùng thư viện (như `lopdf`) extract text thô.
    *   **Step 1 (Local AI)**: Gọi Local LLM để trích xuất JSON structured data (Tên, Email, Skills, Experience, Education).
    *   **Step 2 (Store)**: Lưu Structured Data vào SurrealDB.
    *   **Step 3 (Cloud AI)**: Gọi Cloud LLM để phân tích điểm mạnh/yếu và tóm tắt profile.
    *   **Step 4 (Embedding)**: Tạo Vector Embedding cho nội dung CV để phục vụ Semantic Search.
3.  **Completion**: Notify cho User/HR là CV đã sẵn sàng.

## 5. Cấu trúc Database (SurrealDB Schema Idea)

*   `candidate`: Lưu thông tin cá nhân.
*   `job`: Lưu thông tin JD.
*   `skill`: Danh mục kỹ năng chuẩn hóa.
*   `application`: Quan hệ Edge nối giữa `candidate` và `job`, chứa thuộc tính `match_score`, `status`, `ai_assessment`.
*   Vectors: Lưu trực tiếp embedding vector trong record `candidate` hoặc `job` để query KNN search.

## 6. Hạ tầng & Triển khai (Infrastructure)

*   **Containerization**: Docker hóa toàn bộ services.
*   **Orchestration**: Docker Compose (Dev) hoặc K8s (Prod).
*   **Monitoring**: Prometheus + Grafana để theo dõi metrics hệ thống và AI performance.

## 7. Roadmap & Mở rộng
*   **LinkedIn Integration**: Extension để import profile từ LinkedIn.
*   **Video Interview Analysis**: Phân tích cảm xúc, tone giọng trong video phỏng vấn (sử dụng Vision/Audio models).
*   **Blind Hiring Mode**: Chế độ ẩn danh tính ứng viên để giảm thiểu thiên kiến tuyển dụng.
*   **Multi-language Support**: Hỗ trợ đa ngôn ngữ cho các thị trường global.

---

# Hướng dẫn Sử dụng Oh-My-OpenCode cho Project Resume AI

Đây là project phức tạp với nhiều layers (Rust + Python + Flutter + SurrealDB). Oh-My-OpenCode sẽ giúp bạn xây dựng hiệu quả nhờ multi-agent orchestration.

---

## 🚀 Step 1: Chuẩn bị Project

### 1.1 Tạo thư mục project
```bash
mkdir resume-ai && cd resume-ai
git init
```

### 1.2 Tạo file planning
```bash
mkdir -p .sisyphus/plans
```

Tạo file `.sisyphus/plans/resume-ai.md` với nội dung spec (phần trên).

---

## 🎯 Step 2: Sử dụng đúng Agents

### Tier System (Mike's Full Setup)

| Khi nào | Dùng Agent nào | Cách gọi |
|---------|----------------|----------|
| **Lên kế hoạch** | Prometheus (Opus 4.5) | `@prometheus Phân tích spec và tạo task breakdown` |
| **Thiết kế kiến trúc** | Oracle (Opus 4.5) | `@oracle Review architecture choices cho Rust + Python + Flutter` |
| **Code Rust backend** | Sisyphus (Opus 4.5) | `ulw Implement Rust API với Axum` |
| **Code Python AI** | Sisyphus (Opus 4.5) | `ulw Implement AI service với FastAPI` |
| **Tìm docs/examples** | Librarian (Minimax) | `@librarian Tìm cách integrate SurrealDB với Rust` |
| **Explore codebase** | Explore (Minimax) | `@explore Tìm các file liên quan đến authentication` |
| **UI/Frontend** | Multimodal-looker (Gemini) | `@multimodal-looker Analyze this UI mockup` |

---

## 📋 Step 3: Flow làm việc hiệu quả

### 3.1 Bắt đầu với Planning

```
@prometheus

Đọc spec tại .sisyphus/plans/resume-ai.md và tạo task breakdown chi tiết.

Chia thành các phases:
1. Phase 1: Setup & Infrastructure
2. Phase 2: Backend Core (Rust)
3. Phase 3: AI Service (Python)
4. Phase 4: Frontend (Flutter Web)
5. Phase 5: Integration & Testing

Output: .sisyphus/plans/resume-ai-tasks.md
```

### 3.2 Dùng `ultrawork` (ulw) để auto-orchestrate

```
ulw

Implement Phase 1: Setup infrastructure cho Resume AI

Yêu cầu:
1. Docker Compose với SurrealDB, Dragonfly, Ory Kratos
2. Rust project với Axum scaffold
3. Python project với FastAPI scaffold
4. Shared proto/API contracts

File kế hoạch: .sisyphus/plans/resume-ai-tasks.md
```

**`ulw` keyword sẽ kích hoạt Sisyphus chạy đến khi xong, tự động:**
- Gọi Librarian để tìm docs
- Gọi Explore để scan codebase
- Delegate tasks song song
- Verify với build/test

### 3.3 Gọi chuyên gia khi cần

```
@oracle

Review cấu trúc database SurrealDB cho Resume AI:
- candidate, job, skill, application tables
- Vector embeddings cho semantic search
- Graph relations

Đề xuất schema tối ưu.
```

```
@librarian

Tìm examples về:
1. Axum + SurrealDB integration
2. FastAPI + Ollama embedding
3. Flutter Web + gRPC

Chú ý performance và production-ready patterns.
```

---

## 🔑 Magic Keywords

| Keyword | Tác dụng |
|---------|----------|
| `ulw` / `ultrawork` | Sisyphus làm đến khi xong, không dừng giữa chừng |
| `ultrathink` | Thinking mode sâu hơn cho complex decisions |
| `@agent-name` | Gọi trực tiếp agent cụ thể |

---

## 📁 Project Structure Gợi ý

```
resume-ai/
├── .sisyphus/
│   ├── plans/           # Task plans
│   └── notepads/        # AI learnings per plan
├── docker/
│   └── docker-compose.yml
├── backend-rust/        # Axum API
│   ├── src/
│   └── Cargo.toml
├── ai-service/          # FastAPI + LLM
│   ├── src/
│   └── pyproject.toml
├── frontend/            # Flutter Web
│   └── lib/
└── README.md
```

---

## 💡 Pro Tips

1. **Đặt plan trước, code sau**: Luôn tạo `.sisyphus/plans/` trước khi code
2. **Dùng `ulw` cho tasks lớn**: Sisyphus sẽ tự chia nhỏ và orchestrate
3. **Dùng `@librarian` cho unfamiliar tech**: Nó tìm docs rất nhanh (Minimax M2.1)
4. **Verify liên tục**: Oh-My-OpenCode tự chạy lsp_diagnostics và tests sau mỗi thay đổi
