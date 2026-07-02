"""研究方向与项目设计相关技能定义。"""
from __future__ import annotations

from ..models import SkillDefinition


def build_research_skill_definitions() -> list[SkillDefinition]:
    """构建研究流程第一批技能定义。"""
    return [
        SkillDefinition(
            id="research.direction_generate",
            name="研究方向候选生成",
            description="根据文献分析结果与需求描述生成研究方向候选列表。",
            domain="research",
            input_schema={
                "required": ["literature_analysis", "requirement"],
            },
            output_schema={
                "required": ["directions"],
            },
            tags=("research", "direction", "generation"),
            handler=_direction_generate_handler,
        ),
        SkillDefinition(
            id="research.direction_score",
            name="研究方向评分",
            description="对候选研究方向进行多维评分并返回结构化分数。",
            domain="research",
            input_schema={
                "required": ["directions"],
            },
            output_schema={
                "required": ["scores"],
            },
            tags=("research", "direction", "score"),
            handler=_direction_score_handler,
        ),
        SkillDefinition(
            id="research.project_design_generate",
            name="项目设计生成",
            description="根据研究方向、文献分析和需求生成项目设计方案。",
            domain="research",
            input_schema={
                "required": ["direction", "literature_analysis", "requirement"],
            },
            output_schema={
                "required": ["design"],
            },
            tags=("research", "design", "generation"),
            handler=_project_design_generate_handler,
        ),
    ]


def _direction_generate_handler(payload, context):
    direction_agent = context.state.get("direction_agent")
    if direction_agent is None:
        raise ValueError("缺少 direction_agent，无法执行 research.direction_generate")

    directions = direction_agent.generate_directions(
        literature_analysis=payload.get("literature_analysis") or {},
        requirement=payload.get("requirement") or "",
    )
    return {
        "directions": directions or [],
    }


def _direction_score_handler(payload, context):
    direction_agent = context.state.get("direction_agent")
    if direction_agent is None:
        raise ValueError("缺少 direction_agent，无法执行 research.direction_score")

    scores = direction_agent.score_directions(payload.get("directions") or [])
    return {
        "scores": scores or [],
    }


def _project_design_generate_handler(payload, context):
    project_design_agent = context.state.get("project_design_agent")
    if project_design_agent is None:
        raise ValueError("缺少 project_design_agent，无法执行 research.project_design_generate")

    design = project_design_agent.generate_design(
        direction=payload.get("direction") or {},
        literature_analysis=payload.get("literature_analysis") or {},
        requirement=payload.get("requirement") or "",
    )
    return {
        "design": design or {},
    }
