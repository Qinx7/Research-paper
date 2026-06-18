"""文献知识图谱数据构建服务

基于项目 Paper 数据构建多种图谱视图：
- network: 力导向关系网络（关键词共现 + 作者合作）
- timeline: 时间线散点图（年份 × 引用数 × 影响力）
- clusters: 主题聚类（关键词分组层级）
- impact: 引用排行（高引论文 + 期刊分布）
"""
import json
import math
import logging
import re
from collections import Counter

from ..models.paper import Paper

logger = logging.getLogger(__name__)

# ============================================================
# 常量
# ============================================================

# 常见停用词（中文关键词提取时过滤）
CN_STOP_WORDS = frozenset({
    "研究", "本文", "方法", "基于", "提出", "分析", "进行", "用于",
    "一个", "一种", "可以", "以及", "通过", "使用", "及其", "结果",
    "问题", "相关", "不同", "实现", "应用", "主要", "采用", "利用",
    "改进", "提高", "结合", "面对", "新的", "现有", "针对",
})

# 英文停用词
EN_STOP_WORDS = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to",
    "for", "of", "with", "by", "from", "as", "is", "was", "are",
    "were", "been", "be", "have", "has", "had", "do", "does", "did",
    "will", "would", "could", "should", "may", "might", "can", "shall",
    "this", "that", "these", "those", "it", "its", "we", "they",
    "based", "using", "used", "proposed", "novel", "approach", "method",
    "paper", "research", "study", "result", "experiment", "analysis",
})


# ============================================================
# 关键词提取与图谱构建
# ============================================================

def _parse_keywords(existing) -> list[str]:
    """把数据库中的关键词字段安全解析成字符串列表。"""
    if not existing:
        return []
    try:
        keywords = json.loads(existing) if isinstance(existing, str) else existing
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(keywords, list):
        return []
    return [
        str(keyword).strip()
        for keyword in keywords
        if str(keyword).strip()
    ][:5]


def _collect_existing_keywords(papers: list[Paper]) -> tuple[dict[str, list[str]], list[Paper]]:
    """优先收集已持久化关键词，避免无 LLM 配置时退回到低质量标题分词。"""
    keywords_map: dict[str, list[str]] = {}
    missing: list[Paper] = []
    for paper in papers:
        keywords = _parse_keywords(getattr(paper, "keywords", None))
        if keywords:
            keywords_map[str(paper.id)] = keywords
        else:
            missing.append(paper)
    return keywords_map, missing


def _ensure_keywords(papers: list[Paper], api_key: str, base_url: str, model: str) -> dict[str, list[str]]:
    """确保每篇论文都有提取好的关键词。

    已有关键词的论文直接读取，缺失的批量调用 LLM 提取后持久化。
    返回 {paper_id: [keyword1, keyword2, ...]}
    """
    # 分离已有和缺失的
    result: dict[str, list[str]] = {}
    missing: list[tuple[str, str, str]] = []  # (paper_id, title, abstract)

    for p in papers:
        pid = str(p.id)
        kw = _parse_keywords(getattr(p, "keywords", None))
        if kw:
            result[pid] = kw
            continue
        missing.append((pid, p.title or "", p.abstract or ""))

    if not missing:
        return result

    # 批量调 LLM 提取关键词
    extracted = _llm_extract_keywords(missing, api_key, base_url, model)

    # 写回 DB 并合并结果
    from ..core.database import SessionLocal
    db = SessionLocal()
    try:
        for paper_id, keywords in extracted.items():
            result[paper_id] = keywords
            p = db.query(Paper).filter(Paper.id == paper_id).first()
            if p:
                p.keywords = json.dumps(keywords, ensure_ascii=False)
        db.commit()
    except Exception:
        logger.warning("关键词持久化失败", exc_info=True)
    finally:
        db.close()

    return result


def _llm_extract_keywords(
    papers: list[tuple[str, str, str]],
    api_key: str,
    base_url: str,
    model: str,
) -> dict[str, list[str]]:
    """调用 LLM 提取论文关键词列表。"""
    import httpx

    if not api_key or not papers:
        return {}

    # 构建批量请求
    paper_texts = []
    for pid, title, abstract in papers:
        text = title
        if abstract and len(abstract) > 20:
            text += " | " + abstract[:200]
        paper_texts.append(f"[{pid}] {text}")

    papers_str = "\n".join(paper_texts[:30])  # 一次最多处理 30 篇

    system_prompt = """你是学术文献分析专家。为每篇论文提取 3-5 个关键词。

规则：
- 关键词应为专业术语、技术名词、研究方法或应用领域
- 中英文均可，保留原文语言
- 排除过于宽泛的词（如"研究""方法"）
- 每行格式：[论文ID] 关键词1, 关键词2, 关键词3

示例输出：
[paper_1] 大语言模型, 文本生成, Transformer
[paper_2] knowledge graph, entity linking, NLP

只返回关键词列表，不要其他内容。"""

    try:
        response = httpx.post(
            f"{base_url}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"为以下论文提取关键词：\n\n{papers_str}"},
                ],
                "temperature": 0.3,
                "max_tokens": 1500,
            },
            timeout=120.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]

        # 解析输出
        result: dict[str, list[str]] = {}
        for line in content.strip().split("\n"):
            line = line.strip()
            if not line or "[" not in line:
                continue
            try:
                pid_start = line.index("[") + 1
                pid_end = line.index("]")
                pid = line[pid_start:pid_end].strip()
                kw_str = line[pid_end + 1:].strip().lstrip(":").strip()
                keywords = [k.strip() for k in kw_str.split(",") if k.strip()]
                keywords = [k for k in keywords if k.lower() not in EN_STOP_WORDS and k not in CN_STOP_WORDS]
                if keywords:
                    result[pid] = keywords[:5]
            except ValueError:
                continue

        return result
    except Exception:
        logger.warning("LLM 关键词提取失败，使用 title 分词 fallback", exc_info=True)
        return _fallback_keywords(papers)


