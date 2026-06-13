"""研究方向模型"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, Float, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class ResearchDirection(Base):
    __tablename__ = "research_directions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, comment="所属项目")
    title = Column(String(500), nullable=False, comment="方向标题")
    background = Column(Text, comment="研究背景")
    research_questions = Column(Text, comment="研究问题")
    methods = Column(Text, comment="研究方法")
    expected_outputs = Column(Text, comment="预期成果")
    innovation = Column(Text, comment="创新点")
    feasibility_score = Column(Float, comment="可行性评分")
    recommendation_score = Column(Float, comment="综合推荐评分")
    content = Column(JSONB, comment="完整方向数据")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
