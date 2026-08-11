import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { matchesIconFocus } from "../../../domain/iconFocus.js";
import { resolveIconInteractionPhase } from "../../../domain/input/launchpadTargetPresentation.js";
import { getIconVisualOffsetY } from "../geometry/iconMetrics.js";

export function makeFolderIconRenderPlan(options = {}) {
  const {
    folderId = null,
    geometry = null,
    index = 0,
    item = null,
    pageIndex = 0,
    pageSpan = null,
    slot = null,
  } = options;
  const safePageIndex = Math.max(0, Number(pageIndex) || 0);
  const safeIndex = Math.max(0, Number(index) || 0);
  const resolvedPageSpan = pageSpan != null && Number.isFinite(Number(pageSpan))
    ? Number(pageSpan)
    : Number(geometry?.grid?.width) || 0;
  const x = safePageIndex * resolvedPageSpan + (Number(slot?.left) || 0) + (Number(slot?.width) || 0) / 2;
  const y = (Number(slot?.top) || 0) + (Number(slot?.height) || 0) / 2;
  const source = { type: "folder", folderId, index: safeIndex, pageIndex: safePageIndex, slotIndex: safeIndex };
  return {
    key: `${folderId}:${safePageIndex}:${item?.id}`,
    source,
    x,
    y,
  };
}

export function makeFolderIconTargetCenter(options = {}) {
  const {
    geometry = null,
    isTextlessMode = false,
    targetTrackX = 0,
    x = 0,
    y = 0,
  } = options;
  return {
    x: (Number(geometry?.panel?.left) || 0) + x + targetTrackX,
    y: (Number(geometry?.panel?.top) || 0) + y + getIconVisualOffsetY(isTextlessMode),
  };
}

export function makeFolderIconNodeState(options = {}) {
  const {
    closingGhostKeys = null,
    folderId = null,
    folderPageSize = 0,
    groupTransferOwned = false,
    iconSize = 64,
    iconGesturePresentation = null,
    isActiveDraggedItem = false,
    isBatchSelectionActive = false,
    isEditMode = false,
    isIconOpening = null,
    isInteractivePage = false,
    isTextlessMode = false,
    item = null,
    launchTargetStatusById = null,
    openingGhostItemIds = null,
    pageIndex = 0,
    revealLabelAfterVisualHandoff = false,
    focusedIcon = null,
    selectedAppIds = null,
    showMissingLaunchTargetBadge = true,
    slot = null,
    source = null,
    stageHeight = 1,
    stageWidth = 1,
  } = options;
  const itemId = item?.id;
  const ghosted = Boolean(
    groupTransferOwned ||
    (isInteractivePage && (
      openingGhostItemIds?.has(itemId) ||
      closingGhostKeys?.has(itemId)
    ))
  );
  return {
    batchSelected: Boolean(
      isBatchSelectionActive &&
      item?.type === "app" &&
      (selectedAppIds instanceof Set
        ? selectedAppIds.has(itemId)
        : (selectedAppIds || []).includes?.(itemId))
    ),
    cellHeight: slot?.height,
    cellWidth: slot?.width,
    compact: false,
    dragging: isActiveDraggedItem,
    draggable: isInteractivePage,
    dropTarget: false,
    editing: isInteractivePage && isEditMode,
    folderPreviewPageSize: folderPageSize,
    ghosted,
    hasCustomIcon: Boolean(item?.customIconPath || item?.customIconDataUrl),
    iconSize,
    interactionPhase: resolveIconInteractionPhase(iconGesturePresentation, {
      interactive: isInteractivePage,
      itemId,
      scope: `folder:${folderId}`,
    }),
    interactive: isInteractivePage,
    item,
    jiggleSeed: Math.max(0, Number(pageIndex) || 0) * 100 + (Number(source?.index) || 0),
    launchTargetStatus: isInteractivePage && showMissingLaunchTargetBadge ? launchTargetStatusById?.[itemId] : null,
    opening: isInteractivePage && isIconOpening?.("folder", itemId, pageIndex, folderId),
    removable: item?.type === "app",
    revealLabelAfterVisualHandoff,
    focused: isInteractivePage && matchesIconFocus(focusedIcon, "folder", itemId, pageIndex, folderId),
    source,
    stageHeight,
    stageWidth,
    textless: isTextlessMode,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
