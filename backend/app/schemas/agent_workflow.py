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
    node_type: str | None = None
    node_label: str | None = None
    status: str
    critical: bool | None = None
    visible: bool | None = None
    skill_id: str | None = None
    skill_version: str | None = None
    input_summary: dict[str, Any] | None = None
    output_summary: dict[str, Any] | None = None
    warnings: list[Any] | None = None
    artifacts: list[dict[str, Any]] | None = None
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
    workflow_version: str | None = None
    trigger_source: str | None = None
    visibility: str | None = None
    input_hash: str | None = None
    input_snapshot: dict[str, Any] | None = None
    output_snapshot: dict[str, Any] | None = None
    result_ref: dict[str, Any] | None = None
    diagnostics: dict[str, Any] | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AgentWorkflowRunDetailOut(AgentWorkflowRunOut):
    steps: list[AgentWorkflowStepOut] = []
