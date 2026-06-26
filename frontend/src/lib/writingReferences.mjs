function normalizeLineEndings(text = "") {
  return String(text || "").replace(/\r\n/g, "\n");
}

export function stripInlineReferenceSection(content = "") {
  const normalized = normalizeLineEndings(content);
  const patterns = [
    /\n{2,}#{1,6}\s*参考文献[\s\S]*$/u,
    /\n{2,}参考文献\s*\n[\s\S]*$/u,
  ];

  for (const pattern of patterns) {
    if (pattern.test(normalized)) {
      return normalized.replace(pattern, "").trimEnd();
    }
  }
  return normalized;
}

export function buildDocumentReferenceItems(references = []) {
  return Array.from(
    new Set(
      (references || [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}
