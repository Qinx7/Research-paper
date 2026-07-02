"""add agent workflow diagnostics fields

Revision ID: 20260702_0004
Revises: 20260627_0003
Create Date: 2026-07-02 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260702_0004"
down_revision = "20260627_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    _add_column_if_missing(inspector, "agent_workflow_runs", sa.Column("workflow_version", sa.String(length=40), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_runs", sa.Column("trigger_source", sa.String(length=120), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_runs", sa.Column("visibility", sa.String(length=40), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_runs", sa.Column("input_hash", sa.String(length=64), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_runs", sa.Column("result_ref", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_runs", sa.Column("diagnostics", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("node_type", sa.String(length=40), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("node_label", sa.String(length=120), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("critical", sa.Boolean(), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("visible", sa.Boolean(), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("skill_id", sa.String(length=160), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("skill_version", sa.String(length=40), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    _add_column_if_missing(inspector, "agent_workflow_steps", sa.Column("artifacts", postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    _create_index_if_missing(inspector, "ix_agent_workflow_runs_trigger_source", "agent_workflow_runs", ["trigger_source"])
    _create_index_if_missing(inspector, "ix_agent_workflow_runs_visibility", "agent_workflow_runs", ["visibility"])
    _create_index_if_missing(inspector, "ix_agent_workflow_runs_input_hash", "agent_workflow_runs", ["input_hash"])
    _create_index_if_missing(inspector, "ix_agent_workflow_steps_node_type", "agent_workflow_steps", ["node_type"])
    _create_index_if_missing(inspector, "ix_agent_workflow_steps_skill_id", "agent_workflow_steps", ["skill_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_workflow_steps_skill_id", table_name="agent_workflow_steps", if_exists=True)
    op.drop_index("ix_agent_workflow_steps_node_type", table_name="agent_workflow_steps", if_exists=True)
    op.drop_index("ix_agent_workflow_runs_input_hash", table_name="agent_workflow_runs", if_exists=True)
    op.drop_index("ix_agent_workflow_runs_visibility", table_name="agent_workflow_runs", if_exists=True)
    op.drop_index("ix_agent_workflow_runs_trigger_source", table_name="agent_workflow_runs", if_exists=True)

    for column_name in ("artifacts", "warnings", "skill_version", "skill_id", "visible", "critical", "node_label", "node_type"):
        _drop_column_if_exists("agent_workflow_steps", column_name)
    for column_name in ("diagnostics", "result_ref", "input_hash", "visibility", "trigger_source", "workflow_version"):
        _drop_column_if_exists("agent_workflow_runs", column_name)


def _add_column_if_missing(inspector, table_name: str, column: sa.Column) -> None:
    existing = {item["name"] for item in inspector.get_columns(table_name)}
    if column.name not in existing:
        op.add_column(table_name, column)


def _create_index_if_missing(inspector, index_name: str, table_name: str, columns: list[str]) -> None:
    existing = {item["name"] for item in inspector.get_indexes(table_name)}
    if index_name not in existing:
        op.create_index(index_name, table_name, columns, unique=False)


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {item["name"] for item in inspector.get_columns(table_name)}
    if column_name in existing:
        op.drop_column(table_name, column_name)
