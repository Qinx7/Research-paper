"""项目相关 API 路由"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.agent_workflow import AgentWorkflowRun
from ..models.draft import Draft
from ..models.literature_search_task import LiteratureSearchTask
from ..models.outcome import Outcome
from ..models.paper import Paper
from ..models.paper_note import PaperNote
from ..models.project import Project
from ..models.project_design import ProjectDesign
from ..models.project_document_chunk import ProjectDocumentChunk
from ..models.proposal import Proposal
from ..models.research_direction import ResearchDirection
from ..models.user import User
from ..models.zotero_sync import ZoteroSync
from ..schemas.project import ProjectCreate, ProjectUpdate, ProjectOut
from ..services.auth_dependency import get_current_user
from ..services.ownership import get_owned_project
from ..services.project_workspace_service import load_project_workspace_snapshot
from ..services.upload_service import delete_upload

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


@router.get("/{project_id}/workspace")
def get_project_workspace(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取项目知识沉淀与交付工作台快照。"""
    project = get_owned_project(project_id, current_user, db)
    return load_project_workspace_snapshot(db, project.id)


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
        _delete_project_dependencies(db, project.id)
        db.flush()
        db.delete(project)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除项目失败: {str(e)}")


def _delete_project_dependencies(db: Session, project_id: UUID) -> None:
    """删除项目的关联记录，避免外键阻塞项目删除。"""
    # 先删依赖更深的记录
    for note in db.query(PaperNote).filter(PaperNote.project_id == project_id).all():
        db.delete(note)

    for proposal in db.query(Proposal).filter(Proposal.project_id == project_id).all():
        if getattr(proposal, "docx_path", None):
            try:
                delete_upload(proposal.docx_path)
            except Exception:
                pass
        db.delete(proposal)

    for chunk in db.query(ProjectDocumentChunk).filter(ProjectDocumentChunk.project_id == project_id).all():
        db.delete(chunk)

    for draft in db.query(Draft).filter(Draft.project_id == project_id).all():
        db.delete(draft)

    for design in db.query(ProjectDesign).filter(ProjectDesign.project_id == project_id).all():
        db.delete(design)

    for direction in db.query(ResearchDirection).filter(ResearchDirection.project_id == project_id).all():
        db.delete(direction)

    for sync in db.query(ZoteroSync).filter(ZoteroSync.project_id == project_id).all():
        db.delete(sync)

    for run in db.query(AgentWorkflowRun).filter(AgentWorkflowRun.project_id == project_id).all():
        db.delete(run)

    for task in db.query(LiteratureSearchTask).filter(LiteratureSearchTask.project_id == project_id).all():
        db.delete(task)

    for outcome in db.query(Outcome).filter(Outcome.project_id == project_id).all():
        if getattr(outcome, "file_path", None):
            try:
                delete_upload(outcome.file_path)
            except Exception:
                pass
        db.delete(outcome)

    for paper in db.query(Paper).filter(Paper.project_id == project_id).all():
        db.delete(paper)
