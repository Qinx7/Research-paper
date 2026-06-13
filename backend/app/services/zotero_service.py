"""Zotero API 服务封装

基于 pyzotero 提供业务级 API：
- 连接验证
- 集合浏览
- 条目导入（支持增量同步）
- 条目 → Paper 映射
"""
import logging
from datetime import datetime
from typing import Any

from pyzotero import zotero as zotero_lib
from sqlalchemy.orm import Session

from ..models.paper import Paper
from ..models.zotero_sync import ZoteroSync

logger = logging.getLogger(__name__)

# Zotero 条目类型 → 简短类型名
ITEM_TYPE_MAP: dict[str, str] = {
    "journalArticle": "期刊论文",
    "conferencePaper": "会议论文",
    "book": "图书",
    "bookSection": "图书章节",
    "thesis": "学位论文",
    "dissertation": "学位论文",
    "report": "报告",
    "preprint": "预印本",
    "webpage": "网页",
    "patent": "专利",
    "computerProgram": "软件",
    "presentation": "演示文稿",
    "dataset": "数据集",
}


class ZoteroClient:
    """封装 pyzotero 的业务客户端"""

    def __init__(self, library_type: str, library_id: str, api_key: str):
        self._zot = zotero_lib.Zotero(library_id, library_type, api_key)
        self.library_type = library_type
        self.library_id = library_id

    def verify_connection(self) -> dict:
        """验证 API Key 权限，返回账户信息"""
        key_info = self._zot.key_info()
        return {
            "user_id": str(key_info.get("userID", "")),
            "username": key_info.get("username", ""),
            "display_name": key_info.get("displayName", ""),
            "access": key_info.get("access", {}),
        }

    def get_collections(self) -> list[dict]:
        """获取所有集合（递归展开为扁平列表，含层级信息）"""
        try:
            raw = self._zot.collections(limit=200)
            collections: list[dict] = []
            for col in raw:
                data = col.get("data", {})
                collections.append({
                    "key": data.get("key", ""),
                    "name": data.get("name", ""),
                    "parent_key": data.get("parentCollection") or None,
                    "version": col.get("version", 0),
                })
            # 补充每个集合的条目数量（逐一查询）
            for c in collections:
                try:
                    c["item_count"] = self._zot.num_collectionitems(c["key"])
                except Exception:
                    c["item_count"] = 0
            return collections
        except Exception:
            logger.warning("获取 Zotero 集合列表失败", exc_info=True)
            raise

    def get_collection_items(
        self, collection_key: str, since_version: int | None = None
    ) -> list[dict]:
        """获取集合内所有条目（自动分页）"""
        kwargs: dict[str, Any] = {"limit": 100, "sort": "dateModified", "direction": "desc"}
        if since_version is not None:
            kwargs["since"] = since_version

        items: list[dict] = []
        start = 0
        while True:
            try:
                batch = self._zot.collection_items(collection_key, start=start, **kwargs)
                if not batch:
                    break
                items.extend(batch)
                start += len(batch)
                if len(batch) < 100:
                    break
            except Exception:
                logger.warning(f"获取集合 {collection_key} 条目时出错 (start={start})", exc_info=True)
                break
        return items

    def get_all_items(self, since_version: int | None = None) -> list[dict]:
        """获取顶层所有条目"""
        kwargs: dict[str, Any] = {"limit": 100, "sort": "dateModified", "direction": "desc"}
        if since_version is not None:
            kwargs["since"] = since_version

        items: list[dict] = []
        start = 0
        while True:
            try:
                batch = self._zot.top(start=start, **kwargs)
                if not batch:
                    break
                items.extend(batch)
                start += len(batch)
                if len(batch) < 100:
                    break
            except Exception:
                logger.warning(f"获取顶层条目时出错 (start={start})", exc_info=True)
                break
        return items

    def get_last_version(self) -> int:
        """获取当前库的最新版本号"""
        return self._zot.last_modified_version() or 0


def _extract_year(date_str: str) -> int | None:
    """从 Zotero date 字段提取年份"""
    if not date_str:
        return None
    # 支持 "2024", "2024-05", "2024-05-15", "May 2024" 等格式
    import re

    m = re.search(r"(\d{4})", str(date_str))
    return int(m.group(1)) if m else None


def _format_authors(creators: list[dict]) -> str:
    """将 Zotero creators 格式化为分号分隔的作者字符串"""
    names = []
    for c in creators or []:
        if "name" in c:
            names.append(c["name"])
        elif "lastName" in c:
            parts = [c["lastName"]]
            if c.get("firstName"):
                parts.append(c["firstName"])
            names.append(" ".join(parts))
    return "; ".join(names)


