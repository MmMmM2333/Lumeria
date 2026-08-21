import { STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";

export function makeDesktopBoundsRegistration(state = {}, entries = [], desktopFrame = {}) {
  return {
    coordinateSpace: {
      bounds: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      desktopFrame: STAGE_COORDINATE_SPACES.STAGE_LAYOUT,
      layoutTargets: STAGE_COORDINATE_SPACES.STAGE_LAYOUT,
      stageRect: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    },
    deviceResolution: state.deviceResolution,
    entries,
    folderClosingHandoffIds: state.folderClosingHandoffIds,
    height: state.height,
    isTextlessMode: state.isTextlessMode,
    desktopFrame,
    stageRect: state.stageRect,
    width: state.width,
  };
}
