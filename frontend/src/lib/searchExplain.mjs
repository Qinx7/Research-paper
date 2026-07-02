const SOURCE_LABEL = {
  cnki: "知网",
  cqvip: "维普",
  pubscholar: "PubScholar",
  pubmed: "PubMed",
  openalex: "OpenAlex",
  semantic_scholar: "Semantic Scholar",
  crossref: "Crossref",
  arxiv: "arXiv",
};

function authorityLabel(tag) {
  const labels = {
    ieee: "IEEE",
    acm: "ACM",
    ei: "EI",
    jcr: "JCR",
    cas: "中科院分区",
    pku_core: "北大核心",
  };
  return labels[tag] ?? tag;
}

export function sourceLabel(source) {
  return SOURCE_LABEL[source] ?? source;
}

export function sourceStatusText(info = {}) {
  if (info.status === "ok") return `已返回 ${info.count ?? 0} 条`;
  if (info.status === "rate_limited") return "当前限流";
  if (info.status === "gateway_timeout") return "服务超时";
  if (info.status === "blocked") return "访问受限";
  if (info.status === "no_results") return "暂无结果";
  if (info.status === "error" || info.status === "http_error") return "请求失败";
  return (info.count ?? 0) > 0 ? `已返回 ${info.count} 条` : "状态未知";
}

export function sourceStatusClass(status) {
  if (status === "ok") return "border-[#bfe5d1] bg-[#eefaf3] text-[#16613a]";
  if (status === "rate_limited" || status === "gateway_timeout") return "border-[#f1d49b] bg-[#fff7e8] text-[#8a5a00]";
  if (status === "blocked" || status === "error" || status === "http_error") return "border-[#f0b9b9] bg-[#fff0f0] text-[#9a2f2f]";
  return "border-[#dfe4e8] bg-[#f6f8fa] text-[#5e6874]";
}

export function buildPaperExplanation(paper = {}) {
  const verified = Array.isArray(paper.authority_tags) ? paper.authority_tags : [];
  const pending = Array.isArray(paper.pending_authority_tags) ? paper.pending_authority_tags : [];
  const authorityReasons = Array.isArray(paper.authority_reasons) ? paper.authority_reasons : [];
  const qualityFlags = Array.isArray(paper.quality_flags) ? paper.quality_flags : [];
  const recommendationHints = [];
  const verificationNotes = [];

  if (verified.length) {
    recommendationHints.push(`已核验标签：${verified.map(authorityLabel).join("、")}。`);
    verificationNotes.push(`当前命中已核验标签：${verified.map(authorityLabel).join("、")}，表示系统已有明确匹配依据。`);
  }
  if (pending.length) {
    recommendationHints.push(`待核验标签：${pending.map(authorityLabel).join("、")}。`);
    verificationNotes.push(`以下标签仅表示系统检测到相关信号，尚未完成本地授权目录级核验：${pending.map(authorityLabel).join("、")}。`);
  }
  if ((paper.citation_count ?? 0) > 0) {
    recommendationHints.push(`引用量 ${paper.citation_count}，可作为影响力参考。`);
  }
  if (qualityFlags.length) {
    recommendationHints.push(`补充提示：${qualityFlags.join("、")}。`);
  }
  if (!recommendationHints.length) {
    recommendationHints.push("当前主要依据题名、摘要和来源元数据命中该问题。");
  }

  if (authorityReasons.length) {
    verificationNotes.push(...authorityReasons);
  }
  if (!verificationNotes.length) {
    verificationNotes.push("当前未命中额外权威目录标签，建议结合来源链接与原文继续核验。");
  }

  return {
    hitExplanation: paper.why_selected || paper.abstract || "暂无摘要，建议打开来源链接进一步核验。",
    recommendationHints,
    verificationNotes,
  };
}

export function buildPaperCompactReasons(paper = {}) {
  const verified = Array.isArray(paper.authority_tags) ? paper.authority_tags : [];
  const pending = Array.isArray(paper.pending_authority_tags) ? paper.pending_authority_tags : [];
  const qualityFlags = Array.isArray(paper.quality_flags) ? paper.quality_flags : [];
  const reasons = [];

  if (verified.length) {
    reasons.push(`已核验 ${authorityLabel(verified[0])}`);
  } else if (pending.length) {
    reasons.push(`待核验 ${authorityLabel(pending[0])}`);
  }

  if ((paper.citation_count ?? 0) > 0) {
    reasons.push(`引用 ${paper.citation_count}`);
  }

  if (qualityFlags.length) {
    reasons.push(qualityFlags[0]);
  }

  if (!reasons.length) {
    reasons.push("摘要命中");
  }

  return reasons.slice(0, 3);
}

export function buildSourceStatusSections(statuses = {}) {
  const items = Object.entries(statuses).map(([source, info]) => ({
    source,
    label: sourceLabel(source),
    text: sourceStatusText(info),
    status: info.status,
    detail: info.detail || "",
    count: info.count ?? 0,
    className: sourceStatusClass(info.status),
  }));

  const healthy = items.filter((item) => item.status === "ok");
  const empty = items.filter((item) => item.status === "no_results");
  const risky = items.filter((item) => !["ok", "no_results"].includes(item.status));
  const summaryParts = [];

  if (healthy.length) summaryParts.push(`${healthy.length} 个来源返回结果`);
  if (empty.length) summaryParts.push(`${empty.length} 个来源暂无结果`);
  if (risky.length) summaryParts.push(`${risky.length} 个来源异常`);

  return {
    items,
    healthy,
    empty,
    risky,
    summary: summaryParts.length ? summaryParts.join("，") : "暂无来源状态信息",
  };
}

export function buildSearchHistoryStatusHint(statuses = {}) {
  const sections = buildSourceStatusSections(statuses);
  if (sections.risky.length) return `${sections.risky.length} 个异常来源`;
  if (sections.empty.length) return `${sections.empty.length} 个来源暂无结果`;
  if (sections.healthy.length) return `${sections.healthy.length} 个来源正常`;
  return "暂无来源状态";
}
