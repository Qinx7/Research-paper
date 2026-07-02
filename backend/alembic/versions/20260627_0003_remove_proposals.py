"""remove proposals table

Revision ID: 20260627_0003
Revises: 20260621_0002
Create Date: 2026-06-27 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260627_0003"
down_revision = "20260621_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "proposals" not in inspector.get_table_names():
        return
    op.drop_table("proposals")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "proposals" in inspector.get_table_names():
        return
    op.create_table(
        "proposals",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("project_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("design_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("content", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column("docx_path", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["design_id"], ["project_designs.id"]),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
    )
