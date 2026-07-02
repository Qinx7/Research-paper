"""项目工作台聚合服务：汇总知识沉淀映射与交付状态。"""
from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Any, Iterable
from uuid import UUID

from sqlalchemy.orm import Session


def load_project_workspace_snapshot(db: Session, project_id: UUID | str) -> dict[str, Any]:
    """从数据库加载项目相关对象，并构建工作台快照。"""
    return load_project_workspace_snapshot_for_draft(db, project_id, active_draft_id=None)


def load_project_workspace_snapshot_for_draft(
    db: Session,
    project_id: UUID | str,
    active_draft_id: UUID | str | None,
) -> dict[str, Any]:
    """从数据库加载项目相关对象，并按指定草稿构建工作台快照。"""
    from ..models.draft import Draft
    from ..models.outcome import Outcome
    from ..models.paper import Paper
    from ..models.paper_note import PaperNote
    from ..models.project_document_chunk import ProjectDocumentChunk

    outcomes = (
        db.query(Outcome)
        .filter(Outcome.project_id == project_id)
        .order_by(Outcome.created_at.desc())
        .all()
    )
    drafts = (
        db.query(Draft)
        .filter(Draft.project_id == project_id)
        .order_by(Draft.updated_at.desc())
        .all()
    )
    papers = (
        db.query(Paper)
        .filter(Paper.project_id == project_id)
        .order_by(Paper.updated_at.desc())
        .all()
    )
    paper_notes = (
        db.query(PaperNote)
        .filter(PaperNote.project_id == project_id)
        .order_by(PaperNote.updated_at.desc())
        .all()
    )
    chunks = (
        db.query(ProjectDocumentChunk)
        .filter(ProjectDocumentChunk.project_id == project_id)
        .order_by(ProjectDocumentChunk.updated_at.desc())
        .all()
    )
    return build_project_workspace_snapshot(
        project_id=project_id,
        outcomes=outcomes,
        drafts=drafts,
        papers=papers,
        paper_notes=paper_notes,
        chunks=chunks,
        active_draft_id=str(active_draft_id) if active_draft_id else None,
    )


def build_project_workspace_snapshot(
    *,
    project_id: UUID | str,
    outcomes: Iterable[Any],
    drafts: Iterable[Any],
    papers: Iterable[Any],
    paper_notes: Iterable[Any],
    chunks: Iterable[Any],
    active_draft_id: str | None = None,
) -> dict[str, Any]:
    """构建项目知识与交付工作台快照。"""
    project_id_str = str(project_id)
    outcome_list = list(outcomes)
    draft_list = list(drafts)
    paper_list = list(papers)
    note_list = list(paper_notes)
    chunk_list = list(chunks)
    latest_draft = _resolve_active_draft(draft_list, active_draft_id)
    chapters = _build_chapter_summaries(
        project_id=project_id_str,
        draft=latest_draft,
        outcomes=outcome_list,
        papers=paper_list,
        paper_notes=note_list,
        chunks=chunk_list,
    )
    chapter_titles_by_outcome = _collect_outcome_chapter_links(chapters)

    outcomes_summary = [
        {
            "id": str(getattr(outcome, "id")),
            "name": getattr(outcome, "name", "未命名成果"),
            "outcome_type": getattr(outcome, "outcome_type", None),
            "description": getattr(outcome, "description", None),
            "knowledge_status": _knowledge_status(outcome),
            "chunk_count": _knowledge_chunk_count(outcome),
            "download_url": _outcome_download_url(outcome),
            "cited_by_chapters": chapter_titles_by_outcome.get(str(getattr(outcome, "id")), []),
            "extra_data": getattr(outcome, "extra_data", None) or {},
        }
        for outcome in outcome_list
    ]

    indexed_count = sum(1 for outcome in outcome_list if _knowledge_status(outcome) == "indexed")
    delivery = _build_delivery_summary(project_id_str, latest_draft, chapters)

    return {
        "stats": {
            "outcomes_total": len(outcome_list),
            "indexed_outcomes": indexed_count,
            "drafts_total": len(draft_list),
            "evidence_cards_total": len(note_list),
            "project_papers_total": len(paper_list),
            "project_chunks_total": len(chunk_list),
        },
        "outcomes": outcomes_summary,
        "chapters": chapters,
        "delivery": delivery,
    }


