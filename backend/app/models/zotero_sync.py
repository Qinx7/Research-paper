"""Zotero 同步状态模型"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func

from ..core.database import Base


class ZoteroSync(Base):
    __tablename__ = "zotero_syncs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    zotero_user_id = Column(String(20), nullable=False, comment="Zotero 用户/群组 ID")
    zotero_api_key = Column(String(64), nullable=False, comment="Zotero API Key（明文存储，后续升级加密）")
    library_type = Column(String(10), default="user", comment="user 或 group")
    last_sync_version = Column(Integer, nullable=True, comment="上次同步的库版本号，用于增量同步")
    synced_collections = Column(JSONB, default=list, comment="已同步的集合 key 列表")
    sync_status = Column(String(20), default="idle", comment="idle / syncing / error")
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
