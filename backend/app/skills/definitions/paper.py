"""论文写作相关技能定义。"""
from __future__ import annotations

from ..models import SkillDefinition
from ...services.grounding_guard import validate_generated_chapter_grounding


def build_paper_skill_definitions() -> list[SkillDefinition]:
    """构建论文写作技能定义。"""
    return [
        SkillDefinition(
            id="paper.plan",
            name="论文写作计划生成",
            description="根据项目背景、成果摘要与文献上下文生成论文写作计划、证据缺口与风险提示。",
            domain="paper",
            input_schema={"required": ["project_context", "outcomes_summary", "literature_context"]},
            output_schema={"required": ["goal", "recommended_structure", "evidence_gaps", "risks", "notes"]},
            tags=("paper", "plan", "writing"),
            handler=_paper_plan_handler,
        ),
        SkillDefinition(
            id="paper.outline_generate",
            name="论文大纲生成",
            description="根据项目背景、成果摘要与文献上下文生成论文大纲。",
            domain="paper",
            input_schema={"required": ["project_context", "outcomes_summary", "literature_context"]},
            output_schema={"required": ["suggested_title", "chapters", "notes"]},
            tags=("paper", "outline", "draft"),
            handler=_paper_outline_generate_handler,
        ),
        SkillDefinition(
            id="paper.review_pass",
            name="论文章节审查",
            description="对当前章节进行结构、依据与表述层面的审查，返回问题清单与建议。",
            domain="paper",
            input_schema={"required": ["chapter_key", "chapter_title", "chapter_content", "citations", "evidence_context"]},
            output_schema={"required": ["chapter_key", "passed", "summary", "issues", "focus_areas"]},
            tags=("paper", "review", "quality"),
            handler=_paper_review_pass_handler,
        ),
        SkillDefinition(
            id="paper.revision_apply",
            name="章节定向修订",
            description="根据章节审查问题和关注点，对当前章节进行定向修订并返回修订摘要。",
            domain="paper",
            input_schema={"required": ["chapter_key", "chapter_title", "chapter_content", "issues", "focus_areas", "citations", "evidence_context"]},
            output_schema={"required": ["chapter_key", "title", "content", "change_summary", "resolved_issues", "citations", "data_based"]},
            tags=("paper", "revision", "quality"),
            handler=_paper_revision_apply_handler,
        ),
        SkillDefinition(
            id="paper.full_review_pass",
            name="整篇论文审查",
            description="对整篇论文进行结构、证据、重复与章节衔接层面的整体审查。",
            domain="paper",
            input_schema={"required": ["draft_title", "full_text", "chapter_summaries", "citations", "evidence_context"]},
            output_schema={"required": ["passed", "summary", "issues", "focus_areas", "chapter_flags"]},
            tags=("paper", "review", "full-draft", "quality"),
            handler=_paper_full_review_pass_handler,
        ),
        SkillDefinition(
            id="paper.full_revision_apply",
            name="整篇论文修订",
            description="根据整篇审查结果对全文做轻量整体修订，并返回可回写的全文。",
            domain="paper",
            input_schema={"required": ["draft_title", "full_text", "issues", "focus_areas", "citations", "evidence_context"]},
            output_schema={"required": ["title", "full_text", "change_summary", "resolved_issues", "remaining_issues"]},
            tags=("paper", "revision", "full-draft", "quality"),
            handler=_paper_full_revision_apply_handler,
        ),
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
            output_schema={"required": ["chapter_key", "title", "content", "citations", "data_based"]},
            tags=("paper", "draft", "chapter"),
            handler=_chapter_draft_handler,
        ),
        SkillDefinition(
            id="paper.chapter_grounding",
            name="论文章节依据校验",
            description="校验章节 citations、真实数据与具体数据表述是否具备可验证依据。",
            domain="paper",
            input_schema={"required": ["chapter_key", "result", "outcomes", "papers", "evidence_items"]},
            output_schema={"required": ["chapter_key", "title", "content", "citations", "data_based"]},
            tags=("paper", "grounding", "compliance"),
            handler=_chapter_grounding_handler,
        ),
    ]


def _get_writing_agent(context):
    writing_agent = context.state.get("writing_agent")
    if writing_agent is None:
        raise ValueError("缺少 writing_agent，无法执行 paper skill")
    return writing_agent


def _paper_plan_handler(payload, context):
    writing_agent = _get_writing_agent(context)
    return writing_agent.build_writing_plan(
        project_context=payload["project_context"],
        outcomes_summary=payload["outcomes_summary"],
        literature_context=payload.get("literature_context") or "",
    )


def _paper_outline_generate_handler(payload, context):
    writing_agent = _get_writing_agent(context)
    return writing_agent.generate_outline(
        project_context=payload["project_context"],
        outcomes_summary=payload["outcomes_summary"],
        literature_context=payload.get("literature_context") or "",
    )


def _paper_review_pass_handler(payload, context):
    writing_agent = _get_writing_agent(context)
    return writing_agent.review_chapter(
        chapter_key=payload["chapter_key"],
        chapter_title=payload["chapter_title"],
        chapter_content=payload["chapter_content"],
        citations=payload.get("citations") or [],
        evidence_context=payload.get("evidence_context") or "",
    )


def _paper_revision_apply_handler(payload, context):
    writing_agent = _get_writing_agent(context)
    return writing_agent.revise_chapter(
        chapter_key=payload["chapter_key"],
        chapter_title=payload["chapter_title"],
        chapter_content=payload["chapter_content"],
        issues=payload.get("issues") or [],
        focus_areas=payload.get("focus_areas") or [],
        citations=payload.get("citations") or [],
        evidence_context=payload.get("evidence_context") or "",
    )


def _paper_full_review_pass_handler(payload, context):
    writing_agent = _get_writing_agent(context)
    return writing_agent.review_full_draft(
        draft_title=payload["draft_title"],
        full_text=payload["full_text"],
        chapter_summaries=payload.get("chapter_summaries") or [],
        citations=payload.get("citations") or [],
        evidence_context=payload.get("evidence_context") or "",
    )


def _paper_full_revision_apply_handler(payload, context):
    writing_agent = _get_writing_agent(context)
    return writing_agent.revise_full_draft(
        draft_title=payload["draft_title"],
        full_text=payload["full_text"],
        issues=payload.get("issues") or [],
        focus_areas=payload.get("focus_areas") or [],
        citations=payload.get("citations") or [],
        evidence_context=payload.get("evidence_context") or "",
    )


def _chapter_draft_handler(payload, context):
    writing_agent = _get_writing_agent(context)
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
