import { nextTick, ref, shallowRef } from "vue";
import {
  DESKTOP_SORT_MIN_DISTANCE,
  FOLDER_HIT_ZONE_SCALE,
  FOLDER_HOVER_DELAY,
  FOLDER_HOVER_STICKY_MARGIN,
  FOLDER_PAGE_EDGE_SIZE,
  FOLDER_SORT_MIN_DISTANCE,
  LONG_PRESS_DELAY,
  LONG_PRESS_MOVE_THRESHOLD,
  PAGE_EDGE_SIZE,
  PAGE_TURN_DELAY,
} from "./launchpadConstants.js";
import {
  clamp,
  expandRect,
  isPointInsideRect,
  makePreviewTransform,
  shouldCommitPlacementFromLast,
  shrinkRect,
} from "../domain/launchpadLayout.js";
import { getDomRefElement } from "./usePageGridMetrics.js";

export function useLaunchpadDrag(options) {
  const dragMeta = shallowRef(null);
  const pendingTargetId = ref(null);

  let dragRuntime = null;
  let dragPlacement = null;
  let folderHover = null;
  let lastPlacementCommit = null;
  let pendingPreviewPoint = null;
  let previewRafId = 0;
  let pendingTimer = null;
  let pageTurnTimer = null;
  let folderPageTurnTimer = null;
  let dragListenersAttached = false;
  let longPressState = null;

  function isDragActive() {
    return Boolean(dragRuntime);
  }

  function placementKey(kind) {
    const parts = Array.prototype.slice.call(arguments, 1);
    return `${kind}:${parts.join(":")}`;
  }

  function clearPendingTarget() {
    if (pendingTimer) window.clearTimeout(pendingTimer.timer);
    pendingTimer = null;
    folderHover = null;
    pendingTargetId.value = null;
  }

  function clearPendingTimerButKeepSticky() {
    if (pendingTimer) window.clearTimeout(pendingTimer.timer);
    pendingTimer = null;
    pendingTargetId.value = null;
  }

  function clearPageTurn() {
    if (pageTurnTimer) window.clearTimeout(pageTurnTimer.timer);
    pageTurnTimer = null;
  }

  function clearFolderPageTurn() {
    if (folderPageTurnTimer) window.clearTimeout(folderPageTurnTimer.timer);
    folderPageTurnTimer = null;
  }

  function attachDragListeners() {
    if (dragListenersAttached) return;
    dragListenersAttached = true;
    window.addEventListener("pointermove", updateDragPointer, { passive: false });
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
  }

  function detachDragListeners() {
    if (!dragListenersAttached) return;
    dragListenersAttached = false;
    window.removeEventListener("pointermove", updateDragPointer);
    window.removeEventListener("pointerup", finishDrag);
    window.removeEventListener("pointercancel", finishDrag);
  }

  function updatePreviewElement() {
    previewRafId = 0;
    if (!pendingPreviewPoint || !dragRuntime) return;
    const preview = getDomRefElement(options.dragPreviewRef.value);
    if (!preview) return;
    preview.style.transform = makePreviewTransform(pendingPreviewPoint, dragRuntime.offset);
  }

  function schedulePreviewPosition(clientX, clientY) {
    pendingPreviewPoint = { x: clientX, y: clientY };
    if (previewRafId) return;
    previewRafId = window.requestAnimationFrame(updatePreviewElement);
  }

  function cancelPreviewRaf() {
    if (previewRafId) window.cancelAnimationFrame(previewRafId);
    previewRafId = 0;
    pendingPreviewPoint = null;
  }

  function endDrag() {
    const shouldClampFolderPage = Boolean(options.renderedFolder.value || options.openFolderId.value);
    detachDragListeners();
    cancelPreviewRaf();
    dragRuntime = null;
    dragMeta.value = null;
    dragPlacement = null;
    folderHover = null;
    lastPlacementCommit = null;
    if (shouldClampFolderPage) options.commitFolderPageIndex(options.folderPageIndex.value);
    options.commitPageIndex(options.pageIndex.value);
  }

  function calcPageInsertIndex(clientX, clientY, targetPageIndex) {
    const safePageIndex = typeof targetPageIndex === "number" ? targetPageIndex : options.pageIndex.value;
    const page = options.pageRefs[safePageIndex];
    if (!page) return options.pages.value[safePageIndex]?.length || 0;

    const rect = page.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / (rect.width / options.gridCols.value)), 0, options.gridCols.value - 1);
    const row = clamp(Math.floor(y / (rect.height / options.gridRows.value)), 0, options.gridRows.value - 1);
    return clamp(row * options.gridCols.value + col, 0, options.pageSize.value - 1);
  }

  function getCurrentFolderGridElement() {
    return options.folderPageRefs[options.folderPageIndex.value] || null;
  }

  function isInsideCurrentFolderGrid(clientX, clientY) {
    const grid = getCurrentFolderGridElement();
    const rect = grid?.getBoundingClientRect();
    return rect ? isPointInsideRect(rect, clientX, clientY) : false;
  }

  function calcFolderInsertTarget(clientX, clientY) {
    const grid = getCurrentFolderGridElement();
    const folder = options.openFolderId.value ? options.findFolder(options.pages.value, options.openFolderId.value)?.item : null;
    if (!grid || !folder) {
      const fallbackPages = options.getFolderChildPages(folder, options.folderPageSize.value);
      const fallbackPageIndex = clamp(options.folderPageIndex.value, 0, Math.max(0, fallbackPages.length - 1));
      return { pageIndex: fallbackPageIndex, index: fallbackPages[fallbackPageIndex]?.length || 0 };
    }

    const rect = grid.getBoundingClientRect();
    const cellWidth = rect.width / options.folderCols.value;
    const cellHeight = rect.height / options.folderRows.value;
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / cellWidth), 0, options.folderCols.value - 1);
    const row = clamp(Math.floor(y / cellHeight), 0, options.folderRows.value - 1);
    return { pageIndex: options.folderPageIndex.value, index: row * options.folderCols.value + col };
  }

  function getTopLevelTargetAtPoint(clientX, clientY) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const element of elements) {
      const node = element.closest?.("[data-top-item-id]");
      const id = node?.getAttribute("data-top-item-id");
      if (!id || id === dragRuntime?.item.id) continue;
      const found = options.findTopLevel(options.pages.value, id);
      if (found) return { item: found.item, node };
    }
    return null;
  }

  function isInsideFolderHitZone(targetInfo, clientX, clientY) {
    if (!targetInfo?.node) return false;
    return isPointInsideRect(shrinkRect(targetInfo.node.getBoundingClientRect(), FOLDER_HIT_ZONE_SCALE), clientX, clientY);
  }

  function isInsideStickyFolderZone(clientX, clientY) {
    if (!folderHover?.stickyRect) return false;
    return isPointInsideRect(folderHover.stickyRect, clientX, clientY);
  }

  function lockFolderHoverTarget(targetInfo) {
    if (!targetInfo?.node) return;
    folderHover = { targetId: targetInfo.item.id, stickyRect: expandRect(targetInfo.node.getBoundingClientRect(), FOLDER_HOVER_STICKY_MARGIN) };
  }

  function startPendingFolderTarget(target) {
    if (pendingTimer?.targetId === target.id) return;
    clearPendingTimerButKeepSticky();
    pendingTargetId.value = target.id;

    pendingTimer = {
      targetId: target.id,
      timer: window.setTimeout(() => {
        const activeDrag = dragRuntime;
        if (!activeDrag || activeDrag.item.type !== "app") return;
        const latestTarget = options.findTopLevel(options.pages.value, target.id)?.item;
        if (!latestTarget || latestTarget.id === activeDrag.item.id) return;
        clearPendingTarget();
        if (latestTarget.type === "folder") openExistingFolderForDrop(latestTarget.id);
        else createFolderForDrop(latestTarget.id);
      }, FOLDER_HOVER_DELAY),
    };
  }

  function createFolderForDrop(targetAppId) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;

    const withoutDragged = options.removeEverywhere(options.pages.value, activeDrag.item.id);
    const target = options.findTopLevel(withoutDragged, targetAppId);
    if (!target || target.item.type !== "app") return;

    const folderId = options.makeId("folder");
    const originGeometry =
      options.getTopLevelIconMotionGeometry(targetAppId, folderId) ||
      options.getPageSlotMotionGeometry(folderId, target.pageIndex, target.index);
    const next = options.clonePages(withoutDragged);
    next[target.pageIndex][target.index] = options.withFolderPages(
      { id: folderId, type: "folder", name: "新文件夹" },
      [[options.cloneItem(target.item)]]
    );

    dragPlacement = placementKey("folder-open", folderId);
    lastPlacementCommit = null;
    options.commitPages(options.compactPages(next));
    options.commitOpenFolder(folderId, { originGeometry });
    options.commitFolderSession({ mode: "created", folderId, targetApp: options.cloneItem(target.item), hasEntered: false, openedAt: Date.now() });
  }

  function openExistingFolderForDrop(folderId) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;
    dragPlacement = placementKey("folder-open", folderId);
    lastPlacementCommit = null;
    options.commitPages(options.removeEverywhere(options.pages.value, activeDrag.item.id));
    options.commitOpenFolder(folderId);
    options.commitFolderSession({ mode: "existing", folderId, hasEntered: false, openedAt: Date.now() });
  }

  function cancelFolderSessionAndReturnToDesktop(cancelOptions) {
    const activeDrag = dragRuntime;
    const session = options.folderSession.value;
    if (!activeDrag || !session) return;

    const safeOptions = cancelOptions || {};
    let next = options.removeEverywhere(options.pages.value, activeDrag.item.id);
    if (session.mode === "created" && session.targetApp) next = options.replaceFolderWithItem(next, session.folderId, session.targetApp);
    const insertIndex = calcPageInsertIndex(activeDrag.pointer.x, activeDrag.pointer.y);
    const shouldCommitOverflow = Boolean(safeOptions.force) || !options.wouldTopLevelInsertOverflow(next, activeDrag.item, options.pageIndex.value, options.pageSize.value);
    next = shouldCommitOverflow
      ? options.insertTopLevelItem(next, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value)
      : options.previewTopLevelItemWithoutOverflow(next, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value);
    dragPlacement = placementKey("page", options.pageIndex.value, insertIndex);

    options.commitOpenFolder(null);
    options.commitFolderSession(null);
    options.commitPages(next);
    clearPendingTarget();
    options.commitFolderPageIndex(options.folderPageIndex.value);
  }

  function shouldCommitPlacement(key, clientX, clientY, minDistance, force) {
    return shouldCommitPlacementFromLast(lastPlacementCommit, clientX, clientY, minDistance, Boolean(force));
  }

  function rememberPlacementCommit(key, clientX, clientY) {
    lastPlacementCommit = { key, x: clientX, y: clientY };
  }

  function placeDraggedItemOnDesktop(clientX, clientY, placeOptions) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    const safeOptions = placeOptions || {};
    const insertIndex = calcPageInsertIndex(clientX, clientY);
    const key = placementKey("page", options.pageIndex.value, insertIndex);
    const isAlreadyVisible = Boolean(options.findTopLevel(options.pages.value, activeDrag.item.id));
    const needsMove = dragPlacement !== key || !isAlreadyVisible;
    if (!needsMove) return;
    const wouldOverflow = options.wouldTopLevelInsertOverflow(options.pages.value, activeDrag.item, options.pageIndex.value, options.pageSize.value);
    if (!shouldCommitPlacement(key, clientX, clientY, DESKTOP_SORT_MIN_DISTANCE, safeOptions.force || !isAlreadyVisible)) return;

    const next = safeOptions.force || !wouldOverflow
      ? options.insertTopLevelItem(options.pages.value, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value)
      : options.previewTopLevelItemWithoutOverflow(options.pages.value, activeDrag.item, options.pageIndex.value, insertIndex, options.pageSize.value);
    dragPlacement = key;
    rememberPlacementCommit(key, clientX, clientY);
    options.commitPages(next);
  }

  function placeDraggedItemInFolder(folderId, clientX, clientY, placeOptions) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app") return;
    const safeOptions = placeOptions || {};
    const target = calcFolderInsertTarget(clientX, clientY);
    const key = placementKey("folder", folderId, target.pageIndex, target.index);
    const existing = options.findInFolder(options.pages.value, folderId, activeDrag.item.id);
    const needsMove = dragPlacement !== key || !existing || existing.pageIndex !== target.pageIndex || existing.index !== target.index;
    if (!needsMove) return;
    const wouldOverflow = options.wouldFolderInsertOverflow(options.pages.value, folderId, activeDrag.item, target.pageIndex, options.folderPageSize.value);
    if (!shouldCommitPlacement(key, clientX, clientY, FOLDER_SORT_MIN_DISTANCE, safeOptions.force || !existing)) return;

    const next = safeOptions.force || !wouldOverflow
      ? options.insertAppIntoFolder(options.pages.value, folderId, activeDrag.item, target.pageIndex, target.index, options.folderPageSize.value)
      : options.previewAppIntoFolderWithoutOverflow(options.pages.value, folderId, activeDrag.item, target.pageIndex, target.index, options.folderPageSize.value);
    dragPlacement = key;
    rememberPlacementCommit(key, clientX, clientY);
    options.commitPages(next);
  }

  function handleFolderSessionMove(clientX, clientY) {
    const activeDrag = dragRuntime;
    const session = options.folderSession.value;
    const folderId = options.openFolderId.value;
    if (!activeDrag || !session || !folderId) return false;

    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    const inside = rect ? isPointInsideRect(rect, clientX, clientY) : false;

    clearPendingTarget();

    if (inside) {
      if (!session.hasEntered) options.commitFolderSession({ ...session, hasEntered: true });
      if (isInsideCurrentFolderGrid(clientX, clientY)) placeDraggedItemInFolder(folderId, clientX, clientY);
      return true;
    }

    if (!session.hasEntered) return true;

    cancelFolderSessionAndReturnToDesktop();
    return true;
  }

  function handlePageEdgeTurn(clientX) {
    const width = window.innerWidth;
    const direction = clientX > width - PAGE_EDGE_SIZE ? 1 : clientX < PAGE_EDGE_SIZE ? -1 : 0;
    if (!direction) {
      clearPageTurn();
      return;
    }
    if (pageTurnTimer?.direction === direction) return;
    clearPageTurn();

    pageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        const currentPage = options.pageIndex.value;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) {
          options.commitPageIndex(Math.max(0, currentPage - 1));
          return;
        }
        if (currentPage >= options.pages.value.length - 1) {
          const draggedItemId = dragRuntime?.item?.id;
          if (!options.canCreateDesktopPageAfterDrag(options.pages.value, currentPage, draggedItemId)) return;
          options.commitPages([...options.pages.value, []]);
        }
        options.commitPageIndex(currentPage + 1);
      }, PAGE_TURN_DELAY),
    };
  }

  function handleFolderPageEdgeTurn(clientX, clientY) {
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    if (!rect || !isPointInsideRect(rect, clientX, clientY)) {
      clearFolderPageTurn();
      return;
    }

    const direction = clientX < rect.left + FOLDER_PAGE_EDGE_SIZE ? -1 : clientX > rect.right - FOLDER_PAGE_EDGE_SIZE ? 1 : 0;
    if (!direction) {
      clearFolderPageTurn();
      return;
    }

    if (direction < 0 && options.folderPageIndex.value <= 0) {
      clearFolderPageTurn();
      return;
    }

    if (folderPageTurnTimer?.direction === direction) return;
    clearFolderPageTurn();

    folderPageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        const currentPage = options.folderPageIndex.value;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) options.commitFolderPageIndex(currentPage - 1);
        else {
          const isCreatingNewPage = currentPage >= options.folderPages.value.length - 1;
          if (isCreatingNewPage) {
            const folder = options.openFolderId.value ? options.findFolder(options.pages.value, options.openFolderId.value)?.item : null;
            const draggedItemId = dragRuntime?.item?.id;
            if (!options.canCreateFolderPageAfterDrag(folder, currentPage, draggedItemId, options.folderPageSize.value)) return;
          }
          options.commitFolderPageIndex(currentPage + 1, { allowCreate: true });
        }
        folderPageTurnTimer = null;
      }, PAGE_TURN_DELAY),
    };
  }

  function handleDefaultDesktopMove(clientX, clientY) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;

    if (activeDrag.item.type === "app") {
      const targetInfo = getTopLevelTargetAtPoint(clientX, clientY);
      const targetStillSticky = pendingTimer && isInsideStickyFolderZone(clientX, clientY);
      if (targetInfo && isInsideFolderHitZone(targetInfo, clientX, clientY)) {
        lockFolderHoverTarget(targetInfo);
        startPendingFolderTarget(targetInfo.item);
        return;
      }
      if (targetStillSticky) return;
      clearPendingTarget();
    } else {
      clearPendingTarget();
    }

    placeDraggedItemOnDesktop(clientX, clientY);
  }

  function cancelLongPress() {
    if (!longPressState) return;
    window.clearTimeout(longPressState.timer);
    longPressState = null;
    window.removeEventListener("pointermove", handleLongPressMove);
    window.removeEventListener("pointerup", handleLongPressUp);
    window.removeEventListener("pointercancel", handleLongPressUp);
  }

  function handleLongPressMove(event) {
    if (!longPressState) return;
    const dist = Math.hypot(event.clientX - longPressState.startPoint.x, event.clientY - longPressState.startPoint.y);
    if (dist > LONG_PRESS_MOVE_THRESHOLD) cancelLongPress();
  }

  function handleLongPressUp(_event) {
    if (!longPressState) return;
    const lp = longPressState;
    cancelLongPress();
    if (options.isLaunchpadInteractionBlocked()) return;
    if (lp.item.type === "app") options.openApp(lp.item, lp.source);
    else if (lp.item.type === "folder" && lp.source.type === "page") options.commitOpenFolder(lp.item.id);
  }

  function executeDragStart() {
    const lp = longPressState;
    if (!lp) return;
    if (options.isLaunchpadInteractionBlocked()) {
      cancelLongPress();
      return;
    }
    if (options.isHomeRevealSettling.value && !options.isFolderLayerActive.value) options.finishHomeRevealSettleWindow();
    window.removeEventListener("pointermove", handleLongPressMove);
    window.removeEventListener("pointerup", handleLongPressUp);
    window.removeEventListener("pointercancel", handleLongPressUp);
    longPressState = null;

    clearPendingTarget();
    clearPageTurn();
    clearFolderPageTurn();

    const nextDrag = {
      item: lp.item,
      source: lp.source,
      pointer: { x: lp.startPoint.x, y: lp.startPoint.y },
      offset: lp.offset,
      start: { x: lp.startPoint.x, y: lp.startPoint.y },
      hasMoved: false,
    };

    dragRuntime = nextDrag;
    dragMeta.value = { item: nextDrag.item, source: nextDrag.source };
    dragPlacement = lp.source.type === "page" ? placementKey("page", lp.source.pageIndex, lp.source.index) : null;
    lastPlacementCommit = { key: dragPlacement, x: lp.startPoint.x, y: lp.startPoint.y };
    attachDragListeners();
    nextTick(() => schedulePreviewPosition(lp.startPoint.x, lp.startPoint.y));

    if (lp.source.type === "folder") {
      options.commitPages(options.removeEverywhere(options.pages.value, lp.item.id, { preserveFolderIds: [lp.source.folderId] }));
      options.commitFolderSession({ mode: "source-folder", folderId: lp.source.folderId, hasEntered: true, openedAt: Date.now() });
    }
  }

  function beginDrag(event, item, source) {
    event.preventDefault();
    event.stopPropagation();

    if (options.isLaunchpadInteractionBlocked() || dragRuntime || longPressState) return;

    cancelLongPress();

    const iconBox = event.currentTarget.querySelector(".icon-box");
    const rect = iconBox ? iconBox.getBoundingClientRect() : event.currentTarget.getBoundingClientRect();
    longPressState = {
      item: options.cloneItem(item),
      source,
      startPoint: { x: event.clientX, y: event.clientY },
      offset: { x: event.clientX - rect.left, y: event.clientY - rect.top },
      timer: window.setTimeout(executeDragStart, LONG_PRESS_DELAY),
    };

    window.addEventListener("pointermove", handleLongPressMove);
    window.addEventListener("pointerup", handleLongPressUp);
    window.addEventListener("pointercancel", handleLongPressUp);
  }

  function updateDragPointer(event) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;

    event.preventDefault();
    const distance = Math.hypot(event.clientX - activeDrag.start.x, event.clientY - activeDrag.start.y);
    activeDrag.pointer = { x: event.clientX, y: event.clientY };
    activeDrag.hasMoved = activeDrag.hasMoved || distance > 6;
    schedulePreviewPosition(event.clientX, event.clientY);

    if (options.folderSession.value || options.openFolderId.value) {
      clearPageTurn();
      handleFolderPageEdgeTurn(event.clientX, event.clientY);
    } else {
      clearFolderPageTurn();
      handlePageEdgeTurn(event.clientX);
    }

    if (options.folderSession.value && handleFolderSessionMove(event.clientX, event.clientY)) return;
    handleDefaultDesktopMove(event.clientX, event.clientY);
  }

  function finishDrag(event) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    if (options.isLaunchpadInteractionBlocked()) {
      endDrag();
      return;
    }

    activeDrag.pointer = { x: event.clientX, y: event.clientY };
    schedulePreviewPosition(event.clientX, event.clientY);

    clearPageTurn();
    clearFolderPageTurn();
    clearPendingTarget();

    const session = options.folderSession.value;
    const folderId = options.openFolderId.value;
    const movedDistance = Math.hypot(event.clientX - activeDrag.start.x, event.clientY - activeDrag.start.y);

    if (!session && movedDistance <= 6 && activeDrag.item.type === "folder" && activeDrag.source.type === "page") {
      options.commitOpenFolder(activeDrag.item.id);
      endDrag();
      return;
    }

    if (session && folderId && activeDrag.item.type === "app") {
      const panel = getDomRefElement(options.folderPanelRef.value);
      const rect = panel?.getBoundingClientRect();
      const inside = rect ? isPointInsideRect(rect, event.clientX, event.clientY) : true;
      if (!inside) {
        cancelFolderSessionAndReturnToDesktop({ force: true });
        endDrag();
        return;
      }
      placeDraggedItemInFolder(folderId, event.clientX, event.clientY, { force: true });
      options.commitOpenFolder(folderId);
      options.commitFolderSession(null);
    } else {
      placeDraggedItemOnDesktop(event.clientX, event.clientY, { force: true });
      options.commitFolderSession(null);
    }

    endDrag();
  }

  return {
    beginDrag,
    cancelLongPress,
    cancelPreviewRaf,
    clearFolderPageTurn,
    clearPageTurn,
    clearPendingTarget,
    detachDragListeners,
    dragMeta,
    isDragActive,
    pendingTargetId,
  };
}
