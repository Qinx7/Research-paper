"""数据库连接管理。"""
from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

Base = declarative_base()

_ENGINE = None
_SESSION_FACTORY = None


def get_engine():
    """按需创建数据库引擎，避免导入阶段就依赖数据库驱动。"""
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = create_engine(
            settings.DATABASE_URL,
            echo=(settings.APP_ENV == "development"),
        )
    return _ENGINE


class _SessionLocalProxy:
    """保持 `SessionLocal()` 调用方式不变，同时延迟初始化 sessionmaker。"""

    def __call__(self, *args, **kwargs):
        global _SESSION_FACTORY
        if _SESSION_FACTORY is None:
            _SESSION_FACTORY = sessionmaker(
                autocommit=False,
                autoflush=False,
                bind=get_engine(),
            )
        return _SESSION_FACTORY(*args, **kwargs)


class _EngineProxy:
    """保持 `engine` 名称兼容，同时延迟获取真实引擎。"""

    def __getattr__(self, item):
        return getattr(get_engine(), item)


SessionLocal = _SessionLocalProxy()
engine = _EngineProxy()


def get_db():
    """FastAPI 依赖：获取数据库会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
