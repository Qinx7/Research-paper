"""baseline schema

Revision ID: 20260621_0001
Revises: None
Create Date: 2026-06-21 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.core.database import Base
from app import models  # noqa: F401
from app.services.embedding_service import EMBEDDING_DIM


revision = "20260621_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))
    op.execute(sa.text(
        f"CREATE TABLE IF NOT EXISTS document_vectors ("
        "  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),"
        "  title VARCHAR(500) NOT NULL,"
        "  authors TEXT,"
        "  year INTEGER,"
        "  venue VARCHAR(255),"
        "  doi VARCHAR(255),"
        "  abstract TEXT,"
        "  source VARCHAR(50),"
        f"  embedding vector({EMBEDDING_DIM}),"
        "  created_at TIMESTAMP DEFAULT now()"
        ")"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS idx_document_vectors_embedding "
        "ON document_vectors USING ivfflat (embedding vector_cosine_ops)"
    ))


def downgrade() -> None:
    bind = op.get_bind()
    op.execute(sa.text("DROP INDEX IF EXISTS idx_document_vectors_embedding"))
    op.execute(sa.text("DROP TABLE IF EXISTS document_vectors"))
    Base.metadata.drop_all(bind=bind)
