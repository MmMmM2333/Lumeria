import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getGridSlotRect } from "../geometry/gridGeometry.js";
import {
  isActiveDraggedLaunchItem,
  isReleaseGhostLaunchItem,
} from "./dragVisibility.js";
import {
  makeFolderIconNodeState,
  makeFolderIconRenderPlan,
  makeFolderIconTargetCenter,
} from "./folderOverlayIconPlan.js";
import {
  findFolderGhostKey,
  makeClosingPreviewSwapTargets,
  makePreviewSlotById,
} from "./folderOverlayTargets.js";

export function makeFolderOverlayRenderPlan(options = {}) {
  const {
    closeThumbRect = null,
    closingGhostKeys = null,
    cols = 1,
    dragMeta = null,
    dragReleaseGhostId = null,
    folderCloseIconGhosts = null,
    folderId = null,
    folderOpenIconGhosts = null,
    folderPageIndex = 0,
    folderPages = [],
    folderPageSize = 0,
    folderPageSpan = null,
    geometry = null,
    getFolderPageRenderMode = null,
    getVisibleFolderPage = null,
    iconSize = 64,
    isClosing = false,
    isEditMode = false,
    isFolderClosing = false,
    isIconOpening = null,
    isIconSelected = null,
    isNewFolder = false,
    isTextlessMode = false,
    launchTargetStatusById = null,
    localMetrics = null,
    openingGhostItemIds = null,
    previewSlots = [],
    rows = 1,
    showMissingLaunchTargetBadge = true,
    stableFolderCloseTarget = null,
    stageHeight = 1,
    stageWidth = 1,
    targetTrackX = 0,
    visualFolderPageIndex = folderPageIndex,
  } = options;
  const previewSlotById = makePreviewSlotById(previewSlots);
  const dragState = { dragMeta, dragReleaseGhostId };
  const entries = [];

  (folderPages || []).forEach((page, pageIndex) => {
    const visibleItems = getVisibleFolderPage?.(page) || [];
    const renderMode = getFolderPageRenderMode?.(pageIndex) || "interactive";
    const isInteractivePage = renderMode === "interactive";
    if (renderMode === "empty") return;

    visibleItems.forEach((item, index) => {
      const slot = getGridSlotRect(localMetrics, index);
      const iconPlan = makeFolderIconRenderPlan({
        folderId,
        geometry,
        index,
        item,
        pageIndex,
        pageSpan: folderPageSpan,
        slot,
      });
      const { key, source, x, y } = iconPlan;
      const isActiveDraggedItem = isActiveDraggedLaunchItem(item, dragState);
      const isReleaseGhostItem = isReleaseGhostLaunchItem(item, dragState);
      const hasActiveOpeningGhost = openingGhostItemIds?.has(item.id) === true;
      const targetCenter = makeFolderIconTargetCenter({ geometry, isTextlessMode, targetTrackX, x, y });
      const nodeState = makeFolderIconNodeState({
        closingGhostKeys,
        folderId,
        folderPageSize,
        iconSize,
        isActiveDraggedItem,
        isEditMode,
        isIconOpening,
        isIconSelected,
        isInteractivePage,
        isReleaseGhostItem,
        isTextlessMode,
        item,
        launchTargetStatusById,
        openingGhostItemIds,
        pageIndex,
        showMissingLaunchTargetBadge,
        slot,
        source,
        stageHeight,
        stageWidth,
      });

      entries.push({
        closingGhostInput: isInteractivePage && isFolderClosing && pageIndex === folderPageIndex
          ? {
            cellHeight: slot.height,
            cellWidth: slot.width,
            cols,
            controllerGhostKey: findFolderGhostKey(folderCloseIconGhosts, item.id, index),
            folderId,
            iconSize,
            index,
            item,
            previewSlotById,
          }
          : null,
        iconPlan,
        index,
        isActiveDraggedItem,
        isInteractivePage,
        isReleaseGhostItem,
        item,
        key,
        nodeState,
        openingGhostInput: (isInteractivePage || hasActiveOpeningGhost) &&
          !isActiveDraggedItem &&
          !isReleaseGhostItem &&
          (isNewFolder || hasActiveOpeningGhost) &&
          !isClosing &&
          (pageIndex === visualFolderPageIndex || hasActiveOpeningGhost)
          ? {
            cellHeight: slot.height,
            cellWidth: slot.width,
            cols,
            controllerGhostKey: findFolderGhostKey(folderOpenIconGhosts, item.id, index),
            iconSize,
            index,
            item,
            previewSlotById,
            rows,
            targetCenterX: targetCenter.x,
            targetCenterY: targetCenter.y,
          }
          : null,
        pageIndex,
        renderMode,
        slot,
        source,
        targetCenter,
        x,
        y,
      });
    });
  });

  const closingPreviewSwapTargets = isFolderClosing && folderPageIndex > 0
    ? makeClosingPreviewSwapTargets({
      folderId,
      folderRect: closeThumbRect,
      previewSlots,
      stableFolderCloseTarget,
    })
    : [];

  return {
    closingPreviewSwapTargets,
    entries,
    previewSlotById,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
