import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWritingReview } from "../src/lib/writingReview.mjs";

test("normalizeWritingReview returns normalized review payload", () => {
  const review = normalizeWritingReview({
    chapter_key: "chapter_3_design",
    passed: false,
    summary: "当前章节存在依据不足与结构重复问题",
    issues: [
      {
        severity: "warning",
        title: "依据不足",
        detail: "本章缺少与项目成果直接对应的说明",
        suggestion: "补充项目成果或文献支撑",
      },
    ],
    focus_areas: ["证据支撑", "结构完整性"],
  });

  assert.deepEqual(review, {
    chapterKey: "chapter_3_design",
    passed: false,
    summary: "当前章节存在依据不足与结构重复问题",
    issues: [
      {
        severity: "warning",
        title: "依据不足",
        detail: "本章缺少与项目成果直接对应的说明",
        suggestion: "补充项目成果或文献支撑",
      },
    ],
    focusAreas: ["证据支撑", "结构完整性"],
  });
});

test("normalizeWritingReview returns null for invalid payload", () => {
  assert.equal(normalizeWritingReview(null), null);
  assert.equal(normalizeWritingReview({}), null);
});
