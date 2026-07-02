"""项目资料全文搜索服务。"""
from __future__ import annotations

from typing import Any, Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from .evidence_retrieval_service import _score_document_chunk, tokenize_evidence_query
from .project_document_embedding_service import search_similar_project_document_chunks


def search_project_documents(
    db: Session,
    project_id: UUID | str,
    query: str,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """搜索指定项目下已解析入库的资料片段。"""
    from ..models.project_document_chunk import ProjectDocumentChunk

    chunks = (
        db.query(ProjectDocumentChunk)
        .filter(ProjectDocumentChunk.project_id == project_id)
        .order_by(ProjectDocumentChunk.updated_at.desc())
        .limit(200)
        .all()
    )
    keyword_hits = search_project_document_chunks(chunks, project_id, query, limit=limit)
    semantic_hits = search_project_document_semantic_hits(db, project_id, query, limit=limit)
    return merge_project_document_search_results(keyword_hits, semantic_hits, limit=limit)


def search_project_document_chunks(
    chunks: Iterable[Any],
    project_id: UUID | str,
    query: str,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """对现有资料片段集合执行关键词搜索。"""
    tokens = tokenize_evidence_query(query)
    safe_limit = max(1, min(limit, 50))
    items: list[dict[str, Any]] = []

    for chunk in chunks:
        title = getattr(chunk, "title", None) or getattr(chunk, "source_filename", None) or "上传资料"
        content = getattr(chunk, "content", "") or ""
        source_filename = getattr(chunk, "source_filename", None) or title
        score, reasons = _score_document_chunk(
            tokens=tokens,
            title=title,
            content=content,
            source_filename=source_filename,
        )
        has_keyword_hit = any("命中" in reason for reason in reasons)
        if score <= 0 and tokens:
            continue
        if tokens and not has_keyword_hit:
            continue
        items.append(
            {
                "chunk_id": str(getattr(chunk, "id")),
                "outcome_id": str(getattr(chunk, "outcome_id")),
                "title": title,
                "source_filename": source_filename,
                "source_type": getattr(chunk, "source_type", None),
                "section_title": getattr(chunk, "meta", {}).get("section_title") if getattr(chunk, "meta", None) else None,
                "section_level": getattr(chunk, "meta", {}).get("section_level") if getattr(chunk, "meta", None) else None,
                "section_path": getattr(chunk, "meta", {}).get("section_path") if getattr(chunk, "meta", None) else [],
                "content_excerpt": (getattr(chunk, "content_excerpt", None) or content)[:600],
                "download_url": f"/api/outcomes/{getattr(chunk, 'outcome_id')}/download",
                "score": score,
                "score_reasons": reasons,
                "action_label": "下载原文件",
                "action_url": f"/api/outcomes/{getattr(chunk, 'outcome_id')}/download",
            }
        )

    items.sort(key=lambda item: item["score"], reverse=True)
    return items[:safe_limit]


def search_project_document_semantic_hits(
    db: Session,
    project_id: UUID | str,
    query: str,
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """执行项目资料语义检索并转换为统一结果结构。"""
    semantic_hits = search_similar_project_document_chunks(
        db,
        project_id=project_id,
        query=query,
        top_k=max(1, min(limit, 20)),
    )
    items: list[dict[str, Any]] = []
    for item in semantic_hits:
        score = float(item.get("semantic_score") or 0)
        items.append(
            {
                "chunk_id": item["chunk_id"],
                "outcome_id": item["outcome_id"],
                "title": item.get("title") or item.get("source_filename") or "上传资料",
                "source_filename": item.get("source_filename"),
                "source_type": item.get("source_type"),
                "section_title": item.get("section_title"),
                "section_level": None,
                "section_path": [],
                "content_excerpt": item.get("content_excerpt") or "",
                "download_url": f"/api/outcomes/{item['outcome_id']}/download",
                "score": score,
                "score_reasons": [f"语义相似 {score:.2f}"],
                "action_label": "下载原文件",
                "action_url": f"/api/outcomes/{item['outcome_id']}/download",
            }
        )
    return items


def merge_project_document_search_results(
    keyword_hits: list[dict[str, Any]],
    semantic_hits: list[dict[str, Any]],
    *,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """合并关键词和语义检索结果。"""
    merged: dict[str, dict[str, Any]] = {}
    for item in keyword_hits + semantic_hits:
        chunk_id = str(item.get("chunk_id"))
        existing = merged.get(chunk_id)
        if existing is None:
            merged[chunk_id] = {
                **item,
                "score_reasons": list(dict.fromkeys(item.get("score_reasons", []))),
            }
            continue

        existing["score"] = max(float(existing.get("score") or 0), float(item.get("score") or 0))
        existing["score_reasons"] = list(
            dict.fromkeys([*(existing.get("score_reasons") or []), *(item.get("score_reasons") or [])])
        )
        for key, value in item.items():
            if existing.get(key) in (None, "", [], {}) and value not in (None, "", [], {}):
                existing[key] = value

    results = list(merged.values())
    results.sort(key=lambda item: float(item.get("score") or 0), reverse=True)
    return results[: max(1, min(limit, 50))]
