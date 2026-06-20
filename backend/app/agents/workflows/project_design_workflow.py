"""项目设计生成 workflow：生成并保存研究项目设计方案。"""
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from ...models.project_design import ProjectDesign
from ...services.agent_workflow_record_service import AgentWorkflowDbRecorder
from ..orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
from ..project_design_agent import project_design_agent as default_project_design_agent


class ProjectDesignGenerateNode(AgentNode):
    """调用现有项目设计 Agent 生成设计方案。"""

    name = "project_design_generate"

    def __init__(self, project_design_agent=None):
        self.project_design_agent = project_design_agent or default_project_design_agent

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        design = self.project_design_agent.generate_design(
            direction=state.input.get("direction") or {},
            literature_analysis=state.input.get("literature_analysis") or {},
            requirement=state.input.get("requirement") or "",
        )
        if not design:
            return AgentNodeResult.failed("未生成可用项目设计方案")
        return AgentNodeResult.success(
            data_delta={"design": design, "design_topic": design.get("topic")},
            metadata={"design_topic": design.get("topic")},
        )


class ProjectDesignSaveNode(AgentNode):
    """保存项目设计方案到数据库。"""

    name = "project_design_save"

    def __init__(self, db: Session):
        self.db = db

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        design = state.data.get("design", {})
        saved = ProjectDesign(
            project_id=_parse_uuid(state.project_id),
            direction_id=_parse_uuid(state.input.get("direction_id")),
            topic=design.get("topic", ""),
            content=design,
        )
        self.db.add(saved)
        self.db.commit()
        self.db.refresh(saved)
        return AgentNodeResult.success(
            data_delta={"saved_id": str(saved.id)},
            metadata={"saved_id": str(saved.id), "design_topic": saved.topic},
        )


def run_generate_project_design_workflow(
    *,
    db: Session,
    direction: dict,
    literature_analysis: dict | None = None,
    requirement: str = "",
    project_id: str | None = None,
    direction_id: str | None = None,
    user_id: str | None = None,
    project_design_agent=None,
    record_db=None,
) -> dict[str, Any]:
    """运行项目设计生成 workflow，并返回原项目设计接口兼容的数据。"""
    state = AgentWorkflowState(
        workflow_name="project_design_generation",
        user_id=user_id,
        project_id=project_id,
        input={
            "direction": direction or {},
            "literature_analysis": literature_analysis or {},
            "requirement": requirement or "",
            "direction_id": direction_id,
        },
    )
    recorder = AgentWorkflowDbRecorder(record_db) if record_db is not None else None
    runner = AgentWorkflowRunner(
        [
            ProjectDesignGenerateNode(project_design_agent=project_design_agent),
            ProjectDesignSaveNode(db=db),
        ],
        recorder=recorder,
    )
    workflow_result = runner.run(state)
    if workflow_result.state.status == "failed":
        raise ValueError("; ".join(workflow_result.state.errors) or "项目设计生成 workflow 失败")

    persisted_run = getattr(recorder, "run", None) if recorder else None
    return {
        "requirement": requirement,
        "design": workflow_result.state.data.get("design", {}),
        "saved_id": workflow_result.state.data.get("saved_id"),
        "workflow_status": workflow_result.state.status,
        "workflow_run_id": str(getattr(persisted_run, "id", None) or workflow_result.state.run_id),
    }


def _parse_uuid(value) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None
