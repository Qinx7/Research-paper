"""多 Agent workflow 共享状态。"""
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4


@dataclass
class AgentWorkflowState:
    """节点之间传递的统一上下文对象。"""

    workflow_name: str
    run_id: str = field(default_factory=lambda: str(uuid4()))
    status: str = "pending"
    user_id: str | None = None
    project_id: str | None = None
    search_task_id: str | None = None
    input: dict[str, Any] = field(default_factory=dict)
    data: dict[str, Any] = field(default_factory=dict)
    evidence: list[dict[str, Any]] = field(default_factory=list)
    messages: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
