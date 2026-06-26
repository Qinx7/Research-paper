"""论文写作相关技能定义。"""
from __future__ import annotations

from ..models import SkillDefinition
from ...services.grounding_guard import validate_generated_chapter_grounding


def build_paper_skill_definitions() -> list[SkillDefinition]:
    """构建论文写作第一批技能定义。"""
    return [
        SkillDefinition(
            id="paper.chapter_draft",
            name="论文章节草稿生成",
            description="根据大纲、项目成果和文献上下文生成单章节草稿。",
            domain="paper",
            input_schema={
                "required": [
                    "chapter_key",
                    "outline",
                    "outcomes_summary",
                    "literature_context",
                    "existing_chapters",
                ],
            },
            output_schema={
                "required": ["chapter_key", "title", "content", "citations", "data_based"],
            },
            tags=("paper", "draft", "chapter"),
            handler=_chapter_draft_handler,
        ),
        SkillDefinition(
            id="paper.chapter_grounding",
            name="论文章节依据校验",
            description="校验章节 citations、真实数据与具体数据表述是否具备可验证依据。",
            domain="paper",
            input_schema={
                "required": ["chapter_key", "result", "outcomes", "papers", "evidence_items"],
            },
            output_schema={
                "required": ["chapter_key", "title", "content", "citations", "data_based"],
            },
            tags=("paper", "grounding", "compliance"),
            handler=_chapter_grounding_handler,
        ),
    ]


def _chapter_draft_handler(payload, context):
    writing_agent = context.state.get("writing_agent")
    if writing_agent is None:
        raise ValueError("缺少 writing_agent，无法执行 paper.chapter_draft")

    return writing_agent.generate_chapter(
        chapter_key=payload["chapter_key"],
        outline=payload["outline"],
        outcomes_summary=payload["outcomes_summary"],
        literature_context=payload["literature_context"],
        existing_chapters=payload.get("existing_chapters") or {},
    )


def _chapter_grounding_handler(payload, context):
    return validate_generated_chapter_grounding(
        chapter_key=payload["chapter_key"],
        result=payload["result"],
        outcomes=payload.get("outcomes", []),
        papers=payload.get("papers", []),
        evidence_items=payload.get("evidence_items", []),
    )
