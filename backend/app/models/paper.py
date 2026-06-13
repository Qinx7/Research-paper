"""文献模型"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Integer, Float, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import Base


class Paper(Base):
    __tablename__ = "papers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, comment="所属项目")
    title = Column(String(500), nullable=False, comment="论文标题")
    authors = Column(Text, comment="作者列表")
    year = Column(Integer, comment="发表年份")
    venue = Column(String(255), comment="期刊/会议名称")
    doi = Column(String(255), comment="DOI")
    abstract = Column(Text, comment="摘要")
    url = Column(String(500), comment="原文链接")
    pdf_path = Column(String(500), comment="PDF 本地路径")
    citation_count = Column(Integer, default=0, comment="引用次数")
    source = Column(String(50), comment="数据来源: openalex/semantic_scholar/cnki/cqvip")
    relevance_score = Column(Float, default=0.0, comment="相关性评分")
    keywords = Column(Text, comment="LLM 提取的关键词 JSON 数组")
    zotero_key = Column(String(50), nullable=True, unique=True, comment="Zotero 条目 key，用于去重和增量同步")
    zotero_synced_at = Column(DateTime, nullable=True, comment="最近一次从 Zotero 同步的时间")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
