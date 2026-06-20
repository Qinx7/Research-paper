"""开题报告 workflow：生成报告内容并保存 Proposal。"""
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from ...models.proposal import Proposal
from ...services.agent_workflow_record_service import AgentWorkflowDbRecorder
from ...services.grounding_guard import collect_allowed_references_from_design
from ..orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
from ..proposal_agent import proposal_agent as default_proposal_agent


class ProposalContextNode(AgentNode):
    """准备开题报告生成上下文和引用白名单。"""

    name = "proposal_context"

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        project_design = state.input.get("project_design") or {}
        allowed_references = collect_allowed_references_from_design(project_design)
        return AgentNodeResult.success(
            data_delta={"allowed_references": allowed_references},
            metadata={
                "topic": project_design.get("topic"),
                "allowed_reference_count": len(allowed_references),
            },
        )


class ProposalGenerateNode(AgentNode):
    """调用现有开题报告 Agent 生成内容。"""

    name = "proposal_generate"

    def __init__(self, proposal_agent=None):
        self.proposal_agent = proposal_agent or default_proposal_agent

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        result = self.proposal_agent.generate(
            project_design=state.input.get("project_design") or {},
            research_direction=state.input.get("research_direction"),
            literature_context=state.input.get("literature_context", ""),
            allowed_references=state.data.get("allowed_references", []),
        )
        return AgentNodeResult.success(
            data_delta={"proposal_result": result},
            metadata={
                "title": result.get("title"),
                "sections_count": len(result.get("sections", {}) or {}),
            },
        )


class ProposalSaveNode(AgentNode):
    """保存开题报告到数据库。"""

    name = "proposal_save"

    def __init__(self, db: Session):
        self.db = db

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        result = state.data.get("proposal_result", {})
        project_design = state.input.get("project_design") or {}
        proposal = Proposal(
            project_id=_parse_uuid(state.project_id) or state.project_id,
            design_id=_parse_uuid(state.input.get("design_id")) or state.input.get("design_id"),
            title=result.get("title", f"{project_design.get('topic', '开题报告')} —— 开题报告"),
            content=result.get("sections", {}),
        )
        self.db.add(proposal)
        self.db.commit()
        self.db.refresh(proposal)
        return AgentNodeResult.success(
            data_delta={"proposal": proposal, "proposal_title": proposal.title},
            metadata={"proposal_id": str(proposal.id), "proposal_title": proposal.title},
        )


def run_generate_proposal_workflow(
    *,
    db: Session,
    project_id: str,
    design_id: str,
    project_design: dict,
    research_direction: dict | None = None,
    literature_context: str = "",
    user_id: str | None = None,
    proposal_agent=None,
    record_db=None,
) -> dict[str, Any]:
    """运行开题报告生成 workflow，并返回异步任务/同步接口可复用摘要。"""
    state = AgentWorkflowState(
        workflow_name="proposal_generation",
        user_id=user_id,
        project_id=project_id,
        input={
            "design_id": design_id,
            "project_design": project_design or {},
            "research_direction": research_direction,
            "literature_context": literature_context,
        },
    )
    recorder = AgentWorkflowDbRecorder(record_db) if record_db is not None else None
    runner = AgentWorkflowRunner(
        [
            ProposalContextNode(),
            ProposalGenerateNode(proposal_agent=proposal_agent),
            ProposalSaveNode(db=db),
        ],
        recorder=recorder,
    )
    workflow_result = runner.run(state)
    if workflow_result.state.status == "failed":
        raise ValueError("; ".join(workflow_result.state.errors) or "开题报告 workflow 失败")

    proposal = workflow_result.state.data["proposal"]
    persisted_run = getattr(recorder, "run", None) if recorder else None
    sections = getattr(proposal, "content", {}) or {}
    return {
        "id": str(proposal.id),
        "project_id": str(getattr(proposal, "project_id", project_id)) if getattr(proposal, "project_id", None) else project_id,
        "design_id": str(getattr(proposal, "design_id", design_id)) if getattr(proposal, "design_id", None) else design_id,
        "title": proposal.title,
        "sections": sections,
        "sections_count": len(sections),
        "proposal": proposal,
        "workflow_status": workflow_result.state.status,
        "workflow_run_id": str(getattr(persisted_run, "id", None) or workflow_result.state.run_id),
    }


def _parse_uuid(value) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None
