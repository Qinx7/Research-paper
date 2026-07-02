import test from "node:test";
import assert from "node:assert/strict";

import { normalizeFullDraftRevision } from "../src/lib/writingFullRevision.mjs";

test("normalizeFullDraftRevision returns normalized full revision payload", () => {
  const revision = normalizeFullDraftRevision({
    title: "测试论文",
    full_text: "## 第一章 绪论\n修订后的正文",
    change_summary: ["补充章节承接", "弱化无依据数据表述"],
    resolved_issues: ["章节衔接较弱"],
    remaining_issues: ["仍需补充真实实验数据"],
  });

  assert.deepEqual(revision, {
    title: "测试论文",
    fullText: "## 第一章 绪论\n修订后的正文",
    changeSummary: ["补充章节承接", "弱化无依据数据表述"],
    resolvedIssues: ["章节衔接较弱"],
    remainingIssues: ["仍需补充真实实验数据"],
  });
});

test("normalizeFullDraftRevision returns null for invalid payload", () => {
  assert.equal(normalizeFullDraftRevision(null), null);
  assert.equal(normalizeFullDraftRevision({}), null);
});
