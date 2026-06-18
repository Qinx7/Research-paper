"""学术检索任务相关 Schema。"""
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LiteratureSearchTaskCreate(BaseModel):
    project_id: UUID | None = Field(None, description="关联项目")
    query: str = Field(..., min_length=1, description="检索词摘要")
    mode: str = Field("quick_search", description="检索模式")
    library_scope: str = Field("all", description="文献范围")
    selected_sources: list[str] = Field(default_factory=list, description="实际检索来源")


class LiteratureSearchTaskUpdate(BaseModel):
    status: str | None = None
    selected_sources: list[str] | None = None
    total_results: int | None = None
    source_statuses: dict[str, Any] | None = None
    result_snapshot: list[dict[str, Any]] | None = None
    error_message: str | None = None


class LiteratureSearchTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID | None = None
    query: str
    mode: str
    library_scope: str
    selected_sources: list[str] | None = None
    status: str
    total_results: int
    source_statuses: dict[str, Any] | None = None
    result_snapshot: list[dict[str, Any]] | None = None
    error_message: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
