"""CNKI 中文文献搜索服务。"""
import asyncio
import logging
import re
import sys
import time
import urllib.parse
from typing import Any

from ..core.config import settings
from .literature_search import PaperResult
from .scrapling_cnki_fallback import ScraplingCNKIFallback
from .shared_browser import get_shared_browser

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logger = logging.getLogger(__name__)

CNKI_MOBILE_SEARCH = "https://wap.cnki.net/touch/web/Article/search"
CNKI_GATE_API = "https://wap.cnki.net/gate/m052/web/api/article/search"
CNKI_FAILURE_COOLDOWN_SECONDS = 120
MOBILE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
)
CAPTCHA_HINTS = ("验证码", "安全验证", "captcha", "verify", "blockpuzzle")
BLOCK_HINTS = CAPTCHA_HINTS + ("访问异常", "请求异常", "操作频繁", "稍后再试")
_cnki_failure_cooldown: dict[str, tuple[float, str, str]] = {}


def _build_gate_payload(keyword: str, page_index: int = 1, page_size: int = 20) -> dict:
    """构建手机知网 Gate API 请求体。"""
    return {
        "keyword": keyword,
        "searchType": 0,
        "dbType": "",
        "pageIndex": page_index,
        "pageSize": page_size,
        "articletype": 0,
        "sorttype": 0,
        "fieldtype": 101,
        "yeartype": 0,
        "remark": "",
        "yearinterval": "",
        "screen": {
            "screentype": 0,
            "isscreen": "",
            "subject_sc": "",
            "research_sc": "",
            "depart_sc": "",
            "author_sc": "",
            "subjectcode_sc": "",
            "researchcode_sc": "",
            "departcode_sc": "",
            "authorcode_sc": "",
            "sponsor_sc": "",
            "teacher_sc": "",
            "sponsorcode_sc": "",
            "teachercode_sc": "",
            "starttime_sc": "",
            "endtime_sc": "",
            "timestate_sc": "",
        },
        "senior": {
            "theme_kw": "",
            "title_kw": "",
            "abstract_kw": "",
            "author_kw": "",
            "sponsor_kw": "",
            "sourceid_kw": "",
            "refcode_kw": "",
        },
    }


