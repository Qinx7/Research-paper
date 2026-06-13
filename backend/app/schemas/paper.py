"""文献相关 Schema"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class PaperOut(BaseModel):
    id: UUID
    project_id: UUID | None
    title: str
    authors: str | None
    year: int | None
    venue: str | None
    doi: str | None
    abstract: str | None
    url: str | None
    citation_count: int
    relevance_score: float
    source: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class KeywordsRequest(BaseModel):
    requirement: str


class LiteratureSearchRequest(BaseModel):
    keywords_cn: list[str] = []
    keywords_en: list[str] = []
    year_from: int | None = 2020
    year_to: int | None = 2026
    mode: str = Field("quick_search", description="检索模式：quick_search / literature_review / deep_research")
    library_scope: str = Field("all", description="检索语料范围：all / cn / en")
    sources: list[str] | None = Field(None, description="指定检索数据源")
    min_citation_count: int = Field(0, description="最低引用量过滤")
    prefer_high_impact: bool = Field(False, description="是否优先高影响力文献")


class LiteratureAnalyzeRequest(BaseModel):
    papers: list[dict] = []
    requirement: str | None = ""
