import { getStageVisualOffset, STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";

export function makeDesktopBoundsRegistration(state = {}, entries = [], desktopFrame = {}) {
  const stableStageRect = state.stableStageRect || state.stageRect;
  const stageVisualOffset = getStageVisualOffset(state.stageRect, stableStageRect);

  return {
    coordinateSpace: {
      bounds: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      desktopFrame: STAGE_COORDINATE_SPACES.STAGE_LAYOUT,
      layoutTargets: STAGE_COORDINATE_SPACES.STAGE_LAYOUT,
      stageRect: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      stableStageRect: STAGE_COORDINATE_SPACES.CLIENT_LAYOUT,
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
