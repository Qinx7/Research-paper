"""论文草稿 Celery 异步任务"""
import logging
from uuid import UUID

from ..core.celery_app import celery_app
from ..core.database import SessionLocal
from ..models.draft import Draft
from ..models.outcome import Outcome
from ..models.paper import Paper
from ..agents.paper_writing_agent import paper_writing_agent
from ..agents.workflows import run_generate_chapter_workflow
from ..services.compliance_checker import check_draft
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

        # 使用统一 workflow，避免同步/异步章节生成逻辑分叉。
        result = run_generate_chapter_workflow(
            db=db,
            draft=draft,
            chapter_key=chapter_key,
            outcome_ids=outcome_ids,
            literature_context_override=literature_context,
            writing_agent=paper_writing_agent,
            record_db=db,
        )

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
            try:
                flag_modified(draft, "content")
            except Exception:
                pass
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
            "workflow_run_id": result.get("workflow_run_id"),
        }

    except Exception as exc:
        logger.error(f"章节生成失败 (draft={draft_id}, chapter={chapter_key}): {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise
    finally:
        db.close()
