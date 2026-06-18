"""文献检索服务 —— 调用 OpenAlex 和 Semantic Scholar API"""
from dataclasses import dataclass, field
import logging
import re
import time
import urllib.parse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# 简单内存缓存，避免短时间内重复查询触发 API 限流
_cache: dict[str, tuple[float, list]] = {}
_CACHE_TTL = 300  # 5 分钟
_source_last_request_at: dict[str, float] = {}
_source_cooldown_until: dict[str, float] = {}
_SOURCE_MIN_INTERVAL_SECONDS = {
    "openalex": 1.0,
    "semantic_scholar": 1.0,
    "crossref": 0.5,
    "arxiv": 3.0,
}
_SOURCE_DEFAULT_COOLDOWN_SECONDS = {
    "openalex": 60.0,
    "semantic_scholar": 120.0,
    "crossref": 60.0,
    "arxiv": 300.0,
}


def _cache_key(source: str, query: str, year_from: int, year_to: int, limit: int) -> str:
    """按文献源隔离缓存，避免不同 API 的同名查询互相污染。"""
    return f"{source}|{query}|{year_from}|{year_to}|{limit}"


def _cache_get(key: str) -> list | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, results = entry
    if time.time() - ts > _CACHE_TTL:
        del _cache[key]
        return None
    logger.debug("缓存命中: key=%s count=%s", key, len(results))
    return results


def _cache_set(key: str, results: list) -> None:
    _cache[key] = (time.time(), results)


def _get_source_cooldown_remaining(source: str) -> float:
    cooldown_until = _source_cooldown_until.get(source, 0.0)
    remaining = cooldown_until - time.time()
    if remaining <= 0:
        _source_cooldown_until.pop(source, None)
        return 0.0
    return remaining


def _parse_retry_after_seconds(retry_after: str | None) -> float | None:
    if not retry_after:
        return None
    try:
        seconds = float(retry_after.strip())
    except ValueError:
        return None
    return max(0.0, seconds)


def _mark_source_rate_limited(source: str, headers: httpx.Headers | dict | None = None) -> float:
    retry_after = None
    if headers is not None and hasattr(headers, "get"):
        retry_after = _parse_retry_after_seconds(headers.get("Retry-After"))
    cooldown_seconds = retry_after or _SOURCE_DEFAULT_COOLDOWN_SECONDS.get(source, 60.0)
    _source_cooldown_until[source] = max(
        _source_cooldown_until.get(source, 0.0),
        time.time() + cooldown_seconds,
    )
    return cooldown_seconds


def _enter_source_request_window(source: str) -> None:
    min_interval = _SOURCE_MIN_INTERVAL_SECONDS.get(source, 0.0)
    if min_interval <= 0:
        return
    now = time.time()
    last_request_at = _source_last_request_at.get(source)
    if last_request_at is not None:
        wait_seconds = min_interval - (now - last_request_at)
        if wait_seconds > 0:
            logger.info("文献源节流等待: source=%s wait=%.2fs", source, wait_seconds)
            time.sleep(wait_seconds)
            now += wait_seconds
    _source_last_request_at[source] = now


def _http_get_with_retry(url: str, **kwargs) -> httpx.Response:
    """带 429 重试的 HTTP GET。最多 3 次尝试，指数退避 2s/4s。"""
    last_exc = None
    for attempt in range(3):
        try:
            resp = httpx.get(url, **kwargs)
            if resp.status_code == 429 and attempt < 2:
                wait = 2 ** attempt  # 1s, 2s
                logger.info("HTTP 429 第%d次尝试，等待%ds后重试: url=%s", attempt + 1, wait, url)
                time.sleep(wait)
                continue
            return resp
        except Exception as e:
            last_exc = e
            if attempt < 2:
                time.sleep(1)
                continue
    raise last_exc  # type: ignore[misc]


@dataclass
class PaperResult:
    """统一的文献结果数据结构"""
    title: str
    authors: list[str] = field(default_factory=list)
    year: int | None = None
    venue: str | None = None
    doi: str | None = None
    abstract: str | None = None
    url: str | None = None
    citation_count: int = 0
    source: str = ""  # "openalex" 或 "semantic_scholar"
    is_open_access: bool | None = None


