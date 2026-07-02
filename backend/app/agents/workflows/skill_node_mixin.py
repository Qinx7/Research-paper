"""workflow 节点调用 skill runtime 的轻量辅助层。"""
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from ...skills import SkillExecutionContext
from ..orchestration import AgentNodeResult, AgentWorkflowState


@dataclass(slots=True)
class SkillNodeExecutionOutcome:
    """skill 节点调用后的统一结果。"""

    output: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    failed_result: AgentNodeResult | None = None

    @property
    def ok(self) -> bool:
        """是否成功完成 skill 调用。"""
        return self.failed_result is None


class SkillNodeMixin:
    """为 workflow 节点统一解析、执行和记录 skill 调用。"""

    def run_skill_action(
        self,
        state: AgentWorkflowState,
        *,
        skill_executor,
        skill_router,
        domain: str,
        action: str,
        payload: dict[str, Any],
        context_state: dict[str, Any] | None = None,
        context_metadata: dict[str, Any] | None = None,
    ) -> SkillNodeExecutionOutcome:
        """执行一次 `domain + action` skill，并返回结构化诊断信息。"""
        started = perf_counter()
        try:
            skill_definition = skill_router.resolve(domain=domain, action=action)
            state.metadata.setdefault("resolved_skills", {})[action] = skill_definition.id
            skill_result = skill_executor.execute(
                skill_definition.id,
                payload,
                context=SkillExecutionContext(
                    user_id=state.user_id,
                    project_id=state.project_id,
                    draft_id=state.input.get("draft_id"),
                    metadata=context_metadata or {},
                    state=context_state or {},
                ),
            )
            output = skill_result.output or {}
            metadata = {
                "domain": domain,
                "action": action,
                "skill_id": skill_result.skill_id,
                "resolved_skill_id": skill_definition.id,
                "skill_version": getattr(skill_definition, "version", None),
                "input_required": list((getattr(skill_definition, "input_schema", {}) or {}).get("required", []) or []),
                "output_keys": sorted(output.keys()),
                "duration_ms": max(0, int((perf_counter() - started) * 1000)),
            }
            return SkillNodeExecutionOutcome(output=output, metadata=metadata)
        except Exception as exc:
            message = f"{domain}.{action}: {exc}"
            return SkillNodeExecutionOutcome(failed_result=AgentNodeResult.failed(message))
