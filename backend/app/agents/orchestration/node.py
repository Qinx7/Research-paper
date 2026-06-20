"""多 Agent workflow 节点抽象。"""
from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentNodeResult:
    """单个节点执行后的结构化输出。"""

    status: str
    data_delta: dict[str, Any] = field(default_factory=dict)
    evidence_delta: list[dict[str, Any]] = field(default_factory=list)
    messages: list[str] = field(default_factory=list)
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def success(
        cls,
        *,
        data_delta: dict[str, Any] | None = None,
        evidence_delta: list[dict[str, Any]] | None = None,
        messages: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> "AgentNodeResult":
        """构造成功结果。"""
        return cls(
            status="success",
            data_delta=data_delta or {},
            evidence_delta=evidence_delta or [],
            messages=messages or [],
            metadata=metadata or {},
        )

    @classmethod
    def skipped(cls, message: str = "节点条件不满足，已跳过。") -> "AgentNodeResult":
        """构造跳过结果。"""
        return cls(status="skipped", messages=[message] if message else [])

    @classmethod
    def failed(cls, error: str) -> "AgentNodeResult":
        """构造失败结果。"""
        return cls(status="failed", error=error)


class AgentNode:
    """workflow 中的最小可执行节点。"""

    name = "unnamed_node"
    description = ""
    critical = True

    def should_run(self, state) -> bool:
        """判断当前节点是否需要执行。"""
        return True

    def run(self, state) -> AgentNodeResult:
        """执行节点并返回结构化结果。"""
        raise NotImplementedError
