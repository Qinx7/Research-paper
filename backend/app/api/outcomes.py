"""成果管理 API 路由 —— 上传 / 查看 / 下载 / 分析项目成果"""
import logging
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.outcome import Outcome
from ..models.user import User
from ..schemas.outcome import (
    OutcomeCreate, OutcomeUpdate, OutcomeOut, OutcomeSummary, ReadinessCheck,
    OUTCOME_TYPES, OutcomeTypeInfo,
)
from ..schemas.project_document import OutcomeKnowledgeStatus
from ..services.upload_service import save_upload, delete_upload, get_object_stream, validate_file_type
from ..services.auth_dependency import get_current_user
from ..services.ownership import get_owned_outcome, get_owned_project, query_owned_outcomes
from ..services.project_knowledge_service import get_outcome_knowledge_status, index_outcome_document
from ..agents.outcome_agent import outcome_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/outcomes", tags=["outcomes"])

# 最大上传大小 50MB
MAX_UPLOAD_SIZE = 50 * 1024 * 1024


@router.get("/types", response_model=list[OutcomeTypeInfo])
def list_outcome_types():
    """列出可选的成果类型"""
    return [OutcomeTypeInfo(**t) for t in OUTCOME_TYPES]


@router.post("/upload", response_model=OutcomeOut, status_code=201)
def upload_outcome(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    outcome_type: str = Form(...),
    name: str = Form(...),
    description: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """上传项目成果文件"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="未选择文件")

    if not validate_file_type(file.filename):
        raise HTTPException(status_code=400, detail=f"不支持的文件类型: {file.filename}")

    # 检查文件大小
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail=f"文件大小超过限制（{MAX_UPLOAD_SIZE // 1024 // 1024}MB）")

    # 验证类型
    valid_types = [t["id"] for t in OUTCOME_TYPES]
    if outcome_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"无效的成果类型: {outcome_type}")

    try:
        project = get_owned_project(project_id, current_user, db)
        relative_path = save_upload(file, "outcomes")
        outcome = Outcome(
            project_id=project.id,
            outcome_type=outcome_type,
            name=name,
            description=description,
            file_path=relative_path,
        )
        db.add(outcome)
        db.commit()
        db.refresh(outcome)

        result = OutcomeOut.model_validate(outcome)
        result.file_url = f"/api/outcomes/{outcome.id}/download"
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.get("/", response_model=list[OutcomeOut])
def list_outcomes(
    project_id: str | None = None,
    outcome_type: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出成果，可按项目和类型过滤"""
    q = query_owned_outcomes(db, current_user)
    if project_id:
        project = get_owned_project(project_id, current_user, db)
        q = q.filter(Outcome.project_id == project.id)
    if outcome_type:
        q = q.filter(Outcome.outcome_type == outcome_type)
    outcomes = q.order_by(Outcome.created_at.desc()).all()
    result = []
    for o in outcomes:
        item = OutcomeOut.model_validate(o)
        item.file_url = f"/api/outcomes/{o.id}/download" if o.file_path else None
        result.append(item)
    return result


@router.get("/{outcome_id}", response_model=OutcomeOut)
def get_outcome(
    outcome_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取单个成果详情"""
    outcome = get_owned_outcome(outcome_id, current_user, db)
    result = OutcomeOut.model_validate(outcome)
    result.file_url = f"/api/outcomes/{outcome.id}/download" if outcome.file_path else None
    return result


@router.patch("/{outcome_id}", response_model=OutcomeOut)
def update_outcome(
    outcome_id: UUID,
    payload: OutcomeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """更新成果元数据"""
    outcome = get_owned_outcome(outcome_id, current_user, db)
    try:
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(outcome, field, value)
        db.commit()
        db.refresh(outcome)
        result = OutcomeOut.model_validate(outcome)
        result.file_url = f"/api/outcomes/{outcome.id}/download" if outcome.file_path else None
        return result
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新失败: {str(e)}")


@router.delete("/{outcome_id}", status_code=204)
def delete_outcome(
    outcome_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """删除成果及其文件"""
    outcome = get_owned_outcome(outcome_id, current_user, db)
    try:
        if outcome.file_path:
            delete_upload(outcome.file_path)
        db.delete(outcome)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@router.get("/{outcome_id}/download")
def download_outcome(
    outcome_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下载成果文件（MinIO 优先，本地 fallback）"""
    outcome = get_owned_outcome(outcome_id, current_user, db)
    if not outcome.file_path:
        raise HTTPException(status_code=404, detail="该成果没有文件")

    stream_result = get_object_stream(outcome.file_path)
    if stream_result is None:
        raise HTTPException(status_code=404, detail="文件不存在或已被删除")

    stream, size, content_type = stream_result
    filename = os.path.basename(outcome.file_path)

    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(size),
        },
    )


@router.post("/{outcome_id}/index-knowledge", response_model=OutcomeKnowledgeStatus)
def index_outcome_knowledge(
    outcome_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """将成果文件解析、切分并写入项目知识库。"""
    outcome = get_owned_outcome(outcome_id, current_user, db)
    return index_outcome_document(db, outcome)


@router.get("/{outcome_id}/knowledge-status", response_model=OutcomeKnowledgeStatus)
def get_knowledge_status(
    outcome_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取成果文件解析入知识库的当前状态。"""
    outcome = get_owned_outcome(outcome_id, current_user, db)
    return get_outcome_knowledge_status(outcome)


@router.post("/{project_id}/summarize", response_model=OutcomeSummary)
def summarize_outcomes(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI 汇总项目成果"""
    project = get_owned_project(project_id, current_user, db)
    outcomes = db.query(Outcome).filter(Outcome.project_id == project.id).all()
    outcome_dicts = [
        {
            "outcome_type": o.outcome_type,
            "name": o.name,
            "description": o.description,
            "file_path": o.file_path,
        }
        for o in outcomes
    ]

    result = outcome_agent.summarize_outcomes(outcome_dicts)

    type_counts = {}
    for o in outcomes:
        type_counts[o.outcome_type] = type_counts.get(o.outcome_type, 0) + 1

    return OutcomeSummary(
        total_count=len(outcomes),
        type_counts=type_counts,
        summary_text=result.get("summary_text"),
        ready_for_paper=result.get("ready_for_paper", False),
        missing_items=result.get("missing_items", []),
    )


@router.post("/{project_id}/check-readiness", response_model=ReadinessCheck)
def check_paper_readiness(
    project_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """检查项目成果是否足够撰写论文"""
    project = get_owned_project(project_id, current_user, db)
    outcomes = db.query(Outcome).filter(Outcome.project_id == project.id).all()
    outcome_dicts = [
        {
            "outcome_type": o.outcome_type,
            "name": o.name,
            "description": o.description,
        }
        for o in outcomes
    ]

    result = outcome_agent.suggest_paper_ready(outcome_dicts)
    return ReadinessCheck(**result)
