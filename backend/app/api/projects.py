"""项目相关 API 路由"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.project import Project
from ..models.user import User
from ..schemas.project import ProjectCreate, ProjectUpdate, ProjectOut
from ..services.auth_dependency import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """创建研究项目（需登录）"""
    try:
        project = Project(
            name=payload.name,
            research_field=payload.research_field,
            user_requirement=payload.user_requirement,
            user_id=current_user.id,
        )
        db.add(project)
        db.commit()
        db.refresh(project)
        return project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"创建项目失败: {str(e)}")


@router.get("/", response_model=list[ProjectOut])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出当前用户的所有项目"""
    try:
        return (
            db.query(Project)
            .filter(Project.user_id == current_user.id)
            .order_by(Project.created_at.desc())
            .all()
        )
    except Exception as e:
        logger.warning(f"列出项目失败: {e}")
        return []


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取单个项目（仅所有者）"""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新项目信息（仅所有者）"""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    try:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(project, field, value)
        db.commit()
        db.refresh(project)
        return project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新项目失败: {str(e)}")


@router.delete("/{project_id}", status_code=204)
def delete_project(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除项目（仅所有者）"""
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    try:
        db.delete(project)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除项目失败: {str(e)}")
