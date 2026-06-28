import { getFolderPreviewSlots } from "../../../domain/launchpadLayout.js";
import { stageLayoutRecordToClientRect, STAGE_COORDINATE_SPACES } from "../geometry/stageCoordinates.js";
import {
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../geometry/iconBoundsRegistry.js";
import { makeStableFolderCloseTarget } from "./folderOverlayTargets.js";

const BOUNDS_KIND = ICON_BOUNDS_KIND;
const BOUNDS_VARIANT = ICON_BOUNDS_VARIANT;

export function getCapturedPreviewChildRect(originBounds, childId, slotIndex) {
  if (!originBounds?.previewChildRects?.length || !childId) return null;
  const exact = originBounds.previewChildRects.find((entry) => entry?.childId === childId && entry.slotIndex === slotIndex);
  return exact?.rect || originBounds.previewChildRects.find((entry) => entry?.childId === childId)?.rect || null;
}

function projectStableRecordToClient(record) {
  return stageLayoutRecordToClientRect(record);
}

function rectTrackingKey(rect) {
  if (!rect) return "null";
  return [
    rect.left,
    rect.top,
    rect.width,
    rect.height,
  ].map((value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : "null";
  }).join(",");
}

function makeLiveCloseTargetTrackingKey(options = {}) {
  const {
    desktopPageTrackOffset = null,
    folderId = null,
    iconRect = null,
    thumbRect = null,
  } = options;
  const liveX = Number.isFinite(Number(desktopPageTrackOffset?.liveX))
    ? Math.round(Number(desktopPageTrackOffset.liveX) * 1000) / 1000
    : "null";
  const targetX = Number.isFinite(Number(desktopPageTrackOffset?.targetX))
    ? Math.round(Number(desktopPageTrackOffset.targetX) * 1000) / 1000
    : "null";
  return [
    "live-close-target",
    folderId || "",
    `liveX:${liveX}`,
    `targetX:${targetX}`,
    `icon:${rectTrackingKey(iconRect)}`,
    `thumb:${rectTrackingKey(thumbRect)}`,
  ].join("|");
}

export function resolveFolderOverlayTargets(options = {}) {
  const {
    desktopPageTrackOffset = null,
    folder,
    folderOpeningOriginBounds = null,
    folderPageSize,
    iconBoundsRegistry,
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
  if (!iconBoundsRegistry) throw new Error("resolveFolderOverlayTargets requires iconBoundsRegistry");

  const capturedOriginBounds = folderOpeningOriginBounds?.folderId === folderId
    ? folderOpeningOriginBounds
    : null;
  const liveFolderClientRect = iconBoundsRegistry.getBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.RENDERED, folderId, {
    owner: "FolderOverlayLayer.open.folderRect",
    warnIfMissing: true,
  });
  const liveFolderThumbClientRect = iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.RENDERED, folderId) || liveFolderClientRect;
  const shouldUseLiveOpeningBounds = Boolean(capturedOriginBounds && liveFolderClientRect);
  const folderClientRect = shouldUseLiveOpeningBounds
    ? liveFolderClientRect
    : capturedOriginBounds?.iconRect || liveFolderClientRect;
  const folderThumbClientRect = shouldUseLiveOpeningBounds
    ? liveFolderThumbClientRect || liveFolderClientRect
    : capturedOriginBounds?.thumbRect || liveFolderThumbClientRect || folderClientRect;
  const stableFolderStageLayoutRecord = iconBoundsRegistry.getBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId);
  const stableFolderThumbStageLayoutRecord = iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, folderId);
  const liveFolderTargetRect = isClosing
    ? iconBoundsRegistry.getBounds(BOUNDS_KIND.TOP_LEVEL, BOUNDS_VARIANT.LIVE_TARGET, folderId)
    : null;
  const liveFolderThumbTargetRect = isClosing
    ? iconBoundsRegistry.getBounds(BOUNDS_KIND.FOLDER_THUMB, BOUNDS_VARIANT.LIVE_TARGET, folderId) || liveFolderTargetRect
    : null;
  const liveCloseTrackingKey = liveFolderTargetRect
    ? makeLiveCloseTargetTrackingKey({
      desktopPageTrackOffset,
      folderId,
      iconRect: liveFolderTargetRect,
      thumbRect: liveFolderThumbTargetRect,
    })
    : null;
  const shouldUseLiveCloseTarget = Boolean(isClosing && liveFolderTargetRect);
  const shouldRefreshLiveCloseTarget = Boolean(
    shouldUseLiveCloseTarget &&
    (!previousStableFolderCloseTarget ||
      previousStableFolderCloseTarget.folderId !== folderId ||
      previousStableFolderCloseTarget.coordinateSpace !== STAGE_COORDINATE_SPACES.CLIENT_VISUAL ||
      previousStableFolderCloseTarget.trackingKey !== liveCloseTrackingKey)
  );
  const shouldRefreshStableCloseTarget = Boolean(
    !shouldUseLiveCloseTarget &&
    stableFolderStageLayoutRecord &&
    (!previousStableFolderCloseTarget ||
      previousStableFolderCloseTarget.folderId !== folderId ||
      previousStableFolderCloseTarget.coordinateSpace !== STAGE_COORDINATE_SPACES.STAGE_LAYOUT ||
      (isClosing && !wasClosing))
  );
  if (!shouldRefreshLiveCloseTarget && !shouldRefreshStableCloseTarget) {
    return {
      capturedOriginBounds,
      closeTargetSource: previousStableFolderCloseTarget?.source || null,
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      folderClientRect,
      folderId,
      folderThumbClientRect,
      getOpeningPreviewChildClientRect: (item, previewSlotIndex) => shouldUseLiveOpeningBounds
        ? iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, { childId: item?.id, folderId, slotIndex: previewSlotIndex }) ||
          getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex)
        : getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex) ||
          iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, { childId: item?.id, folderId, slotIndex: previewSlotIndex }),
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
  const stableFolderCloseTarget = shouldRefreshLiveCloseTarget
    ? makeStableFolderCloseTarget({
      coordinateSpace: STAGE_COORDINATE_SPACES.CLIENT_VISUAL,
      folderId,
      getStageLayoutPreviewChildRect: (item, previewSlotIndex) =>
        iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.LIVE_TARGET, { childId: item.id, folderId, slotIndex: previewSlotIndex }),
      iconRect: liveFolderTargetRect,
      previewSlots,
      projection: null,
      source: isClosing && !wasClosing ? "live-final-close" : "live-target",
      thumbRect: liveFolderThumbTargetRect || liveFolderTargetRect,
      trackingKey: liveCloseTrackingKey,
    })
    : makeStableFolderCloseTarget({
      folderId,
      getStageLayoutPreviewChildRect: (item, previewSlotIndex) => {
        const stablePreviewRecord = iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.STABLE_STAGE_LAYOUT, { childId: item.id, folderId, slotIndex: previewSlotIndex });
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
    getOpeningPreviewChildClientRect: (item, previewSlotIndex) => shouldUseLiveOpeningBounds
      ? iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, { childId: item?.id, folderId, slotIndex: previewSlotIndex }) ||
        getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex)
      : getCapturedPreviewChildRect(capturedOriginBounds, item?.id, previewSlotIndex) ||
        iconBoundsRegistry.getBounds(BOUNDS_KIND.PREVIEW_CHILD, BOUNDS_VARIANT.RENDERED, { childId: item?.id, folderId, slotIndex: previewSlotIndex }),
    previewSlots,
    stableFolderCloseTarget,
  };
}
