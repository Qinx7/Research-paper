# 阶段1-02：Zotero 服务层

## 2.1 文件

新建 `backend/app/services/zotero_service.py`

## 2.2 设计思路

在 `pyzotero` 基础上封装业务逻辑，提供同步友好的函数式 API。核心职责：

1. 连接验证 — 测试 API Key 是否有效
2. 集合浏览 — 获取用户/群组的所有集合
3. 条目导入 — 按集合拉取条目，映射为 Paper 对象
4. 增量同步 — 基于版本号只拉变更条目

## 2.3 核心函数

### ZoteroClient 类

```python
class ZoteroClient:
    """封装 pyzotero 的业务客户端"""

    def __init__(self, library_type: str, library_id: str, api_key: str):
        self._zot = zotero.Zotero(library_id, library_type, api_key)
        self.library_type = library_type
        self.library_id = library_id

    def verify_connection(self) -> dict:
        """验证 API Key 权限，返回用户信息"""
        # GET /keys/current

    def get_collections(self) -> list[dict]:
        """获取所有集合（递归展开子集合）"""

    def get_collection_items(self, collection_key: str, since_version: int | None = None) -> list[dict]:
        """获取集合内所有条目"""

    def get_all_items(self, since_version: int | None = None) -> list[dict]:
        """获取顶层所有条目"""
```

### 导入映射

```python
def map_zotero_item_to_paper(item: dict, project_id: str) -> dict:
    """将 Zotero 条目映射为 Paper 创建参数字典。

    Zotero itemType → Paper 字段映射：
    - title → title
    - creators → authors（分号拼接）
    - date → year（提取年份）
    - publicationTitle / conferenceName → venue
    - DOI → doi
    - abstractNote → abstract
    - url → url
    - extra → 尝试提取引用数
    - key → zotero_key
    """
```

### 同步编排

```python
def import_from_zotero(
    zotero_config: dict,
    collection_keys: list[str],
    project_id: str,
    db_session,
) -> dict:
    """主导入流程：
    1. 创建 ZoteroClient
    2. 按集合拉取条目
    3. 按 zotero_key 去重（已有则更新，无则新建）
    4. 批量写入 DB
    5. 更新 ZoteroSync 记录
    返回 {imported: N, updated: N, total: N}
    """
```

## 2.4 错误处理

- Zotero API 403 → API Key 无效或无权限
- Zotero API 429 → 等待 Retry-After 秒后重试（最多 3 次）
- 网络错误 → 抛出明确错误信息
- 条目映射失败 → 跳过该条目，继续处理

## 2.5 验证

```python
from backend.app.services.zotero_service import ZoteroClient, map_zotero_item_to_paper
# 可以实例化并调用方法
```
