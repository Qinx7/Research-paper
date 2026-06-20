"""首页文献检索 workflow：封装检索、总结和来源诊断。"""
from collections import Counter
from typing import Any

from ..literature_search_agent import literature_search_agent
from ..orchestration import AgentNode, AgentNodeResult, AgentWorkflowRunner, AgentWorkflowState
from ...services.agent_workflow_record_service import AgentWorkflowDbRecorder
from ...services.authority_filter_service import summarize_authority_hits


class ExternalLiteratureSearchNode(AgentNode):
    """调用现有多源文献检索 Agent，保持原检索逻辑不迁移。"""

    name = "external_literature_search"
    description = "调用现有文献检索 Agent 获取本次检索结果。"

    def __init__(self, search_agent=None):
        self.search_agent = search_agent or literature_search_agent

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        payload = state.input
        result = self.search_agent.search_by_requirement(
            keywords_cn=payload.get("keywords_cn", []),
            keywords_en=payload.get("keywords_en", []),
            year_from=payload.get("year_from", 2020),
            year_to=payload.get("year_to", 2026),
            limit=payload.get("limit", 30),
            mode=payload.get("mode", "quick_search"),
            library_scope=payload.get("library_scope", "all"),
            sources=payload.get("sources"),
            min_citation_count=payload.get("min_citation_count", 0),
            prefer_high_impact=payload.get("prefer_high_impact", False),
            open_access_only=payload.get("open_access_only", False),
            quality_tags=payload.get("quality_tags", []),
        )
        papers = result.get("papers", [])
        return AgentNodeResult.success(
            data_delta={"search_result": result},
            evidence_delta=papers,
            messages=[f"检索返回 {len(papers)} 篇文献"],
            metadata={"paper_count": len(papers)},
        )


class SearchSynthesisNode(AgentNode):
    """只基于本次返回文献生成结构化总结，避免引入未检索证据。"""

    name = "search_synthesis"
    description = "生成本次检索结果总结分析。"

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        search_result = state.data.get("search_result", {})
        summary = build_search_summary(
            papers=search_result.get("papers", []),
            query=search_result.get("query", ""),
            library_scope=search_result.get("library_scope", state.input.get("library_scope", "all")),
        )
        return AgentNodeResult.success(
            data_delta={"search_summary": summary},
            messages=["已生成本次检索总结"],
            metadata={"summary_status": summary["status"]},
        )


class SearchDiagnosticsNode(AgentNode):
    """把各来源状态转换为前端可读诊断。"""

    name = "search_diagnostics"
    description = "生成来源状态诊断。"

    def run(self, state: AgentWorkflowState) -> AgentNodeResult:
        search_result = state.data.get("search_result", {})
        diagnostics = build_search_diagnostics(search_result.get("source_statuses", {}))
        return AgentNodeResult.success(
            data_delta={"search_diagnostics": diagnostics},
            messages=["已生成来源诊断"],
            metadata={"source_count": len(diagnostics["source_notes"])},
        )


def run_literature_search_workflow(
    *,
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
    search_task_id: str | None = None,
    user_id: str | None = None,
    project_id: str | None = None,
    search_agent=None,
    record_db=None,
) -> dict[str, Any]:
    """运行首页文献检索 workflow，并返回兼容原接口的结果。"""
    state = AgentWorkflowState(
        workflow_name="home_literature_search",
        user_id=user_id,
        project_id=project_id,
        search_task_id=search_task_id,
        input={
            "keywords_cn": keywords_cn,
            "keywords_en": keywords_en,
            "year_from": year_from,
            "year_to": year_to,
            "limit": limit,
            "mode": mode,
            "library_scope": library_scope,
            "sources": sources,
            "min_citation_count": min_citation_count,
            "prefer_high_impact": prefer_high_impact,
            "open_access_only": open_access_only,
            "quality_tags": quality_tags or [],
        },
    )
    recorder = AgentWorkflowDbRecorder(record_db) if record_db is not None else None
    runner = AgentWorkflowRunner(
        [
            ExternalLiteratureSearchNode(search_agent=search_agent),
            SearchSynthesisNode(),
            SearchDiagnosticsNode(),
        ],
        recorder=recorder,
    )
    workflow_result = runner.run(state)
    search_result = dict(workflow_result.state.data.get("search_result", {}))
    search_result["search_summary"] = workflow_result.state.data.get(
        "search_summary",
        build_search_summary(papers=search_result.get("papers", []), query=search_result.get("query", ""), library_scope=library_scope),
    )
    search_result["search_diagnostics"] = workflow_result.state.data.get(
        "search_diagnostics",
        build_search_diagnostics(search_result.get("source_statuses", {})),
    )
    search_result["workflow_status"] = workflow_result.state.status
    persisted_run = getattr(recorder, "run", None) if recorder else None
    search_result["workflow_run_id"] = str(getattr(persisted_run, "id", None) or workflow_result.state.run_id)
    search_result["workflow_messages"] = workflow_result.state.messages
    return search_result


