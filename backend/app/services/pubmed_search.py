"""文献检索服务 —— 调用 PubMed E-utilities API。"""
import logging
import re
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

SOURCE_NAME = "pubmed"
SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


class PubMedClient:
    """PubMed API 客户端（免费，无需 API Key）。"""

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

        try:
            ids = self._search_ids(query, year_from, year_to, limit)
            if not ids:
                self.last_status = "no_results"
                self.last_detail = f"query={query}"
                return []
            results = self._fetch_details(ids)
            self.last_status = "ok" if results else "no_results"
            self.last_detail = f"count={len(results)}"
            _cache_set(cache_key, results)
            return results
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response else "unknown"
            logger.warning("PubMed 请求失败: query=%s status=%s", query, status)
            self.last_status = "http_error"
            self.last_detail = f"status={status} query={query}"
            return []
        except Exception as exc:
            logger.warning("PubMed 搜索异常: query=%s error=%s", query, exc)
            self.last_status = "error"
            self.last_detail = str(exc)
            return []

    def _search_ids(self, query: str, year_from: int, year_to: int, limit: int) -> list[str]:
        params = {
            "db": "pubmed",
            "term": query,
            "retmax": min(limit, 50),
            "retmode": "json",
            "sort": "relevance",
            "mindate": year_from,
            "maxdate": year_to,
            "datetype": "pdat",
        }
        response = _http_get_with_retry(SEARCH_URL, params=params, timeout=30.0)
        if response.status_code == 429:
            logger.warning("PubMed 被限流 (429): query=%s", query)
            cooldown_seconds = _mark_source_rate_limited(SOURCE_NAME, response.headers)
            self.last_status = "rate_limited"
            self.last_detail = f"cooldown={cooldown_seconds:.1f}s query={query}"
            return []
        response.raise_for_status()
        data = response.json()
        return [item for item in data.get("esearchresult", {}).get("idlist", []) if item]

    def _fetch_details(self, ids: list[str]) -> list[PaperResult]:
        params = {
            "db": "pubmed",
            "id": ",".join(ids),
            "retmode": "xml",
        }
        response = _http_get_with_retry(FETCH_URL, params=params, timeout=30.0)
        if response.status_code == 429:
            logger.warning("PubMed 详情接口被限流 (429): ids=%s", ",".join(ids[:5]))
            cooldown_seconds = _mark_source_rate_limited(SOURCE_NAME, response.headers)
            self.last_status = "rate_limited"
            self.last_detail = f"cooldown={cooldown_seconds:.1f}s ids={len(ids)}"
            return []
        response.raise_for_status()
        return self._parse_articles(response.text)

    def _parse_articles(self, xml_text: str) -> list[PaperResult]:
        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as exc:
            logger.warning("PubMed XML 解析失败: %s", exc)
            return []

        results: list[PaperResult] = []
        for article in root.findall(".//PubmedArticle"):
            medline = article.find("MedlineCitation")
            article_node = medline.find("Article") if medline is not None else None
            if article_node is None:
                continue

            title = self._text(article_node.find("ArticleTitle"))
            if not title:
                continue

            authors = []
            for author in article_node.findall(".//Author"):
                last_name = self._text(author.find("LastName"))
                fore_name = self._text(author.find("ForeName"))
                collective_name = self._text(author.find("CollectiveName"))
                name = " ".join(part for part in [fore_name, last_name] if part).strip() or collective_name
                if name:
                    authors.append(name)

            journal = article_node.find("Journal")
            venue = self._text(journal.find("Title")) if journal is not None else None
            abstract = self._collect_abstract(article_node)
            pmid = self._text(medline.find("PMID")) if medline is not None else ""
            year = self._extract_year(article_node)
            doi = self._extract_doi(article_node)
            is_open_access = bool(article.findall(".//ArticleId[@IdType='pmc']"))

            results.append(
                PaperResult(
                    title=title,
                    authors=authors[:10],
                    year=year,
                    venue=venue or "PubMed",
                    doi=doi,
                    abstract=abstract,
                    url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/" if pmid else None,
                    citation_count=0,
                    source=SOURCE_NAME,
                    is_open_access=is_open_access,
                )
            )
        return results

    def _collect_abstract(self, article_node) -> str | None:
        abstract_node = article_node.find("Abstract")
        if abstract_node is None:
            return None
        parts = []
        for text_node in abstract_node.findall("AbstractText"):
            text = self._text(text_node)
            label = text_node.attrib.get("Label")
            if label and text:
                parts.append(f"{label}: {text}")
            elif text:
                parts.append(text)
        joined = " ".join(part.strip() for part in parts if part.strip())
        return joined or None

    def _extract_year(self, article_node) -> int | None:
        candidates = [
            article_node.find(".//JournalIssue/PubDate/Year"),
            article_node.find(".//ArticleDate/Year"),
            article_node.find(".//PubMedPubDate/Year"),
        ]
        for node in candidates:
            value = self._text(node)
            if value.isdigit():
                return int(value)
        medline_date = self._text(article_node.find(".//JournalIssue/PubDate/MedlineDate"))
        match = re.search(r"(19|20)\d{2}", medline_date)
        if match:
            return int(match.group(0))
        return None

    def _extract_doi(self, article_node) -> str | None:
        for node in article_node.findall(".//ELocationID"):
            if node.attrib.get("EIdType") == "doi":
                doi = self._text(node)
                if doi:
                    return doi
        for node in article_node.findall(".//ArticleId"):
            if node.attrib.get("IdType") == "doi":
                doi = self._text(node)
                if doi:
                    return doi
        return None

    @staticmethod
    def _text(node) -> str:
        if node is None:
            return ""
        return "".join(node.itertext()).strip()
