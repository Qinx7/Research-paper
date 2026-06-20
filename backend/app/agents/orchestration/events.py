"""多 Agent workflow 执行事件。"""
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


@dataclass(frozen=True)
class AgentWorkflowEvent:
    """记录 workflow 或单个节点的执行状态变化。"""

    event_type: str
    status: str
    workflow_name: str
    run_id: str
    node_name: str | None = None
    message: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