def build_search_summary(*, papers: list[dict], query: str, library_scope: str) -> dict[str, Any]:
    """从本次检索结果中提取可解释摘要，不补充外部知识。"""
    if not papers:
        return {
            "status": "insufficient",
            "overview": "暂无相关文献。本次检索没有返回可用于总结分析的文献依据。",
            "authority_summary": summarize_authority_hits([]),
            "representative_papers": [],
            "main_methods": [],
            "research_trends": [],
            "research_gaps": ["当前检索结果不足，无法形成可靠综述。"],
            "suggested_queries": _suggest_queries(query=query, library_scope=library_scope),
            "warnings": ["本次检索结果不足，以下分析不能替代文献综述。"],
        }

    years = [paper.get("year") for paper in papers if isinstance(paper.get("year"), int)]
    sources = Counter(str(paper.get("source") or "unknown") for paper in papers)
    languages = Counter(str(paper.get("language") or "unknown") for paper in papers)
    year_text = f"{min(years)}-{max(years)} 年" if years else "年份未知"
    source_text = "、".join(f"{source} {count} 篇" for source, count in sources.most_common(4))
    language_text = "、".join(f"{_language_label(language)} {count} 篇" for language, count in languages.most_common())
    authority_summary = summarize_authority_hits(papers)

    representative = [
        {
            "title": paper.get("title") or "未命名文献",
            "year": paper.get("year"),
            "source": paper.get("source"),
            "reason": paper.get("why_selected") or _abstract_excerpt(paper),
        }
        for paper in _top_papers(papers, limit=3)
    ]

    return {
        "status": "ready" if len(papers) >= 2 else "insufficient",
        "overview": f"本次检索共返回 {len(papers)} 篇文献，时间范围为 {year_text}，来源分布为 {source_text or '暂无来源统计'}，语种分布为 {language_text or '未知'}。",
        "authority_summary": authority_summary,
        "representative_papers": representative,
        "main_methods": _infer_methods(papers),
        "research_trends": _infer_trends(papers, years),
        "research_gaps": _infer_gaps(papers),
        "suggested_queries": _suggest_queries(query=query, library_scope=library_scope),
        "warnings": [] if len(papers) >= 2 else ["本次检索结果不足，结论可靠性有限。"],
    }


def build_search_diagnostics(source_statuses: dict[str, dict]) -> dict[str, Any]:
    """生成来源状态诊断，供首页直接展示或后续任务记录使用。"""
    source_notes = {
        source: _source_status_note(info)
        for source, info in (source_statuses or {}).items()
    }
    failed_sources = [
        source
        for source, info in (source_statuses or {}).items()
        if str(info.get("status")) in {"rate_limited", "gateway_timeout", "blocked", "error", "http_error"}
    ]
    return {
        "source_notes": source_notes,
        "failed_sources": failed_sources,
        "has_failures": bool(failed_sources),
        "overview": _build_source_overview(source_statuses or {}),
    }


def _top_papers(papers: list[dict], limit: int) -> list[dict]:
    return sorted(
        papers,
        key=lambda paper: (
            _safe_float(paper.get("final_score")),
            _safe_int(paper.get("citation_count")),
            _safe_int(paper.get("year")),
        ),
        reverse=True,
    )[:limit]


