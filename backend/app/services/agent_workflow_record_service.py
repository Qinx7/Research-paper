"""多 Agent workflow 执行记录服务。"""
import hashlib
import json
from datetime import UTC, datetime
from time import perf_counter
from typing import Any
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
        self._step_count = 0
        self._step_status_counts: dict[str, int] = {}

    def workflow_started(self, state: AgentWorkflowState) -> None:
        now = datetime.now(UTC)
        input_snapshot = _summarize_value(state.input)
        self.run = AgentWorkflowRun(
            id=_parse_uuid(state.run_id),
            workflow_name=state.workflow_name,
            status="running",
            user_id=_parse_uuid(state.user_id),
            project_id=_parse_uuid(state.project_id),
            search_task_id=_parse_uuid(state.search_task_id),
            workflow_version=str(state.metadata.get("workflow_version") or "1"),
            trigger_source=str(state.metadata.get("trigger_source") or _infer_trigger_source(state.workflow_name)),
            visibility=str(state.metadata.get("visibility") or "internal"),
            input_hash=_hash_snapshot(input_snapshot),
            input_snapshot=input_snapshot,
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
            node_type=getattr(node, "node_type", "task"),
            node_label=getattr(node, "label", "") or getattr(node, "description", "") or node.name,
            status=result.status,
            critical=bool(getattr(node, "critical", True)),
            visible=bool(getattr(node, "visible", False)),
            skill_id=_extract_skill_id(result.metadata),
            skill_version=_extract_skill_version(result.metadata),
            input_summary=_summarize_node_input(state, node),
            output_summary=_summarize_node_output(result),
            warnings=_summarize_value(result.warnings),
            artifacts=_summarize_value(result.artifacts),
            error_message=result.error,
            duration_ms=duration_ms,
            started_at=started_at,
            finished_at=datetime.now(UTC),
        )
        self._step_count += 1
        self._step_status_counts[result.status] = self._step_status_counts.get(result.status, 0) + 1
        self.db.add(step)
        self._commit()

    def workflow_finished(self, state: AgentWorkflowState) -> None:
        if not self.run:
            return
        self.run.status = state.status
        self.run.workflow_version = str(state.metadata.get("workflow_version") or self.run.workflow_version or "1")
        self.run.trigger_source = str(state.metadata.get("trigger_source") or self.run.trigger_source or _infer_trigger_source(state.workflow_name))
        self.run.visibility = str(state.metadata.get("visibility") or self.run.visibility or "internal")
        self.run.output_snapshot = _summarize_workflow_output(state)
        self.run.result_ref = _build_result_ref(state)
        self.run.diagnostics = _build_workflow_diagnostics(
            state,
            step_count=self._step_count,
            step_status_counts=self._step_status_counts,
        )
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
        "warnings": _summarize_value(result.warnings),
        "artifacts": _summarize_value(result.artifacts),
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
        "workflow_metadata": _summarize_value(state.metadata),
        "total_found": search_result.get("total_found"),
        "selected_sources": search_result.get("selected_sources"),
        "source_statuses": search_result.get("source_statuses"),
        "summary_status": summary.get("status"),
        "summary_overview": summary.get("overview"),
        "failed_sources": diagnostics.get("failed_sources"),
    })
    if "resolved_skills" in state.metadata:
        output["resolved_skills"] = _summarize_value(state.metadata.get("resolved_skills"))
    if "chapter_key" in state.input:
        output["chapter_key"] = state.input.get("chapter_key")
    if "evidence_counts" in state.data:
        output["evidence_counts"] = state.data.get("evidence_counts")
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


def _hash_snapshot(snapshot: dict) -> str:
    """生成稳定输入哈希，用于后续判断历史结果是否可复用。"""
    payload = json.dumps(snapshot or {}, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _infer_trigger_source(workflow_name: str) -> str:
    """从 workflow 名称推断默认触发来源。"""
    mapping = {
        "home_literature_search": "home_search",
        "research_direction_generation": "research_page",
        "project_design_generation": "research_page",
        "paper_chapter_generation": "writing_page",
        "html_deck_preview": "ppt_page",
    }
    return mapping.get(workflow_name, "")


def _extract_skill_id(metadata: dict[str, Any] | None) -> str | None:
    """从节点 metadata 中提取实际技能 ID。"""
    metadata = metadata or {}
    return metadata.get("resolved_skill_id") or metadata.get("skill_id")


def _extract_skill_version(metadata: dict[str, Any] | None) -> str | None:
    """从节点 metadata 中提取技能版本。"""
    metadata = metadata or {}
    value = metadata.get("skill_version") or metadata.get("version")
    return str(value) if value is not None else None


def _build_result_ref(state: AgentWorkflowState) -> dict[str, Any]:
    """提取可恢复结果引用，避免记录完整大对象。"""
    result_ref: dict[str, Any] = {}
    if state.search_task_id:
        result_ref["search_task_id"] = state.search_task_id
    if state.project_id:
        result_ref["project_id"] = state.project_id

    for key in (
        "draft_id",
        "chapter_key",
        "direction_id",
        "design_id",
    ):
        value = state.input.get(key)
        if value:
            result_ref[key] = value

    for key in (
        "artifact_id",
        "object_key",
        "preview_url",
        "download_url",
        "saved_id",
        "saved_ids",
        "draft_version",
    ):
        value = state.data.get(key)
        if value:
            result_ref[key] = _summarize_value(value)

    search_result = state.data.get("search_result")
    if isinstance(search_result, dict):
        if search_result.get("query"):
            result_ref["query"] = search_result.get("query")
        papers = search_result.get("papers")
        if isinstance(papers, list):
            result_ref["paper_count"] = len(papers)
        elif search_result.get("total_found") is not None:
            result_ref["paper_count"] = search_result.get("total_found")

    if state.workflow_name == "research_direction_generation" and state.data.get("saved_ids"):
        result_ref["direction_ids"] = _summarize_value(state.data.get("saved_ids"))
    if state.workflow_name == "project_design_generation" and state.data.get("saved_id"):
        result_ref["design_id"] = state.data.get("saved_id")
    if state.workflow_name == "html_deck_generation" and not result_ref.get("artifact_id") and result_ref.get("object_key"):
        result_ref["artifact_id"] = result_ref["object_key"]
    if "directions" in state.data:
        result_ref["direction_count"] = len(state.data.get("directions") or [])
    return result_ref


def _build_workflow_diagnostics(
    state: AgentWorkflowState,
    *,
    step_count: int,
    step_status_counts: dict[str, int],
) -> dict[str, Any]:
    """生成内部诊断摘要，供排障和审计使用。"""
    diagnostics = {
        "node_count": step_count,
        "step_statuses": dict(step_status_counts),
        "warnings": _summarize_value(state.metadata.get("warnings", [])),
        "artifacts": _summarize_value(state.metadata.get("artifacts", [])),
        "recording_errors": _summarize_value(state.metadata.get("recording_errors", [])),
    }
    if "resolved_skills" in state.metadata:
        diagnostics["resolved_skills"] = _summarize_value(state.metadata.get("resolved_skills"))
    search_diagnostics = state.data.get("search_diagnostics")
    if isinstance(search_diagnostics, dict):
        diagnostics["failed_sources"] = _summarize_value(search_diagnostics.get("failed_sources", []))
        diagnostics["source_overview"] = search_diagnostics.get("overview")
    if state.errors:
        diagnostics["errors"] = _summarize_value(state.errors)
    return diagnostics


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
