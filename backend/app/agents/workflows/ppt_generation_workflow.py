"""通用 PPTX 生成 workflow：统一 skill 调用、产物引用和执行记录。"""
from typing import Any

from ...services.agent_workflow_record_service import AgentWorkflowDbRecorder
from ...skills import get_default_skill_runtime
from ..orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
from .skill_node_mixin import SkillNodeMixin


class PptSkillRenderNode(SkillNodeMixin, AgentNode):
    """调用 PPT skill 生成通用 PPTX。"""

    name = "ppt_render"
    node_type = "render"
    label = "生成通用 PPT"

    def __init__(self, skill_runtime=None):
        self.skill_runtime = skill_runtime or get_default_skill_runtime()

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        outcome = self.run_skill_action(
            state,
            skill_executor=self.skill_runtime.executor,
            skill_router=self.skill_runtime.router,
            domain="ppt",
            action="generate_project_pptx",
            payload={
                "design": state.input.get("design") or {},
                "template": state.input.get("template") or "academic_blue",
            },
            context_metadata={
                "download_base_url": state.input.get("download_base_url", "/api/ppt/download/"),
            },
        )
        if not outcome.ok:
            return outcome.failed_result

        artifact = dict(outcome.output)
        return AgentNodeResult.success(
            data_delta={
                "artifact": artifact,
                "artifact_id": artifact.get("object_key"),
                "object_key": artifact.get("object_key"),
                "download_url": artifact.get("download_url"),
            },
            artifacts=[{
                "kind": "project_ppt",
                "artifact_id": artifact.get("object_key"),
                "object_key": artifact.get("object_key"),
            }],
            metadata={
                **outcome.metadata,
                "style_id": artifact.get("style_id"),
                "design_fields": artifact.get("design_fields", 0),
            },
        )


def run_ppt_generation_workflow(
    *,
    design: dict,
    template: str = "academic_blue",
    user_id: str | None = None,
    project_id: str | None = None,
    skill_runtime=None,
    record_db=None,
    download_base_url: str = "/api/ppt/download/",
) -> dict[str, Any]:
    """运行通用 PPTX workflow，并返回原 PPT 接口兼容结果。"""
    state = AgentWorkflowState(
        workflow_name="project_ppt_generation",
        user_id=user_id,
        project_id=project_id,
        input={
            "design": design or {},
            "template": template or "academic_blue",
            "download_base_url": download_base_url,
        },
        metadata={
            "workflow_version": "1",
            "trigger_source": "ppt_page",
            "visibility": "internal",
        },
    )
    recorder = AgentWorkflowDbRecorder(record_db) if record_db is not None else None
    workflow_result = AgentWorkflowRunner(
        [PptSkillRenderNode(skill_runtime=skill_runtime)],
        recorder=recorder,
    ).run(state)
    if workflow_result.state.status == "failed":
        raise ValueError("; ".join(workflow_result.state.errors) or "PPT 生成 workflow 失败")

    artifact = dict(workflow_result.state.data.get("artifact", {}))
    persisted_run = getattr(recorder, "run", None) if recorder else None
    artifact["workflow_status"] = workflow_result.state.status
    artifact["workflow_run_id"] = str(getattr(persisted_run, "id", None) or workflow_result.state.run_id)
    return artifact
