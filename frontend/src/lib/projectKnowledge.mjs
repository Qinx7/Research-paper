export function findChapterKnowledge(snapshot, chapterKey) {
  if (!snapshot || !Array.isArray(snapshot.chapters)) return null;
  return snapshot.chapters.find((chapter) => chapter?.chapter_key === chapterKey) ?? null;
}

function buildProjectHref(projectId, params) {
  if (!projectId) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `/projects/${projectId}?${query}` : `/projects/${projectId}`;
}

export function getChapterKnowledgeActions(chapter, options = {}) {
  const safeChapter = chapter || {};
  const projectId = options.projectId || "";
  const chapterKey = options.chapterKey || safeChapter.chapter_key || "";

  return {
    outcomes: (safeChapter.linked_outcomes || []).map((outcome) => ({
      key: `outcome-${outcome.id}`,
      title: outcome.name,
      subtitle: outcome.outcome_type || "成果材料",
      sourceHint: "来自项目成果",
      href:
        buildProjectHref(projectId, {
          view: "overview",
          chapter_key: chapterKey,
          highlight_type: "outcome",
          highlight_id: outcome.id,
        }) || outcome.action_url || outcome.download_url,
      actionLabel: "查看成果",
      external: false,
      downloadHref: outcome.download_url || "",
      downloadLabel: outcome.download_url ? "下载文件" : "",
    })),
    chunks: (safeChapter.linked_chunks || []).map((chunk) => ({
      key: `chunk-${chunk.id}`,
      title: chunk.title,
      subtitle: chunk.source_filename || "资料片段",
      sectionTitle: chunk.section_title || "",
      sourceHint: "来自上传资料片段",
      href:
        buildProjectHref(projectId, {
          view: "overview",
          chapter_key: chapterKey,
          highlight_type: "chunk",
          highlight_id: chunk.id,
        }) || chunk.action_url || chunk.download_url,
      actionLabel: "查看片段",
      external: false,
      downloadHref: chunk.download_url || "",
      downloadLabel: chunk.download_url ? "下载原文件" : "",
    })),
    papers: (safeChapter.linked_papers || []).map((paper) => ({
      key: `paper-${paper.id}`,
      title: paper.title,
      subtitle: [paper.venue, paper.year ? `${paper.year}` : null].filter(Boolean).join(" · ") || "项目文献",
      sourceHint: "来自项目文献库",
      href:
        buildProjectHref(projectId, {
          view: "literature",
          highlight_type: "paper",
          highlight_id: paper.id,
          chapter_key: chapterKey,
        }) || paper.action_url,
      actionLabel: "查看文献",
      external: false,
    })),
    notes: (safeChapter.linked_notes || []).map((note) => ({
      key: `note-${note.id}`,
      title: note.title,
      subtitle: note.note_type || "证据卡片",
      sourceHint: "来自证据卡片",
      href:
        buildProjectHref(projectId, {
          view: "overview",
          chapter_key: chapterKey,
          highlight_type: "note",
          highlight_id: note.id,
        }) || note.action_url,
      actionLabel: "查看证据",
      external: false,
    })),
  };
}
