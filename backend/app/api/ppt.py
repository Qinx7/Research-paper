"""PPT 生成 API 路由"""
import os
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session

from ..agents.ppt_agent import ppt_agent
from ..agents.workflows import run_deck_generation_workflow, run_ppt_generation_workflow
from ..core.database import get_db
from ..models.user import User
from ..schemas.ppt import GenerateHtmlDeckRequest, GeneratePPTRequest, HtmlDeckArtifactOut, PPTStyleOut
from ..services.auth_dependency import get_current_user
from ..services.generated_artifact_service import (
    can_access_object_key,
    register_generated_file,
    register_task_artifact,
)
from ..services.ownership import get_owned_draft
from ..services.upload_service import get_object_stream
from ..services.web_deck_render_service import build_slides_outline_from_draft
from ..tasks.ppt_task import generate_ppt_task

router = APIRouter(prefix="/ppt", tags=["ppt"])

STORAGE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "storage", "generated")
STORAGE_DIR = os.path.abspath(STORAGE_DIR)


@router.get("/list")
def list_ppts(current_user: User = Depends(get_current_user)):
    """列出所有已生成的 PPT 文件"""
    if not os.path.exists(STORAGE_DIR):
        return {"files": []}
    files = []
    for fname in os.listdir(STORAGE_DIR):
        if fname.endswith(".pptx"):
            fpath = os.path.join(STORAGE_DIR, fname)
            stat = os.stat(fpath)
            files.append({
                "filename": fname,
                "size": stat.st_size,
                "created_at": time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_ctime)),
                "download_url": f"/api/ppt/download/{fname}",
            })
    files.sort(key=lambda f: f["created_at"], reverse=True)
    return {"files": files}


@router.get("/styles", response_model=list[PPTStyleOut])
def list_ppt_styles(current_user: User = Depends(get_current_user)):
    """列出可选的 PPT 风格列表"""
    return ppt_agent.list_styles()


@router.post("/generate")
def generate_ppt(
    payload: GeneratePPTRequest,
    async_mode: bool = Query(False, alias="async", description="是否异步生成（Celery 任务）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """根据项目设计方案生成通用 PPTX 文件。

    设置 ?async=true 则立即返回 task_id，客户端可轮询 GET /api/tasks/{task_id} 获取结果。
    """
    if async_mode:
        task = generate_ppt_task.delay(
            design=payload.design,
            template=payload.template,
            user_id=str(current_user.id),
        )
        register_task_artifact(db, current_user.id, task.id, "project_ppt")
        return {"task_id": task.id, "status": "pending"}

    try:
        artifact = run_ppt_generation_workflow(
            design=payload.design,
            template=payload.template,
            user_id=str(current_user.id),
            record_db=db,
        )
        register_generated_file(db, current_user.id, artifact["object_key"], "project_ppt")
        return artifact
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PPT 生成失败: {str(e)}")


@router.post("/html-deck", response_model=HtmlDeckArtifactOut)
def generate_html_deck(
    payload: GenerateHtmlDeckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """生成实验型 HTML deck 产物。"""
    try:
        slides_outline = payload.slides_outline or []
        deck_title = payload.deck_title or "HTML Deck"

        if payload.draft_id:
            draft = get_owned_draft(payload.draft_id, current_user, db)
            slides_outline = build_slides_outline_from_draft(
                title=draft.title,
                draft_content=draft.content or {},
            )
            deck_title = payload.deck_title or draft.title
        if not slides_outline:
            raise HTTPException(status_code=400, detail="必须提供 slides_outline 或 draft_id")

        artifact = run_deck_generation_workflow(
            deck_title=deck_title,
            slides_outline=slides_outline,
            theme=payload.theme,
            user_id=str(current_user.id),
            project_id=str(getattr(draft, "project_id", "")) if payload.draft_id else None,
            draft_id=str(payload.draft_id) if payload.draft_id else None,
            record_db=db,
        )
        register_generated_file(db, current_user.id, artifact["object_key"], "html_deck")
        return HtmlDeckArtifactOut(**artifact)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"HTML deck 生成失败: {str(e)}")


@router.get("/html-deck/preview/{object_key:path}")
def preview_html_deck(
    object_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """内联预览 HTML deck。"""
    if not can_access_object_key(db, current_user.id, object_key):
        raise HTTPException(status_code=404, detail="文件不存在")

    stream_result = get_object_stream(object_key)
    if stream_result is None:
        raise HTTPException(status_code=404, detail="文件不存在")

    stream, _, _ = stream_result
    html_text = stream.read().decode("utf-8")
    try:
        stream.close()
    except Exception:
        pass
    return HTMLResponse(content=html_text)


@router.get("/html-deck/download/{object_key:path}")
def download_html_deck(
    object_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下载 HTML deck 文件。"""
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


@router.get("/download/{object_key:path}")
def download_pptx(
    object_key: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """下载生成的 PPTX 文件（MinIO 优先，本地 fallback）"""
    if not can_access_object_key(db, current_user.id, object_key):
        raise HTTPException(status_code=404, detail="文件不存在")

    stream_result = get_object_stream(object_key)
    if stream_result is None:
        # 兼容旧的本地路径下载
        if os.path.exists(os.path.join(STORAGE_DIR, os.path.basename(object_key))):
            safe_path = os.path.abspath(os.path.join(STORAGE_DIR, os.path.basename(object_key)))
            if safe_path.startswith(STORAGE_DIR) and os.path.exists(safe_path):
                stream_result = open(safe_path, "rb"), os.path.getsize(safe_path), \
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation"
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
