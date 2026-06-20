"""多 Agent workflow 执行记录模型。"""
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from ..core.database import Base


class AgentWorkflowRun(Base):
    """记录一次 workflow 运行的输入、输出摘要和最终状态。"""

    __tablename__ = "agent_workflow_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_name = Column(String(120), nullable=False, index=True, comment="workflow 名称")
    status = Column(String(40), nullable=False, default="pending", index=True, comment="运行状态")
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True, comment="所属用户")
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True, comment="关联项目")
    search_task_id = Column(UUID(as_uuid=True), ForeignKey("literature_search_tasks.id"), nullable=True, index=True, comment="关联检索任务")
    input_snapshot = Column(JSONB, nullable=True, default=dict, comment="输入参数摘要")
    output_snapshot = Column(JSONB, nullable=True, default=dict, comment="输出结果摘要")
    error_message = Column(Text, nullable=True, comment="错误摘要")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AgentWorkflowStep(Base):
    """记录 workflow 中单个节点的执行状态和耗时。"""

    __tablename__ = "agent_workflow_steps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("agent_workflow_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    node_name = Column(String(120), nullable=False, index=True, comment="节点名称")
    status = Column(String(40), nullable=False, default="pending", index=True, comment="节点状态")
    input_summary = Column(JSONB, nullable=True, default=dict, comment="节点输入摘要")
    output_summary = Column(JSONB, nullable=True, default=dict, comment="节点输出摘要")
    error_message = Column(Text, nullable=True, comment="错误摘要")
    duration_ms = Column(Integer, nullable=False, default=0, comment="执行耗时毫秒")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
