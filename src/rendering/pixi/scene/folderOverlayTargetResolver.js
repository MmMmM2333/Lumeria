import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";
import {
  getFolderPreviewChildBounds,
  getFolderPreviewChildTargetBounds,
  getTopLevelFolderThumbBounds,
  getTopLevelFolderThumbTargetBounds,
  getTopLevelIconBounds,
  getTopLevelIconTargetBounds,
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
      folderId: null,
      folderRect: null,
      folderThumbRect: null,
      getOpeningPreviewChildRect: () => null,
      previewSlots,
      stableFolderCloseTarget: previousStableFolderCloseTarget,
    };
  }

  const capturedOriginBounds = folderOpeningOriginBounds?.folderId === folderId
    ? folderOpeningOriginBounds
    : null;
  const liveFolderRect = getTopLevelIconBounds(folderId, {
    owner: "FolderOverlayLayer.open.folderRect",
    warnIfMissing: true,
  });
  const liveFolderThumbRect = getTopLevelFolderThumbBounds(folderId) || liveFolderRect;
  const folderRect = capturedOriginBounds?.iconRect || liveFolderRect;
  const folderThumbRect = capturedOriginBounds?.thumbRect || liveFolderThumbRect || folderRect;
  const targetFolderRect = getTopLevelIconTargetBounds(folderId);
  const targetFolderThumbRect = getTopLevelFolderThumbTargetBounds(folderId);
  const shouldRefreshStableCloseTarget = Boolean(
    (targetFolderRect || liveFolderRect || folderRect) &&
    (!previousStableFolderCloseTarget ||
      previousStableFolderCloseTarget.folderId !== folderId ||
      (isClosing && !wasClosing))
  );
  if (!shouldRefreshStableCloseTarget) {
    return {
      capturedOriginBounds,
      closeTargetSource: previousStableFolderCloseTarget?.source || null,
      folderId,
      folderRect,
      folderThumbRect,
      getOpeningPreviewChildRect: (item, previewSlotIndex) =>
        getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex) ||
        getFolderPreviewChildBounds(folderId, item?.id, previewSlotIndex),
      previewSlots,
      stableFolderCloseTarget: previousStableFolderCloseTarget,
    };
  }

  const captureFinalCloseTarget = Boolean(isClosing && !wasClosing);
  const hasTargetFolderRect = Boolean(targetFolderRect);
  const stableFolderCloseTarget = makeStableFolderCloseTarget({
    folderId,
    folderRect: captureFinalCloseTarget
      ? targetFolderRect || liveFolderRect || folderRect
      : targetFolderRect || folderRect,
    folderThumbRect: captureFinalCloseTarget
      ? targetFolderThumbRect || targetFolderRect || liveFolderThumbRect || folderThumbRect || liveFolderRect || folderRect
      : targetFolderThumbRect || targetFolderRect || folderThumbRect,
    getPreviewChildRect: (item, previewSlotIndex) =>
      getFolderPreviewChildTargetBounds(folderId, item.id, previewSlotIndex) ||
      (hasTargetFolderRect ? null : (
        getCapturedPreviewChildRect(capturedOriginBounds, item.id, previewSlotIndex) ||
        getFolderPreviewChildBounds(folderId, item.id, previewSlotIndex)
      )),
    previewSlots,
  });
  if (stableFolderCloseTarget) stableFolderCloseTarget.source = captureFinalCloseTarget ? "stable-final-close" : "stable-target";

  return {
    capturedOriginBounds,
    closeTargetSource: stableFolderCloseTarget?.source || null,
    folderId,
    folderRect,
    folderThumbRect,
    getOpeningPreviewChildRect: (item, previewSlotIndex) =>
      getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex) ||
      getFolderPreviewChildBounds(folderId, item?.id, previewSlotIndex),
    previewSlots,
    stableFolderCloseTarget,
  };
}
