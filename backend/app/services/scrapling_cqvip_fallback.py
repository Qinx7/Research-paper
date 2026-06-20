"""维普搜索的可选 Scrapling 页面兜底抓取。"""
import logging
import os
import re
import urllib.parse

from .literature_search import PaperResult

logger = logging.getLogger(__name__)

CQVIP_SEARCH_URL = "https://www.cqvip.com/search"
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
)
BLOCK_HINTS = ("captcha", "verify", "安全验证", "验证码", "访问异常", "操作频繁")
BROWSER_CANDIDATES = (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
)

try:
    from scrapling.fetchers import StealthyFetcher

    SCRAPLING_AVAILABLE = True
except Exception:
    StealthyFetcher = None
    SCRAPLING_AVAILABLE = False


class ScraplingCQVIPFallback:
    """主 Playwright 路径失败时，使用 Scrapling 轻量重抓维普结果页。"""

    def __init__(self, *, timeout: int = 40):
        self.timeout = timeout
        self.last_status = "idle"
        self.last_detail = ""

    def search(
        self,
        query: str,
        *,
        year_from: int = 2020,
        year_to: int = 2026,
        limit: int = 20,
    ) -> list[PaperResult]:
        if not SCRAPLING_AVAILABLE or StealthyFetcher is None:
            self.last_status = "unavailable"
            self.last_detail = "scrapling_not_installed"
            logger.info("Scrapling CQVIP fallback skipped because dependency is not installed")
            return []

        try:
            url = f"{CQVIP_SEARCH_URL}?k={urllib.parse.quote(query)}"
            fetch_kwargs = {
                "browser": "chromium",
                "headless": True,
                "disable_resources": False,
                "wait": 4000,
                "extra_headers": {"User-Agent": MOBILE_UA},
            }
            executable_path = self._detect_local_browser_executable()
            if executable_path:
                fetch_kwargs["executable_path"] = executable_path
                fetch_kwargs["real_chrome"] = True

            page = StealthyFetcher.fetch(url, **fetch_kwargs)
            body_text = self._page_text(page).lower()
            if any(hint in body_text for hint in BLOCK_HINTS):
                self.last_status = "blocked"
                self.last_detail = "captcha_or_block_detected"
                return []

            results = self._extract_results(page, year_from=year_from, year_to=year_to, limit=limit)
            self.last_status = "ok" if results else "no_results"
            self.last_detail = f"count={len(results)} query={query}"
            return results
        except Exception as exc:
            # 捕获 Playwright asyncio 冲突错误
            exc_str = str(exc).lower()
            if "asyncio" in exc_str or "async api" in exc_str or "sync api" in exc_str:
                self.last_status = "unavailable"
                self.last_detail = "asyncio_conflict"
                logger.info("Scrapling CQVIP fallback unavailable in asyncio context")
                return []
            self.last_status = "error"
            self.last_detail = str(exc)
            logger.warning("Scrapling CQVIP fallback failed: query=%s error=%s", query, exc)
            return []

    def _page_text(self, page) -> str:
        text = getattr(page, "text", None)
        if isinstance(text, str):
            return text
        body = getattr(page, "body", b"")
        if isinstance(body, bytes):
            return body.decode("utf-8", errors="ignore")
        html_content = getattr(page, "html_content", None)
        if isinstance(html_content, str):
            return html_content
        return str(body or "")

    def _extract_results(
        self,
        page,
        *,
        year_from: int,
        year_to: int,
        limit: int,
    ) -> list[PaperResult]:
        try:
            items = page.css(".item")
        except Exception:
            items = []

        results: list[PaperResult] = []
        seen: set[str] = set()
        for item in items or []:
            paper = self._parse_item(item)
            if not paper or not paper.title:
                continue
            if paper.year is not None and not (year_from <= paper.year <= year_to):
                continue
            key = (paper.url or paper.title).strip().lower()
            if key in seen:
                continue
            seen.add(key)
            results.append(paper)
            if len(results) >= limit:
                break
        return results

    def _parse_item(self, item) -> PaperResult | None:
        title = self._get_text(item, "a.title::text")
        if not title:
            return None

        href = self._get_attr(item, "a.title::attr(href)")
        if href.startswith("//"):
            url = "https:" + href
        elif href.startswith("/"):
            url = "https://www.cqvip.com" + href
        else:
            url = href or None

        authors = self._get_all_text(item, ".author-name::text")[:10]
        venue = self._get_text(item, ".hoverSource::text") or None
        if venue:
            venue = venue.strip("《》")

        item_text = self._normalize_space(self._page_text(item))
        abstract = self._get_text(item, ".abstr::text") or None

        year = None
        match_year = re.search(r"(20\d{2})", item_text)
        if match_year:
            year = int(match_year.group(1))

        citation_count = 0
        citation_text = self._get_text(item, ".quantitativeData font::text")
        match_citation = re.search(r"\d+", citation_text)
        if match_citation:
            citation_count = int(match_citation.group(0))

        return PaperResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            abstract=abstract,
            url=url,
            citation_count=citation_count,
            source="cqvip",
        )

    def _get_text(self, item, selector: str) -> str:
        try:
            value = item.css(selector).get()
        except Exception:
            return ""
        return self._clean_text(value)

    def _get_all_text(self, item, selector: str) -> list[str]:
        try:
            values = item.css(selector).getall()
        except Exception:
            return []
        return [self._clean_text(value) for value in values if self._clean_text(value)]

    def _get_attr(self, item, selector: str) -> str:
        try:
            value = item.css(selector).get()
        except Exception:
            return ""
        return self._clean_text(value)

    @staticmethod
    def _clean_text(value) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @staticmethod
    def _normalize_space(text: str) -> str:
        return re.sub(r"\s+", " ", text or "").strip()

    @staticmethod
    def _detect_local_browser_executable() -> str | None:
        for candidate in BROWSER_CANDIDATES:
            if os.path.exists(candidate):
                return candidate
        return None
