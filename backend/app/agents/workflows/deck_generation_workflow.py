"""HTML Deck 生成 workflow：统一 skill 调用、产物引用和执行记录。"""
from typing import Any

from ...services.agent_workflow_record_service import AgentWorkflowDbRecorder
from ...skills import get_default_skill_runtime
from ..orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
from .skill_node_mixin import SkillNodeMixin


class DeckSkillRenderNode(SkillNodeMixin, AgentNode):
    """调用 PPT skill 生成 HTML Deck。"""

    name = "deck_render"
    node_type = "render"
    label = "生成 HTML Deck"

    def __init__(self, skill_runtime=None):
        self.skill_runtime = skill_runtime or get_default_skill_runtime()

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        outcome = self.run_skill_action(
            state,
            skill_executor=self.skill_runtime.executor,
            skill_router=self.skill_runtime.router,
            domain="ppt",
            action="preview_html_deck",
            payload=
            {
                "deck_title": state.input["deck_title"],
                "slides_outline": state.input.get("slides_outline") or [],
                "theme": state.input.get("theme") or "paper",
            },
            context_metadata={
                "preview_base_url": state.input.get("preview_base_url", ""),
                "download_base_url": state.input.get("download_base_url", ""),
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
                "preview_url": artifact.get("preview_url"),
                "download_url": artifact.get("download_url"),
            },
            artifacts=[{
                "kind": "html_deck",
                "artifact_id": artifact.get("object_key"),
                "object_key": artifact.get("object_key"),
            }],
            metadata={
                **outcome.metadata,
                "slide_count": artifact.get("slide_count", 0),
            },
        )


def run_deck_generation_workflow(
    *,
    deck_title: str,
    slides_outline: list[dict],
    theme: str = "paper",
    user_id: str | None = None,
    project_id: str | None = None,
    draft_id: str | None = None,
    skill_runtime=None,
    record_db=None,
    preview_base_url: str = "/api/ppt/html-deck/preview/",
    download_base_url: str = "/api/ppt/html-deck/download/",
) -> dict[str, Any]:
    """运行 HTML Deck workflow，并返回原 HTML Deck 接口兼容产物。"""
    state = AgentWorkflowState(
        workflow_name="html_deck_generation",
        user_id=user_id,
        project_id=project_id,
        input={
            "deck_title": deck_title,
            "slides_outline": slides_outline or [],
            "theme": theme or "paper",
            "draft_id": draft_id,
            "preview_base_url": preview_base_url,
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
        [DeckSkillRenderNode(skill_runtime=skill_runtime)],
        recorder=recorder,
    ).run(state)
    if workflow_result.state.status == "failed":
        raise ValueError("; ".join(workflow_result.state.errors) or "HTML Deck workflow 失败")

    artifact = dict(workflow_result.state.data.get("artifact", {}))
    persisted_run = getattr(recorder, "run", None) if recorder else None
    artifact["workflow_status"] = workflow_result.state.status
    artifact["workflow_run_id"] = str(getattr(persisted_run, "id", None) or workflow_result.state.run_id)
    return artifact
