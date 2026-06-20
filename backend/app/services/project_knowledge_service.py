"""项目上传资料解析入知识库服务。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.outcome import Outcome
from ..models.project_document_chunk import ProjectDocumentChunk
from ..schemas.project_document import OutcomeKnowledgeStatus
from .document_parse_service import DocumentParseError, UnsupportedDocumentType, chunk_text, extract_text_from_bytes
from .upload_service import get_object_stream


def get_outcome_knowledge_status(outcome: Outcome) -> OutcomeKnowledgeStatus:
    """从成果扩展数据中读取知识库入库状态。"""
    extra = outcome.extra_data or {}
    status = extra.get("knowledge_status") or "pending"
    count = int(extra.get("knowledge_chunk_count") or 0)
    error = extra.get("knowledge_error")
    indexed_at = extra.get("knowledge_indexed_at")
    parsed_indexed_at = None
    if indexed_at:
        try:
            parsed_indexed_at = datetime.fromisoformat(indexed_at)
        except ValueError:
            parsed_indexed_at = None
    return OutcomeKnowledgeStatus(
        outcome_id=outcome.id,
        status=status,
        chunk_count=count,
        message=_status_message(status, count),
        error=error,
        indexed_at=parsed_indexed_at,
    )


def index_outcome_document(db: Session, outcome: Outcome) -> OutcomeKnowledgeStatus:
    """解析成果文件并保存为项目资料知识块。"""
    if not outcome.file_path:
        return _set_status(db, outcome, "failed", 0, "该成果没有可解析的文件。")

    stream_result = get_object_stream(outcome.file_path)
    if stream_result is None:
        return _set_status(db, outcome, "failed", 0, "文件不存在或已被删除。")

    stream, _size, _content_type = stream_result
    try:
        data = stream.read()
    finally:
        close = getattr(stream, "close", None)
        if callable(close):
            close()

    try:
        _set_status(db, outcome, "parsing", 0, None, commit=False)
        parsed = extract_text_from_bytes(data, outcome.file_path)
        chunks = chunk_text(parsed.text)
        if not chunks:
            return _set_status(db, outcome, "failed", 0, "未提取到可入库文本。")

        _delete_existing_chunks(db, outcome)
        filename = outcome.name or outcome.file_path.split("/")[-1]
        for chunk in chunks:
            db.add(ProjectDocumentChunk(
                project_id=outcome.project_id,
                outcome_id=outcome.id,
                chunk_index=chunk.index,
                title=filename,
                content=chunk.content,
                content_excerpt=chunk.content[:600],
                source_filename=filename,
                source_type=parsed.source_type,
                token_estimate=len(chunk.content),
                meta=parsed.meta,
            ))
        return _set_status(db, outcome, "indexed", len(chunks), None)
    except (UnsupportedDocumentType, DocumentParseError) as exc:
        return _set_status(db, outcome, "failed", 0, str(exc))
    except Exception as exc:
        db.rollback()
        return _set_status(db, outcome, "failed", 0, f"解析入库失败：{exc}")


def _delete_existing_chunks(db: Session, outcome: Outcome) -> None:
    old_chunks = db.query(ProjectDocumentChunk).filter(ProjectDocumentChunk.outcome_id == outcome.id).all()
    for chunk in old_chunks:
        db.delete(chunk)


def _set_status(
    db: Session,
    outcome: Outcome,
    status: str,
    count: int,
    error: str | None,
    *,
    commit: bool = True,
) -> OutcomeKnowledgeStatus:
    extra = dict(outcome.extra_data or {})
    extra["knowledge_status"] = status
    extra["knowledge_chunk_count"] = count
    extra["knowledge_error"] = error
    if status == "indexed":
        extra["knowledge_indexed_at"] = datetime.utcnow().isoformat()
    outcome.extra_data = extra
    if commit:
        db.commit()
        db.refresh(outcome)
    return get_outcome_knowledge_status(outcome)


def _status_message(status: str, count: int) -> str:
    if status == "indexed":
        return f"已解析并入库 {count} 个资料片段。"
    if status == "parsing":
        return "正在解析入知识库。"
    if status == "failed":
        return "解析入知识库失败。"
    return "尚未解析入知识库。"
