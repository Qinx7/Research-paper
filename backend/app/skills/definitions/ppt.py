"""PPT 相关技能定义。"""
from __future__ import annotations

from ..models import SkillDefinition
from ...services.web_deck_render_service import web_deck_render_service


def build_ppt_skill_definitions() -> list[SkillDefinition]:
    """构建第一批 PPT 技能定义。"""
    return [
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
