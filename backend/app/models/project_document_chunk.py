"""项目上传资料解析后的知识块模型。"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from ..core.database import Base


class ProjectDocumentChunk(Base):
    """保存用户上传资料解析后的可检索正文片段。"""

    __tablename__ = "project_document_chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True, comment="所属项目")
    outcome_id = Column(UUID(as_uuid=True), ForeignKey("outcomes.id"), nullable=False, index=True, comment="来源成果")
    chunk_index = Column(Integer, nullable=False, comment="资料内分块序号")
    title = Column(String(500), nullable=False, comment="知识块标题")
    content = Column(Text, nullable=False, comment="知识块正文")
    content_excerpt = Column(Text, nullable=True, comment="前端展示摘要")
    source_filename = Column(String(500), nullable=True, comment="来源文件名")
    source_type = Column(String(50), nullable=True, comment="来源文件类型")
    token_estimate = Column(Integer, nullable=True, comment="粗略 token/字符估算")
    meta = Column(JSONB, nullable=True, default=dict, comment="解析元数据")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
