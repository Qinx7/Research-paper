"""Zotero 同步相关 Pydantic Schema"""
from pydantic import BaseModel, Field


class ZoteroConnectRequest(BaseModel):
    """连接 Zotero 账户"""
    project_id: str = Field(..., description="项目 ID")
    api_key: str = Field(..., description="Zotero API Key")
    library_type: str = Field(default="user", description="user 或 group")
    library_id: str = Field(..., description="Zotero 用户 ID 或群组 ID")


class ZoteroCollectionOut(BaseModel):
    """Zotero 集合信息"""
    key: str
    name: str
    parent_key: str | None = None
    item_count: int = 0
    version: int = 0


class ZoteroSyncRequest(BaseModel):
    """触发同步导入"""
    project_id: str = Field(..., description="项目 ID")
    collection_keys: list[str] = Field(default_factory=list, description="要导入的集合 key 列表，空列表表示导入全部顶层条目")


class ZoteroSyncOut(BaseModel):
    """同步记录输出"""
    id: str
    project_id: str
    library_type: str
    library_id: str
    last_sync_version: int | None = None
    sync_status: str
    synced_collections: list = Field(default_factory=list)
    last_sync_at: str | None = None
    created_at: str | None = None

    class Config:
        from_attributes = True


class ZoteroImportResult(BaseModel):
    """导入结果"""
    imported: int = 0
    updated: int = 0
    skipped: int = 0
    total: int = 0
    errors: list[str] = Field(default_factory=list)


class ZoteroConnectInfo(BaseModel):
    """连接验证返回信息"""
    connected: bool
    user_id: str = ""
    username: str = ""
    display_name: str = ""
    library_type: str = ""
    library_id: str = ""