class OpenAlexClient:
    """OpenAlex API 客户端（可选配置 API Key 提升限频）"""
    BASE_URL = "https://api.openalex.org/works"

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or settings.OPENALEX_API_KEY
        self.last_status = "idle"
        self.last_detail = ""

    def search(self, query: str, year_from: int = 2020, year_to: int = 2026, limit: int = 20) -> list[PaperResult]:
        tried: set[str] = set()
        for candidate_query in self._build_query_fallbacks(query):
            if not candidate_query or candidate_query in tried:
                continue
            tried.add(candidate_query)
            if candidate_query != query:
                logger.info("OpenAlex 回退查询: original=%s fallback=%s", query, candidate_query)
            results = self._search_once(candidate_query, year_from, year_to, limit)
            if results:
                self.last_status = "ok"
                self.last_detail = f"count={len(results)} query={candidate_query}"
                return results
            if self.last_status == "rate_limited":
                break
        if self.last_status == "idle":
            self.last_status = "no_results"
            self.last_detail = f"query={query}"
        return []

    def _search_once(self, query: str, year_from: int = 2020, year_to: int = 2026, limit: int = 20) -> list[PaperResult]:
        cache_key = _cache_key("openalex", query, year_from, year_to, limit)
        cached = _cache_get(cache_key)
        if cached is not None:
            return list(cached)

        cooldown_remaining = _get_source_cooldown_remaining("openalex")
        if cooldown_remaining > 0:
            self.last_status = "rate_limited"
            self.last_detail = f"cooldown={cooldown_remaining:.1f}s query={query}"
            return []
        _enter_source_request_window("openalex")

        results = []
        try:
            params = {
                "search": query,
                "filter": f"publication_year:{year_from}-{year_to}",
                "sort": "cited_by_count:desc",
                "per_page": limit,
            }
            if self.api_key:
                params["api_key"] = self.api_key
            response = _http_get_with_retry(
                self.BASE_URL,
                params=params,
                headers={"User-Agent": "mailto:research-agent@example.com"},
                timeout=30.0,
            )
            if response.status_code == 429:
                logger.warning("OpenAlex 被限流 (429): query=%s", query)
                cooldown_seconds = _mark_source_rate_limited("openalex", response.headers)
                self.last_status = "rate_limited"
                self.last_detail = f"cooldown={cooldown_seconds:.1f}s query={query}"
                return []
            response.raise_for_status()
            data = response.json()
            for work in data.get("results", []):
                results.append(self._parse_work(work))
            self.last_status = "ok" if results else "no_results"
            self.last_detail = f"count={len(results)}"
            _cache_set(cache_key, results)
        except httpx.HTTPStatusError:
            self.last_status = "http_error"
            self.last_detail = str(response.status_code) if response else ""
        except Exception as e:
            self.last_status = "error"
            self.last_detail = str(e)
        return results

    @staticmethod
    def _build_query_fallbacks(query: str) -> list[str]:
        """宽松回退：原始 → 去引号+去AND → 仅保留空格连接的核心词"""
        fallbacks = [query]
        relaxed = query.replace('"', " ").replace(" AND ", " ")
        relaxed = " ".join(relaxed.split())
        if relaxed and relaxed != query:
            fallbacks.append(relaxed)
        return [c for c in fallbacks if c]

    @staticmethod
    def _inverted_to_text(inverted: dict) -> str:
        """将 OpenAlex 倒排索引摘要转为纯文本"""
        if not inverted or not isinstance(inverted, dict):
            return ""
        # 倒排索引格式: {"word": [positions...], ...}
        # 重建文本：按位置排序所有词
        words = []
        for word, positions in inverted.items():
            for pos in positions:
                words.append((pos, word))
        words.sort(key=lambda x: x[0])
        return " ".join(w for _, w in words)

    def _parse_work(self, work: dict) -> PaperResult:
        authors = [
            a["author"]["display_name"]
            for a in work.get("authorships", [])
            if a.get("author", {}).get("display_name")
        ]
        doi = work.get("doi", "")
        doi_url = doi.replace("https://doi.org/", "") if doi else None

        return PaperResult(
            title=work.get("title", ""),
            authors=authors[:10],
            year=work.get("publication_year"),
            venue=work.get("primary_location", {}).get("source", {}).get("display_name"),
            doi=doi_url,
            abstract=self._inverted_to_text(work.get("abstract_inverted_index") or {}),
            url=work.get("primary_location", {}).get("landing_page_url"),
            citation_count=work.get("cited_by_count", 0),
            source="openalex",
            is_open_access=bool(work.get("open_access", {}).get("is_oa")),
        )


