"""论文草稿 Celery 异步任务"""
import logging
import os
from uuid import UUID

from ..core.celery_app import celery_app
from ..core.database import SessionLocal
from ..models.draft import Draft
from ..models.outcome import Outcome
from ..models.paper import Paper
from ..agents.paper_writing_agent import paper_writing_agent
from ..schemas.draft import PAPER_CHAPTER_KEYS, PAPER_CHAPTER_LABELS
from ..services.compliance_checker import check_draft
from ..services.evidence_retrieval_service import retrieve_project_evidence
from ..services.grounding_guard import validate_generated_chapter_grounding
from sqlalchemy.orm.attributes import flag_modified

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=1, default_retry_delay=30)
def generate_chapter_task(
    self,
    draft_id: str,
    chapter_key: str,
    outcome_ids: list[str] | None = None,
    literature_context: str = "",
) -> dict:
    """异步生成论文单个章节，保存到 drafts 表。

    返回：
        {chapter_key, title, content, status, data_based}
    """
    db = SessionLocal()
    try:
        draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
        if not draft:
            raise ValueError(f"草稿不存在: {draft_id}")

        # 收集成果摘要
        outcomes_summary = _build_outcomes_summary(db, draft.project_id, outcome_ids)
        q = db.query(Outcome).filter(Outcome.project_id == draft.project_id)
        if outcome_ids:
            q = q.filter(Outcome.id.in_([UUID(oid) for oid in outcome_ids]))
        outcomes = q.all()
        papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()
        evidence_items = retrieve_project_evidence(db, draft.project_id, "", limit=12, min_confidence=70)

        # 调用 Agent 生成
        result = paper_writing_agent.generate_chapter(
            chapter_key=chapter_key,
            outline=draft.outline or {},
            outcomes_summary=outcomes_summary,
            literature_context=literature_context,
            existing_chapters=draft.content or {},
        )
        result = validate_generated_chapter_grounding(
            chapter_key=chapter_key,
            result=result,
            outcomes=outcomes,
            papers=papers,
            evidence_items=evidence_items,
        )

        # 保存到数据库
        content = draft.content or {}
        content[chapter_key] = {
            "title": result.get("title", PAPER_CHAPTER_LABELS.get(chapter_key, chapter_key)),
            "content": result.get("content", ""),
            "status": "generated",
            "data_based": result.get("data_based", False),
        }
        draft.content = content
        db.commit()

        # 自动运行规则检查（不含 AI），结果存入 _compliance
        try:
            outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
            papers = db.query(Paper).filter(Paper.project_id == draft.project_id).all()
            compliance_result = check_draft(
                draft=draft,
                outcomes=outcomes,
                papers=papers,
                enable_ai=False,
            )
            content = dict(draft.content or {})
            content["_compliance"] = compliance_result.model_dump(mode="json")
            draft.content = content
            flag_modified(draft, "content")
            db.commit()
        except Exception:
            logger.warning(f"自动合规检查失败 (draft={draft_id}, chapter={chapter_key})", exc_info=True)

        return {
            "chapter_key": chapter_key,
            "title": result.get("title", ""),
            "content": result.get("content", ""),
            "status": "generated",
            "data_based": result.get("data_based", False),
            "citations": result.get("citations", []),
        }

    except Exception as exc:
        logger.error(f"章节生成失败 (draft={draft_id}, chapter={chapter_key}): {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise
    finally:
        db.close()


def _build_outcomes_summary(db, project_id, outcome_ids: list[str] | None = None) -> str:
    """从数据库构建成果摘要文本"""
    q = db.query(Outcome).filter(Outcome.project_id == project_id)
    if outcome_ids:
        q = q.filter(Outcome.id.in_([UUID(oid) for oid in outcome_ids]))
    outcomes = q.all()

    if not outcomes:
        return "该项目暂无上传成果。论文中的实验和实现章节只能编写设计方案和预期结果，不能编造实验数据。"

    lines = [f"共 {len(outcomes)} 项成果："]
    for o in outcomes:
        lines.append(f"- [{o.outcome_type}] {o.name}: {o.description or '无描述'}")
    return "\n".join(lines)
