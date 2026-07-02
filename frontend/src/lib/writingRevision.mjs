export function normalizeWritingRevision(rawRevision) {
  if (!rawRevision || typeof rawRevision !== "object" || Array.isArray(rawRevision)) {
    return null;
  }

  const chapterKey = typeof rawRevision.chapter_key === "string" ? rawRevision.chapter_key : "";
  const title = typeof rawRevision.title === "string" ? rawRevision.title : "";
  const content = typeof rawRevision.content === "string" ? rawRevision.content : "";
  const changeSummary = Array.isArray(rawRevision.change_summary)
    ? rawRevision.change_summary.filter((item) => typeof item === "string" && item.trim())
    : [];
  const resolvedIssues = Array.isArray(rawRevision.resolved_issues)
    ? rawRevision.resolved_issues.filter((item) => typeof item === "string" && item.trim())
    : [];
  const citations = Array.isArray(rawRevision.citations)
    ? rawRevision.citations.filter((item) => typeof item === "string" && item.trim())
    : [];
  const dataBased = Boolean(rawRevision.data_based);

  if (!chapterKey && !title && !content && !changeSummary.length && !resolvedIssues.length) {
    return null;
  }

  return {
    chapterKey,
    title,
    content,
    changeSummary,
    resolvedIssues,
    citations,
    dataBased,
  };
}
