"""文献阅读笔记与证据卡片模型。"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from ..core.database import Base


class PaperNote(Base):
    """绑定项目文献的阅读笔记，可作为后续写作和对话的内部依据。"""

    __tablename__ = "paper_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True, comment="所属项目")
    paper_id = Column(UUID(as_uuid=True), ForeignKey("papers.id"), nullable=False, index=True, comment="关联文献")
    note_type = Column(String(40), nullable=False, default="summary", comment="笔记类型")
    title = Column(String(255), nullable=False, comment="笔记标题")
    content = Column(Text, nullable=False, comment="笔记内容")
    evidence_text = Column(Text, nullable=True, comment="可引用的证据摘录")
    evidence_level = Column(String(40), nullable=True, comment="证据等级")
    confidence = Column(Integer, nullable=True, comment="可信度评分 0-100")
    tags = Column(JSONB, nullable=True, default=list, comment="标签")
    meta = Column(JSONB, nullable=True, default=dict, comment="扩展元数据")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    paper = relationship("Paper")

