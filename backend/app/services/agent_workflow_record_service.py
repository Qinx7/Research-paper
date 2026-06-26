"""多 Agent workflow 执行记录服务。"""
from datetime import UTC, datetime
from time import perf_counter
from uuid import UUID

from sqlalchemy.orm import Session

from ..agents.orchestration import AgentNode, AgentNodeResult, AgentWorkflowState
from ..models.agent_workflow import AgentWorkflowRun, AgentWorkflowStep


class AgentWorkflowDbRecorder:
    """把 workflow 运行过程持久化到数据库。"""

    def __init__(self, db: Session):
        self.db = db
        self.run: AgentWorkflowRun | None = None
        self._step_started_at: dict[str, datetime] = {}
        self._step_timer: dict[str, float] = {}

    def workflow_started(self, state: AgentWorkflowState) -> None:
        now = datetime.now(UTC)
        self.run = AgentWorkflowRun(
            id=_parse_uuid(state.run_id),
            workflow_name=state.workflow_name,
            status="running",
            user_id=_parse_uuid(state.user_id),
            project_id=_parse_uuid(state.project_id),
            search_task_id=_parse_uuid(state.search_task_id),
            input_snapshot=_summarize_value(state.input),
            started_at=now,
        )
        self.db.add(self.run)
        self._commit()

    def node_started(self, state: AgentWorkflowState, node: AgentNode) -> None:
        key = node.name
        self._step_started_at[key] = datetime.now(UTC)
        self._step_timer[key] = perf_counter()

    def node_finished(self, state: AgentWorkflowState, node: AgentNode, result: AgentNodeResult) -> None:
        if not self.run:
            return
        started_at = self._step_started_at.pop(node.name, None) or datetime.now(UTC)
        started_timer = self._step_timer.pop(node.name, perf_counter())
        duration_ms = max(0, int((perf_counter() - started_timer) * 1000))
        step = AgentWorkflowStep(
            run_id=self.run.id,
            node_name=node.name,
            status=result.status,
            input_summary=_summarize_node_input(state, node),
            output_summary=_summarize_node_output(result),
            error_message=result.error,
            duration_ms=duration_ms,
            started_at=started_at,
            finished_at=datetime.now(UTC),
        )
        self.db.add(step)
        self._commit()

    def workflow_finished(self, state: AgentWorkflowState) -> None:
        if not self.run:
            return
        self.run.status = state.status
        self.run.output_snapshot = _summarize_workflow_output(state)
        self.run.error_message = "\n".join(state.errors) if state.errors else None
        self.run.finished_at = datetime.now(UTC)
        self._commit()

    def _commit(self) -> None:
        try:
            self.db.commit()
            if self.run:
                self.db.refresh(self.run)
        except Exception:
            self.db.rollback()
            raise


def list_workflow_runs_for_user(
    db: Session,
    *,
    user_id: UUID,
    limit: int = 30,
    offset: int = 0,
) -> list[AgentWorkflowRun]:
    """按用户隔离查询 workflow run 列表。"""
    return [
        run
        for run in db.query(AgentWorkflowRun)
        .filter(AgentWorkflowRun.user_id == user_id)
        .order_by(AgentWorkflowRun.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
        if getattr(run, "user_id", None) == user_id
    ]


def get_workflow_run_for_user(db: Session, *, run_id: UUID, user_id: UUID) -> AgentWorkflowRun | None:
    """获取当前用户可访问的单次 workflow 记录。"""
    run = (
        db.query(AgentWorkflowRun)
        .filter(AgentWorkflowRun.id == run_id, AgentWorkflowRun.user_id == user_id)
        .first()
    )
    if run and getattr(run, "user_id", None) != user_id:
        return None
    return run


def list_workflow_steps(db: Session, *, run_id: UUID) -> list[AgentWorkflowStep]:
    """查询某次 workflow 的节点记录。"""
    return (
        db.query(AgentWorkflowStep)
        .filter(AgentWorkflowStep.run_id == run_id)
        .order_by(AgentWorkflowStep.started_at.asc())
        .all()
    )


def _summarize_node_input(state: AgentWorkflowState, node: AgentNode) -> dict:
    if node.name == "external_literature_search":
        return _summarize_value(state.input)
    return {"available_data_keys": sorted(state.data.keys()), "evidence_count": len(state.evidence)}


def _summarize_node_output(result: AgentNodeResult) -> dict:
    summary = {
        "data_delta": _summarize_value(result.data_delta),
        "evidence_delta_count": len(result.evidence_delta),
        "messages": result.messages[:5],
        "metadata": _summarize_value(result.metadata),
    }
    if isinstance(result.metadata, dict):
        for key, value in result.metadata.items():
            if key not in summary:
                summary[key] = _summarize_value(value)
    return summary


def _summarize_workflow_output(state: AgentWorkflowState) -> dict:
    search_result = state.data.get("search_result", {})
    summary = state.data.get("search_summary", {})
    diagnostics = state.data.get("search_diagnostics", {})
    output = _summarize_value(state.data)
    output.update({
        "data_keys": sorted(state.data.keys()),
        "evidence_count": len(state.evidence),
        "messages": state.messages[:10],
        "total_found": search_result.get("total_found"),
        "selected_sources": search_result.get("selected_sources"),
        "source_statuses": search_result.get("source_statuses"),
        "summary_status": summary.get("status"),
        "summary_overview": summary.get("overview"),
        "failed_sources": diagnostics.get("failed_sources"),
    })
    if "chapter_key" in state.input:
        output["chapter_key"] = state.input.get("chapter_key")
    if "evidence_counts" in state.data:
        output["evidence_counts"] = state.data.get("evidence_counts")
    if "proposal_title" in state.data:
        output["proposal_title"] = state.data.get("proposal_title")
    if "directions" in state.data:
        directions = state.data.get("directions") or []
        output["directions_count"] = len(directions)
        output["direction_titles"] = [
            direction.get("title")
            for direction in directions[:5]
            if isinstance(direction, dict) and direction.get("title")
        ]
    if "saved_ids" in state.data:
        output["saved_ids"] = state.data.get("saved_ids")
    return output


def _summarize_value(value):
    if isinstance(value, dict):
        summarized = {}
        for key, item in value.items():
            if key == "papers" and isinstance(item, list):
                summarized[key] = [_summarize_paper(paper) for paper in item[:5]]
            elif key in {"abstract", "content"} and isinstance(item, str):
                summarized[key] = item[:300]
            else:
                summarized[key] = _summarize_value(item)
        return summarized
    if isinstance(value, list):
        return [_summarize_value(item) for item in value[:20]]
    if isinstance(value, str):
        return value[:500]
    if not isinstance(value, (int, float, bool, type(None))):
        return str(value)[:500]
    return value


def _summarize_paper(paper: dict) -> dict:
    if not isinstance(paper, dict):
        return {
            "title": getattr(paper, "title", None),
            "year": getattr(paper, "year", None),
            "source": getattr(paper, "source", None),
            "citation_count": getattr(paper, "citation_count", None),
        }
    return {
        "title": paper.get("title"),
        "year": paper.get("year"),
        "source": paper.get("source"),
        "citation_count": paper.get("citation_count"),
    }


def _parse_uuid(value) -> UUID | None:
    if not value:
        return None
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None
