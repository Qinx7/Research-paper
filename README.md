
```markdown
# Literature-driven Graduate Research Agent

> 文献驱动型研究生科研设计与成果生成 Agent

本项目旨在构建一个面向研究生科研全过程的智能 Agent 系统。系统可以根据用户提供的研究需求，自动检索和分析相关文献，发现研究热点与研究空白，提出可研究方向，并进一步完成项目设计、开题报告生成、开题 PPT 生成。后续还可根据用户上传的项目成果、实验数据或系统实现材料，辅助生成论文和毕业答辩 PPT。

---

## 1. 项目简介

研究生在科研初期通常会遇到以下问题：

- 不知道自己的研究兴趣可以转化为什么课题；
- 不知道如何查找和筛选高质量文献；
- 不知道如何从文献中发现研究空白；
- 不知道如何设计一个可以开题的研究项目；
- 不知道如何撰写开题报告和制作开题 PPT；
- 后续完成项目后，不知道如何整理成果并撰写论文。

本项目希望通过大语言模型、文献检索、RAG、Agent 工作流和文档生成技术，构建一个完整的科研辅助平台。

核心流程如下：

```text
用户输入研究需求
↓
自动检索相关文献
↓
分析研究现状、热点与不足
↓
提出多个可研究方向
↓
评估方向的创新性与可行性
↓
用户选择研究方向
↓
生成项目设计
↓
生成开题报告
↓
生成开题 PPT
↓
用户后续上传项目成果或实验数据
↓
生成论文
↓
生成毕业答辩 PPT
```

---

## 2. 项目定位

本系统不是简单的论文写作工具，而是一个：

> 文献驱动的研究生科研选题、项目设计、开题报告、开题 PPT、论文与答辩 PPT 生成平台。

系统重点关注：

- 文献真实性；
- 研究方向可行性；
- 开题材料规范性；
- 项目设计完整性；
- 后续论文与成果的可追溯性。

---

## 3. 核心功能

### 3.1 研究需求理解

用户可以输入模糊研究需求，例如：

```text
我是教育技术专业研究生，想研究大语言模型在高校教学中的应用，希望能做一个系统，并用于毕业论文和开题答辩。
```

系统会自动识别：

- 研究领域；
- 核心技术；
- 应用场景；
- 可能研究对象；
- 可能研究方法；
- 适合成果形式。

---

### 3.2 文献检索

系统根据用户需求自动生成中文关键词、英文关键词和布尔检索式，并调用多个文献数据库进行检索。

支持的数据源包括：

- OpenAlex
- Semantic Scholar
- Crossref
- arXiv
- PubMed
- Zotero API
- 其他可扩展文献源

示例检索式：

```text
("large language model" OR "LLM" OR "ChatGPT" OR "generative AI")
AND
("higher education" OR "university teaching" OR "educational chatbot")
AND
("retrieval augmented generation" OR "RAG" OR "personalized learning")
```

---

### 3.3 文献筛选与分析

系统会对检索到的文献进行筛选和排序。

筛选维度包括：

- 主题相关性；
- 发表年份；
- 引用量；
- 期刊或会议质量；
- 是否具有系统设计；
- 是否具有实验数据；
- 是否能支撑开题；
- 是否能体现研究空白。

系统可以输出：

- 单篇文献总结；
- 多篇文献对比表；
- 研究现状总结；
- 研究热点分析；
- 研究不足提取；
- 可借鉴内容分析。

---

### 3.4 研究方向推荐

系统根据文献分析结果，生成多个可研究方向。

每个方向包括：

- 研究题目；
- 研究背景；
- 研究问题；
- 研究目标；
- 研究内容；
- 研究方法；
- 数据来源；
- 预期成果；
- 创新点；
- 可行性分析；
- 风险分析；
- 适合论文类型。

示例方向：

```text
基于 RAG 的高校课程智能问答系统设计与应用研究
```

---

### 3.5 研究方向评分

系统会对每个研究方向进行评分，帮助用户选择最适合自己的课题。

评分维度包括：

| 维度 | 说明 |
|---|---|
| 文献基础 | 是否有足够相关文献支撑 |
| 创新性 | 是否存在明确创新点 |
| 可行性 | 是否能在研究生周期内完成 |
| 数据可获得性 | 是否容易获取数据 |
| 技术难度 | 是否符合用户能力 |
| 论文写作价值 | 是否容易形成完整论文 |
| 开题通过率 | 是否适合作为开题题目 |
| 成果展示性 | 是否适合 PPT 展示 |

---

### 3.6 项目设计生成

用户选择研究方向后，系统会自动生成完整项目设计。

项目设计内容包括：

```text
1. 课题名称
2. 研究背景
3. 研究意义
4. 国内外研究现状
5. 当前研究不足
6. 研究目标
7. 研究问题
8. 研究内容
9. 研究方法
10. 技术路线
11. 系统架构
12. 实验设计
13. 数据来源
14. 评价指标
15. 创新点
16. 可行性分析
17. 研究计划
18. 预期成果
19. 参考文献
```

---

### 3.7 开题报告生成

系统可以根据文献分析和项目设计生成开题报告。

开题报告结构：

```text
一、选题背景与研究意义
二、国内外研究现状
三、现有研究不足
四、研究问题与研究目标
五、研究内容
六、研究方法
七、技术路线
八、创新点
九、可行性分析
十、研究计划
十一、预期成果
十二、参考文献
```

---

### 3.8 开题 PPT 生成

系统可以自动生成开题 PPT。

推荐结构：

```text
1. 题目页
2. 研究背景
3. 研究意义
4. 国内外研究现状
5. 当前研究不足
6. 研究问题
7. 研究目标
8. 研究内容
9. 研究方法
10. 技术路线
11. 系统设计 / 实验设计
12. 创新点
13. 可行性分析
14. 研究计划
15. 预期成果
16. 参考文献
17. 致谢
```

每页 PPT 支持生成：

- 页面标题；
- 页面要点；
- 图表建议；
- 技术路线图；
- 演讲稿；
- 引用来源。

---

### 3.9 项目成果管理

当用户后续开始实施课题后，系统可以管理项目成果。

支持管理：

- 系统原型；
- 实验数据；
- 问卷数据；
- 模型输出；
- 代码文件；
- 系统截图；
- 图表；
- 测试问题集；
- 用户访谈材料；
- 实验记录；
- 阶段性报告。

---

### 3.10 论文与答辩 PPT 生成

在用户上传真实项目成果后，系统可以辅助生成：

- 毕业论文大纲；
- 论文章节内容；
- 实验设计；
- 结果分析；
- 创新点总结；
- 毕业答辩 PPT；
- 答辩演讲稿；
- 答辩问题预测。

注意：

> 论文阶段必须基于真实成果、真实数据和真实实验结果，系统不得编造实验结果。

---

## 4. 系统架构

总体架构如下：

```text
前端界面
    ↓
