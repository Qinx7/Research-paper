"""文献阅读笔记与证据卡片 API。"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.paper import Paper
from ..models.paper_note import PaperNote
from ..models.project import Project
from ..models.user import User
from ..schemas.paper_note import PaperNoteCreate, PaperNoteOut, PaperNoteUpdate
from ..services.auth_dependency import get_current_user

router = APIRouter(prefix="/paper-notes", tags=["paper-notes"])


@router.get("/", response_model=list[PaperNoteOut])
def list_paper_notes(
    project_id: str | None = None,
    paper_id: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出当前用户项目中的文献笔记。"""
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id 不能为空")
    query = db.query(PaperNote)
    project = _get_owned_project(UUID(str(project_id)), current_user, db)
    query = query.filter(PaperNote.project_id == project.id)
    if paper_id:
        query = query.filter(PaperNote.paper_id == UUID(str(paper_id)))
    return query.order_by(PaperNote.created_at.desc()).all()


@router.post("/", response_model=PaperNoteOut, status_code=201)
def create_paper_note(
    payload: PaperNoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """为项目文献创建阅读笔记。"""
    project = _get_owned_project(payload.project_id, current_user, db)
    paper = _get_project_paper(payload.paper_id, project.id, db)
    note = PaperNote(
        project_id=project.id,
        paper_id=paper.id,
        note_type=payload.note_type,
        title=payload.title,
        content=payload.content,
        evidence_text=payload.evidence_text,
        evidence_level=payload.evidence_level,
        confidence=payload.confidence,
        tags=payload.tags,
        meta=payload.meta,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=PaperNoteOut)
def update_paper_note(
    note_id: UUID,
    payload: PaperNoteUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新一条阅读笔记。"""
    note = _get_owned_note(note_id, current_user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_paper_note(
    note_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除一条阅读笔记。"""
    note = _get_owned_note(note_id, current_user, db)
    db.delete(note)
    db.commit()
    return None


def _get_owned_project(project_id: UUID | None, current_user: User, db: Session) -> Project:
    """确保项目存在且属于当前用户。"""
    if not project_id:
        raise HTTPException(status_code=400, detail="project_id 不能为空")
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


def _get_project_paper(paper_id: UUID, project_id: UUID | None, db: Session) -> Paper:
    """获取项目内文献，防止笔记绑定到无关文献。"""
    query = db.query(Paper).filter(Paper.id == paper_id)
    if project_id:
        query = query.filter(Paper.project_id == project_id)
    paper = query.first()
    if not paper:
        raise HTTPException(status_code=404, detail="文献不存在")
    return paper


def _get_owned_note(note_id: UUID, current_user: User, db: Session) -> PaperNote:
    """获取当前用户可操作的笔记。"""
    note = db.query(PaperNote).filter(PaperNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    if note.project_id:
        _get_owned_project(note.project_id, current_user, db)
    return note