class SemanticScholarClient:
    """Semantic Scholar API 客户端（免费层级，建议配置 API Key 提升限频）"""
    BASE_URL = "https://api.semanticscholar.org/graph/v1/paper"

    def __init__(self, api_key: str = ""):
        self.api_key = api_key
        self.last_status = "idle"
        self.last_detail = ""

    def search(self, query: str, year_from: int = 2020, year_to: int = 2026, limit: int = 20) -> list[PaperResult]:
        tried: set[str] = set()
        for candidate_query in self._build_query_fallbacks(query):
            if not candidate_query or candidate_query in tried:
                continue
            tried.add(candidate_query)
            if candidate_query != query:
                logger.info("Semantic Scholar 回退查询: original=%s fallback=%s", query, candidate_query)
            results = self._search_once(candidate_query, year_from, year_to, limit)
            if results:
                self.last_status = "ok"
                self.last_detail = f"count={len(results)} query={candidate_query}"
                return results
            if self.last_status == "rate_limited":
                break  # 被限流后不再尝试回退查询
        if self.last_status == "idle":
            self.last_status = "no_results"
            self.last_detail = f"query={query}"
        return []

    def _search_once(self, query: str, year_from: int, year_to: int, limit: int) -> list[PaperResult]:
        cache_key = _cache_key("semantic_scholar", query, year_from, year_to, limit)
        cached = _cache_get(cache_key)
        if cached is not None:
            return list(cached)

        cooldown_remaining = _get_source_cooldown_remaining("semantic_scholar")
        if cooldown_remaining > 0:
            self.last_status = "rate_limited"
            self.last_detail = f"cooldown={cooldown_remaining:.1f}s query={query}"
            return []
        _enter_source_request_window("semantic_scholar")

        results = []
        try:
            params = {
                "query": query,
                "limit": limit,
                "year": f"{year_from}-{year_to}",
                "fields": "title,authors,year,venue,externalIds,abstract,citationCount,url,publicationDate",
            }
            headers = {}
            if self.api_key:
                headers["x-api-key"] = self.api_key

            url = f"{self.BASE_URL}/search"
            response = _http_get_with_retry(
                url,
                params=params,
                headers=headers,
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()
            for paper in data.get("data", []):
                results.append(self._parse_paper(paper))
            if results:
                self.last_status = "ok"
                self.last_detail = f"count={len(results)}"
                _cache_set(cache_key, results)
            else:
                logger.warning("Semantic Scholar 返回 0 结果: query=%s", query)
                self.last_status = "no_results"
                self.last_detail = f"query={query}"
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response else "unknown"
            logger.warning("Semantic Scholar 请求失败: query=%s status=%s", query, status)
            self.last_status = "rate_limited" if status == 429 else "http_error"
            if status == 429:
                cooldown_seconds = _mark_source_rate_limited("semantic_scholar", e.response.headers if e.response else None)
                self.last_detail = f"status={status} cooldown={cooldown_seconds:.1f}s query={query}"
            else:
                self.last_detail = f"status={status} query={query}"
        except Exception as e:
            logger.warning("Semantic Scholar 搜索异常: query=%s error=%s", query, e)
            self.last_status = "error"
            self.last_detail = str(e)
        return results

    @staticmethod
    def _build_relaxed_query(query: str) -> str:
        relaxed = query.replace(" AND ", " ")
        relaxed = relaxed.replace('"', " ")
        relaxed = " ".join(relaxed.split())
        return relaxed

    def _build_query_fallbacks(self, query: str) -> list[str]:
        fallbacks = [query]
        relaxed = self._build_relaxed_query(query)
        if relaxed and relaxed != query:
            fallbacks.append(relaxed)

        quoted_phrases = re.findall(r'"([^"]+)"', query)
        if quoted_phrases:
            fallbacks.extend(phrase.strip() for phrase in quoted_phrases if phrase.strip())

        # 不再回退到单 token / 双 token 组合，避免无意义请求和 429 雪崩
        return [candidate for candidate in fallbacks if candidate]

    def _parse_paper(self, paper: dict) -> PaperResult:
        authors = [a.get("name", "") for a in paper.get("authors", [])]
        external = paper.get("externalIds", {}) or {}

        return PaperResult(
            title=paper.get("title", ""),
            authors=authors[:10],
            year=paper.get("year"),
            venue=paper.get("venue"),
            doi=external.get("DOI"),
            abstract=paper.get("abstract"),
            url=paper.get("url"),
            citation_count=paper.get("citationCount", 0),
            source="semantic_scholar",
            is_open_access=None,
        )


def deduplicate(results: list[PaperResult]) -> list[PaperResult]:
    """按 DOI 和标题去重，保留引用数更高的记录"""
    seen: dict[str, PaperResult] = {}
    for r in results:
        key = r.doi or r.title.lower().strip()
        if not key:
            continue
        if key in seen:
            if r.citation_count > seen[key].citation_count:
                seen[key] = r
        else:
            seen[key] = r
    # 按引用数降序排列
    return sorted(seen.values(), key=lambda x: x.citation_count, reverse=True)
