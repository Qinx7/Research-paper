export function normalizeFullDraftRevision(rawRevision) {
  if (!rawRevision || typeof rawRevision !== "object" || Array.isArray(rawRevision)) {
    return null;
  }

  const title = typeof rawRevision.title === "string" ? rawRevision.title : "";
  const fullText = typeof rawRevision.full_text === "string" ? rawRevision.full_text : "";
  const changeSummary = Array.isArray(rawRevision.change_summary)
    ? rawRevision.change_summary.filter((item) => typeof item === "string" && item.trim())
    : [];
  const resolvedIssues = Array.isArray(rawRevision.resolved_issues)
    ? rawRevision.resolved_issues.filter((item) => typeof item === "string" && item.trim())
    : [];
  const remainingIssues = Array.isArray(rawRevision.remaining_issues)
    ? rawRevision.remaining_issues.filter((item) => typeof item === "string" && item.trim())
    : [];

  if (!title && !fullText && !changeSummary.length && !resolvedIssues.length && !remainingIssues.length) {
    return null;
  }

  return {
    title,
    fullText,
    changeSummary,
    resolvedIssues,
    remainingIssues,
  };
}
