"""答辩 PPT 生成 Celery 异步任务"""
import logging
import os
from uuid import UUID

from ..core.celery_app import celery_app
from ..core.database import SessionLocal
from ..models.draft import Draft
from ..models.outcome import Outcome
from ..agents.defense_ppt_agent import defense_ppt_agent
from ..services.generated_artifact_service import register_generated_file

logger = logging.getLogger(__name__)

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "generated")


@celery_app.task(bind=True, max_retries=1, default_retry_delay=30)
def generate_defense_ppt_task(self, draft_id: str, template: str = "academic_blue", user_id: str | None = None) -> dict:
    """异步生成答辩 PPTX 文件。

    返回：
        {success, filename, download_url, style_id, style_name, slide_count, has_real_data}
    """
    db = SessionLocal()
    try:
        draft = db.query(Draft).filter(Draft.id == UUID(draft_id)).first()
        if not draft:
            raise ValueError(f"草稿不存在: {draft_id}")

        # 构建成果摘要
        outcomes = db.query(Outcome).filter(Outcome.project_id == draft.project_id).all()
        if outcomes:
            lines = [f"共 {len(outcomes)} 项成果："]
            for o in outcomes:
                lines.append(f"- [{o.outcome_type}] {o.name}: {o.description or ''}")
            outcomes_summary = "\n".join(lines)
        else:
            outcomes_summary = ""

        style = defense_ppt_agent.resolve_style(template)
        object_key = defense_ppt_agent.generate(
            draft_title=draft.title,
            draft_content=draft.content or {},
            outcomes_summary=outcomes_summary,
            template=template,
        )
        filename = os.path.basename(object_key)
        if user_id:
            register_generated_file(
                db=db,
                user_id=UUID(user_id),
                object_key=object_key,
                artifact_type="defense_ppt",
                task_id=self.request.id,
            )

        has_real_data = False
        for ch in (draft.content or {}).values():
            if isinstance(ch, dict) and ch.get("data_based"):
                has_real_data = True
                break

        return {
            "success": True,
            "filename": filename,
            "download_url": f"/api/defense/ppt/download/{object_key}",
            "style_id": style["id"],
            "style_name": style["name"],
            "slide_count": 15,
            "has_real_data": has_real_data,
        }

    except Exception as exc:
        logger.error(f"答辩 PPT 生成失败 (draft={draft_id}): {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise
    finally:
        db.close()
