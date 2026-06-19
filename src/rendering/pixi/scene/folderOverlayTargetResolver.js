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
import { makeStableFolderCloseTarget } from "./folderOverlayTargets.js";

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
  const shouldRefreshStableCloseTarget = Boolean(
    stableFolderStageLayoutRecord &&
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

  const stableProjection = stableFolderStageLayoutRecord?.meta
    ? {
      stageHeight: stableFolderStageLayoutRecord.meta.stageHeight,
      stageRect: stableFolderStageLayoutRecord.meta.stageRect,
      stageWidth: stableFolderStageLayoutRecord.meta.stageWidth,
    }
    : null;
  const stableFolderCloseTarget = makeStableFolderCloseTarget({
    folderId,
    getStageLayoutPreviewChildRect: (item, previewSlotIndex) => {
      const stablePreviewRecord = getStableStageLayoutFolderPreviewChildTargetRecord(folderId, item.id, previewSlotIndex);
      const stablePreviewClientRect = projectStableRecordToClient(stablePreviewRecord);
      return stablePreviewClientRect ? stablePreviewRecord : null;
    },
    iconRect: stableFolderStageLayoutRecord,
    previewSlots,
    projection: stableProjection,
    source: isClosing && !wasClosing ? "stable-final-close" : "stable-target",
    thumbRect: stableFolderThumbStageLayoutRecord || stableFolderStageLayoutRecord,
  });

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
