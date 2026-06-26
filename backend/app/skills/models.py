"""技能系统数据模型与基础异常。"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


class SkillExecutionError(RuntimeError):
    """技能执行失败基类。"""


class SkillValidationError(SkillExecutionError):
    """技能输入或输出校验失败。"""


class SkillDisabledError(SkillExecutionError):
    """技能已被禁用。"""


class SkillRouteNotFoundError(SkillExecutionError):
    """技能路由未命中。"""


SkillHandler = Callable[[dict[str, Any], "SkillExecutionContext"], dict[str, Any]]
SkillGuard = Callable[["SkillDefinition", dict[str, Any], "SkillExecutionContext", dict[str, Any]], None]


@dataclass(slots=True)
class SkillExecutionContext:
    """技能执行上下文。"""

    user_id: str | None = None
    project_id: str | None = None
    draft_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    state: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SkillDefinition:
    """技能定义。"""

    id: str
    name: str
    description: str
    domain: str
    handler: SkillHandler
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: dict[str, Any] = field(default_factory=dict)
    guards: list[SkillGuard] = field(default_factory=list)
    defaults: dict[str, Any] = field(default_factory=dict)
    tags: tuple[str, ...] = ()
    enabled: bool = True
    version: str = "1"


@dataclass(slots=True)
class SkillExecutionResult:
    """技能执行结果。"""

    skill_id: str
    output: dict[str, Any]
    payload: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)
