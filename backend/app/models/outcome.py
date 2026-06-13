"""项目成果模型 —— 管理系统原型、实验数据、截图等项目成果"""
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class Outcome(Base):
    __tablename__ = "outcomes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, comment="所属项目")
    # 成果类型：prototype, code, screenshot, experiment_data, survey_data, experiment_record, other
    outcome_type = Column(String(50), nullable=False, comment="成果类型")
    name = Column(String(500), nullable=False, comment="成果名称")
    description = Column(Text, comment="成果描述")
    file_path = Column(String(500), comment="文件存储路径")
    # 扩展元数据：{experiment_metrics, chart_descriptions, data_summary, ...}
    extra_data = Column(JSONB, comment="扩展元数据 JSON")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