def _build_chapter_summaries(
    *,
    project_id: str,
    draft: Any | None,
    outcomes: list[Any],
    papers: list[Any],
    paper_notes: list[Any],
    chunks: list[Any],
) -> list[dict[str, Any]]:
    if not draft:
        return []

    draft_content = getattr(draft, "content", None) or {}
    sections = list(getattr(draft, "sections", None) or [])
    chapter_keys = [getattr(section, "key", None) for section in sections if getattr(section, "key", None)]
    chapter_keys.extend([key for key in draft_content.keys() if key not in chapter_keys])

    note_index = {str(getattr(note, "paper_id", "")): note for note in paper_notes if getattr(note, "paper_id", None)}
    summaries: list[dict[str, Any]] = []
    for key in chapter_keys:
        section = next((item for item in sections if getattr(item, "key", None) == key), None)
        record = draft_content.get(key) if isinstance(draft_content, dict) else None
        title = (
            getattr(section, "title", None)
            or _record_value(record, "title")
            or key
        )
        content = _record_value(record, "content") or getattr(section, "content", "") or ""
        citations = _string_list(_record_value(record, "citations"))
        match_text = "\n".join([title, content, *citations])

        linked_outcomes = _match_outcomes(project_id, outcomes, match_text)
        linked_papers = _match_papers(project_id, papers, match_text)
        linked_notes = _match_notes(project_id, paper_notes, note_index, linked_papers, match_text)
        linked_chunks = _match_chunks(project_id, chunks, linked_outcomes, match_text)
        status = (
            _record_value(record, "status")
            or getattr(section, "status", None)
            or "draft"
        )

        summaries.append({
            "draft_id": str(getattr(draft, "id")),
            "chapter_key": key,
            "title": title,
            "status": status,
            "word_count": len(re.sub(r"\s+", "", content)),
            "citations_count": len(citations),
            "evidence_count": len(linked_outcomes) + len(linked_papers) + len(linked_notes) + len(linked_chunks),
            "data_based": bool(_record_value(record, "data_based")),
            "linked_outcomes": linked_outcomes,
            "linked_papers": linked_papers,
            "linked_notes": linked_notes,
            "linked_chunks": linked_chunks,
            "action_url": f"/writing?project_id={project_id}&draft_id={getattr(draft, 'id')}",
            "action_label": "进入论文工作流",
        })
    return summaries


def _build_delivery_summary(
    project_id: str,
    latest_draft: Any | None,
    chapters: list[dict[str, Any]],
) -> dict[str, Any]:
    latest_draft_summary = None
    has_real_data = False
    presentation_ready = False
    presentation_summary = {
        "ready": presentation_ready,
        "has_real_data": has_real_data,
        "draft_id": None,
        "action_url": f"/writing?project_id={project_id}",
        "action_label": "进入论文工作台",
    }
    if latest_draft:
        completed_count = sum(1 for chapter in chapters if chapter["status"] != "draft")
        chapter_total = max(len(chapters), 1)
        completion_rate = round((completed_count / chapter_total) * 100)
        has_real_data = any(chapter["data_based"] for chapter in chapters)
        presentation_ready = has_real_data
        latest_draft_summary = {
            "id": str(getattr(latest_draft, "id")),
            "title": getattr(latest_draft, "title", "论文草稿"),
            "version": getattr(latest_draft, "version", 1),
            "completed_chapters": completed_count,
            "total_chapters": chapter_total,
            "completion_rate": completion_rate,
            "download_docx_url": f"/api/drafts/{getattr(latest_draft, 'id')}/download?format=docx",
            "download_pdf_url": f"/api/drafts/{getattr(latest_draft, 'id')}/download?format=pdf",
            "action_url": f"/writing?project_id={project_id}&draft_id={getattr(latest_draft, 'id')}",
            "action_label": "继续论文写作",
        }
        presentation_summary = {
            "ready": presentation_ready,
            "has_real_data": has_real_data,
            "draft_id": str(getattr(latest_draft, "id")),
            "action_url": f"/writing?project_id={project_id}&draft_id={getattr(latest_draft, 'id')}",
            "action_label": "进入论文工作台",
        }

    return {
        "latest_draft": latest_draft_summary,
        "presentation": presentation_summary,
    }


def _collect_outcome_chapter_links(chapters: list[dict[str, Any]]) -> dict[str, list[str]]:
    links: dict[str, list[str]] = {}
    for chapter in chapters:
        title = chapter["title"]
        for outcome in chapter["linked_outcomes"]:
            links.setdefault(outcome["id"], [])
            if title not in links[outcome["id"]]:
                links[outcome["id"]].append(title)
    return links


def _match_outcomes(project_id: str, outcomes: list[Any], match_text: str) -> list[dict[str, Any]]:
    normalized = _normalize(match_text)
    matches = []
    for outcome in outcomes:
        needles = [getattr(outcome, "name", ""), os.path.basename(getattr(outcome, "file_path", "") or "")]
        if not _contains_any(normalized, needles):
            continue
        matches.append({
            "id": str(getattr(outcome, "id")),
            "name": getattr(outcome, "name", "未命名成果"),
            "outcome_type": getattr(outcome, "outcome_type", None),
            "download_url": _outcome_download_url(outcome),
            "action_url": f"/projects/{project_id}?view=overview",
            "action_label": "查看项目知识工作台",
        })
    return matches


