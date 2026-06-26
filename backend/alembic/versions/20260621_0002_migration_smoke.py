"""migration smoke check

Revision ID: 20260621_0002
Revises: 20260621_0001
Create Date: 2026-06-21 00:30:00
"""
from __future__ import annotations


revision = "20260621_0002"
down_revision = "20260621_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """空迁移：用于验证 Alembic 升级链路已经可用。"""
    pass


def downgrade() -> None:
    """空迁移：用于验证 Alembic 回退链路元数据完整。"""
    pass