后端 API 服务
    ↓
Agent 调度层
    ↓
文献检索 / 文献分析 / 方向生成 / 项目设计 / PPT 生成工具
    ↓
数据库 / 向量库 / 文件存储 / 外部文献 API
```

功能架构：

```text
前端界面
├── 项目管理
├── 研究需求输入
├── 文献检索结果
├── 文献分析面板
├── 研究方向推荐
├── 项目设计编辑器
├── 开题报告生成器
├── 开题 PPT 生成器
├── 项目成果管理
├── 论文写作编辑器
└── 答辩 PPT 生成器

后端服务
├── 用户服务
├── 项目服务
├── 文献检索服务
├── 文献解析服务
├── RAG 服务
├── 研究方向生成服务
├── 项目设计服务
├── 文档生成服务
├── PPT 生成服务
└── 文件存储服务

Agent 层
├── Requirement Agent
├── Literature Search Agent
├── Literature Review Agent
├── Research Gap Agent
├── Research Direction Agent
├── Project Design Agent
├── Proposal Agent
├── Outcome Agent
├── Paper Writing Agent
└── Defense PPT Agent

数据层
├── PostgreSQL
├── pgvector / Qdrant
├── Redis
├── MinIO
└── Elasticsearch / OpenSearch
```

---

## 5. 技术栈

### 5.1 前端

推荐技术：

```text
Next.js + TypeScript + Tailwind CSS + Shadcn UI
```

可选组件：

| 功能 | 技术 |
|---|---|
| 文献列表 | TanStack Table / AG Grid |
| PDF 预览 | PDF.js |
| Markdown 编辑 | MDXEditor |
| 富文本编辑 | Tiptap |
| 图表展示 | ECharts / Plotly |
| 技术路线图 | Mermaid |
| 文件上传 | Uppy |
| 实时任务进度 | SSE / WebSocket |

---

### 5.2 后端

推荐技术：

```text
FastAPI + Python + SQLAlchemy + Pydantic
```

配套技术：

| 功能 | 技术 |
|---|---|
| API 服务 | FastAPI |
| ORM | SQLAlchemy |
| 数据校验 | Pydantic |
| 异步任务 | Celery / Dramatiq |
| 缓存 | Redis |
| 认证 | JWT / OAuth2 |
| 后台任务监控 | Flower |

---

### 5.3 数据库与存储

推荐组合：

```text
PostgreSQL + pgvector + Redis + MinIO
```

| 用途 | 技术 |
|---|---|
| 用户、项目、文献元数据 | PostgreSQL |
| 文献向量检索 | pgvector / Qdrant |
| 缓存和任务状态 | Redis |
| PDF、Word、PPT 文件存储 | MinIO |
| 全文检索 | Elasticsearch / OpenSearch |

---

### 5.4 文献检索与解析

```text
OpenAlex API
Semantic Scholar API
Crossref API
arXiv API
PubMed API
Zotero API
GROBID
PyMuPDF
pdfplumber
PaddleOCR
```

---

### 5.5 Agent 框架

推荐：

```text
LangGraph + LlamaIndex
```

说明：

- LangGraph：适合控制多阶段 Agent 工作流；
- LlamaIndex：适合构建文献知识库和 RAG；
- 二者结合适合实现“需求 → 文献 → 方向 → 设计 → PPT/论文”的流程。

---

### 5.6 大模型

可采用多模型路由：

```text
GPT-4.1 / GPT-4o
Claude
Gemini
Qwen
DeepSeek
```

Embedding 模型：

```text
bge-m3
text-embedding-3-large
jina-embeddings
```

Rerank 模型：

```text
bge-reranker-large
Cohere Rerank
Jina Reranker
```

---

### 5.7 文档与 PPT 生成

```text
python-docx
Pandoc
Quarto
python-pptx
PptxGenJS
Mermaid
LibreOffice Headless
```

---

## 6. 推荐目录结构

```text
literature-driven-research-agent/
├── README.md
├── docker-compose.yml
├── .env.example
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── DATABASE.md
│   └── ROADMAP.md
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   └── styles/
│   └── public/
├── backend/
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── agents/
│   │   ├── tasks/
│   │   └── utils/
│   └── tests/
├── agent/
│   ├── graphs/
│   ├── prompts/
│   ├── tools/
│   └── workflows/
├── scripts/
│   ├── init_db.py
│   └── seed_data.py
└── storage/
    ├── uploads/
    ├── generated/
    └── temp/
