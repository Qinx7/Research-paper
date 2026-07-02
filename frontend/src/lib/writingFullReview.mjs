export function normalizeFullDraftReview(rawReview) {
  if (!rawReview || typeof rawReview !== "object" || Array.isArray(rawReview)) {
    return null;
  }

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

  const chapterFlags = {};
  if (rawReview.chapter_flags && typeof rawReview.chapter_flags === "object" && !Array.isArray(rawReview.chapter_flags)) {
    for (const [chapterKey, flags] of Object.entries(rawReview.chapter_flags)) {
      if (!Array.isArray(flags)) continue;
      chapterFlags[chapterKey] = flags.filter((item) => typeof item === "string" && item.trim());
    }
  }

  if (!summary && !issues.length && !focusAreas.length && !Object.keys(chapterFlags).length) {
    return null;
  }

  return {
    passed,
    summary,
    issues,
    focusAreas,
    chapterFlags,
  };
}
