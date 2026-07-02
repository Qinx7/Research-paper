import test from "node:test";
import assert from "node:assert/strict";

import { buildRevisionStatus } from "../src/lib/writingRevisionStatus.mjs";

test("buildRevisionStatus separates resolved and remaining issues", () => {
  const status = buildRevisionStatus(
    {
      issues: [
        { severity: "warning", title: "设计章节结构可能缺项", detail: "缺少需求分析" },
        { severity: "warning", title: "数据性表述存在风险", detail: "缺少真实数据依据" },
        { severity: "info", title: "实现细节描述偏少", detail: "缺少接口说明" },
      ],
    },
    {
      resolvedIssues: ["设计章节结构可能缺项", "数据性表述存在风险"],
    },
  );

  assert.equal(status.resolvedCount, 2);
  assert.equal(status.remainingCount, 1);
  assert.equal(status.resolvedIssues[0].title, "设计章节结构可能缺项");
  assert.equal(status.remainingIssues[0].title, "实现细节描述偏少");
});

test("buildRevisionStatus returns next action based on remaining warnings", () => {
  const status = buildRevisionStatus(
    {
      issues: [
        { severity: "warning", title: "实验章节结构可能缺项", detail: "缺少结果分析" },
      ],
    },
    {
      resolvedIssues: [],
    },
  );

  assert.equal(status.nextAction, "优先处理剩余 warning 问题，再重新执行章节审查。");
});
