import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";
import { stageLayoutRecordToClientRect, STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import {
  getRenderedClientFolderPreviewChildBounds,
  getRenderedClientTopLevelFolderThumbBounds,
  getRenderedClientTopLevelIconBounds,
  getStableStageLayoutFolderPreviewChildTargetRecord,
  getStableStageLayoutTopLevelFolderThumbTargetRecord,
  getStableStageLayoutTopLevelIconTargetRecord,
} from "../geometry/iconBoundsRegistry.js";
import { cloneRect, makePreviewChildKey, makeStableFolderCloseTarget } from "./folderOverlayTargets.js";

export function getCapturedPreviewChildRect(originBounds, childId, slotIndex) {
  if (!originBounds?.previewChildRects?.length || !childId) return null;
  const exact = originBounds.previewChildRects.find((entry) => entry?.childId === childId && entry.slotIndex === slotIndex);
  return exact?.rect || originBounds.previewChildRects.find((entry) => entry?.childId === childId)?.rect || null;
}

function projectStableRecordToClient(record) {
  return stageLayoutRecordToClientRect(record);
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
  const stableFolderStageLayoutRecord = getStableStageLayoutTopLevelIconTargetRecord(folderId);
  const stableFolderThumbStageLayoutRecord = getStableStageLayoutTopLevelFolderThumbTargetRecord(folderId);
  const stableFolderClientRect = projectStableRecordToClient(stableFolderStageLayoutRecord);
  const stableFolderThumbClientRect = projectStableRecordToClient(stableFolderThumbStageLayoutRecord);
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
  const stageLayoutPreviewChildRects = new Map();
  const stableFolderCloseTarget = makeStableFolderCloseTarget({
    folderId,
    projectedClientIconRect: captureFinalCloseTarget
      ? stableFolderClientRect || liveFolderClientRect || folderClientRect
      : stableFolderClientRect || folderClientRect,
    projectedClientThumbRect: captureFinalCloseTarget
      ? stableFolderThumbClientRect || stableFolderClientRect || liveFolderThumbClientRect || folderThumbClientRect || liveFolderClientRect || folderClientRect
      : stableFolderThumbClientRect || stableFolderClientRect || folderThumbClientRect,
    getProjectedClientPreviewChildRect: (item, previewSlotIndex) => {
      const stablePreviewRecord = getStableStageLayoutFolderPreviewChildTargetRecord(folderId, item.id, previewSlotIndex);
      const stablePreviewClientRect = projectStableRecordToClient(stablePreviewRecord);
      if (stablePreviewClientRect) {
        stageLayoutPreviewChildRects.set(makePreviewChildKey(item.id, previewSlotIndex), cloneRect(stablePreviewRecord));
        return stablePreviewClientRect;
      }
      return hasStableFolderClientRect ? null : (
        getCapturedPreviewChildRect(capturedOriginBounds, item.id, previewSlotIndex) ||
        getRenderedClientFolderPreviewChildBounds(folderId, item.id, previewSlotIndex)
      );
    },
    previewSlots,
  });
  if (stableFolderCloseTarget) {
    stableFolderCloseTarget.coordinateSpace = STAGE_COORDINATE_SPACES.CLIENT_VISUAL;
    stableFolderCloseTarget.source = captureFinalCloseTarget ? "stable-final-close" : "stable-target";
    stableFolderCloseTarget.stageLayoutCoordinateSpace = STAGE_COORDINATE_SPACES.STAGE_LAYOUT;
    stableFolderCloseTarget.stageLayoutIconRect = cloneRect(stableFolderStageLayoutRecord);
    stableFolderCloseTarget.stageLayoutPreviewChildRects = stageLayoutPreviewChildRects;
    stableFolderCloseTarget.stageLayoutThumbRect = cloneRect(stableFolderThumbStageLayoutRecord);
  }

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
