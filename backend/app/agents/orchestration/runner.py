"""多 Agent workflow 同步执行器。"""
from dataclasses import dataclass

from .events import AgentWorkflowEvent
from .node import AgentNode, AgentNodeResult
from .state import AgentWorkflowState


@dataclass
class AgentWorkflowResult:
    """workflow 执行结束后的最终状态和事件列表。"""

    state: AgentWorkflowState
    events: list[AgentWorkflowEvent]


class AgentWorkflowRunner:
    """顺序执行 AgentNode，并把每步输出合并到 workflow state。"""

    def __init__(self, nodes: list[AgentNode], recorder=None):
        self.nodes = nodes
        self.recorder = recorder

    def run(self, state: AgentWorkflowState) -> AgentWorkflowResult:
        """执行 workflow，节点失败时停止后续关键流程。"""
        state.status = "running"
        self._notify_recorder("workflow_started", state)
        events = [
            self._event(
                state,
                event_type="workflow_started",
                status="running",
                message="workflow started",
            )
        ]

        for node in self.nodes:
            if not node.should_run(state):
                self._notify_recorder("node_started", state, node)
                result = AgentNodeResult.skipped()
                self._merge_node_result(state, node, result)
                self._notify_recorder("node_finished", state, node, result)
                events.append(self._event(
                    state,
                    event_type="node_finished",
                    status="skipped",
                    node_name=node.name,
                    message="node skipped",
                ))
                continue

            self._notify_recorder("node_started", state, node)
            events.append(self._event(
                state,
                event_type="node_started",
                status="running",
                node_name=node.name,
                message="node started",
            ))
            try:
                result = node.run(state)
                if result is None:
                    result = AgentNodeResult.success()
            except Exception as exc:
                result = AgentNodeResult.failed(str(exc))

            self._merge_node_result(state, node, result)
            self._notify_recorder("node_finished", state, node, result)
            events.append(self._event(
                state,
                event_type="node_finished",
                status=result.status,
                node_name=node.name,
                message=result.error or "",
                payload=result.metadata,
            ))
            if result.status == "failed" and node.critical:
                state.status = "failed"
                self._notify_recorder("workflow_finished", state)
                return AgentWorkflowResult(state=state, events=events)

        if state.status != "failed":
            state.status = "success"
        self._notify_recorder("workflow_finished", state)
        return AgentWorkflowResult(state=state, events=events)

    def _merge_node_result(self, state: AgentWorkflowState, node: AgentNode, result: AgentNodeResult) -> None:
        """把节点输出合并进 workflow state。"""
        state.data.update(result.data_delta)
        state.evidence.extend(result.evidence_delta)
        state.messages.extend(result.messages)
        if result.metadata:
            state.metadata.setdefault("nodes", {})[node.name] = result.metadata
        if result.status == "failed":
            state.errors.append(f"{node.name}: {result.error or '节点执行失败'}")

    def _event(
        self,
        state: AgentWorkflowState,
        *,
        event_type: str,
        status: str,
        message: str,
        node_name: str | None = None,
        payload: dict | None = None,
    ) -> AgentWorkflowEvent:
        return AgentWorkflowEvent(
            event_type=event_type,
            status=status,
            workflow_name=state.workflow_name,
            run_id=state.run_id,
            node_name=node_name,
            message=message,
            payload=payload or {},
        )

    def _notify_recorder(self, method_name: str, *args) -> None:
        """执行记录失败不阻断 workflow 主流程。"""
        if not self.recorder:
            return
        method = getattr(self.recorder, method_name, None)
        if not method:
            return
        try:
            method(*args)
        except Exception as exc:
            state = args[0] if args else None
            if hasattr(state, "metadata"):
                state.metadata.setdefault("recording_errors", []).append(str(exc))
