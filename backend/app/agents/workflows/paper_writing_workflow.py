"""论文写作 workflow：章节生成、依据校验与草稿保存。"""
from typing import Any, Callable
from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ...models.draft import Draft
from ...models.outcome import Outcome
from ...models.paper import Paper
from ...schemas.draft import PAPER_CHAPTER_LABELS
from ...services.agent_workflow_record_service import AgentWorkflowDbRecorder
from ...services.evidence_retrieval_service import build_evidence_context, retrieve_project_evidence
from ...skills import SkillExecutionContext, SkillExecutor, SkillRouter, build_default_skill_registry
from ..orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
from ..paper_writing_agent import paper_writing_agent


class DraftContextNode(AgentNode):
    """读取草稿上下文和既有章节。"""

    name = "draft_context"

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        draft = state.data["draft"]
        chapter_key = state.input["chapter_key"]
        return AgentNodeResult.success(
            data_delta={
                "outline": draft.outline or {},
                "existing_chapters": draft.content or {},
                "chapter_title": PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key),
            },
            metadata={
                "draft_id": str(draft.id),
                "chapter_key": chapter_key,
                "existing_chapter_count": len(draft.content or {}),
            },
        )


class EvidenceCollectNode(AgentNode):
    """收集章节生成所需的项目成果、文献和内部证据卡片。"""

    name = "evidence_collect"

    def __init__(self, db: Session, retrieve_evidence: Callable = retrieve_project_evidence):
        self.db = db
        self.retrieve_evidence = retrieve_evidence

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        draft = state.data["draft"]
        outcomes_query = self.db.query(Outcome).filter(Outcome.project_id == draft.project_id)
        outcome_ids = state.input.get("outcome_ids") or []
        if outcome_ids:
            parsed_ids = [_parse_uuid(item) for item in outcome_ids]
            outcomes_query = outcomes_query.filter(Outcome.id.in_([item for item in parsed_ids if item]))
        outcomes = outcomes_query.all()
        papers = self.db.query(Paper).filter(Paper.project_id == draft.project_id).all()
        evidence_items = self.retrieve_evidence(self.db, draft.project_id, "", limit=12, min_confidence=70)
        outcomes_summary = build_outcomes_summary(outcomes)
        literature_context = state.input.get("literature_context_override") or build_literature_context(papers=papers, evidence_items=evidence_items)
        evidence_counts = {
            "outcomes": len(outcomes),
            "papers": len(papers),
            "internal_evidence": len(evidence_items),
        }
        return AgentNodeResult.success(
            data_delta={
                "outcomes": outcomes,
                "papers": papers,
                "evidence_items": evidence_items,
                "outcomes_summary": outcomes_summary,
                "literature_context": literature_context,
                "evidence_counts": evidence_counts,
            },
            evidence_delta=[
                {"kind": "outcome", "title": getattr(outcome, "name", "")}
                for outcome in outcomes
            ] + [
                {"kind": "paper", "title": getattr(paper, "title", "")}
                for paper in papers
            ] + [
                {"kind": "internal_evidence", "title": item.get("title", "")}
                for item in evidence_items
            ],
            metadata=evidence_counts,
        )


class ChapterWriterNode(AgentNode):
    """调用现有论文写作 Agent 生成章节草稿。"""

    name = "chapter_writer"

    def __init__(self, skill_executor: SkillExecutor, skill_router: SkillRouter, writing_agent=None):
        self.skill_executor = skill_executor
        self.skill_router = skill_router
        self.writing_agent = writing_agent or paper_writing_agent

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        skill_definition = self.skill_router.resolve(domain="paper", action="write_chapter")
        skill_result = self.skill_executor.execute(
            skill_definition.id,
            {
                "chapter_key": state.input["chapter_key"],
                "outline": state.data.get("outline", {}),
                "outcomes_summary": state.data.get("outcomes_summary", ""),
                "literature_context": state.data.get("literature_context", ""),
                "existing_chapters": state.data.get("existing_chapters", {}),
            },
            context=SkillExecutionContext(
                user_id=state.user_id,
                project_id=state.project_id,
                draft_id=state.input.get("draft_id"),
                state={"writing_agent": self.writing_agent},
            ),
        )
        result = skill_result.output
        return AgentNodeResult.success(
            data_delta={"chapter_result": result},
            metadata={
                "skill_id": skill_result.skill_id,
                "chapter_key": state.input["chapter_key"],
                "citation_count": len(result.get("citations", []) or []),
                "data_based": bool(result.get("data_based")),
            },
        )


class GroundingGuardNode(AgentNode):
    """校验章节引用和具体数据表述是否有依据。"""

    name = "grounding_guard"

    def __init__(self, skill_executor: SkillExecutor, skill_router: SkillRouter):
        self.skill_executor = skill_executor
        self.skill_router = skill_router

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        skill_definition = self.skill_router.resolve(domain="paper", action="validate_chapter")
        skill_result = self.skill_executor.execute(
            skill_definition.id,
            {
                "chapter_key": state.input["chapter_key"],
                "result": state.data.get("chapter_result", {}),
                "outcomes": state.data.get("outcomes", []),
                "papers": state.data.get("papers", []),
                "evidence_items": state.data.get("evidence_items", []),
            },
            context=SkillExecutionContext(
                user_id=state.user_id,
                project_id=state.project_id,
                draft_id=state.input.get("draft_id"),
                state={},
            ),
        )
        validated = skill_result.output
        return AgentNodeResult.success(
            data_delta={"validated_chapter_result": validated},
            metadata={
                "skill_id": skill_result.skill_id,
                "citations": validated.get("citations", []),
                "data_based": bool(validated.get("data_based")),
            },
        )


