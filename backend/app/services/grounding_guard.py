"""依据约束工具 —— 过滤伪参考文献，校验章节引用与数据依据。"""
from __future__ import annotations

import copy
import re
from typing import Iterable


def _normalize_text(value: str) -> str:
    return re.sub(r"[\s\W_]+", "", (value or "").strip().lower())


def _dedupe_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        text = (item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _match_allowed_reference(candidate: str, allowed_references: list[str]) -> str | None:
    normalized_candidate = _normalize_text(candidate)
    if not normalized_candidate:
        return None

    for ref in allowed_references:
        normalized_ref = _normalize_text(ref)
        if not normalized_ref:
            continue
        if normalized_candidate == normalized_ref:
            return ref
        if normalized_candidate in normalized_ref or normalized_ref in normalized_candidate:
            return ref
    return None


def _sanitize_reference_candidates(
    candidates: Iterable[str],
    allowed_references: list[str],
    *,
    fallback_limit: int,
) -> list[str]:
    matched: list[str] = []
    for candidate in candidates:
        matched_ref = _match_allowed_reference(str(candidate), allowed_references)
        if matched_ref:
            matched.append(matched_ref)

    matched = _dedupe_preserve_order(matched)
    if matched:
        return matched[:fallback_limit]
    return allowed_references[:fallback_limit]


def sanitize_design_references(design: dict, literature_analysis: dict | None = None) -> dict:
    """仅保留能在文献分析摘要中找到依据的参考文献。"""
    sanitized = copy.deepcopy(design or {})
    literature_analysis = literature_analysis or {}

    allowed_references = _dedupe_preserve_order(
        str(summary.get("title", "")).strip()
        for summary in literature_analysis.get("summaries", [])
        if isinstance(summary, dict)
    )
    if not allowed_references:
        return sanitized

    lit_review = sanitized.get("literature_review")
    if not isinstance(lit_review, dict):
        lit_review = {}
        sanitized["literature_review"] = lit_review

    lit_review["key_references"] = _sanitize_reference_candidates(
        lit_review.get("key_references", []),
        allowed_references,
        fallback_limit=min(5, len(allowed_references)),
    )
    sanitized["references"] = _sanitize_reference_candidates(
        sanitized.get("references", []),
        allowed_references,
        fallback_limit=min(10, len(allowed_references)),
    )
    return sanitized


def collect_allowed_references_from_design(design_content: dict) -> list[str]:
    refs: list[str] = []
    lit_review = design_content.get("literature_review", {}) if isinstance(design_content, dict) else {}
    if isinstance(lit_review, dict):
        refs.extend(str(ref).strip() for ref in lit_review.get("key_references", []) if str(ref).strip())
    refs.extend(str(ref).strip() for ref in design_content.get("references", []) if str(ref).strip())
    return _dedupe_preserve_order(refs)


def sanitize_proposal_sections(sections: dict, allowed_references: list[str]) -> dict:
    """重建开题报告参考文献章节，确保只使用允许的文献列表。"""
    sanitized = copy.deepcopy(sections or {})
    allowed_references = _dedupe_preserve_order(allowed_references)

    ref_section = sanitized.get("references")
    if not isinstance(ref_section, dict):
        ref_section = {"title": "十二、参考文献", "content": ""}
        sanitized["references"] = ref_section

    if not allowed_references:
        ref_section["content"] = "暂无可验证参考文献，请先完成可靠文献检索。"
        return sanitized

    ref_section["content"] = "\n".join(
        f"[{idx}] {ref}"
        for idx, ref in enumerate(allowed_references[:15], start=1)
    )
    return sanitized


def validate_generated_chapter_grounding(
    *,
    chapter_key: str,
    result: dict,
    outcomes: list,
    papers: list,
) -> dict:
    """校验论文章节返回的 citations/data_based 是否具备可验证依据。"""
    allowed_labels: dict[str, str] = {}
    for outcome in outcomes or []:
        name = str(getattr(outcome, "name", "") or "").strip()
        if name:
            allowed_labels[_normalize_text(name)] = name
    for paper in papers or []:
        title = str(getattr(paper, "title", "") or "").strip()
        if title:
            allowed_labels[_normalize_text(title)] = title

    raw_citations = result.get("citations", []) or []
    unknown_citations: list[str] = []
    normalized_citations: list[str] = []
    for citation in raw_citations:
        matched = allowed_labels.get(_normalize_text(str(citation)))
        if matched:
            normalized_citations.append(matched)
        else:
            unknown_citations.append(str(citation))

    if unknown_citations:
        raise ValueError(f"检测到无依据引用：{', '.join(unknown_citations)}")

    has_any_outcomes = bool(outcomes)
    has_experiment_outcomes = any(
        str(getattr(outcome, "outcome_type", "") or "") in {"experiment_data", "survey_data", "experiment_record"}
        for outcome in (outcomes or [])
    )
    if result.get("data_based") and not has_any_outcomes:
        raise ValueError("章节标记为基于真实数据，但项目中不存在任何真实成果。")
    if chapter_key == "chapter_5_experiment" and result.get("data_based") and not has_experiment_outcomes:
        raise ValueError("实验章节标记为基于真实数据，但缺少实验数据类成果。")

    validated = dict(result)
    validated["citations"] = _dedupe_preserve_order(normalized_citations)
    return validated
