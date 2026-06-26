"""HTML deck 渲染服务。"""
from __future__ import annotations

import html
import os
from uuid import uuid4

from ..schemas.draft import PAPER_CHAPTER_KEYS, PAPER_CHAPTER_LABELS
from ..schemas.proposal import SECTION_KEYS, SECTION_LABELS


class WebDeckRenderService:
    """把结构化幻灯片数据渲染为单文件 HTML deck。"""

    def render(
        self,
        *,
        deck_title: str,
        slides_outline: list[dict],
        theme: str = "paper",
        object_prefix: str = "generated/decks",
    ) -> dict:
        """渲染并保存 HTML deck，返回产物元数据。"""
        deck_id = uuid4().hex[:12]
        object_key = f"{object_prefix}/{deck_id}/index.html"
        html_text = self.render_to_html(
            deck_title=deck_title,
            slides_outline=slides_outline,
            theme=theme,
        )
        from .upload_service import save_bytes
        save_bytes(html_text.encode("utf-8"), object_key, content_type="text/html; charset=utf-8")
        return {
            "artifact_type": "html_deck",
            "title": deck_title,
            "object_key": object_key,
            "filename": os.path.basename(object_key),
            "theme": theme,
            "slide_count": len(slides_outline or []),
        }

    def render_to_html(
        self,
        *,
        deck_title: str,
        slides_outline: list[dict],
        theme: str = "paper",
    ) -> str:
        """渲染为单文件 HTML。"""
        safe_title = html.escape(deck_title or "HTML Deck")
        slides = slides_outline or []
        sections = "\n".join(
            _render_slide(index, slide, total=len(slides))
            for index, slide in enumerate(slides, start=1)
        ) or '<section class="slide"><h2>暂无内容</h2><p>当前没有可展示的幻灯片内容。</p></section>'

        theme_class = html.escape(theme or "paper")
        return f"""<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{safe_title}</title>
    <style>
      :root {{
        --bg: #f2eee6;
        --card: #fffdf8;
        --card-soft: #f7f1e5;
        --text: #1f1a17;
        --muted: #75685a;
        --line: rgba(73, 62, 44, 0.16);
        --accent: #234b2b;
        --accent-soft: rgba(35, 75, 43, 0.10);
        --shadow: 0 22px 48px rgba(39, 31, 22, 0.10);
        --display-font: Georgia, "Times New Roman", "Noto Serif SC", serif;
        --body-font: Georgia, "Times New Roman", "Noto Serif SC", serif;
      }}
      .theme-swiss {{
        --bg: #eef1f3;
        --card: #ffffff;
        --card-soft: #f6f8fa;
        --text: #101318;
        --muted: #5f6b78;
        --line: rgba(24, 29, 35, 0.10);
        --accent: #0f4c81;
        --accent-soft: rgba(15, 76, 129, 0.10);
        --shadow: 0 24px 56px rgba(16, 19, 24, 0.10);
        --display-font: "Helvetica Neue", Arial, sans-serif;
        --body-font: "Helvetica Neue", Arial, sans-serif;
      }}
      * {{ box-sizing: border-box; }}
      body {{
        margin: 0;
        font-family: var(--body-font);
        background: var(--bg);
        color: var(--text);
      }}
      .deck {{
        max-width: 1360px;
        margin: 0 auto;
        padding: 36px 28px 72px;
      }}
      .deck-header {{
        margin-bottom: 32px;
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 24px;
      }}
      .deck-header h1 {{
        margin: 0;
        font-size: 42px;
        line-height: 1.1;
        font-family: var(--display-font);
        letter-spacing: -0.04em;
      }}
      .deck-header p {{
        margin: 10px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.7;
      }}
      .deck-badge {{
        align-self: start;
        border: 1px solid var(--line);
        background: var(--card);
        color: var(--muted);
        border-radius: 999px;
        padding: 10px 14px;
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }}
      .slides {{
        display: grid;
        gap: 28px;
      }}
      .slide {{
        min-height: 720px;
        border: 1px solid var(--line);
        background: var(--card);
        padding: 44px 52px;
        box-shadow: var(--shadow);
        position: relative;
        overflow: hidden;
      }}
      .slide::before {{
        content: "";
        position: absolute;
        inset: 0 auto auto 0;
        width: 160px;
        height: 160px;
        border-radius: 50%;
        background: var(--accent-soft);
        transform: translate(-38%, -42%);
        pointer-events: none;
      }}
      .slide-kicker {{
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--muted);
        position: relative;
        z-index: 1;
      }}
      .slide h2 {{
        margin: 14px 0 20px;
        font-size: 34px;
        line-height: 1.15;
        font-family: var(--display-font);
        letter-spacing: -0.04em;
        position: relative;
        z-index: 1;
      }}
      .slide ul {{
        margin: 0;
        padding-left: 22px;
        line-height: 1.9;
        font-size: 18px;
        position: relative;
        z-index: 1;
      }}
      .slide p {{
        font-size: 18px;
        line-height: 1.9;
        position: relative;
        z-index: 1;
      }}
      .slide-grid {{
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 26px;
        align-items: start;
        position: relative;
        z-index: 1;
      }}
      .slide-panel {{
        border: 1px solid var(--line);
        background: var(--card-soft);
        border-radius: 20px;
        padding: 20px 22px;
      }}
      .slide-panel ul {{
        margin-top: 6px;
      }}
      .slide-note {{
        border-left: 4px solid var(--accent);
        padding-left: 16px;
      }}
      .slide-cards {{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        position: relative;
        z-index: 1;
      }}
      .slide-card {{
        border: 1px solid var(--line);
        background: var(--card-soft);
        border-radius: 18px;
        padding: 18px 18px;
        min-height: 180px;
      }}
      .slide-card-index {{
        font-size: 11px;
        color: var(--muted);
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }}
      .slide-card-text {{
        margin-top: 14px;
        font-size: 17px;
        line-height: 1.8;
      }}
      .slide-footer {{
        margin-top: 28px;
        font-size: 12px;
        color: var(--muted);
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: relative;
        z-index: 1;
      }}
      .cover-slide {{
        min-height: 760px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }}
      .cover-slide h2 {{
        font-size: 56px;
        max-width: 10ch;
      }}
      .cover-subtitle {{
        max-width: 52ch;
        color: var(--muted);
      }}
      .cover-grid {{
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 20px;
        align-items: end;
      }}
      .cover-meta {{
        border: 1px solid var(--line);
        border-radius: 22px;
        background: var(--card-soft);
        padding: 18px 20px;
      }}
      .cover-meta strong {{
        display: block;
        font-size: 12px;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.16em;
      }}
      .cover-meta span {{
        display: block;
        margin-top: 10px;
        font-size: 24px;
        line-height: 1.4;
      }}
      .theme-swiss .slide,
      .theme-swiss .slide-panel,
      .theme-swiss .slide-card,
      .theme-swiss .cover-meta {{
        border-radius: 26px;
      }}
      .theme-swiss .slide::before {{
        width: 220px;
        height: 220px;
      }}
    </style>
  </head>
  <body>
    <main class="deck theme-{theme_class}">
      <header class="deck-header">
        <div>
          <h1>{safe_title}</h1>
          <p>Single-file HTML deck generated by skill <code>ppt.web_html_deck</code>.</p>
        </div>
        <div class="deck-badge">{len(slides)} Slides · Theme {theme_class}</div>
      </header>
      <div class="slides">
        {sections}
      </div>
    </main>
  </body>
</html>"""