```

---

## 7. 环境变量

创建 `.env` 文件：

```env
# Application
APP_NAME=LiteratureDrivenResearchAgent
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/research_agent

# Redis
REDIS_URL=redis://localhost:6379/0

# MinIO
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=research-agent

# LLM Provider
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
QWEN_API_KEY=your_qwen_api_key

# Embedding
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-large

# Literature APIs
SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_key
CROSSREF_MAILTO=your_email@example.com

# Security
JWT_SECRET_KEY=your_jwt_secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

---

## 8. 快速启动

### 8.1 克隆项目

```bash
git clone https://github.com/your-username/literature-driven-research-agent.git
cd literature-driven-research-agent
```

---

### 8.2 启动基础服务

```bash
docker compose up -d postgres redis minio
```

---

### 8.3 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate

pip install -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

后端接口地址：

```text
http://localhost:8000
```

API 文档地址：

```text
http://localhost:8000/docs
```

---

### 8.4 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端访问地址：

```text
http://localhost:3000
```

---

## 9. Docker Compose 示例

```yaml
version: "3.9"

services:
  postgres:
    image: ankane/pgvector:latest
    container_name: research_agent_postgres
    environment:
      POSTGRES_DB: research_agent
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    container_name: research_agent_redis
    ports:
      - "6379:6379"

  minio:
    image: minio/minio
    container_name: research_agent_minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  minio_data:
```

---

## 10. 核心 API 示例

### 10.1 创建项目

```http
POST /api/projects
```

```json
{
  "name": "大语言模型在高校教学中的应用研究",
  "research_field": "教育技术",
  "user_requirement": "希望研究大语言模型在高校教学中的应用，并生成开题 PPT"
}
```

---

### 10.2 生成检索关键词

```http
POST /api/literature/keywords
```

```json
{
  "project_id": "project_001",
  "requirement": "研究大语言模型在高校教学中的应用"
}
```

---

### 10.3 文献检索

```http
POST /api/literature/search
```

```json
{
  "project_id": "project_001",
  "query": "large language models in higher education",
  "year_from": 2020,
  "year_to": 2026,
  "sources": ["openalex", "semantic_scholar", "crossref"]
}
```

---

### 10.4 生成研究方向

```http
POST /api/research/directions
```

```json
{
  "project_id": "project_001",
  "paper_ids": ["paper_001", "paper_002", "paper_003"]
}
```

---

### 10.5 生成项目设计

```http
POST /api/research/design
```

```json
{
  "project_id": "project_001",
  "direction_id": "direction_001"
}
```

---

### 10.6 生成开题 PPT

```http
POST /api/ppt/proposal
```

```json
{
  "project_id": "project_001",
  "design_id": "design_001",
  "template_id": "template_001"
}
```

---

## 11. MVP 开发计划

### V0.1：文献到开题 PPT

目标：打通最核心链路。

```text
需求输入
↓
文献检索
↓
文献分析
↓
研究方向推荐
↓
项目设计
↓
开题 PPT 生成
```

功能清单：

