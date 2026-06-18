"""轻量级数据库结构兼容补丁。

项目当前还没有 Alembic 迁移体系，这里只处理已上线表的最小兼容补列，避免旧库启动后运行时报错。
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def ensure_conversation_user_column(db: Session) -> None:
    """确保旧数据库的 conversations 表包含 user_id 字段。"""
    try:
        db.execute(text("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID"))
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_conversations_user_id ON conversations (user_id)"))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("检查 conversations.user_id 兼容列失败: %s", exc)
