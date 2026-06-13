"""项目设计方案模型"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class ProjectDesign(Base):
    __tablename__ = "project_designs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, comment="所属项目")
    direction_id = Column(UUID(as_uuid=True), ForeignKey("research_directions.id"), nullable=True, comment="关联研究方向")
    topic = Column(String(500), nullable=False, comment="课题名称")
    content = Column(JSONB, nullable=False, comment="完整设计方案 JSON")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
