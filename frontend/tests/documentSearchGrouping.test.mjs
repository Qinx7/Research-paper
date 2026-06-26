import test from "node:test";
import assert from "node:assert/strict";

import { groupDocumentSearchResults } from "../src/lib/documentSearchGrouping.mjs";

test("groupDocumentSearchResults groups hits by source file", () => {
  const groups = groupDocumentSearchResults([
    {
      chunk_id: "c1",
      source_filename: "访谈记录.docx",
      title: "访谈记录",
      score: 8,
      content_excerpt: "片段一",
      download_url: "/api/outcomes/o1/download",
    },
    {
      chunk_id: "c2",
      source_filename: "访谈记录.docx",
      title: "访谈记录",
      score: 6,
      content_excerpt: "片段二",
      download_url: "/api/outcomes/o1/download",
    },
    {
      chunk_id: "c3",
      source_filename: "实验日志.pdf",
      title: "实验日志",
      score: 10,
      content_excerpt: "片段三",
      download_url: "/api/outcomes/o2/download",
    },
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].source_filename, "实验日志.pdf");
  assert.equal(groups[0].hits.length, 1);
  assert.equal(groups[1].source_filename, "访谈记录.docx");
  assert.equal(groups[1].hits.length, 2);
});
