/**
 * 论文写作工作台：整理正文附近需要展示的依据摘要与轻状态信息。
 */

function buildTextItem(prefix, text, index) {
  return {
    key: `${prefix}-${index}`,
    title: text,
    subtitle: "",
    href: "",
    actionLabel: "",
    external: false,
  };
}

export function buildInlineEvidenceSections({
  citations = [],
  noteMatches = [],
  chapterKnowledgeActions = {},
} = {}) {
  const actions = chapterKnowledgeActions || {};
  const materialItems = [...(actions.outcomes || []), ...(actions.chunks || [])].slice(0, 3);
  const knowledgeItems = [
    ...(actions.papers || []),
    ...(actions.notes || []),
    ...noteMatches.slice(0, 2).map((item, index) => buildTextItem("note-match", item, index)),
  ].slice(0, 3);

  return [
    {
      key: "citations",
      title: "本章引用",
      description: citations.length > 0 ? `${citations.length} 条已沉淀引用` : "暂无直接引用",
      emptyText: "生成章节或保存文献后，这里会显示可直接追溯的引用。",
      items: citations.slice(0, 3).map((citation, index) => buildTextItem("citation", citation, index)),
    },
    {
      key: "materials",
      title: "资料与成果",
      description: materialItems.length > 0 ? `${materialItems.length} 条可回溯材料` : "暂无材料命中",
      emptyText: "上传成果、实验记录或项目资料后，这里会显示本章可直接使用的材料。",
      items: materialItems,
    },
    {
      key: "knowledge",
      title: "文献与证据",
      description: knowledgeItems.length > 0 ? `${knowledgeItems.length} 条联动线索` : "暂无知识线索",
      emptyText: "本章还没有命中文献或证据卡片，可先在项目文献与知识库中补充依据。",
      items: knowledgeItems,
    },
  ];
}

export function getWritingWorkspaceStatusItems({
  wordCount = 0,
  progress = 0,
  saveStateLabel = "未保存",
  evidenceReadyCount = 0,
  activeSectionStatus,
} = {}) {
  const statusLabel =
    activeSectionStatus === "generated"
      ? "已生成"
      : activeSectionStatus === "edited"
        ? "已编辑"
        : activeSectionStatus === "final"
          ? "已定稿"
          : "草稿";

  return [
    `${wordCount} 字`,
    `进度 ${progress}%`,
    `${evidenceReadyCount}/3 依据就绪`,
    statusLabel,
    saveStateLabel,
  ];
}
