export function normalizeWritingReview(rawReview) {
  if (!rawReview || typeof rawReview !== "object" || Array.isArray(rawReview)) {
    return null;
  }

  const chapterKey = typeof rawReview.chapter_key === "string" ? rawReview.chapter_key : "";
  const passed = Boolean(rawReview.passed);
  const summary = typeof rawReview.summary === "string" ? rawReview.summary : "";
  const issues = Array.isArray(rawReview.issues)
    ? rawReview.issues
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        severity: typeof item.severity === "string" ? item.severity : "info",
        title: typeof item.title === "string" ? item.title : "",
        detail: typeof item.detail === "string" ? item.detail : "",
        suggestion: typeof item.suggestion === "string" ? item.suggestion : "",
      }))
      .filter((item) => item.title || item.detail)
    : [];
  const focusAreas = Array.isArray(rawReview.focus_areas)
    ? rawReview.focus_areas.filter((item) => typeof item === "string" && item.trim())
    : [];

  if (!chapterKey && !summary && !issues.length && !focusAreas.length) {
    return null;
  }

  return {
    chapterKey,
    passed,
    summary,
    issues,
    focusAreas,
  };
}
