"""学术检索任务服务，统一维护任务状态与来源诊断。"""
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from ..models.literature_search_task import LiteratureSearchTask


FAILED_SOURCE_STATUSES = {
    "error",
    "http_error",
    "gateway_timeout",
    "blocked",
    "rate_limited",
    "retryable_error",
}


def create_search_task(db: Session, payload) -> LiteratureSearchTask:
    """创建待执行的学术检索任务。"""
    task = LiteratureSearchTask(
        project_id=getattr(payload, "project_id", None),
        query=_build_query_summary(payload),
        mode=getattr(payload, "mode", None) or "quick_search",
        library_scope=getattr(payload, "library_scope", None) or "all",
        selected_sources=getattr(payload, "sources", None) or [],
        status="pending",
        total_results=0,
        source_statuses={},
        result_snapshot=[],
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def mark_task_running(db: Session, task_id: UUID) -> LiteratureSearchTask | None:
    """把任务标记为执行中。"""
    task = _get_task(db, task_id)
    if not task:
        return None
    task.status = "running"
    db.commit()
    db.refresh(task)
    return task


def mark_task_success(db: Session, task_id: UUID, result: dict[str, Any]) -> LiteratureSearchTask | None:
    """保存检索结果和来源诊断，并根据诊断推断最终状态。"""
    task = _get_task(db, task_id)
    if not task:
        return None
    total_results = int(result.get("total_found") or len(result.get("papers") or []))
    source_statuses = result.get("source_statuses") or {}
    task.status = infer_task_status(source_statuses, total_results)
    task.total_results = total_results
    task.selected_sources = result.get("selected_sources") or task.selected_sources or []
    task.source_statuses = source_statuses
    task.result_snapshot = _build_result_snapshot(result.get("papers") or [])
    task.error_message = None
    db.commit()
    db.refresh(task)
    return task


def mark_task_failed(db: Session, task_id: UUID, message: str) -> LiteratureSearchTask | None:
    """记录检索任务失败原因。"""
    task = _get_task(db, task_id)
    if not task:
        return None
    task.status = "failed"
    task.error_message = message[:1000] if message else "检索任务失败"
    db.commit()
    db.refresh(task)
    return task


def infer_task_status(source_statuses: dict[str, Any] | None, total_results: int) -> str:
    """根据来源状态推断任务状态，区分系统故障和正常无结果。"""
    statuses = source_statuses or {}
    normalized_statuses = [
        str(info.get("status", "")).strip()
        for info in statuses.values()
        if isinstance(info, dict)
    ]
    failed_count = sum(status in FAILED_SOURCE_STATUSES for status in normalized_statuses)

    if total_results > 0:
        return "partial" if failed_count > 0 else "success"
    if normalized_statuses and failed_count == len(normalized_statuses):
        return "failed"
    return "success"


def _get_task(db: Session, task_id: UUID) -> LiteratureSearchTask | None:
    return db.query(LiteratureSearchTask).filter(LiteratureSearchTask.id == task_id).first()


def _build_query_summary(payload) -> str:
    keywords_cn = [kw for kw in getattr(payload, "keywords_cn", []) or [] if kw]
    keywords_en = [kw for kw in getattr(payload, "keywords_en", []) or [] if kw]
    query = " / ".join(keywords_cn + keywords_en)
    return query or "未提供关键词"


def _build_result_snapshot(papers: list[dict[str, Any]], limit: int = 30) -> list[dict[str, Any]]:
    """只保存结果列表需要展示和追踪的精简字段。"""
    snapshot = []
    for paper in papers[:limit]:
        abstract = paper.get("abstract")
        if isinstance(abstract, str) and len(abstract) > 600:
            abstract = f"{abstract[:600]}..."
        snapshot.append(
            {
                "title": paper.get("title"),
                "authors": paper.get("authors") or [],
                "year": paper.get("year"),
                "venue": paper.get("venue"),
                "source": paper.get("source"),
                "abstract": abstract,
                "url": paper.get("url"),
                "doi": paper.get("doi"),
                "citation_count": paper.get("citation_count", 0),
                "relevance_score": paper.get("relevance_score"),
                "final_score": paper.get("final_score"),
                "why_selected": paper.get("why_selected"),
            }
        )
    return snapshot
