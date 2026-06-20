import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResearchWorkspaceState,
  getDirectionStatus,
} from "../src/lib/researchWorkflow.mjs";

test("preselected direction only affects preview, not current direction", () => {
  const directions = [
    { id: "dir-a", title: "方向 A", content: { research_questions: ["Q1"] } },
    { id: "dir-b", title: "方向 B", content: { research_questions: ["Q2"] } },
  ];
  const project = { id: "proj-1", selected_topic: "方向 A" };

  const state = buildResearchWorkspaceState({
    project,
    directions,
    designs: [],
    previewDirectionId: "dir-b",
  });

  assert.equal(state.currentDirection?.id, "dir-a");
  assert.equal(state.previewDirection?.id, "dir-b");
  assert.equal(state.needsDirectionConfirmation, true);
});

test("selected topic is treated as current direction when titles match", () => {
  const directions = [
    { id: "dir-a", title: "具身智能中多模态知识图谱的表示学习与部署挑战评估", content: {} },
    { id: "dir-b", title: "方向 B", content: {} },
  ];
  const project = {
    id: "proj-1",
    selected_topic: "具身智能中多模态知识图谱的表示学习与部署挑战评估",
  };

  const state = buildResearchWorkspaceState({
    project,
    directions,
    designs: [],
    previewDirectionId: "dir-b",
  });

  assert.equal(state.currentDirection?.id, "dir-a");
  assert.deepEqual(getDirectionStatus("dir-a", state), {
    isCurrent: true,
    isPreview: false,
  });
  assert.deepEqual(getDirectionStatus("dir-b", state), {
    isCurrent: false,
    isPreview: true,
  });
});

test("design and proposal actions stay bound to current direction", () => {
  const directions = [
    { id: "dir-a", title: "方向 A", content: {} },
    { id: "dir-b", title: "方向 B", content: {} },
  ];
  const designs = [
    { id: "design-a", direction_id: "dir-a", topic: "方向 A 项目设计", content: { topic: "方向 A 项目设计" } },
    { id: "design-b", direction_id: "dir-b", topic: "方向 B 项目设计", content: { topic: "方向 B 项目设计" } },
  ];
  const project = { id: "proj-1", selected_topic: "方向 A" };

  const state = buildResearchWorkspaceState({
    project,
    directions,
    designs,
    previewDirectionId: "dir-b",
  });

  assert.equal(state.currentDirection?.id, "dir-a");
  assert.equal(state.currentDesign?.id, "design-a");
  assert.equal(state.previewDirection?.id, "dir-b");
  assert.equal(state.previewDesign?.id, "design-b");
  assert.equal(state.materialsLockedToCurrentDirection, true);
});
