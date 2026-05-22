import { nextTick, shallowRef } from "vue";
import {
  DESKTOP_SORT_MIN_DISTANCE,
  DRAG_INTENT_IDLE_DELAY,
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
} from "../domain/launchpadLayout.js";
import { getDomRefElement } from "./usePageGridMetrics.js";

export function useLaunchpadDrag(options) {
  const dragMeta = shallowRef(null);
  const dragFolderTargetId = shallowRef(null);

  let dragRuntime = null;
  let dragPlacement = null;
  let folderHover = null;
  let lastPlacementCommit = null;
  let pendingPreviewPoint = null;
  let previewRafId = 0;
  let pendingTimer = null;
  let pageTurnTimer = null;
  let folderPageTurnTimer = null;
  let dragIntentTimer = null;
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
    dragFolderTargetId.value = null;
  }

  function clearPendingTimerButKeepSticky() {
    if (pendingTimer) window.clearTimeout(pendingTimer.timer);
    pendingTimer = null;
  }

  function clearPageTurn() {
    if (pageTurnTimer) window.clearTimeout(pageTurnTimer.timer);
    pageTurnTimer = null;
  }

  function clearFolderPageTurn() {
    if (folderPageTurnTimer) window.clearTimeout(folderPageTurnTimer.timer);
    folderPageTurnTimer = null;
  }

  function clearDragIntentTimer() {
    if (dragIntentTimer) window.clearTimeout(dragIntentTimer);
    dragIntentTimer = null;
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
    clearDragIntentTimer();
    cancelPreviewRaf();
    dragRuntime = null;
    dragMeta.value = null;
    dragFolderTargetId.value = null;
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
    const columnCount = Math.max(1, options.folderCols.value);
    const rowCount = Math.max(1, options.visibleFolderRowCount.value);
    const cellWidth = rect.width / columnCount;
    const cellHeight = rect.height / rowCount;
    const x = clamp(clientX - rect.left, 0, Math.max(1, rect.width - 1));
    const y = clamp(clientY - rect.top, 0, Math.max(1, rect.height - 1));
    const col = clamp(Math.floor(x / cellWidth), 0, columnCount - 1);
    const row = clamp(Math.floor(y / cellHeight), 0, rowCount - 1);
    return { pageIndex: options.folderPageIndex.value, index: row * columnCount + col };
  }

  function getDragVisualCenter(activeDrag) {
    if (!activeDrag) return null;
    const width = activeDrag.size?.width || 70;
    const height = activeDrag.size?.height || 70;
    return {
      x: activeDrag.pointer.x - activeDrag.offset.x + width / 2,
      y: activeDrag.pointer.y - activeDrag.offset.y + height / 2,
    };
  }

  function getTopLevelTargetRect(node) {
    return node?.querySelector?.(".icon-box")?.getBoundingClientRect?.() || node?.getBoundingClientRect?.() || null;
  }

  function getTopLevelTargetAtPoint(clientX, clientY) {
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const element of elements) {
      const node = element.closest?.("[data-top-item-id]");
      const id = node?.getAttribute("data-top-item-id");
      if (!id || id === dragRuntime?.item.id) continue;
      const found = options.findTopLevel(options.pages.value, id);
      if (found) return { item: found.item, node, rect: getTopLevelTargetRect(node) };
    }
    return null;
  }

  function isInsideFolderHitZone(targetInfo, clientX, clientY) {
    const rect = targetInfo?.rect;
    return rect ? isPointInsideRect(rect, clientX, clientY) : false;
  }

  function isInsideStickyFolderZone(clientX, clientY) {
    if (!folderHover?.stickyRect) return false;
    return isPointInsideRect(folderHover.stickyRect, clientX, clientY);
  }

  function lockFolderHoverTarget(targetInfo) {
    const rect = targetInfo?.rect;
    if (!rect) return;
    folderHover = { targetId: targetInfo.item.id, stickyRect: expandRect(rect, FOLDER_HOVER_STICKY_MARGIN) };
    dragFolderTargetId.value = targetInfo.item.id;
  }

  function startPendingFolderTarget(target) {
    if (pendingTimer?.targetId === target.id) return;
    clearPendingTimerButKeepSticky();

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

  function dropDraggedAppOnTopLevelTarget(targetInfo) {
    const activeDrag = dragRuntime;
    if (!activeDrag || activeDrag.item.type !== "app" || !targetInfo?.item) return false;

    const target = options.findTopLevel(options.pages.value, targetInfo.item.id);
    if (!target || target.item.id === activeDrag.item.id) return false;

    if (target.item.type === "folder") {
      const childPages = options.getFolderChildPages(target.item, options.folderPageSize.value);
      const targetPageIndex = Math.max(0, childPages.length - 1);
      const insertIndex = childPages[targetPageIndex]?.length || 0;
      options.commitPages(
        options.insertAppIntoFolder(
          options.pages.value,
          target.item.id,
          activeDrag.item,
          targetPageIndex,
          insertIndex,
          options.folderPageSize.value
        )
      );
      dragPlacement = placementKey("folder-drop", target.item.id, targetPageIndex, insertIndex);
      return true;
    }

    const withoutDragged = options.removeEverywhere(options.pages.value, activeDrag.item.id);
    const latestTarget = options.findTopLevel(withoutDragged, target.item.id);
    if (!latestTarget || latestTarget.item.type !== "app") return false;

    const folderId = options.makeId("folder");
    const originGeometry =
      options.getTopLevelIconMotionGeometry(latestTarget.item.id, folderId) ||
      options.getPageSlotMotionGeometry(folderId, latestTarget.pageIndex, latestTarget.index);
    const next = options.clonePages(withoutDragged);
    next[latestTarget.pageIndex][latestTarget.index] = options.withFolderPages(
      { id: folderId, type: "folder", name: "新文件夹" },
      [[options.cloneItem(latestTarget.item), options.cloneItem(activeDrag.item)]]
    );

    dragPlacement = placementKey("folder-drop", folderId);
    options.commitPages(options.compactPages(next));
    options.commitOpenFolder(folderId, { originGeometry });
    return true;
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

  function moveTopLevelItemWithinCurrentPage(itemId, insertIndex) {
    const currentPageIndex = options.pageIndex.value;
    const page = options.pages.value[currentPageIndex];
    if (!page) return false;

    const currentIndex = page.findIndex((item) => item?.id === itemId);
    if (currentIndex < 0) return false;

    const safeIndex = clamp(insertIndex, 0, Math.min(options.pageSize.value, Math.max(0, page.length - 1)));
    if (currentIndex === safeIndex) return true;

    const nextPage = page.slice();
    const [item] = nextPage.splice(currentIndex, 1);
    nextPage.splice(safeIndex, 0, item);

    const next = options.pages.value.slice();
    next[currentPageIndex] = nextPage;
    options.commitPages(next);
    return true;
  }

  function placeDraggedItemOnDesktop(clientX, clientY, placeOptions) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;
    const safeOptions = placeOptions || {};
    const insertIndex = calcPageInsertIndex(clientX, clientY);
    const key = placementKey("page", options.pageIndex.value, insertIndex);
    const isAlreadyOnCurrentPage = Boolean((options.pages.value[options.pageIndex.value] || []).some((item) => item?.id === activeDrag.item.id));
    if (isAlreadyOnCurrentPage) {
      if (dragPlacement === key) return;
      if (!shouldCommitPlacement(key, clientX, clientY, DESKTOP_SORT_MIN_DISTANCE, safeOptions.force)) return;
      if (moveTopLevelItemWithinCurrentPage(activeDrag.item.id, insertIndex)) {
        dragPlacement = key;
        rememberPlacementCommit(key, clientX, clientY);
        return;
      }
    }

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
    const direction = getPageEdgeDirection(clientX);
    if (!direction) {
      clearPageTurn();
      return;
    }
    if (pageTurnTimer?.direction === direction) return;
    clearPageTurn();

    pageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        pageTurnTimer = null;
        const currentPage = options.pageIndex.value;
        let didTurn = false;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) {
          if (currentPage <= 0) return;
          options.commitPageIndex(currentPage - 1);
          didTurn = true;
        } else {
          if (currentPage >= options.pages.value.length - 1) {
            const draggedItemId = dragRuntime?.item?.id;
            if (!options.canCreateDesktopPageAfterDrag(options.pages.value, currentPage, draggedItemId)) return;
            options.commitPages([...options.pages.value, []]);
          }
          options.commitPageIndex(currentPage + 1);
          didTurn = true;
        }
        if (didTurn) nextTick(schedulePageEdgeTurnFromCurrentPointer);
      }, PAGE_TURN_DELAY),
    };
  }

  function getPageEdgeDirection(clientX) {
    const width = window.innerWidth;
    return clientX > width - PAGE_EDGE_SIZE ? 1 : clientX < PAGE_EDGE_SIZE ? -1 : 0;
  }

  function schedulePageEdgeTurnFromCurrentPointer() {
    if (!dragRuntime || options.folderSession.value || options.openFolderId.value) return;
    const pointer = dragRuntime.pointer;
    if (!pointer || !getPageEdgeDirection(pointer.x)) return;
    handlePageEdgeTurn(pointer.x);
  }

  function getFolderPageEdgeDirection(clientX, clientY) {
    const panel = getDomRefElement(options.folderPanelRef.value);
    const rect = panel?.getBoundingClientRect();
    if (!rect || !isPointInsideRect(rect, clientX, clientY)) return 0;

    const direction = clientX < rect.left + FOLDER_PAGE_EDGE_SIZE ? -1 : clientX > rect.right - FOLDER_PAGE_EDGE_SIZE ? 1 : 0;
    if (direction < 0 && options.folderPageIndex.value <= 0) return 0;
    return direction;
  }

  function scheduleFolderPageEdgeTurnFromCurrentPointer() {
    if (!dragRuntime || (!options.folderSession.value && !options.openFolderId.value)) return;
    const pointer = dragRuntime.pointer;
    if (!pointer || !getFolderPageEdgeDirection(pointer.x, pointer.y)) return;
    handleFolderPageEdgeTurn(pointer.x, pointer.y);
  }

  function handleFolderPageEdgeTurn(clientX, clientY) {
    const direction = getFolderPageEdgeDirection(clientX, clientY);
    if (!direction) {
      clearFolderPageTurn();
      return;
    }

    if (folderPageTurnTimer?.direction === direction) return;
    clearFolderPageTurn();

    folderPageTurnTimer = {
      direction,
      timer: window.setTimeout(() => {
        folderPageTurnTimer = null;
        const currentPage = options.folderPageIndex.value;
        let didTurn = false;
        dragPlacement = null;
        lastPlacementCommit = null;
        if (direction < 0) {
          if (currentPage <= 0) return;
          options.commitFolderPageIndex(currentPage - 1);
          didTurn = true;
        } else {
          const isCreatingNewPage = currentPage >= options.folderPages.value.length - 1;
          if (isCreatingNewPage) {
            const folder = options.openFolderId.value ? options.findFolder(options.pages.value, options.openFolderId.value)?.item : null;
            const draggedItemId = dragRuntime?.item?.id;
            if (!options.canCreateFolderPageAfterDrag(folder, currentPage, draggedItemId, options.folderPageSize.value)) return;
          }
          options.commitFolderPageIndex(currentPage + 1, { allowCreate: true });
          didTurn = true;
        }
        if (didTurn) nextTick(scheduleFolderPageEdgeTurnFromCurrentPointer);
      }, PAGE_TURN_DELAY),
    };
  }

  function handleDefaultDesktopMove(clientX, clientY) {
    const activeDrag = dragRuntime;
    if (!activeDrag) return;

    if (activeDrag.item.type === "app") {
      const center = getDragVisualCenter(activeDrag) || { x: clientX, y: clientY };
      const targetInfo = getTopLevelTargetAtPoint(center.x, center.y);
      const targetStillSticky = pendingTimer && isInsideStickyFolderZone(center.x, center.y);
      if (targetInfo && isInsideFolderHitZone(targetInfo, center.x, center.y)) {
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

  function evaluateDragIntent() {
    dragIntentTimer = null;
    const activeDrag = dragRuntime;
    if (!activeDrag || options.isLaunchpadInteractionBlocked()) return;

    if (options.folderSession.value) {
      handleFolderSessionMove(activeDrag.pointer.x, activeDrag.pointer.y);
      return;
    }

    handleDefaultDesktopMove(activeDrag.pointer.x, activeDrag.pointer.y);
  }

  function scheduleDragIntentEvaluation() {
    clearDragIntentTimer();
    clearPendingTarget();
    dragIntentTimer = window.setTimeout(evaluateDragIntent, DRAG_INTENT_IDLE_DELAY);
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
    clearDragIntentTimer();
    clearPageTurn();
    clearFolderPageTurn();

    const nextDrag = {
      item: lp.item,
      source: lp.source,
      pointer: { x: lp.startPoint.x, y: lp.startPoint.y },
      offset: lp.offset,
      size: lp.size,
      start: { x: lp.startPoint.x, y: lp.startPoint.y },
      hasMoved: false,
    };

    dragRuntime = nextDrag;
    dragMeta.value = { item: nextDrag.item, source: nextDrag.source };
    dragPlacement = lp.source.type === "page"
      ? placementKey("page", lp.source.pageIndex, lp.source.index)
      : lp.source.type === "folder"
        ? placementKey("folder", lp.source.folderId, lp.source.pageIndex, lp.source.index)
        : null;
    lastPlacementCommit = { key: dragPlacement, x: lp.startPoint.x, y: lp.startPoint.y };
    attachDragListeners();
    nextTick(() => schedulePreviewPosition(lp.startPoint.x, lp.startPoint.y));

    if (lp.source.type === "folder") {
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
      size: { width: rect.width, height: rect.height },
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

    scheduleDragIntentEvaluation();
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
    clearDragIntentTimer();

    const center = getDragVisualCenter(activeDrag);
    const topLevelDropTarget = center ? getTopLevelTargetAtPoint(center.x, center.y) : null;
    const shouldDropOnTopLevelTarget = topLevelDropTarget && isInsideFolderHitZone(topLevelDropTarget, center.x, center.y);

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

    if (!session && shouldDropOnTopLevelTarget && dropDraggedAppOnTopLevelTarget(topLevelDropTarget)) {
      options.commitFolderSession(null);
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
    dragFolderTargetId,
    dragMeta,
    isDragActive,
  };
}
