import { STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";

export function makeDesktopBoundsRegistration(state = {}, entries = [], desktopFrame = {}) {
  const stableStageRect = state.stageRect;

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
    width: state.width,
  };
}
