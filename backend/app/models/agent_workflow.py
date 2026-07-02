"""多 Agent workflow 执行记录模型。"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
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
    workflow_version = Column(String(40), nullable=True, default="1", comment="workflow 版本")
    trigger_source = Column(String(120), nullable=True, default="", index=True, comment="触发来源")
    visibility = Column(String(40), nullable=True, default="internal", index=True, comment="记录可见性")
    input_hash = Column(String(64), nullable=True, index=True, comment="输入摘要哈希")
    input_snapshot = Column(JSONB, nullable=True, default=dict, comment="输入参数摘要")
    output_snapshot = Column(JSONB, nullable=True, default=dict, comment="输出结果摘要")
    result_ref = Column(JSONB, nullable=True, default=dict, comment="结果引用")
    diagnostics = Column(JSONB, nullable=True, default=dict, comment="内部诊断摘要")
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
    node_type = Column(String(40), nullable=True, default="task", index=True, comment="节点类型")
    node_label = Column(String(120), nullable=True, default="", comment="节点展示名称")
    status = Column(String(40), nullable=False, default="pending", index=True, comment="节点状态")
    critical = Column(Boolean, nullable=True, default=True, comment="失败时是否中断 workflow")
    visible = Column(Boolean, nullable=True, default=False, comment="是否适合用户侧展示")
    skill_id = Column(String(160), nullable=True, index=True, comment="调用的技能 ID")
    skill_version = Column(String(40), nullable=True, comment="调用的技能版本")
    input_summary = Column(JSONB, nullable=True, default=dict, comment="节点输入摘要")
    output_summary = Column(JSONB, nullable=True, default=dict, comment="节点输出摘要")
    warnings = Column(JSONB, nullable=True, default=list, comment="非阻塞警告")
    artifacts = Column(JSONB, nullable=True, default=list, comment="节点产物引用")
    error_message = Column(Text, nullable=True, comment="错误摘要")
    duration_ms = Column(Integer, nullable=False, default=0, comment="执行耗时毫秒")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