def _infer_methods(papers: list[dict]) -> list[str]:
    method_keywords = {
        "实验": "实验研究",
        "问卷": "问卷调查",
        "访谈": "访谈研究",
        "case study": "案例研究",
        "survey": "调查研究",
        "experiment": "实验研究",
        "review": "综述研究",
        "模型": "模型构建",
        "model": "模型构建",
    }
    found: list[str] = []
    for paper in papers:
        text = f"{paper.get('title') or ''} {paper.get('abstract') or ''}".lower()
        for keyword, label in method_keywords.items():
            if keyword.lower() in text and label not in found:
                found.append(label)
    return found[:5] or ["本次返回文献的摘要信息不足，暂不能稳定判断研究方法。"]


def _infer_trends(papers: list[dict], years: list[int]) -> list[str]:
    trends: list[str] = []
    recent_count = sum(1 for year in years if year >= 2024)
    if recent_count:
        trends.append(f"近两年文献 {recent_count} 篇，可优先关注最新研究进展。")
    if any("大语言模型" in f"{paper.get('title') or ''}{paper.get('abstract') or ''}" or "large language model" in f"{paper.get('title') or ''}{paper.get('abstract') or ''}".lower() for paper in papers):
        trends.append("返回文献中出现大语言模型相关主题，可围绕具体应用场景继续细化检索。")
    return trends[:4] or ["本次检索结果数量有限，暂不提取趋势性结论。"]


def _infer_gaps(papers: list[dict]) -> list[str]:
    gaps: list[str] = []
    no_abstract_count = sum(1 for paper in papers if not paper.get("abstract"))
    if no_abstract_count:
        gaps.append(f"{no_abstract_count} 篇文献缺少摘要，建议打开来源链接核验研究内容。")
    if len(papers) < 5:
        gaps.append("本次返回文献少于 5 篇，建议扩展关键词或切换文献范围。")
    return gaps[:4] or ["可继续比较不同来源、语种和年份的研究差异，寻找更具体的研究空白。"]


def _suggest_queries(*, query: str, library_scope: str) -> list[str]:
    base = query.strip() or "当前主题"
    suggestions = [f"{base} 综述", f"{base} 实证研究"]
    if library_scope != "cn":
        suggestions.append(f"{base} systematic review")
    if library_scope != "en":
        suggestions.append(f"{base} 中文核心")
    return suggestions[:4]


def _source_status_note(info: dict) -> str:
    status = str(info.get("status") or "unknown")
    count = _safe_int(info.get("count"))
    if status == "ok":
        return f"已返回 {count} 条"
    if status == "rate_limited":
        return "当前限流，建议稍后重试"
    if status == "gateway_timeout":
        return "服务超时，建议稍后重试"
    if status == "blocked":
        return "访问受限，建议更换来源或稍后重试"
    if status == "no_results":
        return "暂无结果"
    if status in {"error", "http_error"}:
        return "请求失败"
    return f"已返回 {count} 条" if count > 0 else "状态未知"


def _build_source_overview(source_statuses: dict[str, dict]) -> str:
    if not source_statuses:
        return "本次检索暂无来源诊断信息。"
    parts = []
    for source, info in source_statuses.items():
        status = str(info.get("status") or "unknown")
        count = _safe_int(info.get("count"))
        if status == "ok":
            parts.append(f"{source} 返回 {count} 条")
        elif status == "no_results":
            parts.append(f"{source} 暂无结果")
        elif status == "gateway_timeout":
            parts.append(f"{source} 服务超时")
        elif status == "rate_limited":
            parts.append(f"{source} 当前限流")
        elif status == "blocked":
            parts.append(f"{source} 访问受限")
        else:
            parts.append(f"{source} 请求失败")
    return "；".join(parts) + "。"


def _abstract_excerpt(paper: dict) -> str:
    abstract = (paper.get("abstract") or "").strip()
    return abstract[:90] if abstract else "该文献暂无摘要，建议打开来源链接进一步核验。"


def _language_label(language: str) -> str:
    if language == "cn":
        return "中文"
    if language == "en":
        return "英文"
    return "未知语种"


def _safe_int(value) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _safe_float(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0
