import { getFolderPanelGeometry } from "../geometry/gridGeometry.js";
import { makeStageLocalRect } from "../geometry/stageCoordinates.js";
import { getStableFolderCloseRects, makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";
import { resolveFolderOverlayTargets } from "./folderOverlayTargetResolver.js";

export function getSingleStageFolderProbeOptions(value = globalThis.__LP_SINGLE_STAGE_FOLDER__) {
  if (value === true) return { enabled: true, log: false, probe: true };
  if (!value || typeof value !== "object") return { enabled: false, log: false, probe: false };
  const enabled = value.enabled === true || value.probe === true;
  return {
    enabled,
    log: enabled && value.log === true,
    probe: enabled,
  };
}

export function isSingleStageFolderProbeEnabled(value = globalThis.__LP_SINGLE_STAGE_FOLDER__) {
  return getSingleStageFolderProbeOptions(value).enabled;
}

export function makeSingleStageFolderProbePlan(state, options = {}) {
  const enabled = options.enabled == null
    ? isSingleStageFolderProbeEnabled()
    : isSingleStageFolderProbeEnabled(options.enabled);
  if (!enabled || !state?.renderedFolder) return null;
  const geometry = getFolderPanelGeometry({
    height: state.height,
    panelStyle: state.folderPanelStyle,
    width: state.width,
  });
  const folderId = state.renderedFolder.id;
  const isClosing = Boolean(state.isFolderClosing || state.isFolderAppLaunchClosing);
  const overlayTargets = resolveFolderOverlayTargets({
    folder: state.renderedFolder,
    folderOpeningOriginBounds: state.folderOpeningOriginBounds,
    folderPageSize: state.folderPageSize,
    isClosing,
    previousStableFolderCloseTarget: options.previousStableFolderCloseTarget,
    wasClosing: options.wasClosing,
  });
  const closeRects = getStableFolderCloseRects({
    folderId,
    folderRect: overlayTargets.folderRect,
    folderThumbRect: overlayTargets.folderThumbRect,
    isClosing,
    stableFolderCloseTarget: overlayTargets.stableFolderCloseTarget,
  });
  const previewRects = (overlayTargets.previewSlots || []).slice(0, 9).map((item, slotIndex) => {
    if (!item?.id || !closeRects.closeThumbRect) return null;
    const rect = makeFolderThumbPreviewRect(closeRects.closeThumbRect, slotIndex);
    return {
      itemId: item.id,
      rect,
      localRect: makeStageLocalRect(rect, state.stageRect),
      slotIndex,
    };
  }).filter(Boolean);
  return {
    closeIconRect: closeRects.closeIconRect,
    closeIconLocalRect: makeStageLocalRect(closeRects.closeIconRect, state.stageRect),
    closeThumbRect: closeRects.closeThumbRect,
    closeThumbLocalRect: makeStageLocalRect(closeRects.closeThumbRect, state.stageRect),
    folderId,
    folderRect: overlayTargets.folderRect,
    folderLocalRect: makeStageLocalRect(overlayTargets.folderRect, state.stageRect),
    geometry,
    panelRect: geometry.panel,
    previewRects,
    stableFolderCloseTarget: overlayTargets.stableFolderCloseTarget,
    stageRect: state.stageRect,
  };
}