def _render_slide(index: int, slide: dict, *, total: int) -> str:
    title = html.escape(str(slide.get("title", "") or f"Slide {index}"))
    kind = html.escape(str(slide.get("type", "") or "content"))
    items = slide.get("items") or []
    description = html.escape(str(slide.get("description", "") or ""))
    slide_class = "slide"

    if kind == "cover":
        slide_class += " cover-slide"
        body = f"""
  <div>
    <div class="slide-kicker">Opening Slide</div>
    <h2>{title}</h2>
    <p class="cover-subtitle">{description or '当前 deck 作为网页演示版本输出，适合预演和内容分享。'}</p>
  </div>
  <div class="cover-grid">
    <div class="slide-note">
      <p>本 deck 重点用于快速预览结构、页面叙事和风格，不替代正式 PPTX 交付文件。</p>
    </div>
    <div class="cover-meta">
      <strong>Deck Summary</strong>
      <span>{total} pages / HTML presentation</span>
    </div>
  </div>"""
    elif kind == "cards":
        cards = items if isinstance(items, list) and items else [description or "当前幻灯片暂无正文内容。"]
        cards_html = "".join(
            f"""
      <article class="slide-card">
        <div class="slide-card-index">Card {idx:02d}</div>
        <div class="slide-card-text">{html.escape(str(item))}</div>
      </article>""".rstrip()
            for idx, item in enumerate(cards, start=1)
        )
        body = f'<div class="slide-cards">{cards_html}</div>'
    elif kind == "numbered":
        list_html = "<ul>" + "".join(
            f"<li>{html.escape(str(item))}</li>"
            for item in items
        ) + "</ul>" if isinstance(items, list) and items else "<p>当前幻灯片暂无正文内容。</p>"
        body = f"""
  <div class="slide-grid">
    <div class="slide-panel">
      <p class="slide-kicker">Key Sequence</p>
      {list_html}
    </div>
    <div class="slide-note">
      <p>{description or '这一页适合承载分点叙事、方法步骤或阶段总结。'}</p>
    </div>
  </div>"""
    else:
        list_html = "<ul>" + "".join(
            f"<li>{html.escape(str(item))}</li>"
            for item in items
        ) + "</ul>" if isinstance(items, list) and items else ""
        body = f"""
  <div class="slide-grid">
    <div class="slide-note">
      <p>{description or '当前幻灯片暂无正文内容。'}</p>
    </div>
    <div class="slide-panel">
      {list_html or '<p>当前幻灯片暂无条目内容。</p>'}
    </div>
  </div>"""

    return f"""
<section class="{slide_class}">
  {"" if kind == "cover" else f'<div class="slide-kicker">Slide {index:02d} · {kind}</div>'}
  {"" if kind == "cover" else f'<h2>{title}</h2>'}
  {body}
  <div class="slide-footer">
    <span>Generated by skill <code>ppt.web_html_deck</code>.</span>
    <span>{index:02d} / {total:02d}</span>
  </div>
</section>""".strip()


