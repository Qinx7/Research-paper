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


class PaperSaveRequest(BaseModel):
    """保存到项目文献库的文献快照。"""
    title: str
    authors: list[str] = []
    year: int | None = None
    venue: str | None = None
    doi: str | None = None
    abstract: str | None = None
    url: str | None = None
    citation_count: int = 0
    source: str | None = None
    relevance_score: float | None = 0.0


class PaperAnalysisOut(BaseModel):
    research_question: str
    method: str
    sample_or_data: str
    key_findings: str
    limitations: str
    relevance_to_project: str
    evidence_level: str
    warnings: list[str] = []


class LiteratureMatrixRow(BaseModel):
    title: str
    author_year: str
    source: str
    venue: str
    research_question: str
    method: str
    sample_or_data: str
    key_findings: str
    limitations: str
    relevance_to_project: str
    evidence_level: str
    warnings: list[str] = []


class LiteratureMatrixOut(BaseModel):
    total: int
    rows: list[LiteratureMatrixRow]


class KeywordsRequest(BaseModel):
    requirement: str


class LiteratureSearchRequest(BaseModel):
    project_id: UUID | None = Field(None, description="可选关联项目")
    keywords_cn: list[str] = []
    keywords_en: list[str] = []
    year_from: int | None = 2020
    year_to: int | None = 2026
    mode: str = Field("quick_search", description="检索模式：quick_search / literature_review / deep_research")
    library_scope: str = Field("all", description="检索语料范围：all / cn / en")
    sources: list[str] | None = Field(None, description="指定检索数据源")
    min_citation_count: int = Field(0, description="最低引用量过滤")
    prefer_high_impact: bool = Field(False, description="是否优先高影响力文献")
    open_access_only: bool = Field(False, description="仅保留开放获取文献")
    quality_tags: list[str] = Field(default_factory=list, description="质量标签过滤")


class LiteratureAnalyzeRequest(BaseModel):
    papers: list[dict] = []
    requirement: str | None = ""
