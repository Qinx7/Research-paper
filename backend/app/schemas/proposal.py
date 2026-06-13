"""开题报告 Schema"""
from datetime import datetime
from uuid import UUID as UUIDType

from pydantic import BaseModel, Field, field_validator


# ---- 请求 ----

class ProposalGenerateRequest(BaseModel):
    project_id: str = Field(..., description="项目 ID")
    design_id: str = Field(..., description="项目设计 ID")


# ---- 12 章节标识（PRD 第 3.7 节定义）----

SECTION_KEYS = [
    "background_significance",
    "literature_review",
    "research_gaps",
    "questions_objectives",
    "research_content",
    "research_methods",
    "technical_route",
    "innovation",
    "feasibility",
    "research_plan",
    "expected_outcomes",
    "references",
]

SECTION_LABELS = {
    "background_significance": "选题背景与研究意义",
    "literature_review": "国内外研究现状",
    "research_gaps": "现有研究不足",
    "questions_objectives": "研究问题与研究目标",
    "research_content": "研究内容",
    "research_methods": "研究方法",
    "technical_route": "技术路线",
    "innovation": "创新点",
    "feasibility": "可行性分析",
    "research_plan": "研究计划",
    "expected_outcomes": "预期成果",
    "references": "参考文献",
}


# ---- 响应 ----

class ProposalSection(BaseModel):
    key: str
    title: str
    content: str


class ProposalOut(BaseModel):
    id: str
    project_id: str | None
    design_id: str | None
    title: str
    sections: list[ProposalSection]
    docx_path: str | None
    created_at: datetime

    class Config:
        from_attributes = True

    @field_validator("id", "project_id", "design_id", mode="before")
    @classmethod
    def coerce_uuid(cls, v: object) -> str:
        if isinstance(v, UUIDType):
            return str(v)
        return v
