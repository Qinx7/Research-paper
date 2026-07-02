"""论文草稿 Schema"""
from datetime import datetime
from uuid import UUID as UUIDType
from pydantic import BaseModel, Field, field_validator


# ---- 论文章节标识（6 章标准结构）----

PAPER_CHAPTER_KEYS = [
    "chapter_1_introduction",
    "chapter_2_theory",
    "chapter_3_design",
    "chapter_4_implementation",
    "chapter_5_experiment",
    "chapter_6_conclusion",
]

PAPER_CHAPTER_LABELS = {
    "chapter_1_introduction": "第一章 绪论",
    "chapter_2_theory": "第二章 相关理论与技术基础",
    "chapter_3_design": "第三章 系统需求分析与总体设计",
    "chapter_4_implementation": "第四章 系统实现",
    "chapter_5_experiment": "第五章 实验设计与结果分析",
    "chapter_6_conclusion": "第六章 总结与展望",
}

# 章节状态流转：draft → generated → edited → final
CHAPTER_STATUSES = ["draft", "generated", "edited", "final"]


# ---- 请求 ----

class DraftCreate(BaseModel):
    project_id: str = Field(..., description="所属项目 ID")
    title: str = Field(..., description="论文标题")


class DraftUpdate(BaseModel):
    title: str | None = Field(None, description="论文标题")
    content: dict | None = Field(None, description="章节内容")
    references: list[dict] | None = Field(None, description="参考文献")
    outline: dict | None = Field(None, description="论文大纲")


class GenerateOutlineRequest(BaseModel):
    """生成论文大纲请求 —— 携带项目上下文供 Agent 使用"""
    project_id: str = Field(..., description="项目 ID")
    design_id: str | None = Field(None, description="关联项目设计 ID，用于获取研究方向和方法")


class GenerateChapterRequest(BaseModel):
    """生成单章请求"""
    chapter_key: str = Field(..., description="章节标识")
    style: str | None = Field(None, description="写作风格：academic/concise/detailed")
    regenerate: bool = Field(False, description="是否重新生成（覆盖已有内容）")


class GenerateAbstractRequest(BaseModel):
    """生成摘要请求"""
    pass


# ---- 响应 ----

class PaperSection(BaseModel):
    key: str
    title: str
    content: str
    status: str = "draft"  # draft | generated | edited | final


class ChapterOutline(BaseModel):
    key: str
    title: str
    subsections: list[dict] = []  # [{title: str, description: str}]


class DraftOutline(BaseModel):
    chapters: list[ChapterOutline]
    suggested_title: str | None = None
    notes: str | None = None


class WritingPlanResult(BaseModel):
    goal: str
    recommended_structure: list[str]
    evidence_gaps: list[str]
    risks: list[str]
    notes: str


class WritingReviewIssue(BaseModel):
    severity: str
    title: str
    detail: str
    suggestion: str


class WritingReviewResult(BaseModel):
    chapter_key: str
    passed: bool
    summary: str
    issues: list[WritingReviewIssue]
    focus_areas: list[str]


class WritingRevisionResult(BaseModel):
    chapter_key: str
    title: str
    content: str
    change_summary: list[str]
    resolved_issues: list[str]
    citations: list[str]
    data_based: bool


class FullDraftReviewResult(BaseModel):
    passed: bool
    summary: str
    issues: list[WritingReviewIssue]
    focus_areas: list[str]
    chapter_flags: dict[str, list[str]]


class FullDraftRevisionResult(BaseModel):
    title: str
    full_text: str
    change_summary: list[str]
    resolved_issues: list[str]
    remaining_issues: list[str]


class FullDraftGenerateResult(BaseModel):
    suggested_title: str
    generated_chapters: list[str]
    skipped_chapters: list[str]
    outline: dict
    content: dict


class DraftOut(BaseModel):
    id: str
    project_id: str
    title: str
    content: dict | None
    references: list[dict] | None
    outline: dict | None
    version: int
    sections: list[PaperSection] = []  # 由 API 层从 content 构建
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


class ChapterResult(BaseModel):
    chapter_key: str
    title: str
    content: str
    status: str
    citations: list[str] = []  # 本章引用的成果/文献名称
    data_based: bool = False  # 是否基于真实数据（非实验设计方案）


class AbstractResult(BaseModel):
    abstract_cn: str
    abstract_en: str
    keywords_cn: list[str]
    keywords_en: list[str]


class SuggestRefsResult(BaseModel):
    suggested_references: list[dict]
    notes: str | None = None
