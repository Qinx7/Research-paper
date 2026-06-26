/**
 * @typedef {{ text: string, highlight: boolean }} HighlightSegment
 */

function buildHighlightTokens(query) {
  const tokens = Array.from(
    new Set(
      (query || "")
        .split(/\s+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => b.length - a.length);
  return tokens;
}

export function highlightDocumentSearchText(text, query) {
  const source = text || "";
  const tokens = buildHighlightTokens(query);
  if (!source || !tokens.length) {
    return [{ text: source, highlight: false }];
  }

  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const segments = source.split(pattern).filter((segment) => segment !== "");

  return segments.map((segment) => ({
    text: segment,
    highlight: tokens.some((token) => token.toLowerCase() === segment.toLowerCase()),
  }));
}
