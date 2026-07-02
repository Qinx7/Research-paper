"""本地授权目录核验服务。"""
from __future__ import annotations

import csv
import json
import os
from functools import lru_cache

from ..core.config import settings


SUPPORTED_AUTHORITY_TAGS = {"ei", "jcr", "cas", "pku_core", "ieee", "acm"}


def authority_catalog_enabled() -> bool:
    """当前是否配置了本地授权目录。"""
    return bool((settings.AUTHORITY_CATALOG_PATH or "").strip())


def match_authority_catalog(*, title: str, doi: str | None = None, venue: str | None = None) -> dict[str, dict]:
    """从本地授权目录中匹配文献。

    V1 规则：
    1. 优先通过 DOI 精确命中
    2. 其次允许期刊/会议名级命中
    3. 标题命中只作为辅助，不要求维护论文级全量目录
    """
    rows = _load_catalog_rows()
    if not rows:
        return {}

    normalized_title = _normalize(title)
    normalized_doi = _normalize(doi or "")
    normalized_venue = _normalize(venue or "")
    matched: dict[str, dict] = {}

    for row in rows:
        row_title = row.get("_normalized_title", "")
        row_doi = row.get("_normalized_doi", "")
        row_venue = row.get("_normalized_venue", "")

        title_match = bool(
            normalized_title
            and row_title
            and (normalized_title == row_title or normalized_title in row_title or row_title in normalized_title)
        )
        doi_match = bool(normalized_doi and row_doi and normalized_doi == row_doi)
        venue_match = bool(normalized_venue and row_venue and normalized_venue == row_venue)

        if not (title_match or doi_match or venue_match):
            continue

        for tag in _extract_tags(row):
            record = matched.setdefault(
                tag,
                {
                    "source": "catalog",
                    "reason": "本地授权目录核验命中",
                },
            )
            if doi_match:
                record["reason"] = "本地授权目录通过 DOI 精确命中"
            elif venue_match and title_match:
                record["reason"] = "本地授权目录通过标题+期刊命中"
            elif venue_match:
                record["reason"] = "本地授权目录通过期刊/会议命中"
            elif title_match:
                record["reason"] = "本地授权目录通过标题命中"

    return matched


@lru_cache(maxsize=1)
def _load_catalog_rows() -> tuple[dict, ...]:
    """读取并缓存本地目录。"""
    path = (settings.AUTHORITY_CATALOG_PATH or "").strip()
    if not path or not os.path.exists(path):
        return ()

    ext = os.path.splitext(path)[1].lower()
    if ext == ".json":
        with open(path, "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        rows = raw if isinstance(raw, list) else raw.get("rows", [])
    elif ext == ".csv":
        with open(path, "r", encoding="utf-8-sig", newline="") as fh:
            rows = list(csv.DictReader(fh))
    else:
        return ()

    normalized_rows = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        normalized_rows.append(
            {
                **row,
                "_normalized_title": _normalize(row.get("title", "")),
                "_normalized_doi": _normalize(row.get("doi", "")),
                "_normalized_venue": _normalize(row.get("venue", "")),
            }
        )
    return tuple(normalized_rows)


def _extract_tags(row: dict) -> list[str]:
    raw = row.get("tags")
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, str):
        items = [item.strip() for item in raw.replace(";", ",").split(",")]
    else:
        items = []

    result = []
    for item in items:
        key = str(item).strip().lower()
        if key in SUPPORTED_AUTHORITY_TAGS and key not in result:
            result.append(key)
    return result


def _normalize(value: str) -> str:
    return "".join(str(value or "").strip().lower().split())
