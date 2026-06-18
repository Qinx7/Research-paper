"""生成任务与文件归属记录。"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import Base


class GeneratedArtifact(Base):
    """记录异步任务和生成文件属于哪个用户，用于任务轮询和文件下载鉴权。"""

    __tablename__ = "generated_artifacts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True, comment="所属用户")
    task_id = Column(String(255), nullable=True, unique=True, index=True, comment="Celery 任务 ID")
    object_key = Column(String(500), nullable=True, unique=True, index=True, comment="MinIO 或本地文件对象键")
    artifact_type = Column(String(80), nullable=False, comment="产物类型")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
