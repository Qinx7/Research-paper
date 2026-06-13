"""研究项目模型"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, comment="项目名称")
    research_field = Column(String(255), comment="研究领域")
    user_requirement = Column(Text, comment="用户原始需求描述")
    selected_topic = Column(String(500), comment="用户选定的研究题目")
    status = Column(String(50), default="created", comment="项目状态")
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, comment="所属用户")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
