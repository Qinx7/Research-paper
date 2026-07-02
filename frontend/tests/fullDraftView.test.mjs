import test from "node:test";
import assert from "node:assert/strict";

import { buildFullDraftSections } from "../src/lib/fullDraftView.mjs";

test("buildFullDraftSections keeps stable chapter order and content", () => {
  const sections = buildFullDraftSections(
    {
      content: {
        chapter_2_theory: { title: "第二章 理论基础", content: "第二章内容", status: "edited" },
        chapter_1_introduction: { title: "第一章 绪论", content: "第一章内容", status: "generated" },
      },
    },
    {
      chapter_1_introduction: "第一章 绪论",
      chapter_2_theory: "第二章 理论基础",
      chapter_3_design: "第三章 设计",
      chapter_4_implementation: "第四章 实现",
      chapter_5_experiment: "第五章 实验",
      chapter_6_conclusion: "第六章 结论",
    },
  );

  assert.equal(sections[0].key, "chapter_1_introduction");
  assert.equal(sections[1].key, "chapter_2_theory");
  assert.equal(sections[0].content, "第一章内容");
  assert.equal(sections[1].status, "edited");
  assert.equal(sections[2].content, "");
});
