"""任务状态查询 API —— Celery 异步任务的状态轮询端点"""
from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException

from ..core.celery_app import celery_app
from ..models.user import User
from ..services.auth_dependency import get_current_user
from ..services.generated_artifact_service import can_access_task
from ..core.database import get_db
from sqlalchemy.orm import Session

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{task_id}")
def get_task_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """查询异步任务的状态和结果。

    返回：
        task_id: 任务 ID
        status: PENDING / STARTED / RETRY / SUCCESS / FAILURE
        result: 成功时返回任务结果，失败时返回错误信息
        ready: 任务是否已完成
    """
    if not can_access_task(db, current_user.id, task_id):
        raise HTTPException(status_code=404, detail="任务不存在")

    result = AsyncResult(task_id, app=celery_app)

    response = {
        "task_id": task_id,
        "status": result.status,
        "ready": result.ready(),
    }

    if result.ready():
        if result.successful():
            response["result"] = result.result
        else:
            # 任务失败，返回异常信息
            response["error"] = str(result.info) if result.info else "任务执行失败"

    return response


@router.delete("/{task_id}")
def revoke_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """撤销一个待处理的任务（不保证一定能撤销已在执行的任务）"""
    if not can_access_task(db, current_user.id, task_id):
        raise HTTPException(status_code=404, detail="任务不存在")

    celery_app.control.revoke(task_id, terminate=False)
    return {"ok": True, "task_id": task_id}
