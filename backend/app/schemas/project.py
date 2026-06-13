"""项目相关 Schema"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    research_field: str | None = None
    user_requirement: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    research_field: str | None = None
    selected_topic: str | None = None
    status: str | None = None


class ProjectOut(BaseModel):
    id: UUID
    name: str
    research_field: str | None
    user_requirement: str | None
    selected_topic: str | None
    status: str
    user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
