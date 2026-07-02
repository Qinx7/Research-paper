export function normalizeWritingPlan(rawPlan) {
  if (!rawPlan || typeof rawPlan !== "object" || Array.isArray(rawPlan)) {
    return null;
  }

  const goal = typeof rawPlan.goal === "string" ? rawPlan.goal : "";
  const recommendedStructure = Array.isArray(rawPlan.recommended_structure)
    ? rawPlan.recommended_structure.filter((item) => typeof item === "string" && item.trim())
    : [];
  const evidenceGaps = Array.isArray(rawPlan.evidence_gaps)
    ? rawPlan.evidence_gaps.filter((item) => typeof item === "string" && item.trim())
    : [];
  const risks = Array.isArray(rawPlan.risks)
    ? rawPlan.risks.filter((item) => typeof item === "string" && item.trim())
    : [];
  const notes = typeof rawPlan.notes === "string" ? rawPlan.notes : "";

  if (!goal && !recommendedStructure.length && !evidenceGaps.length && !risks.length && !notes) {
    return null;
  }

  return {
    goal,
    recommendedStructure,
    evidenceGaps,
    risks,
    notes,
  };
}
