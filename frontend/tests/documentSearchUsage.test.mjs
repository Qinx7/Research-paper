import test from "node:test";
import assert from "node:assert/strict";

import { buildDocumentUsageLinks } from "../src/lib/documentSearchUsage.mjs";

test("buildDocumentUsageLinks links grouped result to matched writing chapters", () => {
  const group = {
    hits: [
      { chunk_id: "c1", outcome_id: "o1" },
      { chunk_id: "c2", outcome_id: "o1" },
    ],
  };
  const workspace = {
    chapters: [
      {
        draft_id: "d1",
        chapter_key: "chapter_1_introduction",
        title: "第一章 绪论",
        linked_chunks: [{ id: "c1" }],
        linked_outcomes: [],
      },
      {
        draft_id: "d2",
        chapter_key: "chapter_5_experiment",
        title: "第五章 实验设计与结果分析",
        linked_chunks: [],
        linked_outcomes: [{ id: "o1" }],
      },
    ],
  };

  const links = buildDocumentUsageLinks(group, workspace, "project-1");

  assert.deepEqual(links, [
    {
      key: "d1::chapter_1_introduction",
      title: "第一章 绪论",
      href: "/writing?project_id=project-1&draft_id=d1&chapter_key=chapter_1_introduction",
    },
    {
      key: "d2::chapter_5_experiment",
      title: "第五章 实验设计与结果分析",
      href: "/writing?project_id=project-1&draft_id=d2&chapter_key=chapter_5_experiment",
    },
  ]);
});

test("buildDocumentUsageLinks returns empty list when no chapter uses the document", () => {
  const links = buildDocumentUsageLinks(
    { hits: [{ chunk_id: "c9", outcome_id: "o9" }] },
    { chapters: [] },
    "project-1",
  );

  assert.deepEqual(links, []);
});
