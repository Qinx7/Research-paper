"""技能系统默认运行时。"""
from __future__ import annotations

from dataclasses import dataclass

from .executor import SkillExecutor
from .registry import SkillRegistry, build_default_skill_registry
from .router import SkillRouter


@dataclass(frozen=True, slots=True)
class SkillRuntime:
    """聚合默认技能注册表、执行器与路由器。"""

    registry: SkillRegistry
    executor: SkillExecutor
    router: SkillRouter


_DEFAULT_REGISTRY = build_default_skill_registry()
_DEFAULT_RUNTIME = SkillRuntime(
    registry=_DEFAULT_REGISTRY,
    executor=SkillExecutor(_DEFAULT_REGISTRY),
    router=SkillRouter(_DEFAULT_REGISTRY),
)


def get_default_skill_runtime() -> SkillRuntime:
    """返回进程级复用的默认技能运行时。"""
    return _DEFAULT_RUNTIME
