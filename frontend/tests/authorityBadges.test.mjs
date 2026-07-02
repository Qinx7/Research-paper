import test from "node:test";
import assert from "node:assert/strict";

import { buildAuthorityBadgeItems } from "../src/lib/authorityBadges.mjs";

test("verified badges come first and use compact labels", () => {
  const items = buildAuthorityBadgeItems({
    authority_tags: ["ieee", "pku_core"],
    pending_authority_tags: ["ei", "jcr"],
  });

  assert.deepEqual(items, [
    { key: "verified-ieee", label: "IEEE", tone: "verified", title: "IEEE：已完成来源或本地授权目录级核验" },
    { key: "verified-pku_core", label: "北大核心", tone: "verified", title: "北大核心：已完成来源或本地授权目录级核验" },
    { key: "pending-ei", label: "待核验 EI", tone: "pending", title: "EI：仅检测到相关信号，尚未完成本地授权目录级核验" },
    { key: "pending-jcr", label: "待核验 JCR", tone: "pending", title: "JCR：仅检测到相关信号，尚未完成本地授权目录级核验" },
  ]);
});

test("unknown tags still preserve pending prefix semantics", () => {
  const items = buildAuthorityBadgeItems({
    authority_tags: ["acm"],
    pending_authority_tags: ["custom_tag"],
  });

  assert.deepEqual(items, [
    { key: "verified-acm", label: "ACM", tone: "verified", title: "ACM：已完成来源或本地授权目录级核验" },
    { key: "pending-custom_tag", label: "待核验 custom_tag", tone: "pending", title: "custom_tag：仅检测到相关信号，尚未完成本地授权目录级核验" },
  ]);
});