web_deck_render_service = WebDeckRenderService()


def build_slides_outline_from_draft(*, title: str, draft_content: dict) -> list[dict]:
    """从论文草稿内容构建最小 HTML deck 大纲。"""
    slides = [{"type": "cover", "title": title, "description": "论文写作导出预览"}]

    for chapter_key in PAPER_CHAPTER_KEYS:
        record = draft_content.get(chapter_key, {}) if isinstance(draft_content, dict) else {}
        chapter_title = str(record.get("title") or PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key))
        content = str(record.get("content") or "").strip()
        slides.append({
            "type": "section",
            "title": chapter_title,
            "description": _summarize_text(content),
            "items": _split_outline_items(content, max_items=4),
        })

    return slides


def build_slides_outline_from_proposal(*, title: str, proposal_content: dict) -> list[dict]:
    """从开题报告结构构建最小 HTML deck 大纲。"""
    slides = [{"type": "cover", "title": title, "description": "开题汇报 HTML deck 预览"}]

    for section_key in SECTION_KEYS:
        record = proposal_content.get(section_key, {}) if isinstance(proposal_content, dict) else {}
        section_title = str(record.get("title") or SECTION_LABELS.get(section_key, section_key))
        content = str(record.get("content") or "").strip()
        slides.append({
            "type": "content",
            "title": section_title,
            "description": _summarize_text(content),
            "items": _split_outline_items(content, max_items=5),
        })

    return slides


def _summarize_text(content: str, max_len: int = 220) -> str:
    text = " ".join((content or "").split())
    if not text:
        return "当前内容为空。"
    return text[:max_len] + ("..." if len(text) > max_len else "")


def _split_outline_items(content: str, *, max_items: int) -> list[str]:
    parts = [item.strip() for item in str(content or "").split("\n") if item.strip()]
    if not parts:
        return ["当前内容为空。"]
    return parts[:max_items]