class DraftSaveNode(AgentNode):
    """把通过校验的章节写回草稿。"""

    name = "draft_save"

    def __init__(self, db: Session):
        self.db = db

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        draft = state.data["draft"]
        chapter_key = state.input["chapter_key"]
        result = state.data.get("validated_chapter_result", {})
        chapter_title = PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)
        content = dict(draft.content or {})
        content[chapter_key] = {
            "title": result.get("title", chapter_title),
            "content": result.get("content", ""),
            "status": "generated",
            "citations": result.get("citations", []),
            "data_based": result.get("data_based", False),
        }
        draft.content = content
        draft.version = (draft.version or 1) + 1
        try:
            flag_modified(draft, "content")
        except Exception:
            pass
        self.db.commit()
        return AgentNodeResult.success(
            data_delta={"saved_chapter": content[chapter_key], "draft_version": draft.version},
            metadata={"draft_version": draft.version},
        )


def run_generate_chapter_workflow(
    *,
    db: Session,
    draft: Draft,
    chapter_key: str,
    user_id: str | None = None,
    outcome_ids: list[str] | None = None,
    literature_context_override: str = "",
    writing_agent=None,
    retrieve_evidence: Callable = retrieve_project_evidence,
    record_db=None,
) -> dict[str, Any]:
    """运行论文章节生成 workflow，并返回原章节接口兼容结果。"""
    skill_registry = build_default_skill_registry()
    skill_executor = SkillExecutor(skill_registry)
    skill_router = SkillRouter(skill_registry)
    state = AgentWorkflowState(
        workflow_name="paper_chapter_generation",
        user_id=user_id,
        project_id=str(draft.project_id),
        input={
            "draft_id": str(draft.id),
            "chapter_key": chapter_key,
            "outcome_ids": outcome_ids or [],
            "literature_context_override": literature_context_override,
        },
        data={"draft": draft},
    )
    recorder = AgentWorkflowDbRecorder(record_db) if record_db is not None else None
    runner = AgentWorkflowRunner(
        [
            DraftContextNode(),
            EvidenceCollectNode(db=db, retrieve_evidence=retrieve_evidence),
            ChapterWriterNode(skill_executor=skill_executor, skill_router=skill_router, writing_agent=writing_agent),
            GroundingGuardNode(skill_executor=skill_executor, skill_router=skill_router),
            DraftSaveNode(db=db),
        ],
        recorder=recorder,
    )
    workflow_result = runner.run(state)
    if workflow_result.state.status == "failed":
        raise ValueError("; ".join(workflow_result.state.errors) or "章节生成 workflow 失败")

    result = workflow_result.state.data.get("validated_chapter_result", {})
    persisted_run = getattr(recorder, "run", None) if recorder else None
    return {
        "chapter_key": chapter_key,
        "title": result.get("title", PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)),
        "content": result.get("content", ""),
        "status": "generated",
        "citations": result.get("citations", []),
        "data_based": result.get("data_based", False),
        "workflow_status": workflow_result.state.status,
        "workflow_run_id": str(getattr(persisted_run, "id", None) or workflow_result.state.run_id),
    }


def build_outcomes_summary(outcomes: list) -> str:
    """把项目成果整理为写作 Agent 可读摘要。"""
    if not outcomes:
        return "该项目暂无上传成果。论文中的实验和实现章节只能编写设计方案和预期结果，不能编造实验数据。"
    lines = [f"共 {len(outcomes)} 项成果："]
    for outcome in outcomes:
        lines.append(f"- [{getattr(outcome, 'outcome_type', '')}] {getattr(outcome, 'name', '')}: {getattr(outcome, 'description', '') or '无描述'}")
    return "\n".join(lines)


def build_literature_context(*, papers: list, evidence_items: list[dict] | None = None) -> str:
    """把项目文献和内部证据卡片整理为章节写作依据。"""
    evidence_items = evidence_items or []
    if not papers and not evidence_items:
        return ""
    parts: list[str] = []
    if papers:
        parts.append("已有文献：")
        for paper in papers[:20]:
            authors = _format_authors(getattr(paper, "authors", None))
            parts.append(f"- {authors}. {getattr(paper, 'title', '')}. {getattr(paper, 'venue', '') or ''}, {getattr(paper, 'year', '') or ''}")
        parts.append("")
        parts.append("允许填写到 citations 的文献标题清单：")
        for paper in papers[:20]:
            title = str(getattr(paper, "title", "") or "").strip()
            if title:
                parts.append(f"- {title}")
    evidence_context = build_evidence_context(evidence_items)
    if evidence_context:
        parts.extend(["", evidence_context])
    return "\n".join(parts)


def _format_authors(authors_value) -> str:
    if not authors_value:
        return "佚名"
    if isinstance(authors_value, list):
        return ", ".join([str(author).strip() for author in authors_value[:3] if str(author).strip()]) or "佚名"
    if isinstance(authors_value, str):
        parts = [author.strip() for author in authors_value.split(";") if author.strip()]
        if not parts:
            parts = [author.strip() for author in authors_value.split(",") if author.strip()]
        return ", ".join(parts[:3]) if parts else "佚名"
    return str(authors_value)


def _parse_uuid(value) -> UUID | None:
    try:
        return UUID(str(value))
    except (TypeError, ValueError):
        return None
