import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDocumentReferenceItems,
  stripInlineReferenceSection,
} from "../src/lib/writingReferences.mjs";

test("stripInlineReferenceSection removes trailing reference section from chapter content", () => {
  const content = `## 1.4 论文结构安排

正文内容。

## 参考文献

[1] 文献 A
[2] 文献 B`;

  assert.equal(
    stripInlineReferenceSection(content),
    `## 1.4 论文结构安排

正文内容。`,
  );
});

test("buildDocumentReferenceItems deduplicates merged chapter references", () => {
  const items = buildDocumentReferenceItems(["文献 A", "文献 B", "文献 A", "", "文献 C"]);
  assert.deepEqual(items, ["文献 A", "文献 B", "文献 C"]);
});