def _fallback_keywords(papers: list[tuple[str, str, str]]) -> dict[str, list[str]]:
    """不使用 LLM 时的后备方案：从标题提取关键词。"""
    result: dict[str, list[str]] = {}
    for pid, title, _abstract in papers:
        # 简单分词：按空格和常见分隔符拆分
        words = re.split(r"[,;，；、\s]+", title)
        keywords = []
        for w in words:
            w = w.strip().strip(".").strip("。")
            if len(w) >= 2 and w.lower() not in EN_STOP_WORDS and w not in CN_STOP_WORDS:
                keywords.append(w)
        result[pid] = keywords[:5]
    return result


# ============================================================
# 图谱数据构建
# ============================================================

def _build_co_authors(authors_str: str) -> list[str]:
    """解析作者字段，返回独立作者列表。"""
    if not authors_str:
        return []
    # 支持多种分隔符
    parts = re.split(r"[,;，；、]\s*", authors_str.strip())
    return [p.strip() for p in parts if p.strip() and len(p.strip()) > 1]


def build_network_graph(papers: list[Paper], keywords_map: dict[str, list[str]]) -> dict:
    """构建力导向关系网络数据。

    Returns:
        {nodes: [{id, name, type, year, citations, ...}],
         edges: [{source, target, relation}],
         categories: [{name, itemStyle}]}
    """
    nodes: list[dict] = []
    edges: list[dict] = []
    node_ids: set[str] = set()

    # 论文节点
    for p in papers:
        pid = str(p.id)
        if pid in node_ids:
            continue
        node_ids.add(pid)
        nodes.append({
            "id": pid,
            "name": (p.title or "未命名")[:50],
            "type": "paper",
            "year": p.year,
            "citations": p.citation_count or 0,
            "venue": p.venue,
            "symbolSize": max(8, min(40, math.sqrt((p.citation_count or 0) + 1) * 6)),
        })

    # 关键词节点 + 边
    keyword_paper_map: dict[str, set[str]] = {}
    for paper_id, kws in keywords_map.items():
        if paper_id not in node_ids:
            continue
        for kw in kws:
            kw_lower = kw.lower()
            if kw_lower not in keyword_paper_map:
                keyword_paper_map[kw_lower] = set()
            keyword_paper_map[kw_lower].add(paper_id)

    for kw, paper_set in keyword_paper_map.items():
        kw_id = f"kw_{kw}"
        if kw_id not in node_ids:
            node_ids.add(kw_id)
            nodes.append({
                "id": kw_id,
                "name": kw,
                "type": "keyword",
                "symbolSize": max(6, min(24, len(paper_set) * 4)),
            })
        for pid in paper_set:
            edges.append({"source": pid, "target": kw_id, "relation": "has_keyword"})

    # 作者节点 + 边
    author_paper_map: dict[str, set[str]] = {}
    for p in papers:
        authors = _build_co_authors(p.authors)
        for author in authors:
            author_lower = author.lower()
            if author_lower not in author_paper_map:
                author_paper_map[author_lower] = set()
            author_paper_map[author_lower].add(str(p.id))

    # 只保留出现 2 次以上的作者（避免过多孤立节点）
    for author, paper_set in author_paper_map.items():
        if len(paper_set) < 2:
            continue
        author_id = f"au_{author}"
        if author_id not in node_ids:
            node_ids.add(author_id)
            nodes.append({
                "id": author_id,
                "name": author,
                "type": "author",
                "symbolSize": max(10, min(30, len(paper_set) * 5)),
            })
        for pid in paper_set:
            if pid in node_ids:
                edges.append({"source": pid, "target": author_id, "relation": "authored_by"})

    # 分类定义
    categories = [
        {"name": "论文", "itemStyle": {"color": "#5470c6"}},
        {"name": "关键词", "itemStyle": {"color": "#91cc75"}},
        {"name": "作者", "itemStyle": {"color": "#fac858"}},
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "categories": categories,
    }


