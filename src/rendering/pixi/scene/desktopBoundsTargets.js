import { snapRectToDevicePixels } from "../geometry/stageCoordinates.js";
import { makeContainerTargetIconBounds, makeTargetIconBounds } from "./iconSceneHelpers.js";
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
  const stableTargetBounds = isFolder
    ? snapRectToDevicePixels(rawStableTargetBounds, registration.deviceResolution)
    : rawStableTargetBounds;
  let liveTargetBounds = isFolder
    ? snapRectToDevicePixels(rawLiveTargetBounds, registration.deviceResolution)
    : rawLiveTargetBounds;
  let folderThumbBounds = null;
  if (isFolder) {
    folderThumbBounds = snapRectToDevicePixels(
      node.getFolderThumbBounds(registration.stageRect),
      registration.deviceResolution
    );
    if (isFolderClosingHandoff) liveTargetBounds = stableTargetBounds;
  }
  const iconBounds = isFolder
    ? snapRectToDevicePixels(node.getIconBounds(registration.stageRect), registration.deviceResolution)
    : node.getIconBounds(registration.stageRect);

  return {
    coordinateSpace: "client-visual",
    folderThumbBounds,
    iconBounds,
    liveTargetBounds,
    stableTargetBounds,
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

  return {
    bounds: node?.getFolderPreviewChildBounds?.(stageRect, slotIndex) || null,
    coordinateSpace: "client-visual",
    liveTargetBounds: target?.liveThumbRect ? makeFolderThumbPreviewRect(target.liveThumbRect, slotIndex) : null,
    stableTargetBounds: target?.stableThumbRect ? makeFolderThumbPreviewRect(target.stableThumbRect, slotIndex) : null,
  };
}
