# 阶段 2 步骤 01：检索任务模型与 API

## 目标

新增 `literature_search_tasks` 持久化能力，记录每次学术检索的查询参数、执行状态、来源诊断和结果摘要。

## 关键假设

- 检索任务先以同步检索结果落库为主，不立刻引入 Celery 异步检索。
- 任务状态先包括：`pending`、`running`、`success`、`partial`、`failed`。
- 来源状态复用当前搜索返回中的 `source_statuses`。
- 任务结果可以保存精简版文献列表，不保存全文内容。

## 建议改动

### 1. 后端模型

新增 `backend/app/models/literature_search_task.py`：

```python
"""学术检索任务记录模型。"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID

from ..core.database import Base


class LiteratureSearchTask(Base):
    __tablename__ = "literature_search_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    query = Column(Text, nullable=False)
    mode = Column(String(40), nullable=False, default="literature_review")
    library_scope = Column(String(40), nullable=False, default="all")
    selected_sources = Column(JSONB, nullable=True, default=list)
    status = Column(String(40), nullable=False, default="pending", index=True)
    total_results = Column(Integer, nullable=False, default=0)
    source_statuses = Column(JSONB, nullable=True, default=dict)
    result_snapshot = Column(JSONB, nullable=True, default=list)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

同步修改：

- `backend/app/models/__init__.py`
- 数据库初始化加载。

### 2. Schema

新增 `backend/app/schemas/literature_search_task.py`：

- `LiteratureSearchTaskCreate`
- `LiteratureSearchTaskOut`
- `LiteratureSearchTaskUpdate`

### 3. 服务层

新增 `backend/app/services/literature_search_task_service.py`：

- `create_search_task(db, payload)`
- `mark_task_running(db, task_id)`
- `mark_task_success(db, task_id, result)`
- `mark_task_failed(db, task_id, message)`
- `infer_task_status(source_statuses, total_results)`

状态规则：

- 全部来源失败且结果为 0：`failed`
- 部分来源失败但有结果：`partial`
- 无失败且有结果：`success`
- 无失败但结果为 0：`success`，前端显示“暂无相关文献”

### 4. API

新增 `backend/app/api/literature_search_tasks.py`：

- `GET /api/literature-search-tasks?project_id=&limit=`
- `GET /api/literature-search-tasks/{task_id}`
- `DELETE /api/literature-search-tasks/{task_id}`

接入 `backend/app/main.py`：

```python
from .api.literature_search_tasks import router as literature_search_tasks_router

app.include_router(literature_search_tasks_router, prefix="/api")
```

### 5. 接入现有检索接口

修改 `backend/app/api/literature.py` 的 `/api/literature/search`：

- 请求开始时创建任务。
- 检索成功后写入 `source_statuses`、`selected_sources`、`total_results`、`result_snapshot`。
- 检索异常时写入 `failed` 和错误摘要。
- 响应中增加 `task_id` 字段，保持旧字段兼容。

## 测试计划

新增 `backend/tests/test_literature_search_tasks.py`：

- 创建任务后状态为 `pending`。
- 成功检索后状态为 `success` 或 `partial`。
- 来源全部失败且结果为空时状态为 `failed`。
- 查询任务详情返回来源状态。

运行：

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest tests.test_literature_search_tasks tests.test_search_resilience
```

## 风险

- 如果直接把完整搜索结果 JSON 存入任务，记录可能偏大；建议保存精简字段：标题、作者、年份、来源、摘要片段、URL、引用数。
- 搜索接口目前可能被首页和聊天共用，需要保持响应兼容，不能让旧前端因为新增字段报错。

