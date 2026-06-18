"""学术检索任务记录模型。"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from ..core.database import Base


class LiteratureSearchTask(Base):
    """记录一次学术检索的参数、来源状态和结果快照。"""

    __tablename__ = "literature_search_tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True, comment="关联项目")
    query = Column(Text, nullable=False, comment="检索词摘要")
    mode = Column(String(40), nullable=False, default="quick_search", comment="检索模式")
    library_scope = Column(String(40), nullable=False, default="all", comment="文献范围")
    selected_sources = Column(JSONB, nullable=True, default=list, comment="实际检索来源")
    status = Column(String(40), nullable=False, default="pending", index=True, comment="任务状态")
    total_results = Column(Integer, nullable=False, default=0, comment="结果数量")
    source_statuses = Column(JSONB, nullable=True, default=dict, comment="来源诊断")
    result_snapshot = Column(JSONB, nullable=True, default=list, comment="精简文献快照")
    error_message = Column(Text, nullable=True, comment="错误摘要")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
