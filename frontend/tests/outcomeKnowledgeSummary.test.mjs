import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOutcomeKnowledgeDetails,
  buildOutcomeKnowledgeSummary,
} from "../src/lib/outcomeKnowledgeSummary.mjs";

test("buildOutcomeKnowledgeSummary converts parser meta to readable summary", () => {
  const summary = buildOutcomeKnowledgeSummary({
    knowledge_parser: "pypdf+pdfplumber+ocr",
    knowledge_used_ocr: true,
    document_kind: "scholarly_pdf",
    structured_fields: ["title", "abstract", "references"],
  });

  assert.equal(summary, "pypdf+pdfplumber+ocr · 已用 OCR · 论文型 PDF · 结构化 3 项");
});

test("buildOutcomeKnowledgeDetails expands readable detail lines", () => {
  const details = buildOutcomeKnowledgeDetails({
    knowledge_parser: "pypdf+ocr",
    knowledge_strategy_chain: ["pypdf", "ocr"],
    knowledge_used_ocr: true,
    knowledge_error_stage: "ocr",
    document_kind: "general_pdf",
    structured_fields: ["title"],
  });

  assert.deepEqual(details, [
    "解析路径：pypdf+ocr",
    "策略链：pypdf → ocr",
    "OCR：已进入 OCR",
    "失败阶段：ocr",
    "文档类型：普通 PDF",
    "结构化字段：title",
  ]);
});
