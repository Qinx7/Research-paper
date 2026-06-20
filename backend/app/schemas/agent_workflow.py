"""多 Agent workflow 执行记录 Schema。"""
from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AgentWorkflowStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    node_name: str
    status: str
    input_summary: dict[str, Any] | None = None
    output_summary: dict[str, Any] | None = None
    error_message: str | None = None
    duration_ms: int
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AgentWorkflowRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workflow_name: str
    status: str
    user_id: UUID | None = None
    project_id: UUID | None = None
    search_task_id: UUID | None = None
    input_snapshot: dict[str, Any] | None = None
    output_snapshot: dict[str, Any] | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AgentWorkflowRunDetailOut(AgentWorkflowRunOut):
    steps: list[AgentWorkflowStepOut] = []
