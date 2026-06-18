"""学术检索任务 API。"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.literature_search_task import LiteratureSearchTask
from ..schemas.literature_search_task import LiteratureSearchTaskOut

router = APIRouter(prefix="/literature-search-tasks", tags=["literature-search-tasks"])


@router.get("/", response_model=list[LiteratureSearchTaskOut])
def list_literature_search_tasks(
    project_id: UUID | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """列出学术检索任务，方便前端查看来源诊断和历史结果快照。"""
    safe_limit = max(1, min(limit, 100))
    query = db.query(LiteratureSearchTask).order_by(LiteratureSearchTask.created_at.desc())
    if project_id:
        query = query.filter(LiteratureSearchTask.project_id == project_id)
    return query.limit(safe_limit).all()


@router.get("/{task_id}", response_model=LiteratureSearchTaskOut)
def get_literature_search_task(task_id: UUID, db: Session = Depends(get_db)):
    """获取单次学术检索任务详情。"""
    task = db.query(LiteratureSearchTask).filter(LiteratureSearchTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="检索任务不存在")
    return task


@router.delete("/{task_id}", status_code=204)
def delete_literature_search_task(task_id: UUID, db: Session = Depends(get_db)):
    """删除一条检索任务记录。"""
    task = db.query(LiteratureSearchTask).filter(LiteratureSearchTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="检索任务不存在")
    db.delete(task)
    db.commit()
    return None
