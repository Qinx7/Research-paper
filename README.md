# Literature-driven Graduate Research Agent

> 面向研究生科研场景的文献检索、选题分析、项目设计、知识沉淀、论文写作与通用 PPT 生成平台。

## 当前版本定位

当前版本聚焦以下主链路：

1. 首页发起学术检索
2. 自动完成需求理解、文献分析、研究方向生成
3. 在研究页承接研究方向与项目设计
4. 在项目页沉淀文献、成果、证据卡片与资料片段
5. 在写作页完成论文草稿生成、编辑、依据追踪与导出
6. 基于项目设计或论文草稿生成通用 PPT / HTML Deck

当前版本不再包含：

- 开题报告生成
- 开题报告下载
- 基于开题报告的 PPT 生成链路

## 主要功能

### 1. 学术检索

- 多来源学术检索与结果聚合
- 中英文检索范围切换
- 搜索记录恢复与复用
- 搜索结果解释层与来源状态说明

### 2. 选题研究

- 需求理解
- 文献分析
- 研究方向生成与评分
- 项目设计承接

### 3. 项目知识库

- 项目成果上传
- 文档解析与知识入库
- 文献笔记与证据卡片沉淀
- 项目资料片段检索

### 4. 论文写作

- 创建论文草稿
- 章节生成与连续编辑
- 依据追踪与高亮跳转
- 合规检查
- DOCX / PDF 导出

### 5. 通用 PPT / HTML Deck

- 基于项目设计生成通用 PPT
- 基于论文草稿生成 HTML Deck
- 基于手动 `slides_outline` 生成 HTML Deck
- 多风格 PPT 主题选择

## 前后端结构

```text
frontend/
backend/
docs/
```

## 当前重要接口

### 学术检索与研究

- `POST /api/literature/search`
- `POST /api/literature/analyze`
- `POST /api/research/directions`
- `POST /api/research/design`

### 论文写作

- `POST /api/drafts/`
- `POST /api/drafts/{draft_id}/outline`
- `POST /api/drafts/{draft_id}/chapters/{chapter_key}`
- `GET /api/drafts/{draft_id}/download?format=docx|pdf`

### 通用 PPT / Deck

- `GET /api/ppt/styles`
- `POST /api/ppt/generate`
- `POST /api/ppt/html-deck`
- `GET /api/ppt/html-deck/preview/{object_key}`
- `GET /api/ppt/download/{object_key}`

## 本地开发

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 后端

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 说明

- 数据库迁移使用 Alembic 维护
- 当前产品主打 PC 端体验
- 答辩相关能力已下线为非主链路能力
- `IEEE / ACM` 可按来源规则直接标记为已核验
- `EI / JCR / 中科院分区` 默认只显示“待核验”，命中本地授权目录后才会升级为“已核验”
- 本地授权目录支持 `CSV / JSON`，当前仓库提供了期刊/会议级样例目录：
  `backend/storage/authority_catalogs/sample_authority_catalog.csv`
