import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWritingPlan } from "../src/lib/writingPlan.mjs";

test("normalizeWritingPlan returns normalized writing plan content", () => {
  const plan = normalizeWritingPlan({
    goal: "形成可验证依据支撑的论文写作计划",
    recommended_structure: ["第一章 绪论", "第二章 相关理论与技术基础"],
    evidence_gaps: ["缺少实验结果"],
    risks: ["第五章暂时不能写真实结论"],
    notes: "建议先补证据再写实验章节",
  });

  assert.deepEqual(plan, {
    goal: "形成可验证依据支撑的论文写作计划",
    recommendedStructure: ["第一章 绪论", "第二章 相关理论与技术基础"],
    evidenceGaps: ["缺少实验结果"],
    risks: ["第五章暂时不能写真实结论"],
    notes: "建议先补证据再写实验章节",
  });
});

test("normalizeWritingPlan returns null for empty payload", () => {
  assert.equal(normalizeWritingPlan(null), null);
  assert.equal(normalizeWritingPlan({}), null);
});
