"""项目内部证据卡片与项目文献检索服务。"""
import re
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.paper import Paper
from ..models.paper_note import PaperNote
from ..models.project_document_chunk import ProjectDocumentChunk

STRONG_EVIDENCE_NOTE_TYPES = {"finding", "method", "limitation"}


def tokenize_evidence_query(text: str) -> list[str]:
    """把用户问题拆成中英文关键词，用于轻量证据召回。"""
    raw_tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_-]{1,}|[\u4e00-\u9fff]{2,8}", text or "")
    tokens: list[str] = []
    seen: set[str] = set()
    for token in raw_tokens:
        normalized = token.lower().strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            tokens.append(normalized)
    return tokens


def retrieve_project_evidence(
    db: Session,
    project_id: UUID | str,
    query: str,
    *,
    limit: int = 6,
    min_confidence: int = 0,
) -> list[dict[str, Any]]:
    """检索当前项目下与问题相关的阅读笔记/证据卡片。"""
    tokens = tokenize_evidence_query(query)
    safe_limit = max(1, min(limit, 30))
    notes = (
        db.query(PaperNote)
        .filter(PaperNote.project_id == project_id)
        .order_by(PaperNote.updated_at.desc())
        .limit(50)
        .all()
    )

    items = []
    for note in notes:
        confidence = getattr(note, "confidence", None)
        if confidence is not None and confidence < min_confidence:
            continue

        item = _note_to_evidence_item(db, note, project_id, tokens)
        if item["score"] <= 0 and tokens:
            continue
        items.append(item)

    items.sort(key=lambda item: (item["score"], item.get("confidence") or 0), reverse=True)
    return items[:safe_limit]


def retrieve_project_paper_evidence(
    db: Session,
    project_id: UUID | str,
    query: str,
    *,
    limit: int = 6,
) -> list[dict[str, Any]]:
    """检索当前项目文献库中与问题最相关的文献快照。"""
    tokens = tokenize_evidence_query(query)
    safe_limit = max(1, min(limit, 30))
    papers = (
        db.query(Paper)
        .filter(Paper.project_id == project_id)
        .order_by(Paper.updated_at.desc())
        .limit(50)
        .all()
    )

    items = []
    for paper in papers:
        item = _paper_to_evidence_item(paper, project_id, tokens)
        if item["score"] <= 0 and tokens:
            continue
        items.append(item)

    items.sort(key=lambda item: (item["score"], item.get("citation_count") or 0), reverse=True)
    return items[:safe_limit]


def retrieve_project_document_chunks(
    db: Session,
    project_id: UUID | str,
    query: str,
    *,
    limit: int = 6,
) -> list[dict[str, Any]]:
    """检索用户上传并解析入库的项目资料片段。"""
    tokens = tokenize_evidence_query(query)
    safe_limit = max(1, min(limit, 30))
    chunks = (
        db.query(ProjectDocumentChunk)
        .filter(ProjectDocumentChunk.project_id == project_id)
        .order_by(ProjectDocumentChunk.updated_at.desc())
        .limit(80)
        .all()
    )

    items = []
    for chunk in chunks:
        item = _document_chunk_to_evidence_item(chunk, project_id, tokens)
        if item["score"] <= 0 and tokens:
            continue
        items.append(item)

    items.sort(key=lambda item: item["score"], reverse=True)
    return items[:safe_limit]