def build_timeline(papers: list[Paper]) -> dict:
    """构建时间线数据：按年份组织论文。

    Returns:
        {series: [{year, count, papers: [{id, name, citations, venue}]}]}
    """
    year_data: dict[int, list[dict]] = {}
    for p in papers:
        year = p.year
        if not year:
            continue
        if year not in year_data:
            year_data[year] = []
        year_data[year].append({
            "id": str(p.id),
            "name": (p.title or "未命名")[:60],
            "citations": p.citation_count or 0,
            "venue": p.venue,
            "value": max(5, math.sqrt((p.citation_count or 0) + 1) * 8),
        })

    if not year_data:
        return {"series": [], "year_range": []}

    series = []
    for year in sorted(year_data.keys()):
        papers_in_year = year_data[year]
        series.append({
            "year": year,
            "count": len(papers_in_year),
            "papers": papers_in_year,
        })

    return {"series": series, "year_range": [min(year_data.keys()), max(year_data.keys())]}


def build_clusters(papers: list[Paper], keywords_map: dict[str, list[str]]) -> dict:
    """构建主题聚类数据：按关键词分组。

    Returns:
        {clusters: [{name, value, papers: [...]}]}
    """
    # 统计关键词频次，取 Top 20
    kw_counter: Counter = Counter()
    kw_papers: dict[str, list[str]] = {}
    for pid, kws in keywords_map.items():
        for kw in kws:
            kw_counter[kw] += 1
            if kw not in kw_papers:
                kw_papers[kw] = []
            kw_papers[kw].append(pid)

    top_kws = kw_counter.most_common(20)

    # 为每个关键词找对应论文
    pid_to_paper: dict[str, Paper] = {str(p.id): p for p in papers}
    clusters = []
    for kw, count in top_kws:
        pids = kw_papers.get(kw, [])
        cluster_papers = []
        for pid in pids[:5]:  # 每个聚类最多 5 篇
            p = pid_to_paper.get(pid)
            if p:
                cluster_papers.append({
                    "id": str(p.id),
                    "name": (p.title or "未命名")[:50],
                    "citations": p.citation_count or 0,
                })
        clusters.append({
            "name": kw,
            "value": count,
            "papers": cluster_papers,
        })

    return {"clusters": clusters}


def build_impact(papers: list[Paper]) -> dict:
    """构建引影响力排行数据。

    Returns:
        {top_papers: [...], venue_distribution: [...], citation_range: [min, max]}
    """
    sorted_papers = sorted(papers, key=lambda p: p.citation_count or 0, reverse=True)

    top_papers = []
    for p in sorted_papers[:15]:
        top_papers.append({
            "id": str(p.id),
            "name": (p.title or "未命名")[:60],
            "citations": p.citation_count or 0,
            "venue": p.venue,
            "year": p.year,
            "authors": (p.authors or "")[:50],
        })

    # 期刊分布
    venue_counter: Counter = Counter()
    for p in papers:
        if p.venue:
            venue_counter[p.venue] += 1
    venue_distribution = [
        {"name": venue, "value": count}
        for venue, count in venue_counter.most_common(10)
    ]

    citations = [p.citation_count or 0 for p in papers if p.citation_count]
    citation_range = [min(citations) if citations else 0, max(citations) if citations else 0]

    return {
        "top_papers": top_papers,
        "venue_distribution": venue_distribution,
        "citation_range": citation_range,
    }


# ============================================================
# 主入口
# ============================================================

def build_knowledge_graph(
    papers: list[Paper],
    api_key: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
) -> dict:
    """构建完整图谱数据，包含全部 4 种视图。

    Returns:
        {network, timeline, clusters, impact, stats}
    """
    if not papers:
        return {
            "network": {"nodes": [], "edges": [], "categories": []},
            "timeline": {"series": [], "year_range": []},
            "clusters": {"clusters": []},
            "impact": {"top_papers": [], "venue_distribution": [], "citation_range": [0, 0]},
            "stats": {"total_papers": 0, "year_range": [], "total_citations": 0, "keywords_count": 0},
        }

    # 关键词提取（有则读 DB，无则调 LLM）
    keywords_map: dict[str, list[str]] = {}
    if api_key and base_url and model:
        try:
            keywords_map = _ensure_keywords(papers, api_key, base_url, model)
        except Exception:
            logger.warning("关键词提取失败，使用 fallback", exc_info=True)
            fallback_input = [(str(p.id), p.title or "", p.abstract or "") for p in papers]
            keywords_map = _fallback_keywords(fallback_input)
    else:
        keywords_map, missing_papers = _collect_existing_keywords(papers)
        fallback_input = [(str(p.id), p.title or "", p.abstract or "") for p in missing_papers]
        keywords_map.update(_fallback_keywords(fallback_input))

    # 构建 4 种视图
    network = build_network_graph(papers, keywords_map)
    timeline = build_timeline(papers)
    clusters = build_clusters(papers, keywords_map)
    impact = build_impact(papers)

    # 统计
    years = [p.year for p in papers if p.year]
    total_citations = sum(p.citation_count or 0 for p in papers)

    return {
        "network": network,
        "timeline": timeline,
        "clusters": clusters,
        "impact": impact,
        "stats": {
            "total_papers": len(papers),
            "year_range": [min(years) if years else 0, max(years) if years else 0],
            "total_citations": total_citations,
            "keywords_count": sum(1 for kws in keywords_map.values() if kws),
        },
    }
