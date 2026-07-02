import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWritingRevision } from "../src/lib/writingRevision.mjs";

test("normalizeWritingRevision returns normalized revision payload", () => {
  const revision = normalizeWritingRevision({
    chapter_key: "chapter_3_design",
    title: "第三章 系统需求分析与总体设计",
    content: "修订后的章节内容",
    change_summary: ["补充了需求分析", "弱化了无依据数据表述"],
    resolved_issues: ["章节结构可能缺项", "数据性表述存在风险"],
    citations: ["真实论文A"],
    data_based: false,
  });

  assert.deepEqual(revision, {
    chapterKey: "chapter_3_design",
    title: "第三章 系统需求分析与总体设计",
    content: "修订后的章节内容",
    changeSummary: ["补充了需求分析", "弱化了无依据数据表述"],
    resolvedIssues: ["章节结构可能缺项", "数据性表述存在风险"],
    citations: ["真实论文A"],
    dataBased: false,
  });
});

test("normalizeWritingRevision returns null for invalid payload", () => {
  assert.equal(normalizeWritingRevision(null), null);
  assert.equal(normalizeWritingRevision({}), null);
});
