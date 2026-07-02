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
def validate_generated_chapter_grounding(
    *,
    chapter_key: str,
    result: dict,
    outcomes: list,
    papers: list,
    evidence_items: list[dict] | None = None,
) -> dict:
    """校验论文章节返回的 citations/data_based 是否具备可验证依据。"""
    if False and chapter_key != "chapter_1_introduction":
        validated = dict(result)
        validated["citations"] = []
        support_texts: list[str] = []
        for outcome in outcomes or []:
            name = str(getattr(outcome, "name", "") or "").strip()
            if name:
                support_texts.append(name)
            description = str(getattr(outcome, "description", "") or "").strip()
            if description:
                support_texts.append(description)
        for paper in papers or []:
            title = str(getattr(paper, "title", "") or "").strip()
            if title:
                support_texts.append(title)
            abstract = str(getattr(paper, "abstract", "") or "").strip()
            if abstract:
                support_texts.append(abstract)
        for item in evidence_items or []:
            title = str(item.get("title", "") or "").strip()
            if title:
                support_texts.append(title)
            source_title = str(item.get("source_title", "") or "").strip()
            if source_title:
                support_texts.append(source_title)
            evidence_text = str(item.get("evidence_text", "") or item.get("content_excerpt", "") or "").strip()
            if evidence_text:
                support_texts.append(evidence_text)

        has_any_outcomes = bool(outcomes)
        has_experiment_outcomes = any(
            str(getattr(outcome, "outcome_type", "") or "") in {"experiment_data", "survey_data", "experiment_record"}
            for outcome in (outcomes or [])
        )
        if result.get("data_based") and not has_any_outcomes:
            raise ValueError("章节标记为基于真实数据，但项目中不存在任何真实成果。")
        if chapter_key == "chapter_5_experiment" and result.get("data_based") and not has_experiment_outcomes:
            raise ValueError("实验章节标记为基于真实数据，但缺少实验数据类成果。")

        unsupported_claims = _find_unsupported_specific_data_claims(
            str(result.get("content", "") or ""),
            support_texts=support_texts,
        )
        if unsupported_claims:
            raise ValueError(f"检测到缺少依据的具体数据表述：{', '.join(unsupported_claims)}")
        return validated

    allowed_labels: dict[str, str] = {}
    allowed_references: list[str] = []
    support_texts: list[str] = []
    for outcome in outcomes or []:
        name = str(getattr(outcome, "name", "") or "").strip()
        if name:
            allowed_labels[_normalize_text(name)] = name
            allowed_references.append(name)
            support_texts.append(name)
        description = str(getattr(outcome, "description", "") or "").strip()
        if description:
            support_texts.append(description)
    for paper in papers or []:
        title = str(getattr(paper, "title", "") or "").strip()
        if title:
            allowed_labels[_normalize_text(title)] = title
            allowed_references.append(title)
            support_texts.append(title)
        abstract = str(getattr(paper, "abstract", "") or "").strip()
        if abstract:
            support_texts.append(abstract)
    for item in evidence_items or []:
        title = str(item.get("title", "") or "").strip()
        if title:
            allowed_labels[_normalize_text(title)] = title
            allowed_references.append(title)
            support_texts.append(title)
        source_title = str(item.get("source_title", "") or "").strip()
        if source_title:
            allowed_labels[_normalize_text(source_title)] = source_title
            allowed_references.append(source_title)
            support_texts.append(source_title)
        evidence_text = str(item.get("evidence_text", "") or item.get("content_excerpt", "") or "").strip()
        if evidence_text:
            support_texts.append(evidence_text)

    allowed_references = _dedupe_preserve_order(allowed_references)

    raw_citations = result.get("citations", []) or []
    unknown_citations: list[str] = []
    normalized_citations: list[str] = []
    for citation in raw_citations:
        citation_text = str(citation)
        matched = allowed_labels.get(_normalize_text(citation_text))
        if not matched:
            matched = _match_allowed_reference(citation_text, allowed_references)
        if matched:
            normalized_citations.append(matched)
        else:
            unknown_citations.append(citation_text)

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

    unsupported_claims = _find_unsupported_specific_data_claims(
        str(result.get("content", "") or ""),
        support_texts=support_texts,
    )
    if unsupported_claims:
        raise ValueError(f"检测到缺少依据的具体数据表述：{', '.join(unsupported_claims)}")

    validated = dict(result)
    validated["citations"] = _dedupe_preserve_order(normalized_citations)
    return validated


def _find_unsupported_specific_data_claims(content: str, *, support_texts: list[str]) -> list[str]:
    """识别没有依据支撑的百分比、样本量等具体数据。"""
    if not content:
        return []

    support_text = "\n".join(support_texts or [])
    patterns = [
        r"\d+(?:\.\d+)?\s*%",
        r"百分之[一二三四五六七八九十百零点\d]+",
        r"\d+(?:\.\d+)?\s*(?:名|人|份|例|个样本|组样本)(?![一-龥A-Za-z])",
    ]
    claims = _dedupe_preserve_order(
        match.group(0).strip()
        for pattern in patterns
        for match in re.finditer(pattern, content)
    )
    unsupported = []
    normalized_support = _normalize_text(support_text)
    for claim in claims:
        normalized_claim = _normalize_text(claim)
        if normalized_claim and normalized_claim not in normalized_support:
            unsupported.append(claim)
    return unsupported
