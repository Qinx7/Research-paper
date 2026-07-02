"""PPT 生成 Celery 异步任务。"""
from uuid import UUID

from ..agents.workflows import run_ppt_generation_workflow
from ..core.celery_app import celery_app
from ..core.database import SessionLocal
from ..services.generated_artifact_service import register_generated_file


@celery_app.task(bind=True, max_retries=1, default_retry_delay=30)
def generate_ppt_task(self, design: dict, template: str, user_id: str | None = None) -> dict:
    """异步生成通用 PPT，返回文件信息。"""
    db = None
    try:
        if user_id:
            db = SessionLocal()
        artifact = run_ppt_generation_workflow(
            design=design,
            template=template,
            user_id=user_id,
            record_db=db,
        )
        if user_id:
            register_generated_file(
                db=db,
                user_id=UUID(user_id),
                object_key=artifact["object_key"],
                artifact_type="project_ppt",
                task_id=self.request.id,
            )
        return artifact
    except Exception as exc:
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise
    finally:
        if db is not None:
            db.close()
