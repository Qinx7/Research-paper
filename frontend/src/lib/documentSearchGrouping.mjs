export function groupDocumentSearchResults(results) {
  const grouped = new Map();

  for (const item of results || []) {
    const sourceFilename = item?.source_filename || item?.title || "未命名资料";
    const groupKey = `${sourceFilename}::${item?.download_url || ""}`;
    const existing = grouped.get(groupKey);
    if (existing) {
      existing.hits.push(item);
      existing.maxScore = Math.max(existing.maxScore, Number(item?.score || 0));
      continue;
    }

    grouped.set(groupKey, {
      source_filename: sourceFilename,
      title: item?.title || sourceFilename,
      source_type: item?.source_type || null,
      download_url: item?.download_url || "",
      maxScore: Number(item?.score || 0),
      hits: [item],
    });
  }

  return Array.from(grouped.values()).sort((a, b) => b.maxScore - a.maxScore);
}
