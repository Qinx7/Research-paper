"""项目上传资料解析入知识库服务。"""
from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from ..models.outcome import Outcome
from ..models.project_document_chunk import ProjectDocumentChunk
from ..schemas.project_document import OutcomeKnowledgeStatus
from .document_parse_service import (
    DocumentParseError,
    ParsedDocument,
    UnsupportedDocumentType,
    chunk_document,
    chunk_text as split_text,
    extract_text_from_bytes,
)
from .project_document_embedding_service import (
    delete_project_document_vectors_by_outcome,
    upsert_project_document_vector,
)


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
        message=_status_message(status, count, extra),
        error=error,
        indexed_at=parsed_indexed_at,
        parser=extra.get("knowledge_parser"),
        strategy_chain=extra.get("knowledge_strategy_chain") or [],
        used_ocr=bool(extra.get("knowledge_used_ocr")),
        error_stage=extra.get("knowledge_error_stage"),
        document_kind=extra.get("document_kind"),
        structured_fields=extra.get("structured_fields") or [],
        structured_confidence=extra.get("structured_confidence") or {},
        vector_status=extra.get("knowledge_vector_status") or "not_started",
        vector_count=int(extra.get("knowledge_vector_count") or 0),
        vector_message=_vector_status_message(extra),
    )


def index_outcome_document(db: Session, outcome: Outcome) -> OutcomeKnowledgeStatus:
    """解析成果文件并保存为项目资料知识块。"""
    from .upload_service import get_object_stream

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
        chunks = chunk_text(parsed)
        if not chunks:
            return _set_status(db, outcome, "failed", 0, "未提取到可入库文本。")

        _delete_existing_chunks(db, outcome)
        delete_project_document_vectors_by_outcome(db, outcome.id)
        filename = outcome.name or outcome.file_path.split("/")[-1]
        vector_count = 0
        for chunk in chunks:
            chunk_model = ProjectDocumentChunk(
                # SQLAlchemy 的 default 会在 flush/insert 时才触发；这里提前生成，
                # 让后续向量表能拿到稳定的 chunk_id。
                id=uuid4(),
                project_id=outcome.project_id,
                outcome_id=outcome.id,
                chunk_index=chunk.index,
                title=filename,
                content=chunk.content,
                content_excerpt=chunk.content[:600],
                source_filename=filename,
                source_type=parsed.source_type,
                token_estimate=len(chunk.content),
                meta={**(parsed.meta or {}), **(chunk.meta or {})},
            )
            db.add(chunk_model)
            vector_ok = upsert_project_document_vector(
                db,
                chunk_id=chunk_model.id,
                project_id=outcome.project_id,
                outcome_id=outcome.id,
                title=filename,
                source_filename=filename,
                source_type=parsed.source_type,
                section_title=(chunk.meta or {}).get("section_title") if isinstance(chunk.meta, dict) else None,
                content=chunk.content,
                content_excerpt=chunk.content[:600],
            )
            if vector_ok:
                vector_count += 1
        return _set_status(
            db,
            outcome,
            "indexed",
            len(chunks),
            None,
            parse_meta=parsed.meta,
            vector_count=vector_count,
        )
    except (UnsupportedDocumentType, DocumentParseError) as exc:
        return _set_status(
            db,
            outcome,
            "failed",
            0,
            str(exc),
            error_stage=getattr(exc, "parse_stage", None),
        )
    except Exception as exc:
        db.rollback()
        return _set_status(db, outcome, "failed", 0, f"解析入库失败：{exc}")


def _delete_existing_chunks(db: Session, outcome: Outcome) -> None:
    old_chunks = db.query(ProjectDocumentChunk).filter(ProjectDocumentChunk.outcome_id == outcome.id).all()
    for chunk in old_chunks:
        db.delete(chunk)


def chunk_text(parsed: ParsedDocument | str):
    """兼容旧调用：既支持 ParsedDocument，也支持纯文本切块。"""
    if isinstance(parsed, ParsedDocument):
        return chunk_document(parsed)
    return split_text(parsed)


def _set_status(
    db: Session,
    outcome: Outcome,
    status: str,
    count: int,
    error: str | None,
    *,
    commit: bool = True,
    parse_meta: dict | None = None,
    error_stage: str | None = None,
    vector_count: int | None = None,
) -> OutcomeKnowledgeStatus:
    extra = dict(outcome.extra_data or {})
    extra["knowledge_status"] = status
    extra["knowledge_chunk_count"] = count
    extra["knowledge_error"] = error
    if error_stage:
        extra["knowledge_error_stage"] = error_stage
    if parse_meta:
        extra["knowledge_parser"] = parse_meta.get("parser")
        extra["knowledge_strategy_chain"] = parse_meta.get("strategy_chain") or []
        extra["knowledge_used_ocr"] = bool(parse_meta.get("used_ocr") or ("ocr" in (parse_meta.get("strategy_chain") or [])))
        extra["document_kind"] = parse_meta.get("document_kind")
        extra["structured_fields"] = parse_meta.get("structured_fields") or []
        extra["structured_content"] = parse_meta.get("structured_content") or {}
        extra["structured_confidence"] = parse_meta.get("structured_confidence") or {}
    if vector_count is not None:
        extra["knowledge_vector_count"] = vector_count
        if count <= 0:
            extra["knowledge_vector_status"] = "not_started"
        elif vector_count == count:
            extra["knowledge_vector_status"] = "indexed"
        elif vector_count <= 0:
            extra["knowledge_vector_status"] = "unavailable"
        else:
            extra["knowledge_vector_status"] = "partial"
    if status == "indexed":
        extra["knowledge_indexed_at"] = datetime.utcnow().isoformat()
    outcome.extra_data = extra
    if commit:
        db.commit()
        db.refresh(outcome)
    return get_outcome_knowledge_status(outcome)


def _status_message(status: str, count: int, extra: dict | None = None) -> str:
    extra = extra or {}
    strategy_chain = extra.get("knowledge_strategy_chain") or []
    parser_text = " + ".join(strategy_chain) if strategy_chain else extra.get("knowledge_parser")
    parser_suffix = f"（解析链：{parser_text}）" if parser_text else ""
    ocr_suffix = "，已使用 OCR" if extra.get("knowledge_used_ocr") else ""

    if status == "indexed":
        return f"已解析并入库 {count} 个资料片段{ocr_suffix}{parser_suffix}"
    if status == "parsing":
        return "正在解析入知识库"
    if status == "failed":
        return "解析入知识库失败"
    return "尚未解析入知识库"


def _vector_status_message(extra: dict | None = None) -> str:
    """把向量化状态转换为用户可理解的检索能力提示。"""
    extra = extra or {}
    status = extra.get("knowledge_vector_status") or "not_started"
    vector_count = int(extra.get("knowledge_vector_count") or 0)
    if status == "indexed":
        return f"已生成 {vector_count} 个语义检索向量，项目资料可用于语义检索。"
    if status == "partial":
        return f"已生成 {vector_count} 个语义检索向量，未覆盖的片段会退回关键词检索。"
    if status == "unavailable":
        return "资料已入库，但当前未生成语义检索向量；系统会退回关键词检索。"
    return "尚未生成语义检索向量。"
