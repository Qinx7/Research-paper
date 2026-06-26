const AUTHORITY_LABEL = {
  ieee: "IEEE",
  acm: "ACM",
  ei: "EI",
  jcr: "JCR",
  cas: "中科院分区",
  pku_core: "北大核心",
};

function authorityLabel(tag) {
  return AUTHORITY_LABEL[tag] ?? tag;
}

export function buildAuthorityBadgeItems(paper) {
  const verified = Array.isArray(paper?.authority_tags) ? paper.authority_tags : [];
  const pending = Array.isArray(paper?.pending_authority_tags) ? paper.pending_authority_tags : [];

  return [
    ...verified.map((tag) => ({
      key: `verified-${tag}`,
      label: authorityLabel(tag),
      tone: "verified",
    })),
    ...pending.map((tag) => ({
      key: `pending-${tag}`,
      label: `待核验 ${authorityLabel(tag)}`,
      tone: "pending",
    })),
  ];
}
