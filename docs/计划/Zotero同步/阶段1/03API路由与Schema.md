# 闃舵1-03锛欰PI 璺敱涓?Schema

## 3.1 Schema

鏂板缓 `backend/app/schemas/zotero.py`锛?
```python
class ZoteroConnectRequest(BaseModel):
    """杩炴帴 Zotero 璐︽埛鐨勮姹?""
    project_id: str
    api_key: str
    library_type: str = "user"  # user | group
    library_id: str             # 鐢ㄦ埛 ID 鎴栫兢缁?ID

class ZoteroCollection(BaseModel):
    """Zotero 闆嗗悎"""
    key: str
    name: str
    parent_key: str | None
    item_count: int

class ZoteroSyncRequest(BaseModel):
    """瑙﹀彂鍚屾鐨勮姹?""
    project_id: str
    collection_keys: list[str]  # 瑕佸鍏ョ殑闆嗗悎 key 鍒楄〃

class ZoteroSyncOut(BaseModel):
    """鍚屾璁板綍杈撳嚭"""
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
    """瀵煎叆缁撴灉"""
    imported: int       # 鏂板鍏ユ暟閲?    updated: int        # 鏇存柊鏁伴噺
    skipped: int        # 璺宠繃锛堝凡瀛樺湪涓旀棤鍙樻洿锛?    total: int          # 鎬诲鐞嗘暟
    errors: list[str]   # 閿欒鍒楄〃
```

## 3.2 API 绔偣

鏂板缓 `backend/app/api/zotero.py`锛岃矾鐢卞墠缂€ `/api/zotero`锛?
| 鏂规硶 | 璺緞 | 璇存槑 |
|------|------|------|
| `POST` | `/connect` | 楠岃瘉 Zotero API Key 骞朵繚瀛樿繛鎺ラ厤缃?|
| `GET` | `/{project_id}/collections` | 鑾峰彇椤圭洰鍏宠仈 Zotero 搴撶殑闆嗗悎鍒楄〃 |
| `POST` | `/sync` | 瑙﹀彂瀵煎叆锛氭寜閫変腑闆嗗悎鎷夊彇鏉＄洰骞跺啓鍏?papers 琛?|
| `GET` | `/{project_id}/status` | 鑾峰彇鏈€杩戝悓姝ョ姸鎬?|
| `DELETE` | `/{project_id}/disconnect` | 鏂紑 Zotero 杩炴帴锛堜笉鍒犻櫎宸插鍏ョ殑鏂囩尞锛?|
| `GET` | `/{project_id}/papers` | 鍒楀嚭浠?Zotero 瀵煎叆鐨勬枃鐚?|

## 3.3 绔偣瀹炵幇瑕佺偣

### POST /connect

```python
async def connect_zotero(req: ZoteroConnectRequest, db = Depends(get_db)):
    # 1. 鐢?pyzotero 楠岃瘉 API Key
    # 2. 妫€鏌ユ槸鍚﹀凡鏈夎繛鎺ワ紙鏈夊垯鏇存柊锛?    # 3. 淇濆瓨 ZoteroSync 璁板綍
    # 4. 杩斿洖楠岃瘉淇℃伅锛堢敤鎴峰悕銆佸簱绫诲瀷锛?```

### GET /{project_id}/collections

```python
async def list_collections(project_id: str, db = Depends(get_db)):
    # 1. 鏌?ZoteroSync 鑾峰彇杩炴帴淇℃伅
    # 2. 鍒涘缓 ZoteroClient
    # 3. 鎷夊彇闆嗗悎鏍戯紙閫掑綊灞曞钩锛?    # 4. 杩斿洖 [{key, name, parent_key, item_count}]
```

### POST /sync

```python
async def sync_zotero(req: ZoteroSyncRequest, db = Depends(get_db)):
    # 1. 鏌?ZoteroSync
    # 2. 鏇存柊 sync_status = "syncing"
    # 3. 璋冪敤 zotero_service.import_from_zotero()
    # 4. 鏇存柊 sync_status = "idle", 璁板綍 last_sync_at 鍜?last_sync_version
    # 5. 杩斿洖 ZoteroImportResult
```

## 3.4 娉ㄥ唽璺敱

淇敼 `backend/app/main.py`锛?```python
from .api.zotero import router as zotero_router
app.include_router(zotero_router, prefix="/api/zotero", tags=["zotero"])
```

## 3.5 娉ㄥ唽妯″瀷

淇敼 `backend/app/models/__init__.py`锛?```python
from .zotero_sync import ZoteroSync
```

