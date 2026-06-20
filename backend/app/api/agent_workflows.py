"""多 Agent workflow 执行记录 API。"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.user import User
from ..schemas.agent_workflow import AgentWorkflowRunDetailOut, AgentWorkflowRunOut
from ..services.agent_workflow_record_service import (
    get_workflow_run_for_user,
    list_workflow_runs_for_user,
    list_workflow_steps,
)
from ..services.auth_dependency import get_current_user

router = APIRouter(prefix="/agent-workflows", tags=["agent-workflows"])


@router.get("/runs", response_model=list[AgentWorkflowRunOut])
def list_agent_workflow_runs(
    limit: int = 30,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出当前用户的 workflow 执行记录。"""
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    return list_workflow_runs_for_user(
        db,
        user_id=current_user.id,
        limit=safe_limit,
        offset=safe_offset,
    )


@router.get("/runs/{run_id}", response_model=AgentWorkflowRunDetailOut)
def get_agent_workflow_run(
    run_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取当前用户可访问的单次 workflow 详情和节点记录。"""
    run = get_workflow_run_for_user(db, run_id=run_id, user_id=current_user.id)
    if not run:
        raise HTTPException(status_code=404, detail="workflow 记录不存在")
    data = AgentWorkflowRunOut.model_validate(run).model_dump()
    data["steps"] = list_workflow_steps(db, run_id=run.id)
    return data
