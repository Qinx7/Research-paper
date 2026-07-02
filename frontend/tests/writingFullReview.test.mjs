import test from "node:test";
import assert from "node:assert/strict";

import { normalizeFullDraftReview } from "../src/lib/writingFullReview.mjs";

test("normalizeFullDraftReview returns normalized full review payload", () => {
  const review = normalizeFullDraftReview({
    passed: false,
    summary: "整篇审查发现 2 个问题。",
    issues: [
      {
        severity: "warning",
        title: "章节衔接较弱",
        detail: "第二章到第三章缺少过渡说明。",
        suggestion: "补充承接段。",
      },
    ],
    focus_areas: ["章节衔接", "证据支撑"],
    chapter_flags: {
      chapter_3_design: ["章节衔接较弱"],
      invalid: [null, " "],
    },
  });

  assert.deepEqual(review, {
    passed: false,
    summary: "整篇审查发现 2 个问题。",
    issues: [
      {
        severity: "warning",
        title: "章节衔接较弱",
        detail: "第二章到第三章缺少过渡说明。",
        suggestion: "补充承接段。",
      },
    ],
    focusAreas: ["章节衔接", "证据支撑"],
    chapterFlags: {
      chapter_3_design: ["章节衔接较弱"],
      invalid: [],
    },
  });
});

test("normalizeFullDraftReview returns null for invalid payload", () => {
  assert.equal(normalizeFullDraftReview(null), null);
  assert.equal(normalizeFullDraftReview({}), null);
});