- 创建研究项目；
- 输入研究需求；
- 自动生成检索关键词；
- 调用 OpenAlex / Semantic Scholar / Crossref 检索文献；
- 文献去重和排序；
- 文献摘要生成；
- 研究热点和研究空白总结；
- 生成 3-5 个可研究方向；
- 对研究方向进行评分；
- 生成项目设计；
- 生成开题 PPT 大纲；
- 生成 PPTX 文件。

---

### V0.2：开题报告生成

新增功能：

- 开题报告生成；
- 国内外研究现状生成；
- 参考文献格式化；
- 技术路线图生成；
- 开题演讲稿生成；
- Word / PDF 导出。

---

### V0.3：项目成果到论文

新增功能：

- 上传项目成果；
- 上传实验数据；
- 管理实验记录；
- 生成论文大纲；
- 生成论文章节；
- 生成毕业答辩 PPT。

---

### V1.0：完整科研 Agent

新增功能：

- 多项目管理；
- Zotero 文献库同步；
- 文献知识图谱；
- 成果包归档；
- 多 Agent 协作；
- 学术合规检查；
- 导师审阅模式；
- 团队协作功能。

---

## 12. 学术合规原则

### 12.1 文献必须真实

系统生成的参考文献必须来自真实数据库，不能由模型编造。

要求：

```text
1. 每条参考文献必须有 DOI、URL 或数据库来源；
2. 文献元数据需要保存；
3. 引用内容需要与原文观点匹配；
4. 生成参考文献前需要进行校验。
```

---

### 12.2 开题阶段不能伪造成果

开题阶段可以写：

```text
拟开展研究
计划完成实验
预期成果
预计创新点
研究方案设计
```

不能写：

```text
实验结果表明
已经证明
系统显著提升
研究已取得明显效果
```

---

### 12.3 论文阶段必须基于真实成果

毕业论文和答辩 PPT 中的以下内容必须来自真实数据或真实项目成果：

```text
实验结果
数据分析
用户评价
模型性能
系统截图
结果图表
```

---

## 13. 风险与解决方案

| 风险 | 解决方案 |
|---|---|
| AI 编造文献 | 所有文献必须来自真实 API，并保存 DOI、URL、来源数据库 |
| 研究方向不切实际 | 对方向进行可行性评分，明确数据来源和实施条件 |
| 开题内容空泛 | 内容绑定文献依据，研究内容细化到任务级别 |
| 论文生成虚假结果 | 论文结果部分必须基于用户上传数据和真实成果 |
| 文献质量不高 | 使用引用量、年份、来源质量、相关性综合排序 |
| PPT 内容不规范 | 使用固定开题 PPT 模板和答辩逻辑结构 |

---

## 14. 推荐开发优先级

```text
1. 用户输入研究需求
2. 自动生成检索关键词
3. 文献检索
4. 文献筛选
5. 文献摘要
6. 研究热点与不足总结
7. 研究方向推荐
8. 研究方向评分
9. 项目设计生成
10. 开题 PPT 大纲生成
11. PPTX 文件生成
12. 开题报告生成
13. 项目成果上传
14. 论文草稿生成
15. 毕业答辩 PPT 生成
```

---

## 15. 示例研究主题

本系统适合辅助生成如下类型的研究课题：

```text
1. 基于 RAG 的高校课程智能问答系统设计与应用研究
2. 面向个性化学习反馈的大语言模型教学 Agent 研究
3. 生成式人工智能辅助高校课程教学的效果评估研究
4. 基于课程知识库的大语言模型教学支持平台设计研究
5. 面向研究生论文写作的文献分析 Agent 设计研究
6. 基于大语言模型的智能学习助手设计与评价研究
7. 面向课堂教学的 AI 助教系统设计与应用研究
```

---

## 16. 许可证

本项目可根据实际情况选择许可证。

推荐：

```text
MIT License
```

如果涉及商业化或学校内部系统，也可以选择私有协议。

---

## 17. 贡献指南

欢迎提交 Issue 和 Pull Request。

建议贡献方向：

- 文献检索插件；
- Agent 工作流；
- PPT 模板；
- 开题报告模板；
- 文献分析 Prompt；
- 项目设计模板；
- 学术合规检查模块。

---

## 18. 项目总结

本项目要构建的是一个文献驱动型研究生科研 Agent。

它能够根据用户提供的研究需求自动查找相关文献，分析研究现状和研究空白，提出可研究方向，完成项目设计，并生成开题报告和开题 PPT。

后续系统还可以根据真实项目成果辅助撰写论文和生成毕业答辩 PPT。

最核心的第一版应优先打通：

```text
需求输入 → 文献检索 → 文献分析 → 研究方向推荐 → 项目设计 → 开题 PPT
```

后续再扩展到：

```text
项目成果 → 论文撰写 → 毕业答辩 PPT
```
```

