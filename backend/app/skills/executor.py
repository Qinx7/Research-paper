"""技能执行器。"""
from __future__ import annotations

from typing import Any

from .models import (
    SkillDefinition,
    SkillDisabledError,
    SkillExecutionContext,
    SkillExecutionResult,
    SkillValidationError,
)
from .registry import SkillRegistry


class SkillExecutor:
    """统一执行技能定义。"""

    def __init__(self, registry: SkillRegistry):
        self.registry = registry

    def execute(
        self,
        skill_id: str,
        payload: dict[str, Any] | None = None,
        *,
        context: SkillExecutionContext | None = None,
    ) -> SkillExecutionResult:
        """按 skill_id 执行技能。"""
        definition = self.registry.get(skill_id)
        return self.execute_definition(definition, payload or {}, context=context)

    def execute_definition(
        self,
        definition: SkillDefinition,
        payload: dict[str, Any] | None = None,
        *,
        context: SkillExecutionContext | None = None,
    ) -> SkillExecutionResult:
        """直接执行给定技能定义。"""
        if not definition.enabled:
            raise SkillDisabledError(f"技能已禁用：{definition.id}")

        context = context or SkillExecutionContext()
        merged_payload = dict(definition.defaults)
        merged_payload.update(payload or {})

        self._validate_schema(
            merged_payload,
            definition.input_schema,
            stage="输入",
            skill_id=definition.id,
        )

        output = definition.handler(merged_payload, context)
        if not isinstance(output, dict):
            raise SkillValidationError(f"技能 {definition.id} 输出必须是 dict")

        self._validate_schema(
            output,
            definition.output_schema,
            stage="输出",
            skill_id=definition.id,
        )

        for guard in definition.guards:
            guard(definition, merged_payload, context, output)

        return SkillExecutionResult(
            skill_id=definition.id,
            payload=merged_payload,
            output=output,
            metadata={
                "domain": definition.domain,
                "version": definition.version,
                "enabled": definition.enabled,
            },
        )

    @staticmethod
    def _validate_schema(
        data: dict[str, Any],
        schema: dict[str, Any] | None,
        *,
        stage: str,
        skill_id: str,
    ) -> None:
        """按最小 schema 规则校验 required 字段。"""
        schema = schema or {}
        required = schema.get("required", []) or []
        missing = [key for key in required if key not in data or data.get(key) is None]
        if missing:
            missing_text = "、".join(missing)
            raise SkillValidationError(f"技能 {skill_id}{stage}缺少必填字段：{missing_text}")
