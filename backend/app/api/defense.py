"""答辩 PPT API 路由 —— 生成 / 下载 / 演讲稿"""
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from uuid import UUID

from ..core.database import get_db
from ..models.draft import Draft
from ..models.outcome import Outcome
from ..models.user import User
from ..schemas.defense_ppt import (
    GenerateDefensePPTRequest, GenerateDefensePPTResponse,
    DefensePPTOutline, DefenseScript, DefenseSlideInfo,
)
from ..schemas.ppt import PPTStyleOut
from ..agents.defense_ppt_agent import defense_ppt_agent
from ..services.upload_service import get_object_stream
from ..services.auth_dependency import get_current_user
from ..services.generated_artifact_service import (
    can_access_object_key,
    register_generated_file,
    register_task_artifact,
)
from ..services.ownership import get_owned_draft
from ..tasks.defense_ppt_task import generate_defense_ppt_task

router = APIRouter(prefix="/defense", tags=["defense"])

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "generated")
STORAGE_DIR = os.path.abspath(STORAGE_DIR)


def _build_outcomes_summary(db: Session, project_id) -> str:
    outcomes = db.query(Outcome).filter(Outcome.project_id == project_id).all()
    if not outcomes:
        return "暂无上传成果"
    lines = [f"共 {len(outcomes)} 项成果："]
    for o in outcomes:
        lines.append(f"- [{o.outcome_type}] {o.name}: {o.description or ''}")
    return "\n".join(lines)


@router.get("/ppt/styles", response_model=list[PPTStyleOut])
def list_styles(current_user: User = Depends(get_current_user)):
    """列出可选 PPT 风格"""
    return defense_ppt_agent.list_styles()


@router.post("/ppt", response_model=GenerateDefensePPTResponse)
def generate_defense_ppt(
    payload: GenerateDefensePPTRequest,
    async_mode: bool = Query(False, alias="async", description="是否异步生成"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """根据论文草稿生成答辩 PPT"""
    draft = get_owned_draft(payload.draft_id, current_user, db)

    if async_mode:
        task = generate_defense_ppt_task.delay(
            draft_id=str(draft.id),
            template=payload.template,
            user_id=str(current_user.id),
        )
        register_task_artifact(db, current_user.id, task.id, "defense_ppt")
        return {"task_id": task.id, "status": "pending"}

    # 同步模式
    try:
        outcomes_summary = _build_outcomes_summary(db, draft.project_id)
        style = defense_ppt_agent.resolve_style(payload.template)
        object_key = defense_ppt_agent.generate(
            draft_title=draft.title,
            draft_content=draft.content or {},
            outcomes_summary=outcomes_summary,
            template=payload.template,
        )
        register_generated_file(db, current_user.id, object_key, "defense_ppt")
        filename = os.path.basename(object_key)

        has_real_data = False
        for ch in (draft.content or {}).values():
            if isinstance(ch, dict) and ch.get("data_based"):
                has_real_data = True
                break

        return GenerateDefensePPTResponse(
            success=True,
            filename=filename,
            download_url=f"/api/defense/ppt/download/{object_key}",
            style_id=style["id"],
            style_name=style["name"],
            slide_count=14,
            has_real_data=has_real_data,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"答辩 PPT 生成失败: {str(e)}")


@router.get("/ppt/download/{object_key:path}")
def download_defense_ppt(
    object_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下载答辩 PPTX 文件（MinIO 优先，本地 fallback）"""
    if not can_access_object_key(db, current_user.id, object_key):
        raise HTTPException(status_code=404, detail="文件不存在")

    stream_result = get_object_stream(object_key)
    if stream_result is None:
        raise HTTPException(status_code=404, detail="文件不存在")

    stream, size, content_type = stream_result
    return StreamingResponse(
        stream,
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{os.path.basename(object_key)}"',
            "Content-Length": str(size),
        },
    )


@router.get("/ppt/{draft_id}/outline", response_model=DefensePPTOutline)
def get_defense_outline(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取答辩 PPT 大纲预览"""
    draft = get_owned_draft(draft_id, current_user, db)

    slides = defense_ppt_agent._build_slides(
        title=draft.title,
        content=draft.content or {},
        outcomes_summary=_build_outcomes_summary(db, draft.project_id),
        style=defense_ppt_agent.resolve_style(None),
    )

    has_real_data = False
    for ch in (draft.content or {}).values():
        if isinstance(ch, dict) and ch.get("data_based"):
            has_real_data = True
            break

    slide_infos = []
    for i, s in enumerate(slides):
        slide_infos.append(DefenseSlideInfo(
            page=i + 1,
            title=s.get("title", ""),
            content_type=s.get("type", "content"),
            description=s.get("title", ""),
        ))

    return DefensePPTOutline(slides=slide_infos, total_slides=len(slides), has_real_data=has_real_data)


@router.get("/ppt/{draft_id}/script", response_model=DefenseScript)
def get_defense_script(
    draft_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成答辩演讲稿"""
    draft = get_owned_draft(draft_id, current_user, db)

    slides = defense_ppt_agent._build_slides(
        title=draft.title,
        content=draft.content or {},
        outcomes_summary=_build_outcomes_summary(db, draft.project_id),
        style=defense_ppt_agent.resolve_style(None),
    )

    result = defense_ppt_agent.generate_script(slides)
    return DefenseScript(
        slides=result.get("slides", []),
        total_duration_minutes=result.get("total_duration_minutes", 0),
    )
