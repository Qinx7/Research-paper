import test from "node:test";
import assert from "node:assert/strict";

import { highlightDocumentSearchText } from "../src/lib/documentSearchHighlight.mjs";

test("highlightDocumentSearchText wraps matching keyword fragments", () => {
  const parts = highlightDocumentSearchText(
    "访谈资料显示，学生使用 RAG 课程问答后更容易形成论文初稿。",
    "RAG 课程问答",
  );

  assert.deepEqual(parts, [
    { text: "访谈资料显示，学生使用 ", highlight: false },
    { text: "RAG", highlight: true },
    { text: " ", highlight: false },
    { text: "课程问答", highlight: true },
    { text: "后更容易形成论文初稿。", highlight: false },
  ]);
});

test("highlightDocumentSearchText returns plain text when query is empty", () => {
  const parts = highlightDocumentSearchText("系统说明文档", "");

  assert.deepEqual(parts, [
    { text: "系统说明文档", highlight: false },
  ]);
});
