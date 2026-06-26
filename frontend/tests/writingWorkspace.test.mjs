import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInlineEvidenceSections,
  getWritingWorkspaceStatusItems,
} from "../src/lib/writingWorkspace.mjs";

test("buildInlineEvidenceSections groups chapter evidence for inline writing cards", () => {
  const sections = buildInlineEvidenceSections({
    citations: ["[1] 中文文献 A", "[2] 英文文献 B"],
    noteMatches: ["实验日志记录于 2026-06-01"],
    chapterKnowledgeActions: {
      outcomes: [
        {
          key: "outcome-o1",
          title: "实验数据表",
          subtitle: "experiment_data",
          href: "/api/outcomes/o1/download",
          actionLabel: "下载成果",
          external: true,
        },
      ],
      chunks: [
        {
          key: "chunk-c1",
          title: "实验日志片段",
          subtitle: "log.txt",
          href: "/api/outcomes/o1/download",
          actionLabel: "下载资料",
          external: true,
        },
      ],
      papers: [
        {
          key: "paper-p1",
          title: "项目文献",
          subtitle: "会议论文 · 2025",
          href: "/projects/1?view=literature",
          actionLabel: "查看文献",
          external: false,
        },
      ],
      notes: [
        {
          key: "note-n1",
          title: "证据卡片",
          subtitle: "summary",
          href: "/projects/1?view=literature",
          actionLabel: "查看证据",
          external: false,
        },
      ],
    },
  });

  assert.equal(sections.length, 3);
  assert.equal(sections[0].key, "citations");
  assert.equal(sections[0].items.length, 2);
  assert.equal(sections[1].key, "materials");
  assert.equal(sections[1].items[0].title, "实验数据表");
  assert.equal(sections[1].items[1].title, "实验日志片段");
  assert.equal(sections[2].key, "knowledge");
  assert.equal(sections[2].items[0].title, "项目文献");
});

test("getWritingWorkspaceStatusItems keeps only concise status entries", () => {
  const items = getWritingWorkspaceStatusItems({
    wordCount: 1840,
    progress: 50,
    saveStateLabel: "已同步",
    evidenceReadyCount: 2,
    activeSectionStatus: "edited",
  });

  assert.deepEqual(items, [
    "1840 字",
    "进度 50%",
    "2/3 依据就绪",
    "已编辑",
    "已同步",
  ]);
});
