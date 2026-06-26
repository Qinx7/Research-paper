import test from "node:test";
import assert from "node:assert/strict";

import { buildOutcomeStructuredPreview } from "../src/lib/outcomeStructuredPreview.mjs";

test("buildOutcomeStructuredPreview returns visible structured preview for scholarly pdf", () => {
  const preview = buildOutcomeStructuredPreview({
    extra_data: {
      knowledge_parser: "pypdf+pdfplumber",
      document_kind: "scholarly_pdf",
      structured_content: {
        title: "A Retrieval Augmented Generation Method",
        abstract: "This paper proposes a retrieval augmented generation method for education.",
        references_text: "[1] Example",
        references_list: ["[1] Example"],
      },
      structured_confidence: {
        title: "medium",
        abstract: "high",
        references: "high",
      },
    },
  });

  assert.equal(preview.visible, true);
  assert.equal(preview.title, "A Retrieval Augmented Generation Method");
  assert.equal(preview.referencesDetected, true);
  assert.deepEqual(preview.referencesList, ["[1] Example"]);
  assert.equal(preview.confidence.abstract, "high");
});

test("buildOutcomeStructuredPreview hides preview for non-scholarly documents", () => {
  const preview = buildOutcomeStructuredPreview({
    extra_data: {
      document_kind: "general_pdf",
      structured_content: {
        title: "普通资料",
      },
    },
  });

  assert.equal(preview.visible, false);
});
