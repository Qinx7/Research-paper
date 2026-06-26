export function buildDocumentUsageLinks(group, workspace, projectId) {
  const chapters = Array.isArray(workspace?.chapters) ? workspace.chapters : [];
  const hitChunkIds = new Set((group?.hits || []).map((item) => item?.chunk_id).filter(Boolean));
  const hitOutcomeIds = new Set((group?.hits || []).map((item) => item?.outcome_id).filter(Boolean));
  const links = [];

  for (const chapter of chapters) {
    const linkedChunkIds = new Set((chapter?.linked_chunks || []).map((item) => item?.id).filter(Boolean));
    const linkedOutcomeIds = new Set((chapter?.linked_outcomes || []).map((item) => item?.id).filter(Boolean));
    const matchedByChunk = [...hitChunkIds].some((id) => linkedChunkIds.has(id));
    const matchedByOutcome = [...hitOutcomeIds].some((id) => linkedOutcomeIds.has(id));
    if (!matchedByChunk && !matchedByOutcome) continue;

    links.push({
      key: `${chapter.draft_id}::${chapter.chapter_key}`,
      title: chapter.title,
      href: `/writing?project_id=${projectId}&draft_id=${chapter.draft_id}&chapter_key=${chapter.chapter_key}`,
    });
  }

  return links;
}
