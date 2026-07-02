export function buildRevisionStatus(review, revision) {
  if (!review || !revision) {
    return null;
  }

  const reviewIssues = Array.isArray(review.issues) ? review.issues : [];
  const resolvedIssueTitles = new Set(
    Array.isArray(revision.resolvedIssues) ? revision.resolvedIssues.filter((item) => typeof item === "string" && item.trim()) : [],
  );

  const resolvedIssues = reviewIssues.filter((issue) => resolvedIssueTitles.has(issue.title));
  const remainingIssues = reviewIssues.filter((issue) => !resolvedIssueTitles.has(issue.title));

  let nextAction = "继续人工润色当前章节。";
  if (remainingIssues.some((issue) => issue.severity === "warning")) {
    nextAction = "优先处理剩余 warning 问题，再重新执行章节审查。";
  } else if (remainingIssues.length > 0) {
    nextAction = "当前剩余问题以优化类为主，可选择继续修订或人工处理。";
  } else if (resolvedIssues.length > 0) {
    nextAction = "当前审查问题已基本处理，建议重新执行章节审查确认闭环。";
  }

  return {
    resolvedIssues,
    remainingIssues,
    resolvedCount: resolvedIssues.length,
    remainingCount: remainingIssues.length,
    nextAction,
  };
}
