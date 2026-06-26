import test from "node:test";
import assert from "node:assert/strict";

import { findChapterKnowledge, getChapterKnowledgeActions } from "../src/lib/projectKnowledge.mjs";

test("findChapterKnowledge returns matching chapter from workspace snapshot", () => {
  const snapshot = {
    chapters: [
      {
        chapter_key: "chapter_1_introduction",
        linked_outcomes: [{ id: "o1", name: "系统截图" }],
        linked_chunks: [{ id: "c1", title: "截图说明" }],
      },
      {
        chapter_key: "chapter_5_experiment",
        linked_outcomes: [{ id: "o2", name: "实验数据表" }],
        linked_chunks: [{ id: "c2", title: "实验日志" }],
      },
    ],
  };

  const chapter = findChapterKnowledge(snapshot, "chapter_5_experiment");

  assert.equal(chapter.chapter_key, "chapter_5_experiment");
  assert.equal(chapter.linked_outcomes[0].name, "实验数据表");
});

test("findChapterKnowledge returns null when snapshot has no matching chapter", () => {
  const snapshot = { chapters: [] };

  assert.equal(findChapterKnowledge(snapshot, "chapter_3_design"), null);
});

test("getChapterKnowledgeActions builds project-aware navigation actions", () => {
  const chapter = {
    chapter_key: "chapter_5_experiment",
    linked_outcomes: [
      {
        id: "o1",
        name: "实验数据表",
        outcome_type: "experiment_data",
        download_url: "/api/outcomes/o1/download",
      },
    ],
    linked_chunks: [
      {
        id: "c1",
        title: "实验日志片段",
        source_filename: "log.txt",
        download_url: "/api/outcomes/o1/download",
      },
    ],
    linked_papers: [
      {
        id: "p1",
        title: "项目文献",
        action_url: "/projects/1?view=literature",
        action_label: "进入项目文献库",
      },
    ],
    linked_notes: [
      {
        id: "n1",
        title: "证据卡片",
        action_url: "/projects/1?view=literature",
        action_label: "查看文献与证据",
      },
    ],
  };

  const actions = getChapterKnowledgeActions(chapter, { projectId: "project-1", chapterKey: "chapter_5_experiment" });

  assert.deepEqual(actions.outcomes[0], {
    key: "outcome-o1",
    title: "实验数据表",
    subtitle: "experiment_data",
    sourceHint: "来自项目成果",
    href: "/projects/project-1?view=overview&chapter_key=chapter_5_experiment&highlight_type=outcome&highlight_id=o1",
    actionLabel: "查看成果",
    external: false,
    downloadHref: "/api/outcomes/o1/download",
    downloadLabel: "下载文件",
  });
  assert.deepEqual(actions.chunks[0], {
    key: "chunk-c1",
    title: "实验日志片段",
    subtitle: "log.txt",
    sectionTitle: "",
    sourceHint: "来自上传资料片段",
    href: "/projects/project-1?view=overview&chapter_key=chapter_5_experiment&highlight_type=chunk&highlight_id=c1",
    actionLabel: "查看片段",
    external: false,
    downloadHref: "/api/outcomes/o1/download",
    downloadLabel: "下载原文件",
  });
  assert.equal(actions.papers[0].href, "/projects/project-1?view=literature&highlight_type=paper&highlight_id=p1&chapter_key=chapter_5_experiment");
  assert.equal(actions.notes[0].actionLabel, "查看证据");
  assert.equal(actions.notes[0].sourceHint, "来自证据卡片");
});
