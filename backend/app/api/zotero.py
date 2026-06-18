"""Zotero 同步 API 路由"""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.zotero_sync import ZoteroSync
from ..models.paper import Paper
from ..models.user import User
from ..schemas.zotero import (
    ZoteroConnectRequest,
    ZoteroCollectionOut,
    ZoteroSyncRequest,
    ZoteroSyncOut,
    ZoteroImportResult,
    ZoteroConnectInfo,
)
from ..services.zotero_service import ZoteroClient, import_from_zotero
from ..services.auth_dependency import get_current_user
from ..services.ownership import get_owned_project

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/zotero", tags=["zotero"])


@router.post("/connect", response_model=ZoteroConnectInfo)
def connect_zotero(
    req: ZoteroConnectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """验证 Zotero API Key 并保存连接配置"""
    project = get_owned_project(req.project_id, current_user, db)

    # 验证 API Key
    try:
        client = ZoteroClient(req.library_type, req.library_id, req.api_key)
        info = client.verify_connection()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Zotero 连接验证失败：{e}")

    # 检查是否已有连接（同一个 project + library 组合）
    existing = (
        db.query(ZoteroSync)
        .filter(
            ZoteroSync.project_id == project.id,
            ZoteroSync.library_type == req.library_type,
            ZoteroSync.zotero_user_id == str(info["user_id"]),
        )
        .first()
    )

    if existing:
        existing.zotero_api_key = req.api_key
        db.commit()
        db.refresh(existing)
    else:
        sync_record = ZoteroSync(
            project_id=project.id,
            zotero_user_id=str(info["user_id"]),
            zotero_api_key=req.api_key,
            library_type=req.library_type,
        )
        db.add(sync_record)
        db.commit()
        db.refresh(sync_record)

    return ZoteroConnectInfo(
        connected=True,
        user_id=info["user_id"],
        username=info.get("username", ""),
        display_name=info.get("display_name", ""),
        library_type=req.library_type,
        library_id=req.library_id,
    )


def _get_zotero_sync(
    project_id: str,
    current_user: User,
    db: Session,
) -> tuple[ZoteroSync, ZoteroClient]:
    """辅助：获取项目的 Zotero 同步记录和客户端"""
    project = get_owned_project(project_id, current_user, db)
    sync_record = (
        db.query(ZoteroSync)
        .filter(ZoteroSync.project_id == project.id)
        .first()
    )
    if not sync_record:
        raise HTTPException(status_code=404, detail="未找到 Zotero 连接配置，请先连接 Zotero")

    client = ZoteroClient(
        sync_record.library_type,
        sync_record.zotero_user_id,
        sync_record.zotero_api_key,
    )
    return sync_record, client


@router.get("/{project_id}/collections", response_model=list[ZoteroCollectionOut])
def list_collections(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取项目关联 Zotero 库的集合列表"""
    _, client = _get_zotero_sync(project_id, current_user, db)
    try:
        collections = client.get_collections()
        return [ZoteroCollectionOut(**c) for c in collections]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取集合列表失败：{e}")


@router.post("/sync", response_model=ZoteroImportResult)
def sync_zotero(
    req: ZoteroSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """按选中集合导入 Zotero 条目到项目文献库。
    若 collection_keys 为空，则导入全部顶层条目。"""
    sync_record, client = _get_zotero_sync(req.project_id, current_user, db)

    # 更新同步状态
    sync_record.sync_status = "syncing"
    db.commit()

    try:
        if req.collection_keys:
            # 按集合导入
            result = import_from_zotero(client, req.collection_keys, req.project_id, db)
        else:
            # 导入全部条目（包括顶层无集合的文献）
            all_items = client.get_all_items()
            from ..services.zotero_service import import_items
            result = import_items(client, all_items, req.project_id, db)

        # 更新同步记录
        sync_record.sync_status = "idle"
        sync_record.last_sync_at = datetime.utcnow()
        sync_record.last_sync_version = client.get_last_version()
        sync_record.synced_collections = req.collection_keys
        db.commit()

        return ZoteroImportResult(**result)
    except Exception as e:
        sync_record.sync_status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"同步失败：{e}")


@router.get("/{project_id}/status", response_model=ZoteroSyncOut | None)
def get_zotero_status(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """获取项目最近一次 Zotero 同步状态"""
    project = get_owned_project(project_id, current_user, db)
    sync_record = db.query(ZoteroSync).filter(ZoteroSync.project_id == project.id).first()
    if not sync_record:
        return None
    return ZoteroSyncOut(
        id=str(sync_record.id),
        project_id=str(sync_record.project_id),
        library_type=sync_record.library_type,
        library_id=sync_record.zotero_user_id,
        last_sync_version=sync_record.last_sync_version,
        sync_status=sync_record.sync_status,
        synced_collections=sync_record.synced_collections or [],
        last_sync_at=str(sync_record.last_sync_at) if sync_record.last_sync_at else None,
        created_at=str(sync_record.created_at) if sync_record.created_at else None,
    )


@router.delete("/{project_id}/disconnect")
def disconnect_zotero(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """断开 Zotero 连接（不删除已导入的文献）"""
    project = get_owned_project(project_id, current_user, db)
    sync_record = db.query(ZoteroSync).filter(ZoteroSync.project_id == project.id).first()
    if not sync_record:
        raise HTTPException(status_code=404, detail="未找到 Zotero 连接配置")
    db.delete(sync_record)
    db.commit()
    return {"detail": "已断开 Zotero 连接"}


@router.get("/{project_id}/papers")
def list_zotero_papers(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """列出从 Zotero 导入的文献"""
    project = get_owned_project(project_id, current_user, db)
    papers = (
        db.query(Paper)
        .filter(Paper.project_id == project.id, Paper.source == "zotero")
        .order_by(Paper.citation_count.desc().nullslast())
        .all()
    )
    return [
        {
            "id": str(p.id),
            "title": p.title,
            "authors": p.authors,
            "year": p.year,
            "venue": p.venue,
            "doi": p.doi,
            "citation_count": p.citation_count,
            "zotero_key": p.zotero_key,
            "zotero_synced_at": str(p.zotero_synced_at) if p.zotero_synced_at else None,
        }
        for p in papers
    ]
