# 阶段1-03：API 路由与 Schema

## 3.1 Schema

新建 `backend/app/schemas/zotero.py`：

```python
class ZoteroConnectRequest(BaseModel):
    """连接 Zotero 账户的请求"""
    project_id: str
    api_key: str
    library_type: str = "user"  # user | group
    library_id: str             # 用户 ID 或群组 ID

class ZoteroCollection(BaseModel):
    """Zotero 集合"""
    key: str
    name: str
    parent_key: str | None
    item_count: int

class ZoteroSyncRequest(BaseModel):
    """触发同步的请求"""
    project_id: str
    collection_keys: list[str]  # 要导入的集合 key 列表

class ZoteroSyncOut(BaseModel):
    """同步记录输出"""
    id: str
    project_id: str
    library_type: str
    library_id: str
    last_sync_version: int | None
    sync_status: str
    synced_collections: list[str]
    last_sync_at: str | None
    created_at: str

class ZoteroImportResult(BaseModel):
    """导入结果"""
    imported: int       # 新导入数量
    updated: int        # 更新数量
    skipped: int        # 跳过（已存在且无变更）
    total: int          # 总处理数
    errors: list[str]   # 错误列表
```

## 3.2 API 端点

新建 `backend/app/api/zotero.py`，路由前缀 `/api/zotero`：

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/connect` | 验证 Zotero API Key 并保存连接配置 |
| `GET` | `/{project_id}/collections` | 获取项目关联 Zotero 库的集合列表 |
| `POST` | `/sync` | 触发导入：按选中集合拉取条目并写入 papers 表 |
| `GET` | `/{project_id}/status` | 获取最近同步状态 |
| `DELETE` | `/{project_id}/disconnect` | 断开 Zotero 连接（不删除已导入的文献） |
| `GET` | `/{project_id}/papers` | 列出从 Zotero 导入的文献 |

## 3.3 端点实现要点

### POST /connect

```python
async def connect_zotero(req: ZoteroConnectRequest, db = Depends(get_db)):
    # 1. 用 pyzotero 验证 API Key
    # 2. 检查是否已有连接（有则更新）
    # 3. 保存 ZoteroSync 记录
    # 4. 返回验证信息（用户名、库类型）
```

### GET /{project_id}/collections

```python
async def list_collections(project_id: str, db = Depends(get_db)):
    # 1. 查 ZoteroSync 获取连接信息
    # 2. 创建 ZoteroClient
    # 3. 拉取集合树（递归展平）
    # 4. 返回 [{key, name, parent_key, item_count}]
```

### POST /sync

```python
async def sync_zotero(req: ZoteroSyncRequest, db = Depends(get_db)):
    # 1. 查 ZoteroSync
    # 2. 更新 sync_status = "syncing"
    # 3. 调用 zotero_service.import_from_zotero()
    # 4. 更新 sync_status = "idle", 记录 last_sync_at 和 last_sync_version
    # 5. 返回 ZoteroImportResult
```

## 3.4 注册路由

修改 `backend/app/main.py`：
```python
from .api.zotero import router as zotero_router
app.include_router(zotero_router, prefix="/api/zotero", tags=["zotero"])
```

## 3.5 注册模型

修改 `backend/app/models/__init__.py`：
```python
from .zotero_sync import ZoteroSync
```
