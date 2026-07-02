"""项目资料分块的向量化与语义检索服务。"""
from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from .embedding_service import EMBEDDING_DIM, embed_text, ensure_pgvector_extension

logger = logging.getLogger(__name__)


def _embedding_to_str(vec: list[float]) -> str:
    return "[" + ",".join(str(v) for v in vec) + "]"


def ensure_project_document_vectors_table(db: Session) -> bool:
    """确保项目资料向量表存在。"""
    try:
        ensure_pgvector_extension(db)
        db.execute(
            sa_text(
                f"""
                CREATE TABLE IF NOT EXISTS project_document_vectors (
                  chunk_id UUID PRIMARY KEY,
                  project_id UUID NOT NULL,
                  outcome_id UUID NOT NULL,
                  title VARCHAR(500),
                  source_filename VARCHAR(500),
                  source_type VARCHAR(50),
                  section_title VARCHAR(500),
                  content_excerpt TEXT,
                  embedding vector({EMBEDDING_DIM}),
                  created_at TIMESTAMP DEFAULT now()
                )
                """
            )
        )
        db.execute(
            sa_text(
                """
                CREATE INDEX IF NOT EXISTS idx_project_document_vectors_project
                ON project_document_vectors (project_id)
                """
            )
        )
        db.execute(
            sa_text(
                """
                CREATE INDEX IF NOT EXISTS idx_project_document_vectors_embedding
                ON project_document_vectors USING ivfflat (embedding vector_cosine_ops)
                """
            )
        )
        db.commit()
        return True
    except Exception as exc:
        logger.warning("创建 project_document_vectors 表失败: %s", exc)
        db.rollback()
        return False


def upsert_project_document_vector(
    db: Session,
    *,
    chunk_id: UUID | str,
    project_id: UUID | str,
    outcome_id: UUID | str,
    title: str,
    source_filename: str | None,
    source_type: str | None,
    section_title: str | None,
    content: str,
    content_excerpt: str | None,
) -> bool:
    """为项目资料分块生成向量并写入向量表。"""
    embedding = embed_text(content)
    if embedding is None:
        return False

    embedding_str = _embedding_to_str(embedding)
    try:
        db.execute(
            sa_text(
                """
                INSERT INTO project_document_vectors
                (chunk_id, project_id, outcome_id, title, source_filename, source_type, section_title, content_excerpt, embedding)
                VALUES
                (:chunk_id, :project_id, :outcome_id, :title, :source_filename, :source_type, :section_title, :content_excerpt, CAST(:embedding AS vector))
                ON CONFLICT (chunk_id) DO UPDATE SET
                  project_id = EXCLUDED.project_id,
                  outcome_id = EXCLUDED.outcome_id,
                  title = EXCLUDED.title,
                  source_filename = EXCLUDED.source_filename,
                  source_type = EXCLUDED.source_type,
                  section_title = EXCLUDED.section_title,
                  content_excerpt = EXCLUDED.content_excerpt,
                  embedding = EXCLUDED.embedding
                """
            ),
            {
                "chunk_id": str(chunk_id),
                "project_id": str(project_id),
                "outcome_id": str(outcome_id),
                "title": title,
                "source_filename": source_filename,
                "source_type": source_type,
                "section_title": section_title,
                "content_excerpt": content_excerpt,
                "embedding": embedding_str,
            },
        )
        return True
    except Exception as exc:
        logger.warning("写入项目资料向量失败 (chunk_id=%s): %s", chunk_id, exc)
        db.rollback()
        return False


def delete_project_document_vectors_by_outcome(db: Session, outcome_id: UUID | str) -> None:
    """删除某个成果对应的历史向量记录。"""
    try:
        db.execute(
            sa_text("DELETE FROM project_document_vectors WHERE outcome_id = :outcome_id"),
            {"outcome_id": str(outcome_id)},
        )
    except Exception as exc:
        logger.warning("删除项目资料向量失败 (outcome_id=%s): %s", outcome_id, exc)
        db.rollback()


def search_similar_project_document_chunks(
    db: Session,
    *,
    project_id: UUID | str,
    query: str,
    top_k: int = 8,
    min_similarity: float = 0.65,
) -> list[dict[str, Any]]:
    """项目内资料语义检索。"""
    embedding = embed_text(query)
    if embedding is None:
        return []

    embedding_str = _embedding_to_str(embedding)
    try:
        rows = db.execute(
            sa_text(
                """
                SELECT
                  chunk_id,
                  outcome_id,
                  title,
                  source_filename,
                  source_type,
                  section_title,
                  content_excerpt,
                  1 - (embedding <=> CAST(:embedding AS vector)) AS similarity
                FROM project_document_vectors
                WHERE project_id = :project_id
                  AND 1 - (embedding <=> CAST(:embedding AS vector)) >= :min_similarity
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :limit
                """
            ),
            {
                "project_id": str(project_id),
                "embedding": embedding_str,
                "min_similarity": min_similarity,
                "limit": max(1, min(top_k, 30)),
            },
        ).fetchall()
    except Exception as exc:
        logger.warning("项目资料语义检索失败: %s", exc)
        db.rollback()
        return []

    return [
        {
            "chunk_id": str(row.chunk_id),
            "outcome_id": str(row.outcome_id),
            "title": row.title or row.source_filename or "上传资料",
            "source_filename": row.source_filename,
            "source_type": row.source_type,
            "section_title": row.section_title,
            "content_excerpt": row.content_excerpt or "",
            "semantic_score": round(float(row.similarity or 0), 4),
        }
        for row in rows
    ]
