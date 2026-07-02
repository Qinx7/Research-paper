"""技能注册表。"""
from __future__ import annotations

from .definitions import build_paper_skill_definitions
from .definitions import build_ppt_skill_definitions
from .definitions import build_research_skill_definitions
from .models import SkillDefinition


class SkillRegistry:
    """在内存中注册和查询技能定义。"""

    def __init__(self):
        self._definitions: dict[str, SkillDefinition] = {}

    def register(self, definition: SkillDefinition) -> SkillDefinition:
        """注册技能定义，重复 id 直接报错。"""
        if definition.id in self._definitions:
            raise ValueError(f"技能已存在：{definition.id}")
        self._definitions[definition.id] = definition
        return definition

    def replace(self, definition: SkillDefinition) -> SkillDefinition:
        """覆盖已存在技能定义。"""
        self._definitions[definition.id] = definition
        return definition

    def get(self, skill_id: str) -> SkillDefinition:
        """按 id 获取技能定义。"""
        try:
            return self._definitions[skill_id]
        except KeyError as exc:
            raise KeyError(f"技能不存在：{skill_id}") from exc

    def has(self, skill_id: str) -> bool:
        """检查技能是否存在。"""
        return skill_id in self._definitions

    def list(self, *, domain: str | None = None, enabled_only: bool = True) -> list[SkillDefinition]:
        """列出技能定义。"""
        items = list(self._definitions.values())
        if domain:
            items = [item for item in items if item.domain == domain]
        if enabled_only:
            items = [item for item in items if item.enabled]
        return sorted(items, key=lambda item: item.id)


def build_default_skill_registry() -> SkillRegistry:
    """构建当前默认技能注册表。"""
    registry = SkillRegistry()
    for definition in build_paper_skill_definitions():
        registry.register(definition)
    for definition in build_research_skill_definitions():
        registry.register(definition)
    for definition in build_ppt_skill_definitions():
        registry.register(definition)
    return registry
