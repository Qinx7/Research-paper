"""权威来源筛选服务：对文献来源与质量标签做可解释、保守识别。"""
from dataclasses import dataclass, field
from collections import Counter
import re

from .literature_search import PaperResult


@dataclass
class AuthorityEvaluation:
    """单篇文献的权威标签识别结果。"""

    tags: list[str] = field(default_factory=list)
    pending_tags: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    verified_level: str = "unverified"
    authority_level: str = "none"


AUTHORITY_LABELS = {
    "ieee": "IEEE",
    "acm": "ACM",
    "ei": "EI",
    "jcr": "JCR",
    "cas": "中科院分区",
    "pku_core": "北大核心",
}

# 只放入相对稳定且常见的中文核心刊物名称，避免把普通期刊误标为北大核心。
PKU_CORE_JOURNAL_WHITELIST = {
    "电化教育研究",
    "中国电化教育",
    "现代教育技术",
    "开放教育研究",
    "远程教育杂志",
    "情报学报",
    "图书情报工作",
    "软件学报",
    "计算机学报",
    "计算机研究与发展",
    "自动化学报",
    "心理科学",
    "心理学报",
    "教育研究",
    "高等教育研究",
}


def evaluate_paper_authority(paper: PaperResult) -> AuthorityEvaluation:
    """识别一篇文献可核验的权威标签。

    IEEE/ACM 可通过出版物名称、URL、DOI 域名较高置信识别；北大核心只通过
    本地保守白名单识别。EI/JCR/中科院分区需要授权目录或官方数据，当前只
    输出待核验标签，不参与筛选命中。
    """
    text = _paper_text(paper)
    venue_text = (paper.venue or "").lower()
    url_text = (paper.url or "").lower()
    doi_text = (paper.doi or "").lower()
    tags: list[str] = []
    pending_tags: list[str] = []
    reasons: list[str] = []

    if _matches_ieee(venue_text=venue_text, url_text=url_text, doi_text=doi_text):
        tags.append("ieee")
        reasons.append("命中 IEEE 出版物名称或 IEEE Xplore 链接")

    if _matches_acm(venue_text=venue_text, url_text=url_text, doi_text=doi_text):
        tags.append("acm")
        reasons.append("命中 ACM 出版物名称或 ACM Digital Library 链接")

    venue = (paper.venue or "").strip()
    if venue and _normalize_text(venue) in {_normalize_text(item) for item in PKU_CORE_JOURNAL_WHITELIST}:
        tags.append("pku_core")
        reasons.append(f"期刊《{venue}》命中本地北大核心白名单")

    pending_tags.extend(_detect_pending_authority_tags(text))
    pending_tags = [tag for tag in pending_tags if tag not in tags]

    tags = _dedupe(tags)
    pending_tags = _dedupe(pending_tags)
    if tags:
        verified_level = "verified"
        authority_level = "verified_authority"
    elif pending_tags:
        verified_level = "unverified"
        authority_level = "needs_external_verification"
        reasons.append("EI/JCR/中科院分区需要官方或授权目录核验，当前不作为已认证标签")
    else:
        verified_level = "unverified"
        authority_level = "none"

    return AuthorityEvaluation(
        tags=tags,
        pending_tags=pending_tags,
        reasons=reasons,
        verified_level=verified_level,
        authority_level=authority_level,
    )


def authority_display_flags(evaluation: AuthorityEvaluation) -> list[str]:
    """转换为前端可直接展示的标签文本。"""
    flags = [AUTHORITY_LABELS.get(tag, tag) for tag in evaluation.tags]
    flags.extend(f"{AUTHORITY_LABELS.get(tag, tag)}待核验" for tag in evaluation.pending_tags)
    return flags


def summarize_authority_hits(papers: list[dict]) -> dict[str, object]:
    """汇总本次检索结果中的权威标签命中情况。"""
    verified_counts = Counter()
    pending_counts = Counter()
    for paper in papers:
        verified_tags = paper.get("authority_tags") or []
        pending_tags = paper.get("pending_authority_tags") or []
        if not verified_tags and not pending_tags:
            evaluation = evaluate_paper_authority(
                PaperResult(
                    title=paper.get("title") or "",
                    authors=paper.get("authors") or [],
                    year=paper.get("year"),
                    venue=paper.get("venue"),
                    doi=paper.get("doi"),
                    abstract=paper.get("abstract"),
                    url=paper.get("url"),
                    citation_count=int(paper.get("citation_count") or 0),
                    source=paper.get("source") or "",
                    is_open_access=paper.get("is_open_access"),
                )
            )
            verified_tags = evaluation.tags
            pending_tags = evaluation.pending_tags
        for tag in verified_tags:
            verified_counts[str(tag)] += 1
        for tag in pending_tags:
            pending_counts[str(tag)] += 1

    return {
        "verified_counts": dict(verified_counts),
        "pending_counts": dict(pending_counts),
        "overview": _build_authority_overview(verified_counts, pending_counts),
        "has_verified": bool(verified_counts),
        "has_pending": bool(pending_counts),
    }


def _paper_text(paper: PaperResult) -> str:
    return " ".join(
        part
        for part in [
            paper.title,
            paper.venue,
            paper.url,
            paper.doi,
            paper.abstract,
        ]
        if part
    ).lower()


def _matches_ieee(*, venue_text: str, url_text: str, doi_text: str) -> bool:
    return any(
        marker in venue_text or marker in url_text or marker in doi_text
        for marker in [
            "ieeexplore.ieee.org",
            "ieee xplore",
            "ieee transactions",
            "ieee access",
            "proceedings of ieee",
            "ieee conference",
        ]
    ) or bool(re.search(r"\bieee\b", venue_text))


def _matches_acm(*, venue_text: str, url_text: str, doi_text: str) -> bool:
    return any(
        marker in venue_text or marker in url_text or marker in doi_text
        for marker in [
            "dl.acm.org",
            "acm digital library",
            "proceedings of the acm",
            "acm transactions",
            "association for computing machinery",
        ]
    ) or bool(re.search(r"\bacm\b", venue_text))


def _detect_pending_authority_tags(text: str) -> list[str]:
    tags: list[str] = []
    if re.search(r"\bei\b", text) or "engineering index" in text:
        tags.append("ei")
    if re.search(r"\bjcr\b", text) or "journal citation reports" in text:
        tags.append("jcr")
    if "中科院" in text or "cas partition" in text or "cas quartile" in text:
        tags.append("cas")
    return tags


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value.strip().lower())


def _dedupe(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _build_authority_overview(verified_counts: Counter, pending_counts: Counter) -> str:
    verified_text = "、".join(
        f"{AUTHORITY_LABELS.get(tag, tag)} {count} 篇"
        for tag, count in verified_counts.most_common()
    )
    pending_text = "、".join(
        f"{AUTHORITY_LABELS.get(tag, tag)}待核验 {count} 篇"
        for tag, count in pending_counts.most_common()
    )
    if verified_text and pending_text:
        return f"已核验权威命中：{verified_text}；待核验标签：{pending_text}。"
    if verified_text:
        return f"已核验权威命中：{verified_text}。"
    if pending_text:
        return f"当前没有已核验权威命中；仅识别到待核验标签：{pending_text}。"
    return "当前检索结果未命中可核验的权威标签。"
