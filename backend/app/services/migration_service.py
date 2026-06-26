"""数据库迁移与运行时兼容引导服务。"""
from __future__ import annotations

import logging
from typing import Any, Callable

logger = logging.getLogger(__name__)


def should_run_runtime_schema_bootstrap(settings_obj: Any) -> bool:
    """是否允许应用启动时执行运行时 schema 引导。"""
    return bool(getattr(settings_obj, "RUNTIME_SCHEMA_BOOTSTRAP", False))


def apply_runtime_schema_bootstrap(
    *,
    engine: Any,
    base: Any,
    session_factory: Callable[[], Any],
    close_db: Callable[[Any], None],
    ensure_conversation_user_column: Callable[[Any], None],
    ensure_research_direction_content_column: Callable[[Any], None],
    ensure_project_design_content_column: Callable[[Any], None],
    ensure_document_vectors_table: Callable[[Any], Any],
) -> None:
    """执行当前过渡期的运行时 schema 引导。"""
    try:
        base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.warning("初始化数据库表失败: %s", exc)

    db = None
    try:
        db = session_factory()
        ensure_conversation_user_column(db)
        ensure_research_direction_content_column(db)
        ensure_project_design_content_column(db)
        ensure_document_vectors_table(db)
    except Exception as exc:
        logger.warning("初始化向量存储失败: %s", exc)
    finally:
        if db is not None:
            close_db(db)