def build_evidence_context(items: list[dict[str, Any]]) -> str:
    """把证据卡片列表格式化为可放进 Agent prompt 的上下文。"""
    if not items:
        return ""

    lines = ["内部证据卡片（只能作为已沉淀依据使用，不可扩写为不存在的数据）："]
    for index, item in enumerate(items, 1):
        lines.append(f"[E{index}] 标题：{item['title']}")
        lines.append(f"类型：{item.get('note_type') or 'note'}")
        if item.get("source_title"):
            source_label = "来源资料" if item.get("kind") == "project_document_chunk" else "来源文献"
            lines.append(f"{source_label}：{item['source_title']}")
        if item.get("evidence_text"):
            lines.append(f"证据摘录：{item['evidence_text']}")
        elif item.get("content_excerpt"):
            lines.append(f"笔记内容：{item['content_excerpt']}")
        if item.get("evidence_level"):
            lines.append(f"证据等级：{item['evidence_level']}")
        if item.get("confidence") is not None:
            lines.append(f"可靠性：{item['confidence']}/100")
        if item.get("score_reasons"):
            lines.append(f"命中原因：{'、'.join(item['score_reasons'])}")
        lines.append("")
    return "\n".join(lines).strip()


def _note_to_evidence_item(db: Session, note, project_id: UUID | str, tokens: list[str]) -> dict[str, Any]:
    paper = getattr(note, "paper", None)
    if not paper and getattr(note, "paper_id", None):
        paper = db.query(Paper).filter(Paper.id == note.paper_id).first()

    title = getattr(note, "title", "") or "未命名证据卡片"
    content = getattr(note, "content", "") or ""
    evidence_text = getattr(note, "evidence_text", "") or ""
    tags = getattr(note, "tags", None) or []
    source_title = getattr(paper, "title", None) or "关联文献"

    score, reasons = _score_note(
        tokens=tokens,
        title=title,
        content=content,
        evidence_text=evidence_text,
        tags=tags,
        confidence=getattr(note, "confidence", None),
        note_type=getattr(note, "note_type", None),
    )
    content_excerpt = evidence_text or content

    return {
        "kind": "paper_note",
        "title": title,
        "content_excerpt": content_excerpt[:600],
        "score": score,
        "score_reasons": reasons,
        "note_type": getattr(note, "note_type", None),
        "evidence_text": evidence_text or None,
        "evidence_level": getattr(note, "evidence_level", None),
        "confidence": getattr(note, "confidence", None),
        "source_title": source_title,
        "tags": tags,
        "action_url": f"/projects/{project_id}/literature/{note.paper_id}",
        "action_label": "打开证据卡片",
    }


def _paper_to_evidence_item(paper, project_id: UUID | str, tokens: list[str]) -> dict[str, Any]:
    title = getattr(paper, "title", "") or "未命名文献"
    abstract = getattr(paper, "abstract", "") or ""
    authors = _split_authors(getattr(paper, "authors", None))
    venue = getattr(paper, "venue", None)
    year = getattr(paper, "year", None)
    source = getattr(paper, "source", None)
    citation_count = getattr(paper, "citation_count", 0) or 0

    score, reasons = _score_paper(
        tokens=tokens,
        title=title,
        abstract=abstract,
        authors=authors,
        venue=venue or "",
        citation_count=citation_count,
    )

    meta_bits = [bit for bit in [venue, f"{year}" if year else None, f"来源 {source}" if source else None] if bit]
    meta_line = " · ".join(meta_bits)
    content_excerpt = abstract[:600] if abstract else meta_line or "项目文献库已保存该文献，当前暂无摘要。"

    return {
        "kind": "project_paper",
        "title": title,
        "content_excerpt": content_excerpt,
        "score": score,
        "score_reasons": reasons,
        "citation_count": citation_count,
        "source": source,
        "year": year,
        "venue": venue,
        "authors": authors,
        "action_url": f"/projects/{project_id}/literature/{paper.id}",
        "action_label": "打开项目文献",
    }


