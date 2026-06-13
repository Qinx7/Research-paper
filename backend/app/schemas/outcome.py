"""项目成果 Schema"""
from datetime import datetime
from uuid import UUID as UUIDType
from pydantic import BaseModel, Field, field_validator


# ---- 成果类型信息 ----

OUTCOME_TYPES = [
    {"id": "prototype", "label": "系统原型", "description": "可运行的系统原型或 Demo", "icon": "laptop"},
    {"id": "code", "label": "代码文件", "description": "源代码、脚本、Notebook 等", "icon": "code"},
    {"id": "screenshot", "label": "系统截图", "description": "界面截图、运行结果截图等", "icon": "image"},
    {"id": "experiment_data", "label": "实验数据", "description": "CSV/JSON/Excel 等格式的实验或问卷数据", "icon": "table"},
    {"id": "survey_data", "label": "问卷数据", "description": "用户调查、访谈记录等", "icon": "clipboard"},
    {"id": "experiment_record", "label": "实验记录", "description": "实验过程记录、阶段性报告", "icon": "file-text"},
    {"id": "chart", "label": "图表", "description": "实验分析图表、可视化结果", "icon": "chart"},
    {"id": "paper_draft", "label": "论文草稿", "description": "论文初稿或章节片段", "icon": "file"},
    {"id": "other", "label": "其他", "description": "其他类型成果", "icon": "folder"},
]


# ---- 请求 ----

class OutcomeCreate(BaseModel):
    project_id: str = Field(..., description="所属项目 ID")
    outcome_type: str = Field(..., description="成果类型")
    name: str = Field(..., description="成果名称")
    description: str | None = Field(None, description="成果描述")
    extra_data: dict | None = Field(None, description="扩展元数据")


class OutcomeUpdate(BaseModel):
    name: str | None = Field(None, description="成果名称")
    description: str | None = Field(None, description="成果描述")
    outcome_type: str | None = Field(None, description="成果类型")
    extra_data: dict | None = Field(None, description="扩展元数据")


# ---- 响应 ----

class OutcomeTypeInfo(BaseModel):
    id: str
    label: str
    description: str
    icon: str


class OutcomeOut(BaseModel):
    id: str
    project_id: str
    outcome_type: str
    name: str
    description: str | None
    file_path: str | None
    extra_data: dict | None
    file_url: str | None = None  # 由 API 层动态生成
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    @field_validator("id", "project_id", mode="before")
    @classmethod
    def coerce_uuid(cls, v: object) -> str:
        if isinstance(v, UUIDType):
            return str(v)
        return v


class OutcomeSummary(BaseModel):
    total_count: int
    type_counts: dict[str, int]
    summary_text: str | None = None
    ready_for_paper: bool = False
    missing_items: list[str] = []


class ReadinessCheck(BaseModel):
    ready: bool
    score: int  # 0-100
    available_types: list[str]
    missing_types: list[str]
    suggestion: str
