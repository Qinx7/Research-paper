const CHAPTER_ORDER = [
  "chapter_1_introduction",
  "chapter_2_theory",
  "chapter_3_design",
  "chapter_4_implementation",
  "chapter_5_experiment",
  "chapter_6_conclusion",
];

export function buildFullDraftSections(draft, chapterLabels) {
  if (!draft) {
    return [];
  }

  const content = draft.content || {};
  return CHAPTER_ORDER.map((key) => {
    const record = content[key];
    const title =
      record && typeof record === "object" && typeof record.title === "string"
        ? record.title
        : chapterLabels[key] || key;
    const body =
      record && typeof record === "object" && typeof record.content === "string"
        ? record.content
        : "";
    const status =
      record && typeof record === "object" && typeof record.status === "string"
        ? record.status
        : "draft";

    return {
      key,
      title,
      content: body,
      status,
      wordCount: body.replace(/\s+/g, "").length,
    };
  });
}
