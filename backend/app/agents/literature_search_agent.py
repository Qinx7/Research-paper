"""文献检索 Agent —— 面向学术搜索任务的多源检索、过滤与综合排序。"""
import json
import logging
import math
import re

import httpx

from ..core.config import settings
from ..services.literature_search import (
    OpenAlexClient,
    SemanticScholarClient,
    deduplicate,
    PaperResult,
)
from ..services.cnki_search import CNKIClient
from ..services.cqvip_search import CQVIPClient
from ..services.crossref_search import CrossrefClient
from ..services.arxiv_search import ArxivClient
from ..services.pubmed_search import PubMedClient

logger = logging.getLogger(__name__)

SUPPORTED_SEARCH_MODES = {"quick_search", "literature_review", "deep_research"}
SUPPORTED_LIBRARY_SCOPES = {"all", "cn", "en"}
SOURCE_QUALITY_PRIOR = {
    "pubmed": 0.9,
    "semantic_scholar": 0.88,
    "openalex": 0.84,
    "cnki": 0.82,
    "crossref": 0.80,
    "arxiv": 0.78,
    "cqvip": 0.74,
}

CN_TO_EN_KEYWORD_GLOSSARY = {
    "大语言模型": "large language models",
    "大模型": "large language models",
    "语言模型": "language models",
    "生成式人工智能": "generative artificial intelligence",
    "人工智能": "artificial intelligence",
    "机器学习": "machine learning",
    "深度学习": "deep learning",
    "自然语言处理": "natural language processing",
    "生物信息": "bioinformatics",
    "生物信息学": "bioinformatics",
    "生物医学": "biomedicine",
    "医学": "medicine",
    "教育": "education",
    "学习分析": "learning analytics",
    "知识图谱": "knowledge graph",
    "智能体": "agent",
    "多智能体": "multi-agent systems",
    "推荐系统": "recommender systems",
}


