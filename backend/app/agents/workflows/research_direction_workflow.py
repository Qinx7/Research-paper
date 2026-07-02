"""研究方向生成 workflow：生成、评分并保存研究方向。"""
import json
from typing import Any
from uuid import UUID

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from ...models.research_direction import ResearchDirection
from ...services.agent_workflow_record_service import AgentWorkflowDbRecorder
from ..orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
from ..research_direction_agent import research_direction_agent as default_research_direction_agent
from ...skills import (
    SkillExecutor,
    SkillRouter,
    build_default_skill_registry,
)
from .skill_node_mixin import SkillNodeMixin


class DirectionGenerateNode(SkillNodeMixin, AgentNode):
    """调用现有研究方向 Agent 生成候选方向。"""

    name = "direction_generate"

    def __init__(self, skill_executor: SkillExecutor, skill_router: SkillRouter, direction_agent=None):
        self.skill_executor = skill_executor
        self.skill_router = skill_router
        self.direction_agent = direction_agent or default_research_direction_agent

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        domain = "research"
        action = "generate_directions"
        outcome = self.run_skill_action(
            state,
            skill_executor=self.skill_executor,
            skill_router=self.skill_router,
            domain=domain,
            action=action,
            payload=
            {
                "literature_analysis": state.input.get("literature_analysis") or {},
                "requirement": state.input.get("requirement") or "",
            },
            context_state={"direction_agent": self.direction_agent},
        )
        if not outcome.ok:
            return outcome.failed_result
        directions = outcome.output.get("directions", [])
        if not directions:
            return AgentNodeResult.failed("未生成可用研究方向")
        return AgentNodeResult.success(
            data_delta={"directions": directions},
            metadata={
                **outcome.metadata,
                "directions_count": len(directions),
            },
        )


class DirectionScoreNode(SkillNodeMixin, AgentNode):
    """对候选方向进行多维度评分。"""

    name = "direction_score"

    def __init__(self, skill_executor: SkillExecutor, skill_router: SkillRouter, direction_agent=None):
        self.skill_executor = skill_executor
        self.skill_router = skill_router
        self.direction_agent = direction_agent or default_research_direction_agent

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        domain = "research"
        action = "score_directions"
        outcome = self.run_skill_action(
            state,
            skill_executor=self.skill_executor,
            skill_router=self.skill_router,
            domain=domain,
            action=action,
            payload=
            {
                "directions": state.data.get("directions", []),
            },
            context_state={"direction_agent": self.direction_agent},
        )
        if not outcome.ok:
            return outcome.failed_result
        scores = outcome.output.get("scores", [])
        return AgentNodeResult.success(
            data_delta={"scores": scores},
            metadata={
                **outcome.metadata,
                "scores_count": len(scores or []),
            },
        )


class DirectionSaveNode(AgentNode):
    """保存生成的研究方向，保持原 API 返回结构兼容。"""

    name = "direction_save"

    def __init__(self, db: Session):
        self.db = db

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        directions = state.data.get("directions", [])
        scores = state.data.get("scores", [])
        score_map = {score.get("title", ""): score.get("scores", {}) for score in scores if isinstance(score, dict)}
        project_id = _parse_uuid(state.project_id)
        saved_ids: list[str] = []

        for item in directions:
            title = item.get("title", "")
            score = score_map.get(title, {})
            payload = dict(
                project_id=project_id,
                title=title,
                background=item.get("background"),
                research_questions=_to_json_str(item.get("research_questions", [])),
                methods=_to_json_str(item.get("methods", [])),
                expected_outputs=_to_json_str(item.get("expected_outputs", [])),
                innovation=_to_json_str(item.get("innovation", [])),
                feasibility_score=_to_float(score.get("feasibility")),
                recommendation_score=_to_float(score.get("overall")),
            )
            if _table_has_column(self.db, "research_directions", "content"):
                payload["content"] = {**item, "scores": score}
            direction = ResearchDirection(**payload)
            self.db.add(direction)
            self.db.flush()
            saved_ids.append(str(direction.id))

        self.db.commit()
        return AgentNodeResult.success(
            data_delta={"saved_ids": saved_ids},
            metadata={"saved_count": len(saved_ids)},
        )


def run_generate_research_directions_workflow(
    *,
    db: Session,
    literature_analysis: dict,
    requirement: str = "",
    project_id: str | None = None,
    user_id: str | None = None,
    direction_agent=None,
    record_db=None,
    skill_executor: SkillExecutor | None = None,
    skill_router: SkillRouter | None = None,
) -> dict[str, Any]:
    """运行研究方向生成 workflow，并返回原研究方向接口兼容的数据。"""
    state = AgentWorkflowState(
        workflow_name="research_direction_generation",
        user_id=user_id,
        project_id=project_id,
        input={
            "literature_analysis": literature_analysis or {},
            "requirement": requirement or "",
        },
    )
    recorder = AgentWorkflowDbRecorder(record_db) if record_db is not None else None
    if skill_executor is None or skill_router is None:
        skill_registry = build_default_skill_registry()
        skill_executor = skill_executor or SkillExecutor(skill_registry)
        skill_router = skill_router or SkillRouter(skill_registry)
    runner = AgentWorkflowRunner(
        [
            DirectionGenerateNode(skill_executor=skill_executor, skill_router=skill_router, direction_agent=direction_agent),
            DirectionScoreNode(skill_executor=skill_executor, skill_router=skill_router, direction_agent=direction_agent),
            DirectionSaveNode(db=db),
        ],
        recorder=recorder,
    )
    workflow_result = runner.run(state)
    if workflow_result.state.status == "failed":
        raise ValueError("; ".join(workflow_result.state.errors) or "研究方向生成 workflow 失败")

    persisted_run = getattr(recorder, "run", None) if recorder else None
    directions = workflow_result.state.data.get("directions", [])
    scores = workflow_result.state.data.get("scores", [])
    return {
        "requirement": requirement,
        "directions_count": len(directions),
        "directions": directions,
        "scores": scores,
        "saved_ids": workflow_result.state.data.get("saved_ids", []),
        "workflow_status": workflow_result.state.status,
        "workflow_run_id": str(getattr(persisted_run, "id", None) or workflow_result.state.run_id),
    }


def _to_json_str(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _parse_uuid(value) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None


_TABLE_COLUMN_RUNTIME_CACHE: dict[tuple[str, str], tuple[str, ...]] = {}


def _table_has_column(db: Session, table_name: str, column_name: str) -> bool:
    """兼容旧库结构，只有在字段存在时才写入。"""
    try:
        bind = db.get_bind()
        bind_url = str(getattr(bind, "url", ""))
        cache_key = (bind_url, table_name)
        cached = _TABLE_COLUMN_RUNTIME_CACHE.get(cache_key)
        if cached is not None:
            return column_name in cached
        inspector = inspect(bind)
        columns = tuple(column["name"] for column in inspector.get_columns(table_name))
        _TABLE_COLUMN_RUNTIME_CACHE[cache_key] = columns
        return column_name in columns
    except Exception:
        return True
