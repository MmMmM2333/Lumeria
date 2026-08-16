import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { GROUP_TRANSFER_PHASE } from "../../../domain/groupTransferSession.js";
import { getGridSlotRect } from "../geometry/gridGeometry.js";
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
import { hasIconVisualSpecMismatch, makeIconVisualSpec } from "./iconVisualSpec.js";

export function makeFolderOverlayRenderPlan(options = {}) {
  const {
    closeThumbRect = null,
    closingGhostKeys = null,
    cols = 1,
    dragMeta = null,
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
    groupDragState = null,
    groupTransferOwnedItemIds = null,
    iconSize = 64,
    iconGesturePresentation = null,
    isClosing = false,
    isBatchSelectionActive = false,
    isEditMode = false,
    isFolderClosing = false,
    isIconOpening = null,
    isNewFolder = false,
    isTextlessMode = false,
    launchTargetStatusById = null,
    localMetrics = null,
    openingGhostItemIds = null,
    previewSlots = [],
    rows = 1,
    focusedIcon = null,
    selectedAppIds = null,
    showMissingLaunchTargetBadge = true,
    targetTrackX = 0,
    stableFolderPageSpan = folderPageSpan,
    stableFolderCloseTarget = null,
    stableGeometry = geometry,
    stableLocalMetrics = localMetrics,
    stableTargetTrackX = targetTrackX,
    stageHeight = 1,
    stageWidth = 1,
    visualFolderPageIndex = folderPageIndex,
  } = options;
  const previewSlotById = makePreviewSlotById(previewSlots);
  const ownedItemIds = groupTransferOwnedItemIds instanceof Set
    ? groupTransferOwnedItemIds
    : new Set(groupTransferOwnedItemIds || []);
  const hasVisualHandoff = [
    GROUP_TRANSFER_PHASE.RELEASING,
    GROUP_TRANSFER_PHASE.RETURNING,
  ].includes(groupDragState?.phase);
  const transferActorsAreTextless = Number(groupDragState?.totalCount) > 1 ||
    groupDragState?.visualSpec?.textless === true;
  const sourceVisualSpec = groupDragState?.visualSpec || null;
  const entries = [];

  (folderPages || []).forEach((page, pageIndex) => {
    const visibleItems = getVisibleFolderPage?.(page) || [];
    const renderMode = getFolderPageRenderMode?.(pageIndex) || "interactive";
    const isInteractivePage = renderMode === "interactive";
    if (renderMode === "empty") return;

    visibleItems.forEach((item, index) => {
      const slot = getGridSlotRect(localMetrics, index);
      const stableSlot = getGridSlotRect(stableLocalMetrics || localMetrics, index);
      const targetVisualSpec = makeIconVisualSpec({
        cellHeight: slot?.height,
        cellWidth: slot?.width,
        compact: false,
        iconSize,
        singleLineLabel: false,
        textless: isTextlessMode,
      });
      const iconPlan = makeFolderIconRenderPlan({
        folderId,
        geometry,
        index,
        item,
        pageIndex,
        pageSpan: folderPageSpan,
        slot,
      });
      const stableIconPlan = makeFolderIconRenderPlan({
        folderId,
        geometry: stableGeometry,
        index,
        item,
        pageIndex,
        pageSpan: stableFolderPageSpan,
        slot: stableSlot,
      });
      const { key, source, x, y } = iconPlan;
      const isActiveDraggedItem = Boolean(
        [GROUP_TRANSFER_PHASE.GATHERING, GROUP_TRANSFER_PHASE.DRAGGING].includes(groupDragState?.phase) &&
        ownedItemIds.has(item.id)
      );
      const hasActiveOpeningGhost = openingGhostItemIds?.has(item.id) === true;
      const targetCenter = makeFolderIconTargetCenter({ geometry, isTextlessMode, targetTrackX, x, y });
      const stableTargetCenter = makeFolderIconTargetCenter({
        geometry: stableGeometry,
        isTextlessMode,
        targetTrackX: stableTargetTrackX,
        x: stableIconPlan.x,
        y: stableIconPlan.y,
      });
      const nodeState = makeFolderIconNodeState({
        closingGhostKeys,
        folderId,
        folderPageSize,
        iconSize,
        iconGesturePresentation,
        groupTransferOwned: ownedItemIds.has(item.id),
        isActiveDraggedItem,
        isBatchSelectionActive,
        isEditMode,
        isIconOpening,
        isInteractivePage,
        isTextlessMode,
        item,
        launchTargetStatusById,
        openingGhostItemIds,
        pageIndex,
        revealLabelAfterVisualHandoff: hasVisualHandoff &&
          ownedItemIds.has(item.id) && (
            transferActorsAreTextless ||
            hasIconVisualSpecMismatch(sourceVisualSpec, targetVisualSpec)
          ),
        focusedIcon,
        selectedAppIds,
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
            pageIndex,
            previewSlotById,
          }
          : null,
        iconPlan,
        index,
        isActiveDraggedItem,
        isInteractivePage,
        item,
        key,
        nodeState,
        openingGhostInput: (isInteractivePage || hasActiveOpeningGhost) &&
          !isActiveDraggedItem &&
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
        stableTargetCenter,
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
