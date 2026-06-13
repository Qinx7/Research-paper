"""论文草稿模型 —— 存储论文大纲、各章节内容、参考文献和版本"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class Draft(Base):
    __tablename__ = "drafts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, comment="所属项目")
    title = Column(String(500), nullable=False, comment="论文标题")
    # content: { "chapter_key": {"title": "...", "content": "...", "status": "draft|generated|edited|final"}, ... }
    content = Column(JSONB, default=dict, comment="各章节内容 JSON")
    # references: [{title, authors, year, doi, citation_text}, ...]
    references = Column(JSONB, default=list, comment="参考文献列表")
    # outline: { "chapters": [{"key": "...", "title": "...", "subsections": [...]}, ...] }
    outline = Column(JSONB, comment="论文大纲结构")
    version = Column(Integer, default=1, comment="修订版本号")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
