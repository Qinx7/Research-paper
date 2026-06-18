"""PPT 生成 Celery 异步任务"""
import os
from uuid import UUID

from ..core.celery_app import celery_app
from ..core.database import SessionLocal
from ..agents.ppt_agent import ppt_agent
from ..services.generated_artifact_service import register_generated_file


@celery_app.task(bind=True, max_retries=1, default_retry_delay=30)
def generate_ppt_task(self, design: dict, template: str, user_id: str | None = None) -> dict:
    """异步生成开题 PPT，返回文件信息。

    参数：
        design: 项目设计方案字典
        template: 风格 ID（如 "academic_blue"）
    返回：
        {"filename": str, "download_url": str, "style_id": str, "style_name": str}
    """
    try:
        style = ppt_agent.resolve_style(template)
        object_key = ppt_agent.generate(design=design, template=template)
        if user_id:
            db = SessionLocal()
            try:
                register_generated_file(
                    db=db,
                    user_id=UUID(user_id),
                    object_key=object_key,
                    artifact_type="proposal_ppt",
                    task_id=self.request.id,
                )
            finally:
                db.close()
        filename = os.path.basename(object_key)
        return {
            "filename": filename,
            "download_url": f"/api/ppt/download/{object_key}",
            "style_id": style["id"],
            "style_name": style["name"],
        }
    except Exception as exc:
        # 重试一次
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise
