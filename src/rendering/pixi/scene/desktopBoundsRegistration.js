import { getStageVisualOffset } from "../geometry/stageCoordinates.js";

export function makeDesktopBoundsRegistration(state = {}, entries = [], desktopFrame = {}) {
  const stableStageRect = state.stableStageRect || state.stageRect;
  const stageVisualOffset = getStageVisualOffset(state.stageRect, stableStageRect);

  return {
    coordinateSpace: {
      bounds: "client-visual",
      desktopFrame: "stage-layout",
      layoutTargets: "stage-layout",
      stageRect: "client-visual",
      stableStageRect: "client-layout",
    },
    deviceResolution: state.deviceResolution,
    entries,
    folderClosingHandoffId: state.folderClosingHandoffId,
    height: state.height,
    isTextlessMode: state.isTextlessMode,
    desktopFrame,
    stableStageRect,
    stageRect: state.stageRect,
    stageVisualOffsetX: stageVisualOffset.x,
    stageVisualOffsetY: stageVisualOffset.y,
    width: state.width,
  };
}
