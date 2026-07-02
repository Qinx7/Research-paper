function formatDocumentKind(kind) {
  if (kind === "scholarly_pdf") return "论文型 PDF";
  if (kind === "general_pdf") return "普通 PDF";
  if (kind === "structured_docx") return "结构化 DOCX";
  if (kind === "general_docx") return "普通 DOCX";
  if (kind === "general_text") return "文本资料";
  return kind || "";
}

export function buildOutcomeKnowledgeSummary(extraData) {
  const extra = extraData || {};
  const parts = [];

  if (extra.knowledge_parser) {
    parts.push(extra.knowledge_parser);
  }
  if (typeof extra.knowledge_used_ocr === "boolean" && extra.knowledge_used_ocr) {
    parts.push("已用 OCR");
  }
  if (extra.document_kind) {
    parts.push(formatDocumentKind(extra.document_kind));
  }
  if (Array.isArray(extra.structured_fields) && extra.structured_fields.length > 0) {
    parts.push(`结构化 ${extra.structured_fields.length} 项`);
  }

  return parts.join(" · ");
}

export function buildOutcomeKnowledgeDetails(extraData) {
  const extra = extraData || {};
  const details = [];

  if (extra.knowledge_parser) {
    details.push(`解析路径：${extra.knowledge_parser}`);
  }
  if (Array.isArray(extra.knowledge_strategy_chain) && extra.knowledge_strategy_chain.length > 0) {
    details.push(`策略链：${extra.knowledge_strategy_chain.join(" → ")}`);
  }
  if (typeof extra.knowledge_used_ocr === "boolean") {
    details.push(`OCR：${extra.knowledge_used_ocr ? "已进入 OCR" : "未进入 OCR"}`);
  }
  if (extra.knowledge_error_stage) {
    details.push(`失败阶段：${extra.knowledge_error_stage}`);
  }
  if (extra.document_kind) {
    details.push(`文档类型：${formatDocumentKind(extra.document_kind)}`);
  }
  if (Array.isArray(extra.structured_fields) && extra.structured_fields.length > 0) {
    details.push(`结构化字段：${extra.structured_fields.join("、")}`);
  }

  return details;
}