class LiteratureSearchAgent:
    """文献检索 Agent"""

    def __init__(self):
        self.openalex = OpenAlexClient()
        self.semantic = SemanticScholarClient(api_key=settings.SEMANTIC_SCHOLAR_API_KEY)
        self.pubmed = PubMedClient()
        self.cnki = CNKIClient(
            headless=settings.CNKI_HEADLESS,
            timeout=settings.CNKI_TIMEOUT,
        )
        self.cqvip = CQVIPClient(
            headless=settings.CQVIP_HEADLESS,
            timeout=settings.CQVIP_TIMEOUT,
        )
        self.crossref = CrossrefClient()
        self.arxiv = ArxivClient()

    def _ensure_en_keywords(self, keywords_cn: list[str]) -> list[str]:
        """当正则提取不到英文关键词时，用 LLM 将中文关键词转译为英文学术检索词。"""
        if not keywords_cn:
            return []
        api_key = settings.DEEPSEEK_API_KEY
        if not api_key:
            return self._fallback_en_keywords(keywords_cn)
        cn_text = "、".join(keywords_cn[:6])
        try:
            resp = httpx.post(
                f"{settings.DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.DEEPSEEK_MODEL,
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "你是学术文献检索助手。将用户提供的中文关键词转译为英文学术检索用词。"
                                "只输出 2-4 个最核心的英文关键词/短语，用逗号分隔，不要任何解释。"
                                "优先使用学术术语，缩写展开为全称。"
                            ),
                        },
                        {"role": "user", "content": cn_text},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 80,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
            text = data["choices"][0]["message"]["content"].strip()
            en_keywords = [kw.strip() for kw in text.split(",") if kw.strip()]
            en_keywords = self._normalize_english_keywords(en_keywords)
            logger.info("LLM 转译英文关键词: %s → %s", cn_text, en_keywords)
            return en_keywords[:5] or self._fallback_en_keywords(keywords_cn)
        except Exception as e:
            logger.warning("英文关键词转译失败: %s", e)
            return self._fallback_en_keywords(keywords_cn)

    def _fallback_en_keywords(self, keywords_cn: list[str]) -> list[str]:
        """在 LLM 不可用时，用保守术语表生成英文检索词，避免英文源被直接跳过。"""
        text = " ".join(keywords_cn or [])
        keywords: list[str] = []
        for cn_term, en_term in CN_TO_EN_KEYWORD_GLOSSARY.items():
            if cn_term in text and en_term not in keywords:
                keywords.append(en_term)
        return keywords[:5]

    def _normalize_english_keywords(self, keywords_en: list[str]) -> list[str]:
        """过滤误传到英文检索字段里的中文词，避免英文文献源被中文原句污染。"""
        normalized = []
        for keyword in keywords_en or []:
            keyword = keyword.strip()
            if not keyword or re.search(r"[\u4e00-\u9fff]", keyword):
                continue
            normalized.append(keyword)
        return normalized

    def search_by_requirement(
        self,
        keywords_cn: list[str],
        keywords_en: list[str],
        year_from: int = 2020,
        year_to: int = 2026,
        limit: int = 30,
        mode: str = "quick_search",
        library_scope: str = "all",
        sources: list[str] | None = None,
        min_citation_count: int = 0,
        prefer_high_impact: bool = False,
        open_access_only: bool = False,
        quality_tags: list[str] | None = None,
    ) -> dict:
        """根据关键词执行学术搜索任务。"""
        mode = mode if mode in SUPPORTED_SEARCH_MODES else "quick_search"
        library_scope = library_scope if library_scope in SUPPORTED_LIBRARY_SCOPES else "all"
        selected_sources = self._resolve_sources(library_scope, sources)
        source_limit = self._resolve_source_limit(limit=limit, mode=mode)

        keywords_en = self._normalize_english_keywords(keywords_en)
        # 英文关键词不足时，用 LLM 从中文关键词转译，避免用中文搜英文数据库无结果
        if not keywords_en and keywords_cn:
            keywords_en = self._ensure_en_keywords(keywords_cn)
        query_en = self._build_query(keywords_en) if keywords_en else ""
        query_cn = self._build_cn_query(keywords_cn) if keywords_cn else query_en
        logger.info(
            "学术检索执行: mode=%s scope=%s sources=%s cn_keywords=%s en_keywords=%s query_cn=%s query_en=%s open_access_only=%s quality_tags=%s",
            mode,
            library_scope,
            selected_sources,
            keywords_cn,
            keywords_en,
            query_cn,
            query_en,
            open_access_only,
            quality_tags or [],
        )

        per_source_results: dict[str, list[PaperResult]] = {}
        if "pubmed" in selected_sources and query_en:
            per_source_results["pubmed"] = self.pubmed.search(query_en, year_from, year_to, source_limit)
            logger.info("文献源返回: source=pubmed count=%s query=%s", len(per_source_results["pubmed"]), query_en)
        if "openalex" in selected_sources and query_en:
            per_source_results["openalex"] = self.openalex.search(query_en, year_from, year_to, source_limit)
            logger.info("文献源返回: source=openalex count=%s query=%s", len(per_source_results["openalex"]), query_en)
        if "semantic_scholar" in selected_sources and query_en:
            per_source_results["semantic_scholar"] = self.semantic.search(query_en, year_from, year_to, source_limit)
            logger.info("文献源返回: source=semantic_scholar count=%s query=%s", len(per_source_results["semantic_scholar"]), query_en)
        if "cnki" in selected_sources and settings.CNKI_ENABLED and keywords_cn:
            per_source_results["cnki"] = self._search_cn_source_with_fallbacks(
                self.cnki,
                query_cn=query_cn,
                year_from=year_from,
                year_to=year_to,
                source_limit=source_limit,
            )
            logger.info("文献源返回: source=cnki count=%s query=%s", len(per_source_results["cnki"]), query_cn)
        if "cqvip" in selected_sources and settings.CQVIP_ENABLED and keywords_cn:
            per_source_results["cqvip"] = self._search_cn_source_with_fallbacks(
                self.cqvip,
                query_cn=query_cn,
                year_from=year_from,
                year_to=year_to,
                source_limit=source_limit,
            )
            logger.info("文献源返回: source=cqvip count=%s query=%s", len(per_source_results["cqvip"]), query_cn)
        if "crossref" in selected_sources and query_en:
            per_source_results["crossref"] = self.crossref.search(query_en, year_from, year_to, source_limit)
            logger.info("文献源返回: source=crossref count=%s query=%s", len(per_source_results["crossref"]), query_en)
        if "arxiv" in selected_sources and query_en:
            per_source_results["arxiv"] = self.arxiv.search(query_en, year_from, year_to, source_limit)
            logger.info("文献源返回: source=arxiv count=%s query=%s", len(per_source_results["arxiv"]), query_en)

        raw_results = []
        for source_name in selected_sources:
            raw_results.extend(per_source_results.get(source_name, []))

        deduped = deduplicate(raw_results)
        ranked = self._rank_results(
            deduped,
            keywords_cn=keywords_cn,
            keywords_en=keywords_en,
            year_from=year_from,
            year_to=year_to,
            library_scope=library_scope,
            min_citation_count=min_citation_count,
            prefer_high_impact=prefer_high_impact,
            open_access_only=open_access_only,
            quality_tags=quality_tags or [],
        )
        composed = self._compose_results_by_scope(
            ranked,
            library_scope=library_scope,
            limit=limit,
        )
        if library_scope == "all":
            composed = self._supplement_all_scope_source_diversity(
                composed=composed,
                raw_results=raw_results,
                keywords_cn=keywords_cn,
                keywords_en=keywords_en,
                year_from=year_from,
                year_to=year_to,
                limit=limit,
                prefer_high_impact=prefer_high_impact,
            )
        source_statuses = self._build_source_statuses(selected_sources, per_source_results)

        return {
            "query": query_en or query_cn,
            "search_mode": mode,
            "library_scope": library_scope,
            "selected_sources": selected_sources,
            "total_found": len(composed),
            "sources": {source: len(per_source_results.get(source, [])) for source in selected_sources},
            "source_statuses": source_statuses,
            "papers": [self._paper_to_dict(paper_info) for paper_info in composed],
        }

    def _resolve_sources(self, library_scope: str, sources: list[str] | None) -> list[str]:
        all_valid = {"pubmed", "openalex", "semantic_scholar", "cnki", "cqvip", "crossref", "arxiv"}
        if sources:
            valid = [s for s in sources if s in all_valid]
            if valid:
                return valid
        if library_scope == "cn":
            return ["cnki", "cqvip"]
        if library_scope == "en":
            return ["pubmed", "openalex", "semantic_scholar", "crossref", "arxiv"]
        return ["pubmed", "openalex", "semantic_scholar", "crossref", "arxiv", "cnki", "cqvip"]

    def _resolve_source_limit(self, *, limit: int, mode: str) -> int:
        if mode == "deep_research":
            return max(limit, 20)
        if mode == "literature_review":
            return max(limit, 15)
        return max(10, math.ceil(limit / 2))

    def _build_query(self, keywords: list[str]) -> str:
        """从关键词列表生成更接近学术搜索的布尔检索式。"""
        normalized = [kw.strip() for kw in keywords if kw.strip()]
        if not normalized:
            return ""
        exact_terms = normalized[:3]
        extended_terms = normalized[3:6]
        query_parts = [f'"{term}"' if " " in term else term for term in exact_terms]
        if extended_terms:
            query_parts.extend(extended_terms)
        if len(query_parts) == 1:
            return query_parts[0]
        return " AND ".join(query_parts)

    def _build_cn_query(self, keywords: list[str]) -> str:
        """将中文关键词拼成更适合中文数据库的检索词。"""
        normalized: list[str] = []
        seen: set[str] = set()
        generic_terms = {"研究", "现状", "进展", "应用", "分析", "介绍", "说明", "问题", "方法"}
        for keyword in keywords:
            cleaned = keyword.strip()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            normalized.append(cleaned)

        if not normalized:
            return ""

        primary = [kw for kw in normalized if kw not in generic_terms]
        secondary = [kw for kw in normalized if kw in generic_terms]
        ordered = primary + secondary
        return " ".join(ordered[:4])

    def _build_cn_query_fallbacks(self, query_cn: str) -> list[str]:
        tokens = [token for token in query_cn.split() if token]
        fallbacks = [query_cn]
        if len(tokens) >= 2:
            fallbacks.append(" ".join(tokens[:2]))
        if tokens:
            fallbacks.append(tokens[0])

        ordered: list[str] = []
        seen: set[str] = set()
        for candidate in fallbacks:
            candidate = candidate.strip()
            if candidate and candidate not in seen:
                seen.add(candidate)
                ordered.append(candidate)
        return ordered

    def _search_cn_source_with_fallbacks(
        self,
        client,
        *,
        query_cn: str,
        year_from: int,
        year_to: int,
        source_limit: int,
    ) -> list[PaperResult]:
        for candidate_query in self._build_cn_query_fallbacks(query_cn):
            results = client.search(candidate_query, year_from, year_to, source_limit)
            if results:
                if candidate_query != query_cn:
                    logger.info("中文源回退查询成功: source=%s original=%s fallback=%s count=%s",
                                client.__class__.__name__, query_cn, candidate_query, len(results))
                return results
            if getattr(client, "last_status", "") in {"gateway_timeout", "blocked", "error", "http_error"}:
                logger.info(
                    "中文源服务异常，停止回退查询: source=%s query=%s status=%s detail=%s",
                    client.__class__.__name__,
                    candidate_query,
                    getattr(client, "last_status", ""),
                    getattr(client, "last_detail", ""),
                )
                break
        return []

    def _rank_results(
        self,
        results: list[PaperResult],
        *,
        keywords_cn: list[str],
        keywords_en: list[str],
        year_from: int,
        year_to: int,
        library_scope: str,
        min_citation_count: int,
        prefer_high_impact: bool,
        open_access_only: bool = False,
        quality_tags: list[str] | None = None,
    ) -> list[dict]:
        all_keywords = [kw.lower() for kw in keywords_cn + keywords_en if kw.strip()]
        quality_tags = quality_tags or []
        scored: list[dict] = []

        for paper in results:
            # 宽松过滤：只要有标题就保留，不再硬性要求 venue（中文源 CSS 选择器易失效导致 venue 为空）
            if not paper.title:
                continue
            if paper.citation_count < min_citation_count:
                continue
            if open_access_only and not paper.is_open_access:
                continue

            language = self._detect_language(paper)
            if library_scope == "cn" and language != "cn":
                continue
            if library_scope == "en" and language != "en":
                continue

            relevance_score = self._estimate_relevance_score(paper, all_keywords)
            # 有明确主题词时，完全不命中的高引用文献不应进入结果集。
            if all_keywords and relevance_score <= 0:
                continue
            freshness_score = self._estimate_freshness_score(paper.year, year_from, year_to)
            impact_score = self._estimate_impact_score(paper.citation_count)
            quality_score = SOURCE_QUALITY_PRIOR.get(paper.source, 0.7)

            if prefer_high_impact:
                final_score = (
                    relevance_score * 0.34
                    + impact_score * 0.28
                    + freshness_score * 0.14
                    + quality_score * 0.24
                )
            else:
                final_score = (
                    relevance_score * 0.45
                    + impact_score * 0.18
                    + freshness_score * 0.17
                    + quality_score * 0.20
                )

            quality_flags = self._build_quality_flags(paper, language)
            quality_inference = self._build_quality_inference(paper)
            if quality_tags:
                normalized_tags = {tag.strip().lower() for tag in quality_tags if tag and tag.strip()}
                if normalized_tags and not normalized_tags.issubset(set(quality_inference)):
                    continue
            why_selected = self._build_selection_reason(
                paper=paper,
                relevance_score=relevance_score,
                freshness_score=freshness_score,
                impact_score=impact_score,
                quality_flags=quality_flags,
            )

            scored.append({
                "paper": paper,
                "language": language,
                "relevance_score": round(relevance_score, 4),
                "freshness_score": round(freshness_score, 4),
                "impact_score": round(impact_score, 4),
                "quality_score": round(quality_score, 4),
                "final_score": round(final_score, 4),
                "quality_flags": quality_flags,
                "quality_inference": quality_inference,
                "why_selected": why_selected,
            })

        scored.sort(
            key=lambda item: (
                item["final_score"],
                item["relevance_score"],
                item["impact_score"],
                item["freshness_score"],
            ),
            reverse=True,
        )
        return scored

    def _compose_results_by_scope(
        self,
        ranked: list[dict],
        *,
        library_scope: str,
        limit: int,
    ) -> list[dict]:
        """按文献范围重组结果集。

        规则：
        - all: 中英文双向保底各至少 3 篇，再按总分补齐。
        - cn: 仅返回中文文献。
        - en: 仅返回英文文献。
        """
        cn_results = [item for item in ranked if item.get("language") == "cn"]
        en_results = [item for item in ranked if item.get("language") == "en"]

        if library_scope == "cn":
            return cn_results[:limit]
        if library_scope == "en":
            return en_results[:limit]

        selected: list[dict] = []
        seen_keys: set[str] = set()

        def add_items(items: list[dict], max_count: int | None = None):
            added = 0
            for item in items:
                paper = item.get("paper")
                if not paper:
                    continue
                key = (paper.doi or paper.url or paper.title or "").strip().lower()
                if not key or key in seen_keys:
                    continue
                seen_keys.add(key)
                selected.append(item)
                added += 1
                if len(selected) >= limit:
                    return
                if max_count is not None and added >= max_count:
                    return

        # all 模式下优先保证：
        # 1. 中文至少 3 篇
        # 2. 有结果的源尽量各保留 1 篇
        # 3. 再补英文与总体高分结果
        add_items(cn_results, max_count=3)
        available_sources = []
        for source in ("cnki", "cqvip", "semantic_scholar", "openalex", "crossref", "arxiv"):
            if source == "pubmed":
                continue
            if any(item.get("paper") and item["paper"].source == source for item in ranked):
                available_sources.append(source)
        if any(item.get("paper") and item["paper"].source == "pubmed" for item in ranked):
            available_sources.insert(0, "pubmed")
        for source in available_sources:
            if len(selected) >= limit:
                break
            source_items = [item for item in ranked if item.get("paper") and item["paper"].source == source]
            add_items(source_items, max_count=1)
        add_items(en_results, max_count=3)
        if len(selected) < limit:
            add_items(ranked)
        return selected[:limit]

    def _supplement_all_scope_source_diversity(
        self,
        *,
        composed: list[dict],
        raw_results: list[PaperResult],
        keywords_cn: list[str],
        keywords_en: list[str],
        year_from: int,
        year_to: int,
        limit: int,
        prefer_high_impact: bool,
    ) -> list[dict]:
        """在所有文献模式下，用原始结果补足被严格过滤挤掉的来源。"""
        if limit <= 0:
            return []
        if not composed:
            return composed[:limit]

        selected = list(composed[:limit])
        seen_keys = {
            (item["paper"].doi or item["paper"].url or item["paper"].title or "").strip().lower()
            for item in selected
            if item.get("paper")
        }
        selected_sources = {
            item["paper"].source
            for item in selected
            if item.get("paper") and item["paper"].source
        }
        raw_sources = []
        for paper in raw_results:
            if paper.source and paper.source not in raw_sources:
                raw_sources.append(paper.source)

        if len(selected_sources) >= min(2, len(raw_sources)):
            return selected[:limit]

        for source in raw_sources:
            if source in selected_sources:
                continue
            candidates = [paper for paper in raw_results if paper.source == source]
            ranked_candidates = self._rank_results(
                candidates,
                keywords_cn=keywords_cn,
                keywords_en=keywords_en,
                year_from=year_from,
                year_to=year_to,
                library_scope="all",
                min_citation_count=0,
                prefer_high_impact=prefer_high_impact,
                open_access_only=False,
                quality_tags=[],
            )
            for item in ranked_candidates:
                paper = item.get("paper")
                if not paper:
                    continue
                key = (paper.doi or paper.url or paper.title or "").strip().lower()
                if not key or key in seen_keys:
                    continue
                item["why_selected"] = f"{item.get('why_selected') or '作为补充证据纳入结果集'}；来源多样性补充"
                item["quality_flags"] = list(dict.fromkeys((item.get("quality_flags") or []) + ["来源补充"]))
                if len(selected) < limit:
                    selected.append(item)
                    seen_keys.add(key)
                    selected_sources.add(source)
                    break

                # 结果已满时，用缺失来源替换一个重复来源的低分结果，避免 all 模式被单一来源占满。
                source_counts: dict[str, int] = {}
                for selected_item in selected:
                    selected_paper = selected_item.get("paper")
                    if selected_paper and selected_paper.source:
                        source_counts[selected_paper.source] = source_counts.get(selected_paper.source, 0) + 1
                replaceable_indices = [
                    index
                    for index, selected_item in enumerate(selected)
                    if selected_item.get("paper")
                    and source_counts.get(selected_item["paper"].source, 0) > 1
                ]
                if not replaceable_indices:
                    continue
                replacement_index = min(
                    replaceable_indices,
                    key=lambda index: (
                        selected[index].get("final_score", 0),
                        selected[index].get("relevance_score", 0),
                    ),
                )
                old_paper = selected[replacement_index].get("paper")
                if old_paper:
                    old_key = (old_paper.doi or old_paper.url or old_paper.title or "").strip().lower()
                    seen_keys.discard(old_key)
                selected[replacement_index] = item
                seen_keys.add(key)
                selected_sources.add(source)
                break
            if len(selected_sources) >= min(2, len(raw_sources)):
                break

        return selected[:limit]

    def _build_source_statuses(self, selected_sources: list[str], per_source_results: dict[str, list[PaperResult]]) -> dict[str, dict]:
        client_map = {
            "openalex": self.openalex,
            "semantic_scholar": self.semantic,
            "pubmed": self.pubmed,
            "cnki": self.cnki,
            "cqvip": self.cqvip,
            "crossref": self.crossref,
            "arxiv": self.arxiv,
        }
        statuses: dict[str, dict] = {}
        for source in selected_sources:
            client = client_map.get(source)
            statuses[source] = {
                "status": getattr(client, "last_status", "unknown") if client else "unknown",
                "count": len(per_source_results.get(source, [])),
                "detail": getattr(client, "last_detail", "") if client else "",
            }
        return statuses

    def _detect_language(self, paper: PaperResult) -> str:
        text = f"{paper.title or ''} {paper.abstract or ''}"
        if re.search(r"[\u4e00-\u9fff]", text):
            return "cn"
        return "en"

    def _estimate_relevance_score(self, paper: PaperResult, keywords: list[str]) -> float:
        text = f"{paper.title or ''} {paper.abstract or ''}".lower()
        title = (paper.title or "").lower()
        if not keywords:
            return 0.5
        hit_score = 0.0
        for kw in keywords:
            kw = kw.strip().lower()
            if not kw:
                continue
            if kw in text:
                hit_score += 1.0
                if title and kw in title:
                    hit_score += 0.5
                continue

            fragment_hits = 0
            for fragment in self._keyword_fragments(kw):
                if fragment in text:
                    fragment_hits += 1
                    if fragment in title:
                        hit_score += 0.1
            if fragment_hits:
                hit_score += min(0.75, fragment_hits * 0.25)
        return min(1.0, hit_score / max(2, len(keywords)))

    def _keyword_fragments(self, keyword: str) -> list[str]:
        """把长查询拆成可用于弱相关匹配的片段，避免完整句不命中导致误删。"""
        fragments: set[str] = set()
        for word in re.findall(r"[a-z0-9][a-z0-9-]{2,}", keyword.lower()):
            if word not in {"and", "the", "for", "with", "from", "into"}:
                fragments.add(word)

        chinese_text = "".join(re.findall(r"[\u4e00-\u9fff]+", keyword))
        for size in range(4, min(8, len(chinese_text)) + 1):
            for index in range(0, len(chinese_text) - size + 1):
                fragments.add(chinese_text[index:index + size])
        return sorted(fragments, key=len, reverse=True)

    def _estimate_freshness_score(self, year: int | None, year_from: int, year_to: int) -> float:
        if not year:
            return 0.3
        if year_to <= year_from:
            return 0.5
        ratio = (year - year_from) / (year_to - year_from)
        return max(0.0, min(1.0, ratio))

    def _estimate_impact_score(self, citation_count: int) -> float:
        if citation_count <= 0:
            return 0.12
        return min(1.0, math.log1p(citation_count) / math.log(301))

    def _build_quality_flags(self, paper: PaperResult, language: str) -> list[str]:
        flags = []
        if language == "cn":
            flags.append("中文库")
        else:
            flags.append("英文库")
        if paper.citation_count >= 100:
            flags.append("高被引")
        elif paper.citation_count >= 30:
            flags.append("中高影响")
        if paper.source == "cnki":
            flags.append("知网")
        elif paper.source == "cqvip":
            flags.append("维普")
        elif paper.source == "pubmed":
            flags.append("PubMed")
        elif paper.source == "semantic_scholar":
            flags.append("Semantic Scholar")
        elif paper.source == "openalex":
            flags.append("OpenAlex")
        elif paper.source == "crossref":
            flags.append("Crossref")
        elif paper.source == "arxiv":
            flags.append("arXiv")
        if paper.is_open_access:
            flags.append("开放获取")
        if paper.year and paper.year >= 2024:
            flags.append("近两年")
        return flags

    def _build_quality_inference(self, paper: PaperResult) -> list[str]:
        text = " ".join(filter(None, [paper.venue or "", paper.title or "", paper.url or ""])).lower()
        tags: list[str] = []
        if "ieee" in text:
            tags.append("ieee")
        if "acm" in text or "association for computing machinery" in text:
            tags.append("acm")
        if paper.source == "pubmed":
            tags.append("pubmed")
        if paper.is_open_access:
            tags.append("open_access")
        # 第一版只做保守推断：明确命中关键词时才打标签
        if "ei" in text and "ieee" not in text:
            tags.append("ei")
        if "jcr" in text:
            tags.append("jcr")
        if "中科院" in text:
            tags.append("cas")
        if "北大核心" in text or "中文核心" in text:
            tags.append("pku_core")
        return list(dict.fromkeys(tags))

    def _build_selection_reason(
        self,
        *,
        paper: PaperResult,
        relevance_score: float,
        freshness_score: float,
        impact_score: float,
        quality_flags: list[str],
    ) -> str:
        reasons = []
        if relevance_score >= 0.8:
            reasons.append("与检索主题高度相关")
        elif relevance_score >= 0.55:
            reasons.append("与检索主题较相关")
        if impact_score >= 0.65:
            reasons.append("引用影响力较高")
        if freshness_score >= 0.7:
            reasons.append("发表时间较新")
        if "知网" in quality_flags or "Semantic Scholar" in quality_flags or "Crossref" in quality_flags:
            reasons.append("来源可靠")
        return "；".join(reasons[:3]) or "作为补充证据纳入结果集"

    def _paper_to_dict(self, paper_info: dict) -> dict:
        paper = paper_info["paper"]
        return {
            "title": paper.title,
            "authors": paper.authors,
            "year": paper.year,
            "venue": paper.venue,
            "doi": paper.doi,
            "abstract": paper.abstract,
            "url": paper.url,
            "citation_count": paper.citation_count,
            "source": paper.source,
            "is_open_access": paper.is_open_access,
            "language": paper_info["language"],
            "relevance_score": paper_info["relevance_score"],
            "freshness_score": paper_info["freshness_score"],
            "impact_score": paper_info["impact_score"],
            "quality_score": paper_info["quality_score"],
            "final_score": paper_info["final_score"],
            "quality_flags": paper_info["quality_flags"],
            "quality_inference": paper_info.get("quality_inference", []),
            "why_selected": paper_info["why_selected"],
        }


literature_search_agent = LiteratureSearchAgent()
