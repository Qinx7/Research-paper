"""研究方向相关 Schema"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ResearchDirectionOut(BaseModel):
    id: UUID
    project_id: UUID | None
    title: str
    background: str | None
    research_questions: str | None
    methods: str | None
    expected_outputs: str | None
    innovation: str | None
    feasibility_score: float | None
    recommendation_score: float | None
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateDirectionsRequest(BaseModel):
    literature_analysis: dict = {}
    requirement: str | None = ""
    project_id: UUID | None = None


class SaveDirectionRequest(BaseModel):
    """保存前端已生成并选中的单个研究方向。"""

    direction: dict = {}
    score: dict | None = {}
    project_id: UUID


class GenerateDesignRequest(BaseModel):
    direction: dict = {}
    literature_analysis: dict | None = {}
    requirement: str | None = ""
    project_id: UUID | None = None
    direction_id: UUID | None = None
