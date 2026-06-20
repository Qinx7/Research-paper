export function buildResearchWorkspaceState({
  project,
  directions,
  designs,
  previewDirectionId,
}) {
  const safeDirections = Array.isArray(directions) ? directions : [];
  const safeDesigns = Array.isArray(designs) ? designs : [];
  const currentDirection =
    safeDirections.find((item) => item?.title && item.title === project?.selected_topic) ?? null;
  const previewDirection =
    safeDirections.find((item) => item?.id === previewDirectionId)
    ?? currentDirection
    ?? safeDirections[0]
    ?? null;

  const currentDesign = currentDirection
    ? safeDesigns.find((item) => item?.direction_id === currentDirection.id) ?? null
    : null;
  const previewDesign = previewDirection
    ? safeDesigns.find((item) => item?.direction_id === previewDirection.id) ?? null
    : null;

  return {
    currentDirection,
    previewDirection,
    currentDesign,
    previewDesign,
    needsDirectionConfirmation: Boolean(
      previewDirection && currentDirection && previewDirection.id !== currentDirection.id,
    ),
    materialsLockedToCurrentDirection: Boolean(
      previewDirection && currentDirection && previewDirection.id !== currentDirection.id,
    ),
  };
}

export function getDirectionStatus(directionId, state) {
  return {
    isCurrent: Boolean(state?.currentDirection?.id === directionId),
    isPreview: Boolean(state?.previewDirection?.id === directionId),
  };
}
