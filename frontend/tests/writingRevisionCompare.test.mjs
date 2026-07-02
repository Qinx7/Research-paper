import test from "node:test";
import assert from "node:assert/strict";

import { buildRevisionCompare } from "../src/lib/writingRevisionCompare.mjs";

test("buildRevisionCompare returns changed paragraph excerpts", () => {
  const result = buildRevisionCompare(
    "第一段保持不变。\n\n第二段原始内容。\n\n第三段原始内容。",
    "第一段保持不变。\n\n第二段修订后内容。\n\n第三段补充说明。",
  );

  assert.equal(result.changed, true);
  assert.equal(result.focusIndex, 1);
  assert.deepEqual(result.beforeExcerpt, ["第二段原始内容。", "第三段原始内容。"]);
  assert.deepEqual(result.afterExcerpt, ["第二段修订后内容。", "第三段补充说明。"]);
});

test("buildRevisionCompare returns null only when both sides empty", () => {
  assert.equal(buildRevisionCompare("", ""), null);
});
