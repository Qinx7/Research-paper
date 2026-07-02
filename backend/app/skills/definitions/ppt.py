"""PPT 相关技能定义。"""
from __future__ import annotations

from ..models import SkillDefinition
from ...services.web_deck_render_service import web_deck_render_service


def build_ppt_skill_definitions() -> list[SkillDefinition]:
    """构建第一批 PPT 技能定义。"""
    return [
        SkillDefinition(
            id="ppt.project_pptx",
            name="通用 PPTX 生成",
            description="根据项目设计内容和模板风格生成可下载的 PPTX 文件。",
            domain="ppt",
            input_schema={
                "required": ["design", "template"],
            },
            output_schema={
                "required": ["success", "filename", "download_url", "object_key", "style_id", "style_name"],
            },
            defaults={
                "template": "academic_blue",
            },
            tags=("ppt", "pptx", "project"),
            handler=_project_pptx_handler,
        ),
        SkillDefinition(
            id="ppt.web_html_deck",
            name="HTML Deck 生成",
            description="根据标题、主题和幻灯片大纲生成单文件 HTML deck。",
            domain="ppt",
            input_schema={
                "required": ["deck_title", "slides_outline"],
            },
            output_schema={
                "required": ["artifact_type", "title", "object_key", "filename", "theme", "slide_count", "preview_url", "download_url"],
            },
            defaults={
                "theme": "paper",
                "object_prefix": "generated/decks",
            },
            tags=("ppt", "html", "deck"),
            handler=_web_html_deck_handler,
        ),
    ]


def _project_pptx_handler(payload, context):
    from ...agents.ppt_agent import ppt_agent as default_ppt_agent

    generator = context.state.get("ppt_agent") or default_ppt_agent
    template = payload.get("template") or "academic_blue"
    style = generator.resolve_style(template)
    object_key = generator.generate(
        design=payload.get("design") or {},
        template=template,
    )
    download_base = context.metadata.get("download_base_url", "/api/ppt/download/")
    filename = object_key.rsplit("/", 1)[-1]
    return {
        "success": True,
        "filename": filename,
        "download_url": f"{download_base}{object_key}" if download_base else "",
        "object_key": object_key,
        "design_fields": len(payload.get("design") or {}),
        "style_id": style["id"],
        "style_name": style["name"],
    }


def _web_html_deck_handler(payload, context):
    render_service = context.state.get("web_deck_render_service") or web_deck_render_service
    result = render_service.render(
        deck_title=payload["deck_title"],
        slides_outline=payload.get("slides_outline") or [],
        theme=payload.get("theme") or "paper",
        object_prefix=payload.get("object_prefix") or "generated/decks",
    )

    preview_base = context.metadata.get("preview_base_url", "")
    download_base = context.metadata.get("download_base_url", "")
    object_key = result["object_key"]
    return {
        **result,
        "preview_url": f"{preview_base}{object_key}" if preview_base else "",
        "download_url": f"{download_base}{object_key}" if download_base else "",
    }
