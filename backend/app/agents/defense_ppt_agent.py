"""答辩 PPT 生成 Agent —— 复用 ppt_agent 的渲染基础设施，适配毕业答辩结构"""
import io
import os

from pptx import Presentation
from pptx.util import Inches, Pt

from ..services.upload_service import save_bytes

# 复用 ppt_agent 的所有渲染辅助函数和配置
from .ppt_agent import (
    SLIDE_WIDTH, SLIDE_HEIGHT, MARGIN, C_WHITE,
    STYLE_PRESETS, DEFAULT_STYLE_ID, STYLE_ORDER,
    _set_font, _fill_slide_background, _add_page_number, _add_footer_bar,
    _add_cover_slide, _add_section_slide, _add_content_slide,
    _add_numbered_list_slide, _add_card_slide, _add_ending_slide,
)


class DefensePPTAgent:
    """毕业答辩 PPT Agent —— 基于论文内容生成 14 页答辩幻灯片"""

    def __init__(self, output_dir: str = ""):
        if not output_dir:
            output_dir = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "generated")
        self.output_dir = os.path.abspath(output_dir)
        os.makedirs(self.output_dir, exist_ok=True)

    def list_styles(self) -> list[dict]:
        """列出可选风格"""
        result = []
        for sid in STYLE_ORDER:
            s = STYLE_PRESETS.get(sid)
            if s:
                result.append({
                    "id": s["id"],
                    "name": s["name"],
                    "description": s.get("description", ""),
                    "scene": s.get("scene", ""),
                    "is_default": s.get("is_default", False),
                })
        return result

    def resolve_style(self, template: str | None) -> dict:
        """解析风格 ID 到风格配置，无效 ID 回退到默认"""
        if template and template in STYLE_PRESETS:
            return STYLE_PRESETS[template]
        return STYLE_PRESETS[DEFAULT_STYLE_ID]

    def generate(self, draft_title: str, draft_content: dict, outcomes_summary: str,
                 template: str = DEFAULT_STYLE_ID) -> str:
        """生成答辩 PPTX，保存到 MinIO（本地 fallback），返回对象 key。"""
        style = self.resolve_style(template)
        prs = Presentation()
        prs.slide_width = SLIDE_WIDTH
        prs.slide_height = SLIDE_HEIGHT

        slides = self._build_slides(draft_title, draft_content, outcomes_summary, style=style)
        total = len(slides)

        for i, slide_def in enumerate(slides):
            self._render_slide(prs, slide_def, style=style, num=i + 1, total=total)

        buf = io.BytesIO()
        prs.save(buf)
        pptx_bytes = buf.getvalue()

        filename = f"defense_{style['id']}_{os.urandom(4).hex()}.pptx"
        object_key = f"generated/{filename}"
        save_bytes(pptx_bytes, object_key,
                   content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation")
        return object_key

    def _render_slide(self, prs, slide_def: dict, *, style: dict, num: int, total: int):
        """渲染单页幻灯片（复用 ppt_agent 的渲染函数）"""
        stype = slide_def["type"]
        if stype == "cover":
            _add_cover_slide(prs, style=style, topic=slide_def["title"], num=num, total=total)
        elif stype == "section":
            _add_section_slide(prs, style=style, title=slide_def["title"], color=slide_def["color"], num=num, total=total)
        elif stype == "content":
            _add_content_slide(prs, style=style, title=slide_def["title"], items=slide_def["items"], color=slide_def["color"], num=num, total=total)
        elif stype == "numbered":
            _add_numbered_list_slide(prs, style=style, title=slide_def["title"], items=slide_def["items"], color=slide_def["color"], num=num, total=total)
        elif stype == "cards":
            _add_card_slide(prs, style=style, title=slide_def["title"], items=slide_def["items"], color=slide_def["color"], num=num, total=total)
        elif stype == "ending":
            _add_ending_slide(prs, style=style, num=num, total=total)

    def _build_slides(self, title: str, content: dict, outcomes_summary: str, *, style: dict) -> list[dict]:
        """构建答辩 PPT 的 14 页幻灯片定义。

        根据真实数据可用性自适应调整实验/结果页内容。
        """
        colors = style["colors"]
        col_p = colors["primary"]
        col_s = colors["secondary"]
        col_a = colors["accent"]

        # 检测是否有真实实验数据
        has_real_data = False
        for ch in content.values():
            if isinstance(ch, dict) and ch.get("data_based"):
                has_real_data = True
                break

        def _get_chapter_text(key: str, max_len: int = 300) -> str:
            """提取章节内容摘要（前 max_len 字符）"""
            ch = content.get(key, {})
            if isinstance(ch, dict) and ch.get("content"):
                text = ch["content"]
                return text[:max_len] + ("..." if len(text) > max_len else "")
            return ""

        def _split_paragraphs(text: str, max_items: int = 4) -> list[str]:
            """将文本按段落拆分为列表项"""
            if not text:
                return ["（待生成内容）"]
            paras = [p.strip() for p in text.split("\n") if p.strip()]
            if not paras:
                return [text[:200]]
            return paras[:max_items]

        slides: list[dict] = []

        # 1. 封面
        slides.append({"type": "cover", "title": title})

        # 2. 研究背景与意义
        slides.append({"type": "section", "title": "研究背景与意义", "color": col_p})
        bg_text = _get_chapter_text("chapter_1_introduction")
        if bg_text:
            slides.append({"type": "content", "title": "研究背景", "items": _split_paragraphs(bg_text, 3), "color": col_p})

        # 3. 研究问题与目标
        slides.append({"type": "content", "title": "研究问题与目标",
                        "items": _split_paragraphs(_get_chapter_text("chapter_1_introduction", 500), 4),
                        "color": col_p})

        # 4. 国内外研究现状
        slides.append({"type": "section", "title": "国内外研究现状", "color": col_s})
        theory_text = _get_chapter_text("chapter_2_theory")
        slides.append({"type": "numbered", "title": "关键理论与技术",
                        "items": _split_paragraphs(theory_text, 5), "color": col_s})

        # 5. 系统总体设计
        slides.append({"type": "section", "title": "系统设计与架构", "color": col_a})
        design_text = _get_chapter_text("chapter_3_design")
        slides.append({"type": "content", "title": "系统需求分析与总体设计",
                        "items": _split_paragraphs(design_text, 4), "color": col_a})

        # 6. 系统架构
        impl_text = _get_chapter_text("chapter_4_implementation")
        slides.append({"type": "cards", "title": "核心功能模块",
                        "items": _split_paragraphs(impl_text, 4), "color": col_a})

        # 7. 核心实现
        slides.append({"type": "content", "title": "关键实现技术",
                        "items": _split_paragraphs(impl_text, 4), "color": col_a})

        # 8. 实验设计
        slides.append({"type": "section", "title": "实验设计与结果" if has_real_data else "实验设计方案",
                        "color": col_p})
        exp_text = _get_chapter_text("chapter_5_experiment")
        slides.append({"type": "content", "title": "实验方案与评价指标",
                        "items": _split_paragraphs(exp_text, 4), "color": col_p})

        # 9. 实验结果（有真实数据）或实验设计方案
        if has_real_data:
            slides.append({"type": "content", "title": "实验结果与数据分析 [基于真实数据]",
                            "items": _split_paragraphs(exp_text, 5), "color": col_p})
        else:
            slides.append({"type": "content", "title": "预期实验结果（实验设计方案）",
                            "items": ["（论文阶段尚未上传真实实验数据，以下为实验设计方案和预期结果。）",
                                      "实验数据采集方案已就绪，待项目实际运行后补充。",
                                      "预期通过对比实验验证系统的有效性和优越性。"],
                            "color": col_p})

        # 10. 结果分析
        slides.append({"type": "numbered", "title": "结果分析与讨论" if has_real_data else "预期分析维度",
                        "items": _split_paragraphs(exp_text, 5), "color": col_s})

        # 11. 创新点
        slides.append({"type": "section", "title": "创新点与贡献", "color": col_a})
        conc_text = _get_chapter_text("chapter_6_conclusion")
        slides.append({"type": "cards", "title": "主要创新点",
                        "items": _split_paragraphs(conc_text, 3), "color": col_a})

        # 12. 总结与展望
        slides.append({"type": "content", "title": "研究总结与未来展望",
                        "items": _split_paragraphs(conc_text, 4), "color": col_s})

        # 13. 研究成果
        slides.append({"type": "numbered", "title": "研究成果与产出",
                        "items": _split_paragraphs(outcomes_summary, 6) if outcomes_summary else ["暂无上传成果"],
                        "color": col_p})

        # 14. 致谢
        slides.append({"type": "ending"})

        return slides

    def generate_script(self, slides: list[dict]) -> dict:
        """生成答辩演讲稿（通过 LLM）

        参数：
            slides: 幻灯片定义列表（来自 _build_slides）
        返回：
            {slides: [{page, title, notes, duration_seconds}, ...], total_duration_minutes: int}
        """
        import httpx
        import json
        from ..core.config import settings

        # 构建简洁的幻灯片大纲
        outline = []
        for i, s in enumerate(slides):
            outline.append(f"第{i + 1}页 [{s['type']}]: {s.get('title', '')}")

        system_prompt = """你是一位经验丰富的毕业答辩指导老师。请为以下答辩 PPT 大纲生成每页的演讲稿要点。

返回 JSON：
{
  "slides": [
    {"page": 1, "title": "封面", "notes": "演讲要点（100字以内）", "duration_seconds": 20},
    ...
  ],
  "total_duration_minutes": 总时长（分钟）
}

要求：
- 每页 notes 控制在 100 字以内，简明扼要
- 封面、致谢页 duration_seconds 设为 15-20 秒
- 内容页 duration_seconds 设为 40-90 秒
- 总时长控制在 15-25 分钟
只返回 JSON。"""

        user_message = "PPT 大纲：\n" + "\n".join(outline)

        if not settings.DEEPSEEK_API_KEY:
            return {
                "slides": [{"page": i + 1, "title": s.get("title", ""), "notes": "", "duration_seconds": 60}
                           for i, s in enumerate(slides)],
                "total_duration_minutes": len(slides),
            }

        try:
            resp = httpx.post(
                f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.DEEPSEEK_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 2000,
                },
                timeout=120.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            content = content.strip()
            if content.startswith("```"):
                lines = content.split("\n")
                content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            return json.loads(content)
        except Exception:
            return {
                "slides": [{"page": i + 1, "title": s.get("title", ""), "notes": "", "duration_seconds": 60}
                           for i, s in enumerate(slides)],
                "total_duration_minutes": len(slides),
            }


defense_ppt_agent = DefensePPTAgent()
