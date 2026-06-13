"""维普（cqvip.com）中文文献搜索服务 —— 使用 Playwright 浏览器自动化"""
import asyncio
import logging
import re
import sys
import urllib.parse

from .literature_search import PaperResult
from .shared_browser import get_shared_browser

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

logger = logging.getLogger(__name__)

CQVIP_SEARCH_URL = "https://www.cqvip.com/search"
CQVIP_TIMEOUT = 60  # 维普页面可能加载较慢


class CQVIPClient:
    """维普中文文献搜索客户端（SSR 渲染，直接解析 HTML）"""

    def __init__(self, headless: bool = True, timeout: int = 60):
        self.headless = headless
        self.timeout = timeout
        self.last_status = "idle"
        self.last_detail = ""

    def search(
        self, query: str, year_from: int = 2020, year_to: int = 2026, limit: int = 20
    ) -> list[PaperResult]:
        """搜索维普中文文献。异常时返回空列表，不影响其他源。"""
        results: list[PaperResult] = []
        context = None
        try:
            logger.info("CQVIP 开始搜索: query=%s, year_from=%s, year_to=%s, limit=%s", query, year_from, year_to, limit)
            browser = get_shared_browser(headless=self.headless)
            context = browser.new_context(
                viewport={"width": 414, "height": 896},
                locale="zh-CN",
                timezone_id="Asia/Shanghai",
                user_agent=(
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                    "Mobile/15E148"
                ),
            )
            page = context.new_page()
            page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', { get: () => false });"
            )
            page.set_default_timeout(self.timeout * 1000)

            url = self._build_url(query)
            page.goto(url, wait_until="domcontentloaded", timeout=self.timeout * 1000)
            logger.debug(f"CQVIP 页面已加载: {page.title()}")

            if self._detect_captcha(page):
                logger.warning("CQVIP 验证码出现，跳过本次搜索")
                self.last_status = "blocked"
                self.last_detail = "captcha"
                context.close()
                return results

            try:
                page.wait_for_selector(".item", timeout=15000)
                logger.debug("CQVIP 结果元素已出现")
            except Exception:
                logger.warning("CQVIP 搜索结果未加载（.item 未出现）")
                self.last_status = "no_results"
                self.last_detail = f"query={query}"
                context.close()
                return results

            raw = self._parse_results(page, limit)
            results = [r for r in raw if r and year_from <= (r.year or 0) <= year_to]
            logger.info("CQVIP 搜索完成: query=%s, count=%s, raw_count=%s", query, len(results), len(raw))
            if not results:
                logger.warning("CQVIP 未命中文献: query=%s", query)
                self.last_status = "no_results"
                self.last_detail = f"query={query}"
            else:
                self.last_status = "ok"
                self.last_detail = f"count={len(results)} query={query}"

        except Exception as e:
            logger.warning(f"CQVIP 搜索异常: query={query}, error={e}")
            self.last_status = "error"
            self.last_detail = str(e)

        finally:
            if context:
                try:
                    context.close()
                except Exception:
                    pass

        return results

    # ==================== URL ====================

    def _build_url(self, query: str) -> str:
        encoded = urllib.parse.quote(query)
        return f"{CQVIP_SEARCH_URL}?k={encoded}"

    # ==================== 检测 ====================

    def _detect_captcha(self, page) -> bool:
        keywords = ["验证码", "captcha", "verify", "安全验证"]
        try:
            body = page.inner_text("body").lower()
            return any(kw in body for kw in keywords)
        except Exception:
            return False

    # ==================== 解析 ====================

    def _parse_results(self, page, limit: int) -> list[PaperResult]:
        """解析 SS R 渲染后的维普搜索结果"""
        items = page.query_selector_all(".item")
        if not items:
            logger.debug("未找到 .item 元素")
            return []

        results = []
        for el in items[:limit]:
            try:
                r = self._parse_item(el)
                if r and r.title:
                    results.append(r)
            except Exception:
                continue
        return results

    def _parse_item(self, el) -> PaperResult | None:
        """解析单条维普搜索结果"""
        # 标题 + URL
        title_link = el.query_selector("a.title")
        if not title_link:
            return None
        title = title_link.inner_text().strip()
        if not title:
            return None

        href = title_link.get_attribute("href") or ""
        url = f"https://www.cqvip.com{href}" if href.startswith("/") else href

        # 作者 — .author-name 元素（可能是 a 或 span）
        authors = []
        author_els = el.query_selector_all(".author-name")
        for a_el in author_els:
            name = a_el.inner_text().strip()
            # 过滤掉空字符串和纯数字（机构编号 sup 标签的内容）
            if name and re.search(r"[一-鿿]", name):
                authors.append(name)
        authors = authors[:10]

        # 期刊名 — .hoverSource
        venue = None
        venue_el = el.query_selector(".hoverSource")
        if venue_el:
            venue_text = venue_el.inner_text().strip()
            venue = venue_text.strip("《》")

        # 年份 — font 元素中匹配年份
        year = None
        font_els = el.query_selector_all("font")
        for font_el in font_els:
            text = font_el.inner_text().strip()
            m = re.search(r"(\d{4})年?", text)
            if m:
                year = int(m.group(1))
                if 2000 <= year <= 2030:
                    break

        # 摘要 — .abstr
        abstract = None
        abstract_el = el.query_selector(".abstr")
        if abstract_el:
            abstract = abstract_el.inner_text().strip()

        # 被引量 — .quantitativeData font
        citation_count = 0
        qd_el = el.query_selector(".quantitativeData")
        if qd_el:
            font_el = qd_el.query_selector("font")
            if font_el:
                try:
                    citation_count = int(font_el.inner_text().strip())
                except ValueError:
                    pass

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