class CNKIClient:
    """CNKI 搜索客户端。"""

    def __init__(self, headless: bool = True, timeout: int = 40):
        self.headless = headless
        self.timeout = timeout
        self.last_status = "idle"
        self.last_detail = ""
        self.scrapling_fallback = ScraplingCNKIFallback(timeout=settings.SCRAPLING_CNKI_TIMEOUT)

    def search(
        self,
        query: str,
        year_from: int = 2020,
        year_to: int = 2026,
        limit: int = 20,
    ) -> list[PaperResult]:
        """搜索 CNKI 中文文献。

        搜索字段策略：
        - field=101: 主题（默认，覆盖标题+关键词+摘要）
        - field=1: 标题（更精准）
        - field=0: 全文（范围最大但易超时）
        """
        cooldown_key = self._cooldown_key(query, year_from, year_to, limit)
        cooldown = self._get_failure_cooldown(cooldown_key)
        if cooldown:
            self.last_status = cooldown["status"]
            self.last_detail = cooldown["detail"]
            return []

        results: list[PaperResult] = []
        seen_keys: set[str] = set()
        context = None
        initial_results: list[PaperResult] = []
        gate_error_status = ""

        try:
            logger.info(
                "CNKI 开始搜索: query=%s, year_from=%s, year_to=%s, limit=%s",
                query,
                year_from,
                year_to,
                limit,
            )
            browser = get_shared_browser(headless=self.headless)
            context = browser.new_context(
                viewport={"width": 414, "height": 896},
                locale="zh-CN",
                timezone_id="Asia/Shanghai",
                user_agent=MOBILE_UA,
            )
            page = context.new_page()
            page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', { get: () => false });"
            )
            page.set_default_timeout(min(self.timeout * 1000, 30000))

            url = f"{CNKI_MOBILE_SEARCH}?kw={urllib.parse.quote(query)}&field=101"
            self._goto_search_page(page, url)
            page.wait_for_timeout(5000)

            if self._detect_captcha(page):
                logger.warning("CNKI 页面触发安全验证: query=%s, url=%s", query, page.url)
                self.last_status = "blocked"
                self.last_detail = "captcha"
                context.close()
                return results

            initial_results = self._extract_results_from_page(page)
            if initial_results:
                self._merge_results(
                    results,
                    seen_keys,
                    initial_results,
                    year_from=year_from,
                    year_to=year_to,
                    limit=limit,
                )
                logger.info("CNKI 首屏解析成功: count=%s", len(initial_results))
                page_idx = 2
            else:
                page_idx = 1
                logger.info("CNKI 首屏未解析到结果，转为 Gate API 拉取")

            while len(results) < limit:
                gate_result = self._fetch_gate_api_with_retry(page, query, page_idx)
                status = gate_result.get("status")
                data = gate_result.get("data")

                if status == "blocked":
                    gate_error_status = "blocked"
                    self.last_detail = str(gate_result.get("detail") or "")
                    logger.warning(
                        "CNKI Gate API 疑似被拦截: query=%s, page=%s, detail=%s",
                        query,
                        page_idx,
                        gate_result.get("detail"),
                    )
                    break
                if status == "error":
                    gate_error_status = "error"
                    self.last_detail = str(gate_result.get("detail") or "")
                    logger.warning(
                        "CNKI Gate API 请求失败: query=%s, page=%s, detail=%s",
                        query,
                        page_idx,
                        gate_result.get("detail"),
                    )
                    break
                if status == "retryable_error":
                    gate_error_status = "retryable_error"
                    self.last_detail = str(gate_result.get("detail") or "")
                    logger.warning(
                        "CNKI Gate API 重试后仍失败: query=%s, page=%s, detail=%s",
                        query,
                        page_idx,
                        gate_result.get("detail"),
                    )
                    break
                if not data:
                    gate_error_status = status or "empty"
                    logger.info("CNKI Gate API 未返回有效数据: query=%s, page=%s", query, page_idx)
                    break

                items = data.get("contentList") or []
                if not items:
                    gate_error_status = "empty_items"
                    logger.info("CNKI Gate API 返回空列表: query=%s, page=%s", query, page_idx)
                    break

                parsed_results: list[PaperResult] = []
                for item in items:
                    try:
                        paper = self._parse_json_item(item)
                        if paper:
                            parsed_results.append(paper)
                    except Exception:
                        continue
                logger.info(
                    "CNKI Gate API 拉取成功: query=%s, page=%s, raw_items=%s, parsed_items=%s",
                    query,
                    page_idx,
                    len(items),
                    len(parsed_results),
                )
                self._merge_results(
                    results,
                    seen_keys,
                    parsed_results,
                    year_from=year_from,
                    year_to=year_to,
                    limit=limit,
                )

                total = data.get("totalCount", 0)
                if page_idx * 20 >= total:
                    break
                page_idx += 1

            if self._should_try_scrapling_fallback(
                current_results=results,
                initial_results=initial_results,
                gate_error_status=gate_error_status,
                limit=limit,
            ):
                logger.info(
                    "CNKI 尝试 Scrapling 兜底: query=%s current=%s initial=%s gate_status=%s",
                    query,
                    len(results),
                    len(initial_results),
                    gate_error_status or "none",
                )
                fallback_results = self.scrapling_fallback.search(
                    query,
                    year_from=year_from,
                    year_to=year_to,
                    limit=limit,
                )
                self._merge_results(
                    results,
                    seen_keys,
                    fallback_results,
                    year_from=year_from,
                    year_to=year_to,
                    limit=limit,
                )

            logger.info(
                "CNKI 搜索完成: query=%s, count=%s, year_from=%s, year_to=%s",
                query,
                len(results),
                year_from,
                year_to,
            )
            if not results:
                logger.warning("CNKI 未命中文献: query=%s", query)
                logger.info(
                    "CNKI 诊断信息: initial_results=%s, gate_error=%s, scrapling_status=%s, scrapling_detail=%s",
                    len(initial_results),
                    gate_error_status or "none",
                    self.scrapling_fallback.last_status,
                    self.scrapling_fallback.last_detail,
                )
                if gate_error_status == "retryable_error":
                    self.last_status = "gateway_timeout"
                    self.last_detail = self.last_detail or f"query={query}"
                elif gate_error_status in {"blocked", "error"}:
                    self.last_status = gate_error_status
                    self.last_detail = self.last_detail or f"query={query}"
                elif self.scrapling_fallback.last_status in {"blocked", "error", "unavailable"}:
                    self.last_status = self.scrapling_fallback.last_status
                    self.last_detail = self.scrapling_fallback.last_detail
                else:
                    self.last_status = "no_results"
                    self.last_detail = f"query={query}"
            else:
                self.last_status = "ok"
                self.last_detail = f"count={len(results)} query={query}"
                _cnki_failure_cooldown.pop(cooldown_key, None)

            if self.last_status in {"gateway_timeout", "blocked", "error"}:
                self._set_failure_cooldown(cooldown_key, self.last_status, self.last_detail)

        except Exception as exc:
            logger.warning("CNKI 搜索异常: query=%s, error=%s", query, exc)
            self.last_status = "error"
            self.last_detail = str(exc)

        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass

        return results[:limit]

    def _cooldown_key(self, query: str, year_from: int, year_to: int, limit: int) -> str:
        return f"{query}|{year_from}|{year_to}|{limit}"

    def _get_failure_cooldown(self, key: str) -> dict[str, str] | None:
        entry = _cnki_failure_cooldown.get(key)
        if not entry:
            return None
        expires_at, status, detail = entry
        remaining = expires_at - time.time()
        if remaining <= 0:
            _cnki_failure_cooldown.pop(key, None)
            return None
        return {
            "status": status,
            "detail": f"cooldown={remaining:.1f}s {detail}",
        }

    def _set_failure_cooldown(self, key: str, status: str, detail: str) -> None:
        _cnki_failure_cooldown[key] = (
            time.time() + CNKI_FAILURE_COOLDOWN_SECONDS,
            status,
            detail,
        )

    def _should_try_scrapling_fallback(
        self,
        *,
        current_results: list[PaperResult],
        initial_results: list[PaperResult],
        gate_error_status: str,
        limit: int,
    ) -> bool:
        if not settings.SCRAPLING_CNKI_ENABLED:
            return False
        if len(current_results) >= limit:
            return False
        if not settings.SCRAPLING_CNKI_FALLBACK_ON_EMPTY and current_results:
            return False
        if not current_results:
            return True
        if not initial_results and gate_error_status:
            return True
        return gate_error_status in {"blocked", "error", "retryable_error", "empty", "empty_items"}

    def _fetch_gate_api(self, page, keyword: str, page_index: int) -> dict[str, Any]:
        """通过浏览器上下文调用 Gate API。"""
        payload = _build_gate_payload(keyword, page_index, page_size=20)
        try:
            result = page.evaluate(
                """
                async (payload) => {
                    const resp = await fetch(
                        'https://wap.cnki.net/gate/m052/web/api/article/search',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json;charset=UTF-8',
                                'Accept': 'application/json',
                                'X-Requested-With': 'XMLHttpRequest',
                            },
                            credentials: 'include',
                            body: JSON.stringify(payload),
                        }
                    );
                    const text = await resp.text();
                    let data = null;
                    let parseError = null;
                    try {
                        data = JSON.parse(text);
                    } catch (err) {
                        parseError = String(err);
                    }
                    return {
                        ok: resp.ok,
                        statusCode: resp.status,
                        url: resp.url,
                        contentType: resp.headers.get('content-type') || '',
                        textPreview: text.slice(0, 300),
                        parseError,
                        data,
                    };
                }
                """,
                payload,
            )
            if not isinstance(result, dict):
                return {"status": "error", "detail": "浏览器内 fetch 返回结构异常"}

            text_preview = str(result.get("textPreview") or "")
            preview_lower = text_preview.lower()
            detail = (
                f"http={result.get('statusCode')}, "
                f"content_type={result.get('contentType')}, "
                f"parse_error={result.get('parseError')}, "
                f"preview={text_preview[:160]}"
            )

            status_code = int(result.get("statusCode") or 0)
            if status_code >= 500:
                return {"status": "retryable_error", "detail": detail}

            if any(hint in preview_lower for hint in BLOCK_HINTS):
                return {"status": "blocked", "detail": detail}

            data = result.get("data")
            if isinstance(data, dict):
                return {"status": "ok", "data": data, "detail": detail}
            return {"status": "error", "detail": detail}
        except Exception as exc:
            logger.warning("CNKI Gate API 调用失败 (page %s): %s", page_index, exc)
            return {"status": "retryable_error", "detail": str(exc)}

    def _fetch_gate_api_with_retry(self, page, keyword: str, page_index: int) -> dict[str, Any]:
        """对 5xx 或超时做一次重试。"""
        last_result: dict[str, Any] = {"status": "error", "detail": "unknown"}
        for attempt in range(2):
            last_result = self._fetch_gate_api(page, keyword, page_index)
            if last_result.get("status") != "retryable_error":
                return last_result
            logger.warning(
                "CNKI Gate API 可重试错误: query=%s, page=%s, attempt=%s, detail=%s",
                keyword,
                page_index,
                attempt + 1,
                last_result.get("detail"),
            )
            try:
                page.wait_for_timeout(1200)
            except Exception:
                time.sleep(1.2)

        self.last_status = "gateway_timeout"
        self.last_detail = str(last_result.get("detail"))
        return last_result

    def _goto_search_page(self, page, url: str) -> None:
        """搜索页加载失败时做一次重试。"""
        last_error: Exception | None = None
        for attempt in range(2):
            try:
                page.goto(url, wait_until="domcontentloaded")
                return
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "CNKI 搜索页加载失败: url=%s attempt=%s error=%s",
                    url,
                    attempt + 1,
                    exc,
                )
                try:
                    page.wait_for_timeout(1500)
                except Exception:
                    time.sleep(1.5)
        if last_error:
            raise last_error

    def _detect_captcha(self, page) -> bool:
        """检测验证码或安全验证页。"""
        try:
            title = (page.title() or "").lower()
            url = (page.url or "").lower()
            body = page.inner_text("body").lower()
            text = "\n".join([title, url, body[:1000]])
            return any(kw in text for kw in CAPTCHA_HINTS)
        except Exception:
            return False

    def _extract_results_from_page(self, page) -> list[PaperResult]:
        """从首屏已渲染的页面结果中直接提取文献。"""
        try:
            raw_items = page.eval_on_selector_all(
                ".c-company__body-item",
                """
                (nodes) => nodes.map((node) => {
                    const titleEl = node.querySelector('.c-company__body-title a');
                    const authorEl = node.querySelector('.c-company__body-author');
                    const summaryEl = node.querySelector('.c-company__body-content');
                    const venueEl = node.querySelector('.c-company__body-name .color-green');
                    const metaEl = node.querySelector('.c-company__body-name');
                    const infoEl = node.querySelector('.c-company__body-info');
                    const linkEl = node.querySelector('.c-company-top-link');
                    return {
                        title: titleEl?.textContent?.trim() || '',
                        author: authorEl?.textContent?.trim() || '',
                        summary: summaryEl?.textContent?.trim() || '',
                        venueText: venueEl?.textContent?.trim() || '',
                        metaText: metaEl?.textContent?.trim() || '',
                        infoText: infoEl?.textContent?.trim() || '',
                        href: linkEl?.getAttribute('href') || '',
                    };
                })
                """,
            )
        except Exception as exc:
            logger.info("CNKI 首屏解析失败: %s", exc)
            return []

        results: list[PaperResult] = []
        for item in raw_items or []:
            paper = self._parse_page_item(item)
            if paper:
                results.append(paper)
        return results

    def _parse_page_item(self, item: dict[str, Any]) -> PaperResult | None:
        title = (item.get("title") or "").strip()
        if not title:
            return None

        author_raw = re.sub(r"\s+", " ", str(item.get("author") or "")).strip()
        authors = author_raw.split() if author_raw else []
        venue_text = str(item.get("venueText") or "").strip()
        meta_text = re.sub(r"\s+", " ", str(item.get("metaText") or "")).strip()
        venue = venue_text or None
        summary = str(item.get("summary") or "").strip() or None

        href = str(item.get("href") or "").strip()
        if href.startswith("//"):
            url = "https:" + href
        elif href.startswith("/"):
            url = "https://wap.cnki.net" + href
        else:
            url = href or None

        info_text = str(item.get("infoText") or "")
        citation_count = 0
        match_citation = re.search(r"引用[:：]?\s*(\d+)", info_text)
        if match_citation:
            citation_count = int(match_citation.group(1))

        year = None
        match_year = re.search(r"(20\d{2})", f"{meta_text} {summary or ''}")
        if match_year:
            year = int(match_year.group(1))

        return PaperResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            abstract=summary,
            url=url,
            citation_count=citation_count,
            source="cnki",
        )

    def _parse_json_item(self, item: dict) -> PaperResult | None:
        """把 Gate API 返回结果映射为 PaperResult。"""
        title = (item.get("title") or "").strip()
        if not title:
            return None

        author_raw = (item.get("author") or "").strip("; ")
        authors = [part.strip() for part in author_raw.split(";") if part.strip()] if author_raw else []

        year = None
        pub_time = item.get("publicationTime") or item.get("year") or ""
        match_year = re.search(r"(\d{4})", str(pub_time))
        if match_year:
            year = int(match_year.group(1))

        venue = (item.get("publishName") or "").strip() or None
        abstract = (item.get("summary") or "").strip() or None

        citation_count = 0
        try:
            citation_count = int(item.get("quoteFrequency", 0))
        except (ValueError, TypeError):
            pass

        file_name = item.get("fileName") or ""
        url = f"https://wap.cnki.net/touch/web/Journal/Article/{file_name}.html" if file_name else None

        return PaperResult(
            title=title,
            authors=authors,
            year=year,
            venue=venue,
            abstract=abstract,
            url=url,
            citation_count=citation_count,
            source="cnki",
        )

    def _merge_results(
        self,
        results: list[PaperResult],
        seen_keys: set[str],
        candidates: list[PaperResult],
        *,
        year_from: int,
        year_to: int,
        limit: int,
    ) -> None:
        """统一做去重和年份过滤。"""
        for paper in candidates:
            if len(results) >= limit:
                return
            if not paper.title:
                continue
            if paper.year is not None and not (year_from <= paper.year <= year_to):
                continue
            key = (paper.url or paper.title).strip().lower()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            results.append(paper)
