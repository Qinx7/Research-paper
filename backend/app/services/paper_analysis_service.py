"""单篇文献结构化分析服务，优先保证不编造缺失证据。"""
from __future__ import annotations

import re
from typing import Any

UNKNOWN = "暂无足够依据"


def analyze_saved_paper(paper: Any, project_requirement: str | None = None) -> dict[str, Any]:
    """基于已保存文献元数据做保守结构化分析。

    当前阶段只使用题名、摘要、期刊、年份等已入库字段；没有摘要时不推断研究方法、
    样本或结论，避免把标题联想当作事实。
    """
    title = _get_value(paper, "title") or "未命名文献"
    abstract = (_get_value(paper, "abstract") or "").strip()

    if not abstract:
        return {
            "research_question": UNKNOWN,
            "method": UNKNOWN,
            "sample_or_data": UNKNOWN,
            "key_findings": UNKNOWN,
            "limitations": UNKNOWN,
            "relevance_to_project": _build_title_relevance(title, project_requirement),
            "evidence_level": "证据不足",
            "warnings": ["当前文献缺少摘要，不能可靠提炼研究问题、方法、样本或结论。"],
        }

    sentences = _split_sentences(abstract)
    research_question = _first_matching_sentence(
        sentences,
        ["investigate", "examines", "examine", "study", "研究", "探讨", "分析", "考察"],
        fallback=sentences[0],
    )
    method = _first_matching_sentence(
        sentences,
        ["survey", "interview", "experiment", "case study", "questionnaire", "regression", "问卷", "访谈", "实验", "案例", "实证"],
    )
    sample_or_data = _first_matching_sentence(
        sentences,
        ["student", "teacher", "participant", "sample", "dataset", "data", "学生", "教师", "样本", "数据"],
    )
    key_findings = _first_matching_sentence(
        sentences,
        ["finding", "findings", "suggest", "show", "indicate", "improve", "significant", "结果", "发现", "表明", "提升", "影响"],
    )
    limitations = _first_matching_sentence(
        sentences,
        ["limitation", "risk", "challenge", "ethical", "integrity", "局限", "风险", "挑战", "伦理"],
    )

    return {
        "research_question": research_question,
        "method": method or UNKNOWN,
        "sample_or_data": sample_or_data or UNKNOWN,
        "key_findings": key_findings or UNKNOWN,
        "limitations": limitations or UNKNOWN,
        "relevance_to_project": _build_relevance(title, abstract, project_requirement),
        "evidence_level": "摘要级证据",
        "warnings": _build_warnings(method, sample_or_data, key_findings, limitations),
    }


def _get_value(paper: Any, key: str) -> Any:
    if isinstance(paper, dict):
        return paper.get(key)
    return getattr(paper, key, None)


def _split_sentences(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?<=[。！？.!?])\s+", normalized)
    return [part.strip() for part in parts if part.strip()]


def _first_matching_sentence(sentences: list[str], keywords: list[str], fallback: str | None = None) -> str:
    for sentence in sentences:
        lowered = sentence.lower()
        if any(keyword.lower() in lowered for keyword in keywords):
            return sentence
    return fallback or ""


def _build_title_relevance(title: str, project_requirement: str | None) -> str:
    if not project_requirement:
        return "仅能根据标题判断可能相关，缺少摘要支撑。"
    return f"仅能根据标题判断与“{project_requirement}”可能相关，缺少摘要支撑。"


def _build_relevance(title: str, abstract: str, project_requirement: str | None) -> str:
    if not project_requirement:
        return f"该文献围绕“{title}”展开，可作为主题背景或相关研究线索。"
    return f"该文献题名和摘要与项目需求“{project_requirement}”存在主题关联，可作为后续综述候选证据。"


def _build_warnings(method: str, sample_or_data: str, key_findings: str, limitations: str) -> list[str]:
    warnings: list[str] = []
    if not method:
        warnings.append("摘要中未明确出现研究方法，方法字段仅能标记为证据不足。")
    if not sample_or_data:
        warnings.append("摘要中未明确出现样本或数据来源，不能推断样本量。")
    if not key_findings:
        warnings.append("摘要中未明确出现主要发现，不能生成结论性表述。")
    if not limitations:
        warnings.append("摘要中未明确出现局限或风险，不能补写局限。")
    return warnings