def _match_papers(project_id: str, papers: list[Any], match_text: str) -> list[dict[str, Any]]:
    normalized = _normalize(match_text)
    matches = []
    for paper in papers:
        needles = [getattr(paper, "title", ""), getattr(paper, "doi", "")]
        if not _contains_any(normalized, needles):
            continue
        matches.append({
            "id": str(getattr(paper, "id")),
            "title": getattr(paper, "title", "未命名文献"),
            "venue": getattr(paper, "venue", None),
            "year": getattr(paper, "year", None),
            "citation_count": getattr(paper, "citation_count", 0) or 0,
            "action_url": f"/projects/{project_id}?view=literature",
            "action_label": "进入项目文献库",
        })
    return matches


def _match_notes(
    project_id: str,
    paper_notes: list[Any],
    note_index: dict[str, Any],
    linked_papers: list[dict[str, Any]],
    match_text: str,
) -> list[dict[str, Any]]:
    normalized = _normalize(match_text)
    linked_paper_ids = {paper["id"] for paper in linked_papers}
    matches = []
    for note in paper_notes:
        note_paper_id = str(getattr(note, "paper_id", ""))
        note_paper = note_index.get(note_paper_id)
        needles = [
            getattr(note, "title", ""),
            getattr(note, "evidence_text", ""),
            getattr(note_paper, "title", "") if note_paper else "",
        ]
        if note_paper_id not in linked_paper_ids and not _contains_any(normalized, needles):
            continue
        matches.append({
            "id": str(getattr(note, "id")),
            "title": getattr(note, "title", "未命名证据卡片"),
            "note_type": getattr(note, "note_type", None),
            "confidence": getattr(note, "confidence", None),
            "evidence_text": getattr(note, "evidence_text", None),
            "action_url": f"/projects/{project_id}?view=literature",
            "action_label": "查看文献与证据",
        })
    return matches


def _match_chunks(
    project_id: str,
    chunks: list[Any],
    linked_outcomes: list[dict[str, Any]],
    match_text: str,
) -> list[dict[str, Any]]:
    normalized = _normalize(match_text)
    linked_outcome_ids = {item["id"] for item in linked_outcomes}
    matches = []
    for chunk in chunks:
        outcome_id = str(getattr(chunk, "outcome_id", ""))
        needles = [
            getattr(chunk, "title", ""),
            getattr(chunk, "source_filename", ""),
            getattr(chunk, "content_excerpt", ""),
        ]
        if outcome_id not in linked_outcome_ids and not _contains_any(normalized, needles):
            continue
        matches.append({
            "id": str(getattr(chunk, "id")),
            "title": getattr(chunk, "title", "资料片段"),
            "source_filename": getattr(chunk, "source_filename", None),
            "source_type": getattr(chunk, "source_type", None),
            "section_title": getattr(chunk, "meta", {}).get("section_title") if getattr(chunk, "meta", None) else None,
            "section_level": getattr(chunk, "meta", {}).get("section_level") if getattr(chunk, "meta", None) else None,
            "section_path": getattr(chunk, "meta", {}).get("section_path") if getattr(chunk, "meta", None) else [],
            "download_url": f"/api/outcomes/{getattr(chunk, 'outcome_id')}/download",
            "action_url": f"/projects/{project_id}?view=overview",
            "action_label": "查看知识工作台",
        })
    return matches


def _contains_any(normalized_text: str, needles: Iterable[str | None]) -> bool:
    for needle in needles:
        if not needle:
            continue
        normalized_needle = _normalize(needle)
        if normalized_needle and normalized_needle in normalized_text:
            return True
    return False


def _normalize(value: str) -> str:
    return re.sub(r"\s+", "", (value or "").strip().lower())


def _record_value(record: Any, key: str) -> Any:
    if isinstance(record, dict):
        return record.get(key)
    return getattr(record, key, None) if record is not None else None


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _knowledge_status(outcome: Any) -> str:
    extra = getattr(outcome, "extra_data", None) or {}
    if isinstance(extra, dict):
        return str(extra.get("knowledge_status") or "pending")
    return "pending"


def _knowledge_chunk_count(outcome: Any) -> int:
    extra = getattr(outcome, "extra_data", None) or {}
    if isinstance(extra, dict):
        return int(extra.get("knowledge_chunk_count") or 0)
    return 0


def _outcome_download_url(outcome: Any) -> str | None:
    if not getattr(outcome, "file_path", None):
        return None
    return f"/api/outcomes/{getattr(outcome, 'id')}/download"


def _latest_by(items: list[Any], field: str) -> Any | None:
    if not items:
        return None

    def sort_key(item: Any):
        value = getattr(item, field, None)
        if isinstance(value, datetime):
            return value
        return datetime.min

    return sorted(items, key=sort_key, reverse=True)[0]


def _resolve_active_draft(drafts: list[Any], active_draft_id: str | None) -> Any | None:
    if active_draft_id:
        matched = next((draft for draft in drafts if str(getattr(draft, "id", "")) == str(active_draft_id)), None)
        if matched is not None:
            return matched
    return _latest_by(drafts, "updated_at")
