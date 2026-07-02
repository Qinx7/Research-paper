function splitParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildRevisionCompare(originalContent, revisedContent) {
  const before = splitParagraphs(originalContent);
  const after = splitParagraphs(revisedContent);

  if (!before.length && !after.length) {
    return null;
  }

  let diffIndex = 0;
  const maxLength = Math.max(before.length, after.length);
  while (diffIndex < maxLength && before[diffIndex] === after[diffIndex]) {
    diffIndex += 1;
  }

  const beforeSlice = before.slice(diffIndex, diffIndex + 2);
  const afterSlice = after.slice(diffIndex, diffIndex + 2);

  return {
    changed: beforeSlice.join("\n\n") !== afterSlice.join("\n\n"),
    beforeCount: before.length,
    afterCount: after.length,
    focusIndex: diffIndex,
    beforeExcerpt: beforeSlice,
    afterExcerpt: afterSlice,
  };
}
