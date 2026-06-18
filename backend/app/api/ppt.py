"""PPT 生成 API 路由"""
import os
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..agents.ppt_agent import ppt_agent
from ..core.database import get_db
from ..models.user import User
from ..schemas.ppt import GenerateProposalPPTRequest, PPTStyleOut
from ..services.auth_dependency import get_current_user
from ..services.generated_artifact_service import (
    can_access_object_key,
    register_generated_file,
    register_task_artifact,
)
from ..services.upload_service import get_object_stream
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
def list_ppt_styles():
    """列出可选的 PPT 风格列表"""
    return ppt_agent.list_styles()


@router.post("/proposal")
def generate_proposal_ppt(
    payload: GenerateProposalPPTRequest,
    async_mode: bool = Query(False, alias="async", description="是否异步生成（Celery 任务）"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """根据项目设计方案生成开题 PPTX 文件。

    设置 ?async=true 则立即返回 task_id，客户端可轮询 GET /api/tasks/{task_id} 获取结果。
    """
    if async_mode:
        task = generate_ppt_task.delay(
            design=payload.design,
            template=payload.template,
            user_id=str(current_user.id),
        )
        register_task_artifact(db, current_user.id, task.id, "proposal_ppt")
        return {"task_id": task.id, "status": "pending"}

    try:
        style = ppt_agent.resolve_style(payload.template)
        object_key = ppt_agent.generate(
            design=payload.design,
            template=payload.template,
        )
        register_generated_file(db, current_user.id, object_key, "proposal_ppt")
        filename = os.path.basename(object_key)
        return {
            "success": True,
            "filename": filename,
            "download_url": f"/api/ppt/download/{object_key}",
            "design_fields": len(payload.design),
            "style_id": style["id"],
            "style_name": style["name"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PPT 生成失败: {str(e)}")


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
