import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPaperCompactReasons,
  buildPaperExplanation,
  buildSearchHistoryStatusHint,
  buildSourceStatusSections,
} from "../src/lib/searchExplain.mjs";

test("buildPaperExplanation separates hit reason, recommendation hints and verification notes", () => {
  const explanation = buildPaperExplanation({
    title: "A Study on RAG in Education",
    why_selected: "直接讨论高校课程问答中的 RAG 应用。",
    citation_count: 32,
    authority_tags: ["ieee"],
    pending_authority_tags: ["ei"],
    authority_reasons: ["DOI 前缀命中 IEEE 规则。"],
    quality_flags: ["近五年文献"],
  });

  assert.equal(explanation.hitExplanation, "直接讨论高校课程问答中的 RAG 应用。");
  assert.ok(explanation.recommendationHints.some((item) => item.includes("已核验标签")));
  assert.ok(explanation.recommendationHints.some((item) => item.includes("引用量 32")));
  assert.ok(explanation.verificationNotes.some((item) => item.includes("IEEE")));
  assert.ok(explanation.verificationNotes.some((item) => item.includes("系统推断命中")));
});

test("buildPaperExplanation falls back to abstract when why_selected is absent", () => {
  const explanation = buildPaperExplanation({
    title: "Paper without explicit reason",
    abstract: "这篇文献从摘要层面讨论了高校智能问答系统的实现方法。",
    citation_count: 0,
    authority_tags: [],
    pending_authority_tags: [],
    authority_reasons: [],
    quality_flags: [],
  });

  assert.equal(explanation.hitExplanation, "这篇文献从摘要层面讨论了高校智能问答系统的实现方法。");
  assert.ok(explanation.recommendationHints.some((item) => item.includes("题名、摘要")));
  assert.ok(explanation.verificationNotes.some((item) => item.includes("未命中额外权威目录标签")));
});

test("buildPaperCompactReasons builds short visible reasons for collapsed cards", () => {
  const reasons = buildPaperCompactReasons({
    citation_count: 18,
    authority_tags: ["ieee"],
    quality_flags: ["近五年文献"],
  });

  assert.deepEqual(reasons, ["已核验 IEEE", "引用 18", "近五年文献"]);
});

test("buildSourceStatusSections groups ok, empty and risk sources separately", () => {
  const sections = buildSourceStatusSections({
    openalex: { status: "ok", count: 12 },
    semantic_scholar: { status: "rate_limited", count: 0, detail: "429" },
    cnki: { status: "no_results", count: 0 },
    arxiv: { status: "gateway_timeout", count: 0 },
  });

  assert.equal(sections.healthy.length, 1);
  assert.equal(sections.empty.length, 1);
  assert.equal(sections.risky.length, 2);
  assert.ok(sections.summary.includes("1 个来源返回结果"));
  assert.ok(sections.summary.includes("1 个来源暂无结果"));
  assert.ok(sections.summary.includes("2 个来源异常"));
});

test("buildSearchHistoryStatusHint prioritizes risky sources for history preview", () => {
  assert.equal(
    buildSearchHistoryStatusHint({
      openalex: { status: "ok", count: 4 },
      semantic_scholar: { status: "rate_limited", count: 0 },
    }),
    "1 个异常来源",
  );

  assert.equal(
    buildSearchHistoryStatusHint({
      cnki: { status: "no_results", count: 0 },
    }),
    "1 个来源暂无结果",
  );
});
