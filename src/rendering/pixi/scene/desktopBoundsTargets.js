import { snapRectToDevicePixels, STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import { makeContainerTargetIconBounds, makeIconRect, makeTargetIconBounds } from "./iconSceneHelpers.js";
import { makeFolderThumbPreviewRect } from "./folderOverlayTargets.js";

export function resolveDesktopBoundsTargets(options = {}) {
  const {
    handoffLayoutTarget = null,
    isFolderClosingHandoff = false,
    item,
    node,
    registration,
    sizing,
    targetX,
    visualOffsetY = 0,
    x,
    y,
  } = options;
  const isFolder = item?.type === "folder";
  const rawLiveTargetBounds = makeContainerTargetIconBounds(
    options.visualRoot,
    registration.stageRect,
    registration.width,
    registration.height,
    targetX + x,
    y,
    sizing.iconSize,
    visualOffsetY
  );
  const rawStableTargetBounds = makeTargetIconBounds(
    registration.stableStageRect,
    registration.width,
    registration.height,
    targetX + x,
    y,
    sizing.iconSize,
    visualOffsetY
  );
  const stableStageLayoutTargetBounds = makeIconRect(targetX + x, y + visualOffsetY, sizing.iconSize);
  const stableClientTargetBounds = isFolder
    ? snapRectToDevicePixels(rawStableTargetBounds, registration.deviceResolution)
    : rawStableTargetBounds;
  let liveClientTargetBounds = isFolder
    ? snapRectToDevicePixels(rawLiveTargetBounds, registration.deviceResolution)
    : rawLiveTargetBounds;
  let renderedClientThumbBounds = null;
  if (isFolder) {
    renderedClientThumbBounds = snapRectToDevicePixels(
      node.getFolderThumbBounds(registration.stageRect),
      registration.deviceResolution
    );
    if (isFolderClosingHandoff) liveClientTargetBounds = stableClientTargetBounds;
  }
  const renderedClientIconBounds = isFolder
    ? snapRectToDevicePixels(node.getIconBounds(registration.stageRect), registration.deviceResolution)
    : node.getIconBounds(registration.stageRect);

  return {
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    liveClientTargetBounds,
    renderedClientIconBounds,
    renderedClientThumbBounds,
    stableStageLayoutTargetBounds,
    stableClientTargetBounds,
    syncHandoffLayoutTarget: isFolderClosingHandoff ? handoffLayoutTarget || { x, y } : null,
  };
}

export function resolveFolderPreviewChildBoundsTargets(options = {}) {
  const {
    node,
    slotIndex,
    stageRect,
    target = null,
  } = options;
  const stableStageLayoutTargetBounds = target?.stableStageLayoutThumbRect
    ? makeFolderThumbPreviewRect(target.stableStageLayoutThumbRect, slotIndex)
    : null;

  return {
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    liveClientTargetBounds: target?.liveThumbRect ? makeFolderThumbPreviewRect(target.liveThumbRect, slotIndex) : null,
    renderedClientBounds: node?.getFolderPreviewChildBounds?.(stageRect, slotIndex) || null,
    stableStageLayoutTargetBounds,
    stableClientTargetBounds: target?.stableThumbRect ? makeFolderThumbPreviewRect(target.stableThumbRect, slotIndex) : null,
  };
}
