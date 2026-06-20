"""PubScholar 公益学术平台检索服务。"""
import json
import logging
import re
import urllib.parse

from app.core.config import settings
from .literature_search import (
    PaperResult,
    _cache_get,
    _cache_key,
    _cache_set,
    _enter_source_request_window,
    _get_source_cooldown_remaining,
    _mark_source_rate_limited,
)
from .shared_browser import get_shared_browser

logger = logging.getLogger(__name__)

SOURCE_NAME = "pubscholar"
BASE_URL = "https://pubscholar.cn/hky/open/resources/api/v1/articles"
EXPLORE_URL = "https://pubscholar.cn/"


class PubScholarClient:
    """PubScholar 检索客户端。

    PubScholar articles 接口要求站内签名头，独立 HTTP 请求会返回 403。
    这里改为驱动真实页面搜索，并截获前端已签名的检索响应。
    """

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

        context = None
        try:
            browser = get_shared_browser(headless=True)
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                locale="zh-CN",
                timezone_id="Asia/Shanghai",
            )
            page = context.new_page()
            page.goto(EXPLORE_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(4000)
            input_count = page.locator("input").count()
            if input_count <= 0:
                self.last_status = "error"
                self.last_detail = "search_input_not_found"
                return []

            search_input = page.locator("input").nth(1 if input_count > 1 else 0)
            search_input.fill(query)
            with page.expect_response(
                lambda resp: resp.url == BASE_URL and resp.request.method == "POST",
                timeout=30000,
            ) as response_info:
                page.keyboard.press("Enter")
            response = response_info.value
            body_text = response.text()
            if response.status == 429:
                logger.warning("PubScholar 被限流 (429): query=%s", query)
                cooldown_seconds = _mark_source_rate_limited(SOURCE_NAME, response.headers)
                self.last_status = "rate_limited"
                self.last_detail = f"cooldown={cooldown_seconds:.1f}s query={query}"
                return []
            if response.status >= 400:
                detail = self._extract_error_detail(body_text)
                self.last_status = "blocked" if response.status == 403 else "http_error"
                self.last_detail = f"status={response.status} query={query} detail={detail}"
                return []

            data = json.loads(body_text)
            items = self._extract_items(data)
            results = [item for item in (self._parse_item(raw) for raw in items) if item]
            results = [item for item in results if item.year is None or year_from <= item.year <= year_to]
            self.last_status = "ok" if results else "no_results"
            self.last_detail = f"count={len(results)}"
            _cache_set(cache_key, results)
            return results
        except Exception as exc:
            logger.warning("PubScholar 搜索异常: query=%s error=%s", query, exc)
            self.last_status = "error"
            self.last_detail = str(exc)
        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass
        return []

    def _extract_items(self, data: object) -> list[dict]:
        if isinstance(data, dict):
            for key in ("data", "result", "items", "records", "list", "content"):
                value = data.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
                if isinstance(value, dict):
                    for nested_key in ("items", "records", "list", "content"):
                        nested = value.get(nested_key)
                        if isinstance(nested, list):
                            return [item for item in nested if isinstance(item, dict)]
        return []

    @staticmethod
    def _extract_error_detail(body_text: str) -> str:
        try:
            data = json.loads(body_text)
            if isinstance(data, dict):
                return str(data.get("cause") or data.get("message") or "")
        except Exception:
            pass
        return body_text[:160]

    def _parse_item(self, item: dict) -> PaperResult | None:
        title = self._pick_first(item, ["title", "name", "article_title"])
        if not title:
            return None

        authors_text = self._pick_first(item, ["authors", "author", "author_names", "creator"])
        authors = self._split_authors(authors_text)

        year = self._extract_year(
            self._pick_first(item, ["year", "publish_year", "pub_year", "date", "publish_time", "published_at"])
        )
        venue = self._pick_first(item, ["journal", "journal_name", "source", "source_title", "container_title"])
        doi = self._pick_first(item, ["doi", "DOI"])
        abstract = self._pick_first(item, ["abstract", "summary", "description"])
        url = self._pick_first(item, ["url", "href", "link", "detail_url"])
        citation_count = self._extract_int(self._pick_first(item, ["citation_count", "cited_by_count", "quote_num", "citations"]))

        return PaperResult(
            title=self._strip_html(title),
            authors=authors[:10],
            year=year,
            venue=venue,
            doi=doi,
            abstract=self._strip_html(abstract),
            url=url,
            citation_count=citation_count,
            source=SOURCE_NAME,
            is_open_access=None,
        )

    @staticmethod
    def _pick_first(item: dict, keys: list[str]) -> str | None:
        for key in keys:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _split_authors(text: str | None) -> list[str]:
        if not text:
            return []
        parts = re.split(r"[;,，；、]", text)
        return [part.strip() for part in parts if part and part.strip()]

    @staticmethod
    def _extract_year(value: str | None) -> int | None:
        if not value:
            return None
        match = re.search(r"(19|20)\d{2}", value)
        if match:
            return int(match.group(0))
        return None

    @staticmethod
    def _extract_int(value: str | None) -> int:
        if not value:
            return 0
        match = re.search(r"\d+", value.replace(",", ""))
        return int(match.group(0)) if match else 0

    @staticmethod
    def _strip_html(value: str | None) -> str | None:
        if not value:
            return value
        return re.sub(r"<[^>]+>", "", value).strip()