def map_zotero_item_to_paper(
    item: dict, project_id: str, synced_at: datetime | None = None
) -> dict:
    """将 Zotero 条目映射为 Paper 创建参数字典。

    Args:
        item: Zotero 条目原始 JSON
        project_id: 所属项目 ID
        synced_at: 同步时间戳
    """
    data: dict = item.get("data", {})
    item_type = data.get("itemType", "")
    zotero_key = data.get("key", "")

    # 提取年份
    year = _extract_year(data.get("date", ""))

    # 提取期刊/来源
    venue = (
        data.get("publicationTitle")
        or data.get("conferenceName")
        or data.get("bookTitle")
        or data.get("university")
        or ""
    )

    # 提取 DOI
    doi = data.get("DOI", "") or ""
    # Zotero 的 extra 字段有时包含 DOI
    if not doi:
        extra = data.get("extra", "")
        if extra:
            import re
            doi_match = re.search(r"DOI:\s*(10\.\S+)", extra, re.IGNORECASE)
            if doi_match:
                doi = doi_match.group(1)

    # 提取 URL
    url = data.get("url", "") or ""

    # 尝试从 extra 提取引用数
    citation_count = 0
    extra = data.get("extra", "")
    if extra:
        import re
        cite_match = re.search(r"(?:citation|cited)[\s:]*(\d+)", extra, re.IGNORECASE)
        if cite_match:
            citation_count = int(cite_match.group(1))

    return {
        "title": data.get("title", "未命名")[:500],
        "authors": _format_authors(data.get("creators", [])),
        "year": year,
        "venue": venue[:255] if venue else None,
        "doi": doi[:255] if doi else None,
        "abstract": (data.get("abstractNote") or "")[:5000],
        "url": url[:500] if url else None,
        "citation_count": citation_count,
        "source": "zotero",
        "zotero_key": zotero_key,
        "zotero_synced_at": synced_at or datetime.utcnow(),
        "project_id": project_id,
    }


def import_from_zotero(
    zot: ZoteroClient,
    collection_keys: list[str],
    project_id: str,
    db: Session,
) -> dict:
    """从 Zotero 导入文献到项目。

    Args:
        zot: ZoteroClient 实例
        collection_keys: 要导入的集合 key 列表
        project_id: 目标项目 ID
        db: 数据库会话

    Returns:
        {imported, updated, skipped, total, errors}
    """
    # 收集所有要导入的条目
    all_items: list[dict] = []
    for ckey in collection_keys:
        try:
            items = zot.get_collection_items(ckey)
            all_items.extend(items)
        except Exception as e:
            logger.warning(f"获取集合 {ckey} 失败: {e}")

    # 按 zotero_key 去重
    seen: dict[str, dict] = {}
    for item in all_items:
        key = item.get("data", {}).get("key", "")
        if key and key not in seen:
            seen[key] = item

    result = {"imported": 0, "updated": 0, "skipped": 0, "total": len(seen), "errors": []}
    synced_at = datetime.utcnow()

    # 预查已存在的 zotero 论文
    existing_keys = set(seen.keys())
    existing_papers = (
        db.query(Paper)
        .filter(Paper.zotero_key.in_(existing_keys))
        .all()
    )
    existing_map: dict[str, Paper] = {p.zotero_key: p for p in existing_papers}

    # 批量导入/更新
    for zkey, item in seen.items():
        try:
            mapped = map_zotero_item_to_paper(item, project_id, synced_at)
            existing = existing_map.get(zkey)

            if existing:
                # 更新已存在的条目
                for field, value in mapped.items():
                    if field not in ("zotero_key", "project_id", "zotero_synced_at"):
                        setattr(existing, field, value)
                existing.zotero_synced_at = synced_at
                result["updated"] += 1
            else:
                paper = Paper(**mapped)
                db.add(paper)
                result["imported"] += 1
        except Exception as e:
            result["errors"].append(f"{zkey}: {e}")

    db.commit()
    return result


def import_items(
    zot: ZoteroClient,
    items: list[dict],
    project_id: str,
    db: Session,
) -> dict:
    """将预获取的 Zotero 条目列表导入到项目文献库。

    与 import_from_zotero 的区别：直接接收已获取的条目列表，
    不再调用 API 拉取。适用于导入全部顶层条目等场景。
    """
    # 按 zotero_key 去重
    seen: dict[str, dict] = {}
    for item in items:
        key = item.get("data", {}).get("key", "")
        if key and key not in seen:
            seen[key] = item

    result = {"imported": 0, "updated": 0, "skipped": 0, "total": len(seen), "errors": []}
    synced_at = datetime.utcnow()

    existing_keys = set(seen.keys())
    existing_papers = (
        db.query(Paper)
        .filter(Paper.zotero_key.in_(existing_keys))
        .all()
    )
    existing_map: dict[str, Paper] = {p.zotero_key: p for p in existing_papers}

    for zkey, item in seen.items():
        try:
            mapped = map_zotero_item_to_paper(item, project_id, synced_at)
            existing = existing_map.get(zkey)

            if existing:
                for field, value in mapped.items():
                    if field not in ("zotero_key", "project_id", "zotero_synced_at"):
                        setattr(existing, field, value)
                existing.zotero_synced_at = synced_at
                result["updated"] += 1
            else:
                paper = Paper(**mapped)
                db.add(paper)
                result["imported"] += 1
        except Exception as e:
            result["errors"].append(f"{zkey}: {e}")

    db.commit()
    return result