def _document_chunk_to_evidence_item(chunk, project_id: UUID | str, tokens: list[str]) -> dict[str, Any]:
    title = getattr(chunk, "title", None) or getattr(chunk, "source_filename", None) or "上传资料"
    content = getattr(chunk, "content", "") or ""
    source_filename = getattr(chunk, "source_filename", None) or title
    score, reasons = _score_document_chunk(
        tokens=tokens,
        title=title,
        content=content,
        source_filename=source_filename,
    )

    return {
        "kind": "project_document_chunk",
        "title": title,
        "content_excerpt": (getattr(chunk, "content_excerpt", None) or content)[:600],
        "score": score,
        "score_reasons": reasons,
        "source_title": source_filename,
        "source": "project_upload",
        "action_url": f"/api/outcomes/{chunk.outcome_id}/download",
        "action_label": "下载来源文件",
        "tags": [getattr(chunk, "source_type", "")] if getattr(chunk, "source_type", None) else [],
    }


def _score_note(
    *,
    tokens: list[str],
    title: str,
    content: str,
    evidence_text: str,
    tags: list[str],
    confidence: int | None,
    note_type: str | None,
) -> tuple[int, list[str]]:
    score = 1 if not tokens else 0
    reasons: list[str] = []

    title_text = title.lower()
    content_text = content.lower()
    evidence_text_lower = evidence_text.lower()
    tags_text = " ".join(str(tag).lower() for tag in tags)

    def add_reason(reason: str):
        if reason not in reasons:
            reasons.append(reason)

    for token in tokens:
        if token in title_text:
            score += 3
            add_reason("标题命中")
        if token in evidence_text_lower:
            score += 3
            add_reason("证据摘录命中")
        if token in tags_text:
            score += 2
            add_reason("标签命中")
        if token in content_text:
            score += 1
            add_reason("内容命中")

    if confidence is not None:
        if confidence >= 80:
            score += 2
            add_reason("高可信度")
        elif confidence >= 70:
            score += 1
            add_reason("可信度达标")

    # finding/method/limitation 更适合作为可引用依据；idea 只作为灵感，不额外加权。
    if note_type in STRONG_EVIDENCE_NOTE_TYPES:
        score += 1
        add_reason("方法/发现类证据")

    return score, reasons


def _score_document_chunk(
    *,
    tokens: list[str],
    title: str,
    content: str,
    source_filename: str,
) -> tuple[int, list[str]]:
    score = 1 if not tokens else 0
    reasons: list[str] = []
    title_text = title.lower()
    filename_text = source_filename.lower()
    content_text = content.lower()

    def add_reason(reason: str):
        if reason not in reasons:
            reasons.append(reason)

    for token in tokens:
        if token in title_text:
            score += 3
            add_reason("资料标题命中")
        if token in filename_text:
            score += 2
            add_reason("文件名命中")
        if token in content_text:
            score += 3
            add_reason("资料正文命中")

    if content:
        score += 1
        add_reason("含可引用资料片段")

    return score, reasons


def _score_paper(
    *,
    tokens: list[str],
    title: str,
    abstract: str,
    authors: list[str],
    venue: str,
    citation_count: int,
) -> tuple[int, list[str]]:
    score = 1 if not tokens else 0
    reasons: list[str] = []

    title_text = title.lower()
    abstract_text = abstract.lower()
    authors_text = " ".join(author.lower() for author in authors)
    venue_text = venue.lower()

    def add_reason(reason: str):
        if reason not in reasons:
            reasons.append(reason)

    for token in tokens:
        if token in title_text:
            score += 4
            add_reason("文献标题命中")
        if token in abstract_text:
            score += 2
            add_reason("文献摘要命中")
        if token in venue_text:
            score += 1
            add_reason("期刊/会议命中")
        if token in authors_text:
            score += 1
            add_reason("作者命中")

    if citation_count >= 100:
        score += 2
        add_reason("高被引文献")
    elif citation_count >= 20:
        score += 1
        add_reason("有一定引用基础")

    if abstract:
        score += 1
        add_reason("含摘要")

    return score, reasons


def _split_authors(authors: str | None) -> list[str]:
    if not authors:
        return []
    return [item.strip() for item in re.split(r"[;,，、]", authors) if item.strip()]
