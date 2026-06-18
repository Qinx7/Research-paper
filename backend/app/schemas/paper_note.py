"""文献阅读笔记相关 Schema。"""
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


NOTE_TYPES = {"summary", "quote", "method", "finding", "limitation", "idea"}


class PaperNoteBase(BaseModel):
    note_type: str = Field("summary", description="笔记类型")
    title: str = Field(..., min_length=1, max_length=255, description="笔记标题")
    content: str = Field(..., min_length=1, description="笔记内容")
    evidence_text: str | None = Field(None, description="可引用的证据摘录")
    evidence_level: str | None = Field(None, max_length=40, description="证据等级")
    confidence: int | None = Field(None, ge=0, le=100, description="可信度评分")
    tags: list[str] = Field(default_factory=list, description="标签")
    meta: dict[str, Any] = Field(default_factory=dict, description="扩展元数据")

    @field_validator("note_type")
    @classmethod
    def validate_note_type(cls, value: str) -> str:
        if value not in NOTE_TYPES:
            raise ValueError(f"note_type 必须是以下之一: {', '.join(sorted(NOTE_TYPES))}")
        return value


class PaperNoteCreate(PaperNoteBase):
    project_id: UUID | None = Field(None, description="所属项目")
    paper_id: UUID = Field(..., description="关联文献")


class PaperNoteUpdate(BaseModel):
    note_type: str | None = None
    title: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = Field(None, min_length=1)
    evidence_text: str | None = None
    evidence_level: str | None = Field(None, max_length=40)
    confidence: int | None = Field(None, ge=0, le=100)
    tags: list[str] | None = None
    meta: dict[str, Any] | None = None

    @field_validator("note_type")
    @classmethod
    def validate_note_type(cls, value: str | None) -> str | None:
        if value is not None and value not in NOTE_TYPES:
            raise ValueError(f"note_type 必须是以下之一: {', '.join(sorted(NOTE_TYPES))}")
        return value


class PaperNoteOut(PaperNoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID | None
    paper_id: UUID
    created_at: datetime | None = None
    updated_at: datetime | None = None
