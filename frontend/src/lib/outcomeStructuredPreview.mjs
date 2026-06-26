export function buildOutcomeStructuredPreview(outcome) {
  const extra = outcome?.extra_data || {};
  const content = extra.structured_content || {};
  const confidence = extra.structured_confidence || {};
  const isScholarly = extra.document_kind === "scholarly_pdf";
  const hasContent = Boolean(content.title || content.abstract || content.references_text);

  return {
    visible: Boolean(isScholarly && hasContent),
    title: content.title || "",
    abstract: content.abstract || "",
    referencesDetected: Boolean(content.references_text),
    referencesList: Array.isArray(content.references_list) ? content.references_list.slice(0, 3) : [],
    confidence: {
      title: confidence.title || "low",
      abstract: confidence.abstract || "low",
      references: confidence.references || "low",
    },
  };
}
