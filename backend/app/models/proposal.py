"""开题报告模型 —— 存储 12 章节完整内容与 docx 文件路径"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class Proposal(Base):
    __tablename__ = "proposals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, comment="所属项目")
    design_id = Column(UUID(as_uuid=True), ForeignKey("project_designs.id"), nullable=True, comment="关联项目设计")
    title = Column(String(500), nullable=False, comment="报告标题")
    # 12 章节结构 JSON：
    # { "section_key": {"title": "...", "content": "..."}, ... }
    content = Column(JSONB, nullable=False, comment="各章节完整内容 JSON")
    docx_path = Column(String(500), comment="生成的 docx 文件路径")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
