"""文献检索服务 —— 调用 Crossref REST API（免费，礼貌池）"""
import logging
import time

import httpx

from app.core.config import settings
from .literature_search import (
    PaperResult,
    _cache_get,
    _cache_key,
    _cache_set,
    _enter_source_request_window,
    _get_source_cooldown_remaining,
    _mark_source_rate_limited,
    _http_get_with_retry,
)

logger = logging.getLogger(__name__)

SOURCE_NAME = "crossref"
BASE_URL = "https://api.crossref.org/works"


class CrossrefClient:
    """Crossref API 客户端（免费，无需 API Key；提供 mailto 可加入礼貌池提升限频）"""

    def __init__(self):
        self.last_status = "idle"
        self.last_detail = ""

    def search(self, query: str, year_from: int = 2020, year_to: int = 2026, limit: int = 20) -> list[PaperResult]:
        if not query or not query.strip():
            self.last_status = "no_results"
            self.last_detail = "empty_query"
            return []

        cache_key = _cache_key(SOURCE_NAME, query, year_from, year_to, limit)
        cached = _cache_get(cache_key)
        if cached is not None:
            return list(cached)

        cooldown_remaining = _get_source_cooldown_remaining(SOURCE_NAME)
        if cooldown_remaining > 0:
            self.last_status = "rate_limited"
            self.last_detail = f"cooldown={cooldown_remaining:.1f}s query={query}"
            return []
        _enter_source_request_window(SOURCE_NAME)

        results = []
        try:
            params = {
                "query": query,
                "filter": f"from-pub-date:{year_from}-01-01,until-pub-date:{year_to}-12-31",
                "rows": limit,
                "sort": "is-referenced-by-count",
                "select": "title,author,created,container-title,DOI,abstract,URL,is-referenced-by-count",
            }
            headers = {"User-Agent": "LiteratureDrivenResearchAgent/0.1 (mailto:research-agent@example.com)"}
            if settings.CROSSREF_MAILTO:
                params["mailto"] = settings.CROSSREF_MAILTO

            response = _http_get_with_retry(
                BASE_URL,
                params=params,
                headers=headers,
                timeout=30.0,
            )
            if response.status_code == 429:
                logger.warning("Crossref 被限流 (429): query=%s", query)
                cooldown_seconds = _mark_source_rate_limited(SOURCE_NAME, response.headers)
                self.last_status = "rate_limited"
                self.last_detail = f"cooldown={cooldown_seconds:.1f}s query={query}"
                return []
            response.raise_for_status()
            data = response.json()
            items = data.get("message", {}).get("items", [])
            for item in items:
                results.append(self._parse_item(item))
            self.last_status = "ok" if results else "no_results"
            self.last_detail = f"count={len(results)}"
            _cache_set(cache_key, results)
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response else "unknown"
            logger.warning("Crossref 请求失败: query=%s status=%s", query, status)
            self.last_status = "http_error"
            self.last_detail = f"status={status} query={query}"
        except Exception as e:
            logger.warning("Crossref 搜索异常: query=%s error=%s", query, e)
            self.last_status = "error"
            self.last_detail = str(e)
        return results

    @staticmethod
    def _parse_item(item: dict) -> PaperResult:
        title = ""
        title_list = item.get("title") or []
        if title_list:
            title = title_list[0]

        authors = []
        for a in item.get("author") or []:
            given = a.get("given", "")
            family = a.get("family", "")
            name = f"{given} {family}".strip()
            if name:
                authors.append(name)

        created = item.get("created", {})
        date_parts = created.get("date-parts", [[None]]) if isinstance(created, dict) else [[None]]
        year = date_parts[0][0] if date_parts and date_parts[0] else None

        container = item.get("container-title") or []
        venue = container[0] if container else None

        doi = item.get("DOI")

        abstract = None
        abstract_text = item.get("abstract")
        if abstract_text:
            # Crossref abstract 可能包含 HTML 标签
            import re
            abstract = re.sub(r"<[^>]+>", "", abstract_text)
            # 将 jats:p 等命名空间标签也清理掉
            abstract = re.sub(r"</?\w+:\w+[^>]*>", "", abstract)

        url = item.get("URL")
        citation_count = item.get("is-referenced-by-count", 0)

        return PaperResult(
            title=title,
            authors=authors[:10],
            year=year,
            venue=venue,
            doi=doi,
            abstract=abstract,
            url=url,
            citation_count=citation_count,
            source=SOURCE_NAME,
            is_open_access=None,
        )
