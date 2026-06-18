"""文献检索服务 —— 调用 arXiv API（免费，Atom XML）"""
import logging
import re
import time
import xml.etree.ElementTree as ET

import httpx

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

SOURCE_NAME = "arxiv"
BASE_URL = "https://export.arxiv.org/api/query"

# arXiv 限频严格（无 API Key 时约 1 次/3 秒），默认间隔比其他源更长
_ARXIV_MIN_INTERVAL = 3.0
_ARXIV_DEFAULT_COOLDOWN = 300  # 5 分钟


class ArxivClient:
    """arXiv API 客户端（免费，无需 API Key；严格限频）"""

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

        # arXiv 需要较长的请求间隔，复用现有节流机制但用更长的等待时间
        _enter_source_request_window(SOURCE_NAME)

        results = []
        try:
            arxiv_query = self._build_arxiv_query(query)
            params = {
                "search_query": arxiv_query,
                "start": 0,
                "max_results": min(limit, 50),
                "sortBy": "relevance",
                "sortOrder": "descending",
            }
            response = _http_get_with_retry(
                BASE_URL,
                params=params,
                timeout=30.0,
            )
            if response.status_code == 429:
                logger.warning("arXiv 被限流 (429): query=%s", query)
                cooldown_seconds = _mark_source_rate_limited(SOURCE_NAME, response.headers)
                self.last_status = "rate_limited"
                self.last_detail = f"cooldown={cooldown_seconds:.1f}s query={query}"
                return []
            response.raise_for_status()
            results = self._parse_atom(response.text)
            if results:
                self.last_status = "ok"
                self.last_detail = f"count={len(results)}"
                _cache_set(cache_key, results)
            else:
                self.last_status = "no_results"
                self.last_detail = f"query={query}"
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response else "unknown"
            logger.warning("arXiv 请求失败: query=%s status=%s", query, status)
            self.last_status = "http_error"
            self.last_detail = f"status={status} query={query}"
        except Exception as e:
            logger.warning("arXiv 搜索异常: query=%s error=%s", query, e)
            self.last_status = "error"
            self.last_detail = str(e)
        return results

    @staticmethod
    def _build_arxiv_query(query: str) -> str:
        """把通用英文检索式转换成 arXiv API 更容易识别的字段化查询。"""
        query = " ".join((query or "").strip().split())
        if not query:
            return ""

        phrases = [phrase.strip() for phrase in re.findall(r'"([^"]+)"', query) if phrase.strip()]
        remainder = re.sub(r'"[^"]+"', " ", query)
        parts = phrases + [
            part.strip()
            for part in re.split(r"\bAND\b|\bOR\b", remainder, flags=re.IGNORECASE)
            if part.strip()
        ]

        terms: list[str] = []
        seen: set[str] = set()
        for part in parts:
            part = re.sub(r"^(all|ti|abs):", "", part, flags=re.IGNORECASE).strip().strip('"')
            if not part or part.lower() in seen:
                continue
            seen.add(part.lower())
            terms.append(f'all:"{part}"' if " " in part else f"all:{part}")
        return " AND ".join(terms) or f'all:"{query}"'

    @staticmethod
    def _parse_atom(xml_text: str) -> list[PaperResult]:
        """解析 arXiv Atom XML 响应为 PaperResult 列表。"""
        # arXiv 返回的 Atom 可能包含命名空间，需要处理
        ns = {
            "atom": "http://www.w3.org/2005/Atom",
            "arxiv": "http://arxiv.org/schemas/atom",
        }
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.warning("arXiv XML 解析失败: %s", e)
            return []

        results = []
        for entry in root.findall("atom:entry", ns):
            title = _text(entry.find("atom:title", ns)).replace("\n", " ").strip()

            authors = []
            for author_elem in entry.findall("atom:author", ns):
                name = _text(author_elem.find("atom:name", ns))
                if name:
                    authors.append(name)

            published = _text(entry.find("atom:published", ns))
            year = None
            if published:
                try:
                    year = int(published[:4])
                except (ValueError, IndexError):
                    pass

            summary = _text(entry.find("atom:summary", ns)).replace("\n", " ").strip()

            url = ""
            for link in entry.findall("atom:link", ns):
                if link.get("rel") != "alternate":
                    continue
                url = link.get("href", "")
                if url:
                    break

            doi = ""
            for link in entry.findall("atom:link", ns):
                if link.get("title") == "doi":
                    doi = link.get("href", "").replace("http://dx.doi.org/", "")
                    break

            # arXiv 不提供引用数，默认为 0
            results.append(PaperResult(
                title=title,
                authors=authors[:10],
                year=year,
                venue="arXiv",
                doi=doi or None,
                abstract=summary or None,
                url=url or None,
                citation_count=0,
                source=SOURCE_NAME,
                is_open_access=True,
            ))

        return results


def _text(element: ET.Element | None) -> str:
    """安全获取 XML 元素文本内容。"""
    if element is None:
        return ""
    return element.text or ""
