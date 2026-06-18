"""项目文献矩阵服务：把已保存文献整理为可用于综述的表格行。"""
from __future__ import annotations

from typing import Any

from .paper_analysis_service import analyze_saved_paper


def build_literature_matrix(papers: list[Any], project_requirement: str | None = None) -> dict[str, Any]:
    """基于项目文献库生成保守文献矩阵。"""
    rows = []
    for paper in papers:
        analysis = analyze_saved_paper(paper, project_requirement)
        rows.append(
            {
                "title": _get_value(paper, "title") or "未命名文献",
                "author_year": _format_author_year(_get_value(paper, "authors"), _get_value(paper, "year")),
                "source": _get_value(paper, "source") or "未知来源",
                "venue": _get_value(paper, "venue") or "未知期刊/会议",
                "research_question": analysis["research_question"],
                "method": analysis["method"],
                "sample_or_data": analysis["sample_or_data"],
                "key_findings": analysis["key_findings"],
                "limitations": analysis["limitations"],
                "relevance_to_project": analysis["relevance_to_project"],
                "evidence_level": analysis["evidence_level"],
                "warnings": analysis["warnings"],
            }
        )
    return {"total": len(rows), "rows": rows}


def _get_value(paper: Any, key: str) -> Any:
    if isinstance(paper, dict):
        return paper.get(key)
    return getattr(paper, key, None)


def _format_author_year(authors: str | list[str] | None, year: int | None) -> str:
    if isinstance(authors, str):
        first_author = next((item.strip() for item in authors.split(";") if item.strip()), "")
    elif isinstance(authors, list):
        first_author = str(authors[0]) if authors else ""
    else:
        first_author = ""
    author_text = f"{first_author} 等" if first_author else "未知作者"
    year_text = str(year) if year else "未知年份"
    return f"{author_text}（{year_text}）"
