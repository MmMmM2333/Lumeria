import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";
import { STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import {
  getRenderedClientFolderPreviewChildBounds,
  getRenderedClientTopLevelFolderThumbBounds,
  getRenderedClientTopLevelIconBounds,
  getStableClientFolderPreviewChildTargetBounds,
  getStableClientTopLevelFolderThumbTargetBounds,
  getStableClientTopLevelIconTargetBounds,
} from "../geometry/iconBoundsRegistry.js";
import { makeStableFolderCloseTarget } from "./folderOverlayTargets.js";

export function getCapturedPreviewChildRect(originBounds, childId, slotIndex) {
  if (!originBounds?.previewChildRects?.length || !childId) return null;
  const exact = originBounds.previewChildRects.find((entry) => entry?.childId === childId && entry.slotIndex === slotIndex);
  return exact?.rect || originBounds.previewChildRects.find((entry) => entry?.childId === childId)?.rect || null;
}

export function resolveFolderOverlayTargets(options = {}) {
  const {
    folder,
    folderOpeningOriginBounds = null,
    folderPageSize,
    isClosing = false,
    previousStableFolderCloseTarget = null,
    wasClosing = false,
  } = options;
  const folderId = folder?.id || null;
  const previewSlots = getFolderPreviewSlots(folder, folderPageSize);
  if (!folderId) {
    return {
      capturedOriginBounds: null,
      closeTargetSource: null,
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      folderClientRect: null,
      folderId: null,
      folderThumbClientRect: null,
      getOpeningPreviewChildClientRect: () => null,
      previewSlots,
      stableFolderCloseTarget: previousStableFolderCloseTarget,
    };
  }

  const capturedOriginBounds = folderOpeningOriginBounds?.folderId === folderId
    ? folderOpeningOriginBounds
    : null;
  const liveFolderClientRect = getRenderedClientTopLevelIconBounds(folderId, {
    owner: "FolderOverlayLayer.open.folderRect",
    warnIfMissing: true,
  });
  const liveFolderThumbClientRect = getRenderedClientTopLevelFolderThumbBounds(folderId) || liveFolderClientRect;
  const folderClientRect = capturedOriginBounds?.iconRect || liveFolderClientRect;
  const folderThumbClientRect = capturedOriginBounds?.thumbRect || liveFolderThumbClientRect || folderClientRect;
  const stableFolderClientRect = getStableClientTopLevelIconTargetBounds(folderId);
  const stableFolderThumbClientRect = getStableClientTopLevelFolderThumbTargetBounds(folderId);
  const shouldRefreshStableCloseTarget = Boolean(
    (stableFolderClientRect || liveFolderClientRect || folderClientRect) &&
    (!previousStableFolderCloseTarget ||
      previousStableFolderCloseTarget.folderId !== folderId ||
      (isClosing && !wasClosing))
  );
  if (!shouldRefreshStableCloseTarget) {
    return {
      capturedOriginBounds,
      closeTargetSource: previousStableFolderCloseTarget?.source || null,
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      folderClientRect,
      folderId,
      folderThumbClientRect,
      getOpeningPreviewChildClientRect: (item, previewSlotIndex) =>
        getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex) ||
        getRenderedClientFolderPreviewChildBounds(folderId, item?.id, previewSlotIndex),
      previewSlots,
      stableFolderCloseTarget: previousStableFolderCloseTarget,
    };
  }

  const captureFinalCloseTarget = Boolean(isClosing && !wasClosing);
  const hasStableFolderClientRect = Boolean(stableFolderClientRect);
  const stableFolderCloseTarget = makeStableFolderCloseTarget({
    folderId,
    folderRect: captureFinalCloseTarget
      ? stableFolderClientRect || liveFolderClientRect || folderClientRect
      : stableFolderClientRect || folderClientRect,
    folderThumbRect: captureFinalCloseTarget
      ? stableFolderThumbClientRect || stableFolderClientRect || liveFolderThumbClientRect || folderThumbClientRect || liveFolderClientRect || folderClientRect
      : stableFolderThumbClientRect || stableFolderClientRect || folderThumbClientRect,
    getPreviewChildRect: (item, previewSlotIndex) =>
      getStableClientFolderPreviewChildTargetBounds(folderId, item.id, previewSlotIndex) ||
      (hasStableFolderClientRect ? null : (
        getCapturedPreviewChildRect(capturedOriginBounds, item.id, previewSlotIndex) ||
        getRenderedClientFolderPreviewChildBounds(folderId, item.id, previewSlotIndex)
      )),
    previewSlots,
  });
  if (stableFolderCloseTarget) stableFolderCloseTarget.source = captureFinalCloseTarget ? "stable-final-close" : "stable-target";

  return {
    capturedOriginBounds,
    closeTargetSource: stableFolderCloseTarget?.source || null,
    coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
    folderClientRect,
    folderId,
    folderThumbClientRect,
    getOpeningPreviewChildClientRect: (item, previewSlotIndex) =>
      getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex) ||
      getRenderedClientFolderPreviewChildBounds(folderId, item?.id, previewSlotIndex),
    previewSlots,
    stableFolderCloseTarget,
  };
}
