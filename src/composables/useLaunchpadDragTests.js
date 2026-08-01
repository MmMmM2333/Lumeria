import {
  useLaunchpadDrag,
  isPrimaryPointerMoveEvent,
  isPrimaryPointerStartEvent,
  samplePointerVelocity,
  shouldFinishDragForPointerEvent,
} from "./useLaunchpadDrag.js";
import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";
import { DRAG_INTENT_IDLE_DELAY } from "./launchpadConstants.js";
import { computed, nextTick, ref, shallowRef } from "vue";

const K = ICON_BOUNDS_KIND;
const V = ICON_BOUNDS_VARIANT;

async function withMockPointerEnvironment(run) {
  const originalWindow = globalThis.window;
  const listeners = new Map();
  const timers = new Map();
  let nextTimerId = 1;

  globalThis.window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name, handler) => {
      if (listeners.get(name) === handler) listeners.delete(name);
    },
    cancelAnimationFrame: () => {},
    clearTimeout: (id) => timers.delete(id),
    innerHeight: 768,
    innerWidth: 1024,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    setTimeout: (callback, delay = 0) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
  };

  try {
    await run({ listeners, timers });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

function createDragHarness(overrides = {}) {
  const app = { id: "app-a", type: "app", name: "App A" };
  const pages = shallowRef([[app]]);
  const pageIndex = ref(0);
  const folderPageIndex = ref(0);
  const folderPageTurnRequest = ref(null);
  const visualFolderPageIndex = computed(() => folderPageTurnRequest.value?.targetIndex ?? folderPageIndex.value);
  const folderPageSize = overrides.folderPageSize || ref(16);
  const folderPages = overrides.folderPages || ref([[]]);
  const isLayoutProjectionActive = ref(false);
  const folderSession = ref(null);
  const openFolderId = ref(null);
  const calls = {
    commitFolderSession: [],
    commitFolderPageTurnRequest: [],
    commitOpenFolder: [],
    commitPageIndex: [],
    commitPages: [],
    insertAppIntoFolder: [],
    requestFolderPageTurn: [],
  };
  function cloneItem(item) {
    return item ? { ...item } : item;
  }
  function clonePages(sourcePages) {
    return sourcePages.map((page) => page.map((item) => ({ ...item })));
  }
  function getFolderChildPages(folder) {
    if (Array.isArray(folder?.childPages)) return folder.childPages;
    return folder?.children?.length ? [folder.children] : [[]];
  }
  function findFolder(sourcePages, folderId) {
    for (let currentPageIndex = 0; currentPageIndex < sourcePages.length; currentPageIndex += 1) {
      const index = sourcePages[currentPageIndex].findIndex((item) => item.id === folderId && item.type === "folder");
      if (index >= 0) return { pageIndex: currentPageIndex, index, item: sourcePages[currentPageIndex][index] };
    }
    return null;
  }
  function findInFolder(sourcePages, folderId, itemId) {
    const folder = findFolder(sourcePages, folderId)?.item;
    if (!folder) return null;
    const childPages = getFolderChildPages(folder);
    for (let pageIndex = 0; pageIndex < childPages.length; pageIndex += 1) {
      const index = childPages[pageIndex].findIndex((child) => child?.id === itemId);
      if (index >= 0) return { folder, pageIndex, index, item: childPages[pageIndex][index] };
    }
    return null;
  }
  function insertTopLevelItem(sourcePages, item, targetPageIndex, insertIndex) {
    const next = clonePages(sourcePages);
    while (next.length <= targetPageIndex) next.push([]);
    next[targetPageIndex].splice(Math.max(0, Math.min(insertIndex, next[targetPageIndex].length)), 0, cloneItem(item));
    return next;
  }
  function replaceFolderWithItem(sourcePages, folderId, item) {
    return sourcePages.map((page) => page.map((entry) => (entry.id === folderId ? cloneItem(item) : { ...entry })));
  }
  function removeEverywhere(sourcePages, itemId) {
    return sourcePages.map((page) => page
      .filter((item) => item.id !== itemId)
      .map((item) => {
        if (item.type !== "folder") return { ...item };
        const childPages = (item.childPages || []).map((childPage) => childPage.filter((child) => child.id !== itemId).map(cloneItem));
        return { ...item, childPages, children: childPages.flat() };
      }));
  }
  function insertAppIntoFolder(sourcePages, folderId, item, targetPageIndex, insertIndex) {
    calls.insertAppIntoFolder.push({ folderId, insertIndex, item, targetPageIndex });
    return removeEverywhere(sourcePages, item.id).map((page) => page.map((entry) => {
      if (entry.id !== folderId) return { ...entry };
      const childPages = (entry.childPages || [[]]).map((childPage) => childPage.map(cloneItem));
      while (childPages.length <= targetPageIndex) childPages.push([]);
      childPages[targetPageIndex].splice(insertIndex, 0, cloneItem(item));
      return { ...entry, childPages, children: childPages.flat() };
    }));
  }
  const folderPanelRef = overrides.folderPanelRef || ref(null);
  const folderPageRefs = overrides.folderPageRefs || [];
  const iconBoundsRegistry = overrides.iconBoundsRegistry || createIconBoundsRegistry();
  const drag = useLaunchpadDrag({
    canCreateDesktopPageAfterDrag: overrides.canCreateDesktopPageAfterDrag || (() => false),
    canCreateFolderPageAfterDrag: overrides.canCreateFolderPageAfterDrag || (() => false),
    clearFolderPageTurnRequest: () => {
      folderPageTurnRequest.value = null;
    },
    cloneItem,
    clonePages,
    commitFolderPageTurnRequest: (token) => {
      calls.commitFolderPageTurnRequest.push(token);
      const request = folderPageTurnRequest.value;
      if (!request || request.token !== token) return false;
      folderPageIndex.value = request.targetIndex;
      folderPageTurnRequest.value = null;
      return true;
    },
    commitFolderPageIndex: (value) => {
      folderPageIndex.value = value;
    },
    commitFolderSession: (value) => {
      calls.commitFolderSession.push(value);
      folderSession.value = value;
    },
    commitOpenFolder: (value) => {
      calls.commitOpenFolder.push(value);
      openFolderId.value = value;
    },
    commitPageIndex: (value) => {
      calls.commitPageIndex.push(value);
      pageIndex.value = value;
    },
    commitPages: (next) => {
      calls.commitPages.push(next);
      pages.value = next;
      overrides.onCommitPages?.(next);
    },
    compactPages: (next) => next,
    findFolder,
    findInFolder,
    findTopLevel: (sourcePages, id) => {
      for (let currentPageIndex = 0; currentPageIndex < sourcePages.length; currentPageIndex += 1) {
        const index = sourcePages[currentPageIndex].findIndex((item) => item.id === id);
        if (index >= 0) return { pageIndex: currentPageIndex, index, item: sourcePages[currentPageIndex][index] };
      }
      return null;
    },
    effectiveFolderIconSize: overrides.effectiveFolderIconSize || ref(56),
    finishHomeRevealSettleWindow: overrides.finishHomeRevealSettleWindow || (() => {}),
    folderCols: overrides.folderCols || ref(4),
    folderPageIndex,
    folderPageRefs,
    folderPages,
    folderPageSize,
    folderPageTurnRequest,
    folderPanelRef,
    folderPanelStyle: overrides.folderPanelStyle || ref({}),
    folderSession,
    folderViewportHeight: overrides.folderViewportHeight || ref(0),
    getFolderChildPages,
    getPageSlotMotionGeometry: () => null,
    getTopLevelIconMotionGeometry: () => null,
    gridCols: ref(7),
    gridRows: ref(5),
    iconBoundsRegistry,
    iconSize: overrides.iconSize || ref(64),
    insertAppIntoFolder,
    insertTopLevelItem,
    isFolderLayerActive: overrides.isFolderLayerActive || ref(false),
    isHomeRevealSettling: overrides.isHomeRevealSettling || ref(false),
    isLayoutProjectionActive,
    isLaunchpadInteractionBlocked: () => false,
    isTextlessMode: ref(false),
    makeId: (prefix) => `${prefix}-id`,
    openApp: () => {},
    openFolderId,
    pageIndex,
    pageRefs: [
      {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 500 }),
      },
    ],
    pages,
    pageSize: ref(35),
    previewAppIntoFolderWithoutOverflow: (sourcePages) => sourcePages,
    previewTopLevelItemWithoutOverflow: insertTopLevelItem,
    removeEverywhere,
    renderedFolder: ref(null),
    requestFolderPageTurn: (targetIndex, requestOptions = {}) => {
      const token = calls.requestFolderPageTurn.length + 1;
      calls.requestFolderPageTurn.push({ targetIndex, options: requestOptions, token });
      folderPageTurnRequest.value = {
        folderId: requestOptions.folderId ?? null,
        targetIndex,
        token,
      };
      return token;
    },
    replaceFolderWithItem,
    visualFolderPageIndex,
    visibleFolderRowCount: overrides.visibleFolderRowCount || ref(4),
    withFolderPages: (folder, childPages) => ({ ...folder, childPages, children: childPages.flat() }),
    wouldFolderInsertOverflow: () => false,
    wouldTopLevelInsertOverflow: () => false,
  });

  return { app, calls, drag, folderPageIndex, folderPageTurnRequest, folderPanelRef, folderSession, iconBoundsRegistry, isLayoutProjectionActive, openFolderId, pages, visualFolderPageIndex };
}

function putLaunchBounds(registry, variant, source, rect, meta = {}) {
  registry.registerBounds(K.LAUNCH, variant, source, rect, meta);
}

function makeFolderApps(count, prefix = "folder-app") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `Folder App ${index}`,
    type: "app",
  }));
}

function registerDesktopFolderBounds(registry, folder, rect) {
  const meta = { area: "desktop", id: folder.id, item: folder, pageIndex: 0 };
  putLaunchBounds(registry, V.RENDERED, { area: "desktop", id: folder.id, pageIndex: 0 }, rect, meta);
  registry.registerBounds(K.FOLDER_THUMB, V.RENDERED, folder.id, rect, meta);
  registry.registerBounds(K.FOLDER_THUMB, V.LIVE_TARGET, folder.id, rect, meta);
}

function makePointerDownEvent(pointerId, target, overrides = {}) {
  return {
    button: 0,
    buttons: 1,
    clientX: 24,
    clientY: 32,
    currentTarget: target,
    pointerId,
    preventDefault: () => {},
    stopPropagation: () => {},
    ...overrides,
  };
}

function runNextTimer(timers) {
  const next = Array.from(timers.entries()).sort((a, b) => a[1].delay - b[1].delay)[0];
  if (!next) return;
  const [id, timer] = next;
  timers.delete(id);
  timer.callback();
}

function flushTimers(timers) {
  const pending = Array.from(timers.entries()).sort((a, b) => a[1].delay - b[1].delay);
  timers.clear();
  for (const [, timer] of pending) timer.callback();
}

export async function runLaunchpadDragTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad drag test failed] ${message}`);
  };

  assert(isPrimaryPointerStartEvent({ button: 0, buttons: 1 }), "left pointerdown should start drag intent");
  assert(!isPrimaryPointerStartEvent({ button: 2, buttons: 2 }), "right pointerdown should not start drag intent");
  assert(!isPrimaryPointerStartEvent({ button: 1, buttons: 4 }), "middle pointerdown should not start drag intent");

  assert(isPrimaryPointerMoveEvent({ buttons: 1 }), "primary pointermove should update drag");
  assert(!isPrimaryPointerMoveEvent({ buttons: 2 }), "right-only pointermove should not update drag");
  assert(!isPrimaryPointerMoveEvent({ buttons: 0 }), "released pointermove should not update drag");

  const activeDrag = { pointerId: 8 };
  assert(shouldFinishDragForPointerEvent(activeDrag, { type: "pointerup", pointerId: 8, button: 0 }), "matching left pointerup should finish drag");
  assert(!shouldFinishDragForPointerEvent(activeDrag, { type: "pointerup", pointerId: 8, button: 2 }), "matching right pointerup should not finish drag");
  assert(!shouldFinishDragForPointerEvent(activeDrag, { type: "pointerup", pointerId: 9, button: 0 }), "different pointer should not finish drag");
  assert(shouldFinishDragForPointerEvent(activeDrag, { type: "pointercancel", pointerId: 8, button: 2 }), "matching pointercancel should always finish drag");
  const sampledVelocity = samplePointerVelocity(
    { pointer: { x: 10, y: 20 }, time: 100, velocity: { x: 0, y: 0 } },
    { clientX: 30, clientY: 10, timeStamp: 120 },
    { smoothing: 0.5 }
  );
  assert(sampledVelocity.velocity.x === 500 && sampledVelocity.velocity.y === -250, "pointer velocity should smooth px/s deltas");

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const { app, drag, isLayoutProjectionActive } = createDragHarness();
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(41, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    assert(drag.dragMeta.value?.item.id === "app-a", "long press should enter active drag state");
    assert(drag.dragPreviewState.value?.item.id === "app-a", "active drag should expose a preview item");
    assert(drag.dragPreviewState.value?.pointer.x === 24 && drag.dragPreviewState.value?.pointer.y === 32, "drag preview should track the pointer position");
    assert(drag.dragPreviewState.value?.offset.x === 14 && drag.dragPreviewState.value?.offset.y === 20, "drag preview should preserve the pointer offset from the icon");
    assert(Math.round(drag.dragPreviewState.value?.cellSize.width) === 100, "drag preview should include the source cell width");
    assert(isLayoutProjectionActive.value, "active drag should enable layout projection");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 42, button: 0, clientX: 40, clientY: 50 });
    assert(drag.dragMeta.value?.item.id === "app-a", "different pointerup should not finish an active drag");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 41, button: 0, clientX: 40, clientY: 50 });
    assert(drag.dragMeta.value === null, "matching pointerup should finish the active drag");
    assert(drag.dragPreviewState.value === null, "finished drag should clear preview state");
    assert(isLayoutProjectionActive.value, "layout projection should remain briefly active after drag end");
    flushTimers(timers);
    assert(!isLayoutProjectionActive.value, "layout projection should release after the drag settle window");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const { app, drag } = createDragHarness();
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(44, target, {
      dragVisualState: {
        cellHeight: 91,
        cellWidth: 123,
        compact: true,
        singleLineLabel: true,
      },
    }), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    assert(drag.dragPreviewState.value?.compact === true, "drag preview should preserve source compact label layout");
    assert(drag.dragPreviewState.value?.singleLineLabel === true, "drag preview should preserve source single-line label layout");
    assert(drag.dragPreviewState.value?.cellSize.width === 123, "drag preview should use source node cell width for label wrapping");
    assert(drag.dragPreviewState.value?.cellSize.height === 91, "drag preview should use source node cell height for label layout");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 44, button: 0, clientX: 40, clientY: 50 });
    await nextTick();
    assert(drag.dragReleaseState.value?.compact === true, "drag release should preserve source compact label layout");
    assert(drag.dragReleaseState.value?.singleLineLabel === true, "drag release should preserve source single-line label layout");
    assert(drag.dragReleaseState.value?.cellSize.width === 123, "drag release should preserve source node cell width for label wrapping");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const { app, drag } = createDragHarness();
    const target = {
      getBoundingClientRect: () => ({ left: 11.12, top: 13.12, width: 61.76, height: 61.76 }),
    };

    drag.beginDrag(makePointerDownEvent(45, target, {
      dragVisualState: {
        cellHeight: 100,
        cellWidth: 100,
        iconSize: 64,
      },
    }), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    assert(drag.dragPreviewState.value?.size.width === 64, "drag preview should use the source icon size instead of pressed visual bounds");
    assert(drag.dragPreviewState.value?.size.height === 64, "drag preview should preserve the source icon height");
    assert(Math.abs(drag.dragPreviewState.value?.offset.x - 14) < 0.0001, "drag preview should keep the pointer offset relative to the unpressed icon rect");
    assert(Math.abs(drag.dragPreviewState.value?.offset.y - 20) < 0.0001, "drag preview should keep the pointer y offset relative to the unpressed icon rect");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 45, button: 0, clientX: 40, clientY: 50 });
    await nextTick();
    assert(drag.dragReleaseState.value?.size.width === 64, "drag release should use the source icon size instead of pressed visual bounds");
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const isHomeRevealSettling = ref(true);
    let finishSettleCalls = 0;
    const iconBoundsRegistry = createIconBoundsRegistry();
    const { app, drag } = createDragHarness({
      finishHomeRevealSettleWindow: () => {
        finishSettleCalls += 1;
        isHomeRevealSettling.value = false;
        putLaunchBounds(
          iconBoundsRegistry,
          V.RENDERED,
          { area: "desktop", id: "app-a", pageIndex: 0 },
          { left: 20, top: 22, width: 64, height: 64 },
          { area: "desktop", id: "app-a", index: 0, pageIndex: 0 }
        );
      },
      iconBoundsRegistry,
      isHomeRevealSettling,
    });
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(42, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    await nextTick();

    assert(finishSettleCalls === 1, "first drag after desktop reveal should finish the settle window");
    assert(drag.dragPreviewState.value?.offset.x === 4 && drag.dragPreviewState.value?.offset.y === 10, "settled desktop drag should recompute pointer offset from fresh Pixi bounds");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const isHomeRevealSettling = ref(true);
    const iconBoundsRegistry = createIconBoundsRegistry();
    const { app, drag } = createDragHarness({
      iconBoundsRegistry,
      isHomeRevealSettling,
    });
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(43, target), app, { type: "page", pageIndex: 0, index: 0 });
    isHomeRevealSettling.value = false;
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: "app-a", pageIndex: 0 },
      { left: 20, top: 22, width: 64, height: 64 },
      { area: "desktop", id: "app-a", index: 0, pageIndex: 0 }
    );
    runNextTimer(timers);
    await nextTick();
    await nextTick();

    assert(drag.dragPreviewState.value?.offset.x === 4 && drag.dragPreviewState.value?.offset.y === 10, "desktop drag should refresh bounds when pointerdown happened during reveal settle");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const { calls, drag, pages } = createDragHarness();
    const folder = { id: "folder-a", type: "folder", name: "Folder A", childPages: [[]], children: [] };
    pages.value = [[folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(88, target), folder, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 88, button: 0, clientX: 24, clientY: 32 });
    await nextTick();

    assert(calls.commitOpenFolder.length === 0, "dropping a long-pressed folder without movement should not open it");
    assert(drag.dragReleaseState.value?.item.id === "folder-a", "dropping a long-pressed folder without movement should run release animation");
    assert(drag.isDragActive(), "drag release animation should keep surface interactions blocked");
    flushTimers(timers);
    assert(!drag.isDragActive(), "drag should become inactive after release animation cleanup");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const targetApp = { id: "app-b", type: "app", name: "App B" };
    const iconBoundsRegistry = createIconBoundsRegistry();
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: targetApp.id, pageIndex: 0 },
      { left: 120, top: 112, width: 64, height: 64 },
      { area: "desktop", id: targetApp.id, index: 1, item: targetApp, pageIndex: 0 }
    );
    const { app, calls, drag, folderSession, openFolderId, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, targetApp]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(89, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 89, button: 0, clientX: 132, clientY: 132 });
    await nextTick();

    const [folder] = pages.value[0];
    const childIds = folder?.childPages?.[0]?.map((item) => item.id).join(",");
    assert(folder?.type === "folder", "dropping an app on another app should create a desktop folder");
    assert(childIds === "app-b,app-a", "direct app-on-app drop should create the folder with target and dragged apps");
    assert(calls.commitOpenFolder.length === 0 && openFolderId.value == null, "direct app-on-app drop should not open the created folder");
    assert(folderSession.value == null, "direct app-on-app drop should not enter a folder drag session");
    assert(drag.dragReleaseState.value == null, "direct app-on-app drop should not use the single-icon release state");
    assert(drag.folderCreateReleaseState.value?.folderId === folder.id, "direct app-on-app drop should start a folder-create release animation");
    assert(drag.folderCreateReleaseState.value?.targetApp?.id === "app-b", "folder-create release should track the target app ghost");
    assert(drag.folderCreateReleaseState.value?.draggedApp?.id === "app-a", "folder-create release should track the dragged app ghost");
    assert(drag.folderCreateReleaseState.value?.targetAppSlotRect?.width > 0, "folder-create release should expose a target-app preview slot");
    assert(drag.isDragActive(), "folder-create release should keep surface interactions blocked");
    drag.completeFolderCreateRelease(drag.folderCreateReleaseState.value);
    assert(!drag.isDragActive(), "folder-create release completion should unblock interactions");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const targetApp = { id: "app-b", type: "app", name: "App B" };
    const iconBoundsRegistry = createIconBoundsRegistry();
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: targetApp.id, pageIndex: 0 },
      { left: 120, top: 112, width: 64, height: 64 },
      { area: "desktop", id: targetApp.id, index: 1, item: targetApp, pageIndex: 0 }
    );
    const { app, calls, drag, folderSession, openFolderId, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, targetApp]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(90, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 90,
      buttons: 1,
      clientX: 132,
      clientY: 132,
      preventDefault: () => {},
    });
    assert(drag.dragHitDebugState.value?.winner === "pending", "drag hit debug should publish the pending pointer-move decision");
    assert(drag.dragHitDebugState.value?.target?.id === "app-b", "drag hit debug should expose the current top-level target");

    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value?.targetId === "app-b", "hovering an app target should expose the folder-create hover target");
    assert(drag.dragHitDebugState.value?.winner === "folder-create-hover", "drag hit debug should expose folder-create as the winning intent");
    assert(drag.dragHitDebugState.value?.reason === "center-in-folder-intent", "drag hit debug should explain the folder-create hit reason");
    assert(drag.dragHitDebugState.value?.target?.expandedTargetRect?.width === 76, "drag hit debug should expose the expanded target rect used by overlap hit testing");
    runNextTimer(timers);
    runNextTimer(timers);
    runNextTimer(timers);

    const [folder] = pages.value[0];
    const childIds = folder?.childPages?.[0]?.map((item) => item.id).join(",");
    assert(folder?.type === "folder", "hovering an app target until open should create a folder");
    assert(childIds === "app-b", "hover-created folder should contain only the target app until the dragged app is dropped inside");
    assert(openFolderId.value === folder.id, "hover-created folder should still open for drag");
    assert(calls.commitOpenFolder.length === 1, "hover-created folder should commit an open folder");
    assert(folderSession.value?.mode === "created", "hover-created folder should enter a created-folder drag session");
    assert(drag.folderCreateReleaseState.value == null, "hover-created folder should not start the create-only release animation");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const targetApp = { id: "app-b", type: "app", name: "App B" };
    const iconBoundsRegistry = createIconBoundsRegistry();
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: targetApp.id, pageIndex: 0 },
      { left: 120, top: 112, width: 128, height: 128 },
      { area: "desktop", id: targetApp.id, index: 1, item: targetApp, pageIndex: 0 }
    );
    const { app, drag, folderSession, openFolderId, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, targetApp]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 128, height: 128 }),
    };

    drag.beginDrag(makePointerDownEvent(191, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 191,
      buttons: 1,
      clientX: 92,
      clientY: 132,
      preventDefault: () => {},
    });

    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value == null, "large icon edge overlap should not lock a folder-create hover");
    assert(drag.dragHitDebugState.value?.winner === "page-sort", "large icon edge overlap should leave desktop sorting in control");
    assert(drag.dragHitDebugState.value?.folderDecision?.centerInside === true, "test setup should put the drag center inside the large target");
    assert(drag.dragHitDebugState.value?.folderDecision?.centerInsideIntent === false, "large target edges should sit outside the capped folder intent rect");
    assert(drag.dragHitDebugState.value?.folderDecision?.dragIntersectsExpandedTarget === true, "large icon edge test should still discover the target as an overlap candidate");
    assert(Math.round(drag.dragHitDebugState.value?.folderDecision?.intentRect?.width) === 64, "large icon folder intent should cap to the default icon size");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 191, button: 0, clientX: 92, clientY: 132 });
    await nextTick();

    assert(!pages.value.flat().some((item) => item?.type === "folder"), "large icon edge release should not create a folder");
    assert(openFolderId.value == null, "large icon edge release should not open a folder");
    assert(folderSession.value == null, "large icon edge release should not enter a folder drag session");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const { app, drag } = createDragHarness();
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(91, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 91,
      buttons: 1,
      clientX: 90,
      clientY: 80,
      timeStamp: 20,
      preventDefault: () => {},
    });

    listeners.get("pointerup")({ type: "pointerup", pointerId: 91, button: 0, clientX: 690, clientY: 490, timeStamp: 40 });
    await nextTick();

    const rect = drag.dragReleaseState.value?.targetRect;
    assert(Math.round(rect?.left) === 18 && Math.round(rect?.top) === 4, "desktop release should animate to the committed compact visual slot, not the empty pointer slot");
    assert(drag.dragReleaseState.value?.startPose?.pointer?.x === 690 && drag.dragReleaseState.value?.startPose?.pointer?.y === 490, "desktop release should carry the pointer-up start pose directly");
    assert(drag.dragReleaseState.value?.velocity.x > 0 && drag.dragReleaseState.value?.velocity.y > 0, "desktop release should carry the sampled pointer velocity");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const iconBoundsRegistry = createIconBoundsRegistry();
    const { app, drag, pages } = createDragHarness({
      iconBoundsRegistry,
      onCommitPages: () => {
        putLaunchBounds(
          iconBoundsRegistry,
          V.LIVE_TARGET,
          { area: "desktop", id: "app-a", pageIndex: 0 },
          { left: 123, top: 45, width: 64, height: 64 },
          { area: "desktop", id: "app-a", index: 1, pageIndex: 0 }
        );
        putLaunchBounds(
          iconBoundsRegistry,
          V.STABLE_STAGE_LAYOUT,
          { area: "desktop", id: "app-a", pageIndex: 0 },
          { left: 23, top: 25, width: 64, height: 64 },
          {
            area: "desktop",
            id: "app-a",
            index: 1,
            pageIndex: 0,
            stageHeight: 500,
            stageRect: { left: 100, top: 20, width: 700, height: 500 },
            stageWidth: 700,
          }
        );
      },
    });
    pages.value = [[app, { id: "app-b", type: "app", name: "App B" }]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(93, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 93, button: 0, clientX: 690, clientY: 490 });
    await nextTick();

    const rect = drag.dragReleaseState.value?.targetRect;
    const stageRect = drag.dragReleaseState.value?.targetStageLayoutRect;
    assert(Math.round(rect?.left) === 123 && Math.round(rect?.top) === 45, "desktop release should prefer Pixi target bounds over fallback slot geometry");
    assert(Math.round(stageRect?.left) === 23 && Math.round(stageRect?.top) === 25, "desktop release should carry the committed stage layout target");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 120, right: 400, bottom: 340, width: 280, height: 220 }) }];
    const iconBoundsRegistry = createIconBoundsRegistry();
    const { app, drag, openFolderId, pages } = createDragHarness({
      folderPageRefs,
      folderPanelRef,
      iconBoundsRegistry,
      onCommitPages: () => {
        putLaunchBounds(
          iconBoundsRegistry,
          V.STABLE_STAGE_LAYOUT,
          { area: "folder", folderId: "folder-1", id: "app-a", pageIndex: 0 },
          { left: 28, top: 46, width: 56, height: 56 },
          {
            area: "folder",
            folderId: "folder-1",
            id: "app-a",
            index: 0,
            pageIndex: 0,
            stageHeight: 500,
            stageRect: { left: 100, top: 60, width: 500, height: 500 },
            stageWidth: 500,
            visualSpec: {
              cellHeight: 80,
              cellWidth: 70,
              compact: false,
              iconSize: 56,
              singleLineLabel: false,
              textless: false,
            },
          }
        );
      },
    });
    const folder = { id: "folder-1", type: "folder", name: "Folder", childPages: [[app]], children: [app] };
    pages.value = [[folder]];
    openFolderId.value = "folder-1";
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(92, target), app, { type: "folder", folderId: "folder-1", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 92, button: 0, clientX: 390, clientY: 330 });
    await nextTick();

    const rect = drag.dragReleaseState.value?.targetRect;
    const stageRect = drag.dragReleaseState.value?.targetStageLayoutRect;
    const visualSpec = drag.dragReleaseState.value?.targetVisualSpec;
    assert(Math.round(rect?.left) === 128 && Math.round(rect?.top) === 106, "folder release should animate to the committed compact visual slot, not the empty pointer slot");
    assert(Math.round(stageRect?.left) === 28 && Math.round(stageRect?.top) === 46, "folder release should carry the committed stage layout target");
    assert(visualSpec?.iconSize === 56 && visualSpec?.cellWidth === 70, "folder release should carry the target folder visual spec for 64-to-56 slot release");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 560, bottom: 500, width: 460, height: 400 }) });
    const folderPageRefs = [{
      clientHeight: 320,
      clientWidth: 400,
      getBoundingClientRect: () => ({ left: 120, top: 120, right: 520, bottom: 440, width: 400, height: 320 }),
      offsetHeight: 320,
      offsetWidth: 400,
    }];
    const iconBoundsRegistry = createIconBoundsRegistry();
    const { app, drag, openFolderId, pages } = createDragHarness({
      effectiveFolderIconSize: ref(88),
      folderCols: ref(4),
      folderPageRefs,
      folderPanelRef,
      folderPanelStyle: ref({
        "--folder-icon-cell-height": "144px",
        "--folder-icon-size": "88px",
        "--folder-row-gap": "18px",
        "--folder-shell-min-height": "520px",
      }),
      iconBoundsRegistry,
      visibleFolderRowCount: ref(1),
    });
    const folder = { id: "folder-large-release", type: "folder", name: "Folder", childPages: [[app]], children: [app] };
    pages.value = [[folder]];
    openFolderId.value = "folder-large-release";
    const target = {
      getBoundingClientRect: () => ({ left: 150, top: 150, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(96, target), app, { type: "folder", folderId: "folder-large-release", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 96, button: 0, clientX: 220, clientY: 190 });
    await nextTick();

    const release = drag.dragReleaseState.value;
    assert(release?.targetVisualSpec?.iconSize === 88, "folder release fallback should preserve icon sizes above the old 56px cap");
    assert(release?.targetRect?.width === 88 && release?.targetRect?.height === 88, "folder release fallback rect should match the larger visual spec");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 760, bottom: 560, width: 660, height: 460 }) });
    const folderPageRefs = [{
      clientHeight: 380,
      clientWidth: 600,
      getBoundingClientRect: () => ({ left: 130, top: 130, right: 730, bottom: 510, width: 600, height: 380 }),
      offsetHeight: 380,
      offsetWidth: 600,
    }];
    const baseRegistry = createIconBoundsRegistry();
    let allowPreCommitRecord = true;
    const registerPreCommitTarget = (expected = {}) => {
      putLaunchBounds(
        baseRegistry,
        V.STABLE_STAGE_LAYOUT,
        { area: "folder", folderId: "folder-inflight-resize", id: "app-a", pageIndex: expected.pageIndex ?? 0 },
        { left: 320, top: 210, width: 64, height: 64 },
        {
          area: "folder",
          folderId: "folder-inflight-resize",
          id: "app-a",
          index: expected.index ?? 8,
          pageIndex: expected.pageIndex ?? 0,
          provisionalLayoutTarget: true,
          stageHeight: 768,
          stageRect: { left: 0, top: 0, width: 1024, height: 768 },
          stageWidth: 1024,
          visualSpec: {
            cellHeight: 122,
            cellWidth: 100,
            compact: false,
            iconSize: 64,
            singleLineLabel: false,
            textless: false,
          },
        }
      );
    };
    const iconBoundsRegistry = {
      ...baseRegistry,
      getRecord(kind, variant, keyInput, optionsArg = {}) {
        if (
          allowPreCommitRecord &&
          kind === K.LAUNCH &&
          variant === V.STABLE_STAGE_LAYOUT &&
          keyInput?.area === "folder" &&
          keyInput?.folderId === "folder-inflight-resize" &&
          keyInput?.id === "app-a"
        ) {
          registerPreCommitTarget(optionsArg.expected);
        }
        return baseRegistry.getRecord(kind, variant, keyInput, optionsArg);
      },
    };
    const { app, drag, openFolderId, pages } = createDragHarness({
      folderCols: ref(6),
      folderPageRefs,
      folderPageSize: ref(24),
      folderPanelRef,
      iconBoundsRegistry,
      onCommitPages: () => {
        allowPreCommitRecord = false;
      },
      visibleFolderRowCount: ref(4),
    });
    const folderItems = makeFolderApps(19);
    folderItems[8] = app;
    const folder = { id: "folder-inflight-resize", type: "folder", name: "Folder", childPages: [folderItems], children: folderItems };
    pages.value = [[folder]];
    openFolderId.value = "folder-inflight-resize";
    const target = {
      getBoundingClientRect: () => ({ left: 320, top: 210, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(97, target, { clientX: 352, clientY: 242 }), app, { type: "folder", folderId: "folder-inflight-resize", pageIndex: 0, index: 8 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 97, button: 0, clientX: 380, clientY: 250 });

    const initialRelease = drag.dragReleaseState.value;
    assert(initialRelease?.provisionalLayoutTarget === true, "folder release should reuse the in-flight provisional folder target before clearing row-resize bounds");
    assert(initialRelease?.targetVisualSpec?.iconSize === 64, "folder release should start with the in-flight row-resize visual spec instead of the compressed fallback");
    assert(Math.round(initialRelease?.targetStageLayoutRect?.top) === 210, "folder release should preserve the in-flight stage layout target on the first release frame");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 120, right: 400, bottom: 340, width: 280, height: 220 }) }];
    const baseRegistry = createIconBoundsRegistry();
    let stableReads = 0;
    const registerStableFolderTarget = (top, provisionalLayoutTarget, iconSize = 56) => {
      putLaunchBounds(
        baseRegistry,
        V.STABLE_STAGE_LAYOUT,
        { area: "folder", folderId: "folder-provisional", id: "app-a", pageIndex: 0 },
        { left: 28, top, width: iconSize, height: iconSize },
        {
          area: "folder",
          folderId: "folder-provisional",
          id: "app-a",
          index: 0,
          pageIndex: 0,
          provisionalLayoutTarget,
          stageHeight: 500,
          stageRect: { left: 100, top: 60, width: 500, height: 500 },
          stageWidth: 500,
          visualSpec: {
            cellHeight: provisionalLayoutTarget ? 96 : 72,
            cellWidth: 70,
            compact: false,
            iconSize,
            singleLineLabel: false,
            textless: false,
          },
        }
      );
    };
    const iconBoundsRegistry = {
      ...baseRegistry,
      getRecord(kind, variant, keyInput, optionsArg = {}) {
        if (
          kind === K.LAUNCH &&
          variant === V.STABLE_STAGE_LAYOUT &&
          keyInput?.area === "folder" &&
          keyInput?.folderId === "folder-provisional" &&
          keyInput?.id === "app-a"
        ) {
          stableReads += 1;
          registerStableFolderTarget(
            stableReads >= 12 ? 146 : 46 + stableReads,
            stableReads < 12,
            stableReads >= 12 ? 48 : 64 - stableReads * 0.5
          );
        }
        return baseRegistry.getRecord(kind, variant, keyInput, optionsArg);
      },
    };
    const { app, drag, openFolderId, pages } = createDragHarness({
      folderPageRefs,
      folderPanelRef,
      iconBoundsRegistry,
      onCommitPages: () => registerStableFolderTarget(46, true),
    });
    const folder = { id: "folder-provisional", type: "folder", name: "Folder", childPages: [[app]], children: [app] };
    pages.value = [[folder]];
    openFolderId.value = "folder-provisional";
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(95, target), app, { type: "folder", folderId: "folder-provisional", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 95, button: 0, clientX: 390, clientY: 330 });
    await nextTick();

    const release = drag.dragReleaseState.value;
    assert(stableReads >= 12, "folder release target resolver should keep polling while the registered target is provisional");
    assert(release?.targetVersion <= 3, "folder release should publish at most one provisional retarget before the final stable target");
    assert(release?.provisionalLayoutTarget === false, "folder release should wait for a final stable layout target");
    assert(Math.round(release?.targetStageLayoutRect?.top) === 146, "folder release should retarget from provisional row geometry to the final row geometry");
    assert(Math.round(release?.targetRect?.top) === 206, "folder release client rect should come from the final stage layout target");
    assert(release?.targetVisualSpec?.iconSize === 48, "folder release should retarget to the final resized folder icon visual spec");
    assert(release?.targetStageLayoutRect?.width === 48, "folder release stage target should retarget to the final resized folder icon bounds");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 120, right: 400, bottom: 340, width: 280, height: 220 }) }];
    const iconBoundsRegistry = createIconBoundsRegistry();
    const { app, drag, openFolderId, pages } = createDragHarness({
      folderPageRefs,
      folderPanelRef,
      iconBoundsRegistry,
    });
    const otherApp = { id: "app-b", name: "App B", type: "app" };
    const folder = { id: "folder-stale", type: "folder", name: "Folder", childPages: [[otherApp, app]], children: [otherApp, app] };
    pages.value = [[folder]];
    openFolderId.value = "folder-stale";
    putLaunchBounds(
      iconBoundsRegistry,
      V.STABLE_STAGE_LAYOUT,
      { area: "folder", folderId: "folder-stale", id: "app-a", pageIndex: 0 },
      { left: 420, top: 430, width: 56, height: 56 },
      {
        area: "folder",
        folderId: "folder-stale",
        id: "app-a",
        index: 0,
        pageIndex: 0,
        stageHeight: 500,
        stageRect: { left: 100, top: 60, width: 500, height: 500 },
        stageWidth: 500,
      }
    );
    const target = {
      getBoundingClientRect: () => ({ left: 200, top: 130, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(94, target, { clientX: 210, clientY: 140 }), app, { type: "folder", folderId: "folder-stale", pageIndex: 0, index: 1 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 94, button: 0, clientX: 125, clientY: 135 });
    const staleRecord = iconBoundsRegistry.getRecord(
      K.LAUNCH,
      V.STABLE_STAGE_LAYOUT,
      { area: "folder", folderId: "folder-stale", id: "app-a", pageIndex: 0 }
    );
    assert(staleRecord == null, "folder placement should clear stale Pixi launch bounds before release target resolution");
    await nextTick();
    assert(drag.dragReleaseState.value?.targetStageLayoutRect == null, "folder release should not carry a stale stage layout target after clearing old bounds");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const { app, drag, folderSession, pages } = createDragHarness();
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };
    const targetApp = { id: "app-b", type: "app", name: "App B" };
    pages.value = [
      [
        {
          id: "folder-created",
          type: "folder",
          name: "新文件夹",
          childPages: [[targetApp]],
        },
      ],
    ];

    drag.beginDrag(makePointerDownEvent(51, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    folderSession.value = { mode: "created", folderId: "folder-created", targetApp, hasEntered: false, openedAt: 1 };

    listeners.get("pointercancel")({ type: "pointercancel", pointerId: 51, button: 0, clientX: 40, clientY: 50 });

    const ids = pages.value.flat().map((item) => item.id).sort().join(",");
    assert(drag.dragMeta.value === null, "pointercancel should finish an active drag");
    assert(folderSession.value === null, "pointercancel should clear a pending folder session");
    assert(ids === "app-a,app-b", "pointercancel should restore dragged and target apps to the desktop");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const { app, calls, drag, pages } = createDragHarness({
      canCreateDesktopPageAfterDrag: () => true,
    });
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(61, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    assert(drag.dragMeta.value?.item.id === "app-a", "long press should enter active drag state before edge turn");

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 61,
      buttons: 1,
      clientX: 1018,
      clientY: 50,
      preventDefault: () => {},
    });
    assert(timers.size > 0, "edge drag should arm delayed timers before cancellation");

    listeners.get("pointercancel")({ type: "pointercancel", pointerId: 61, button: 0, clientX: 1018, clientY: 50 });
    flushTimers(timers);

    assert(pages.value.length === 1, "pointercancel should clear page-turn timers before they can create a page");
    assert(!calls.commitPageIndex.includes(1), "pointercancel should not allow a delayed page turn after drag end");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 130, right: 480, bottom: 360, width: 360, height: 230 }) }];
    const secondPageApp = { id: "app-b", type: "app", name: "App B" };
    const folderPages = ref([[{ id: "app-a", type: "app", name: "App A" }], [secondPageApp]]);
    const { app, calls, drag, folderPageIndex, folderSession, openFolderId, pages, visualFolderPageIndex } = createDragHarness({
      folderPageRefs,
      folderPages,
      folderPanelRef,
    });
    const folder = { id: "folder-edge", type: "folder", name: "Folder", childPages: folderPages.value, children: folderPages.value.flat() };
    pages.value = [[folder]];
    openFolderId.value = "folder-edge";
    const target = {
      getBoundingClientRect: () => ({ left: 130, top: 150, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(65, target), app, { type: "folder", folderId: "folder-edge", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    assert(folderSession.value?.mode === "source-folder", "folder edge drag should start from the source folder");

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 65,
      buttons: 1,
      clientX: 492,
      clientY: 180,
      preventDefault: () => {},
    });
    runNextTimer(timers);
    assert(calls.requestFolderPageTurn.length === 0, "folder edge drag should not request a page turn before the delay");
    runNextTimer(timers);
    assert(calls.requestFolderPageTurn.length === 1, "folder edge drag should request a visual folder page turn");
    assert(calls.requestFolderPageTurn[0].options.source === "drag-edge", "folder edge drag should mark the turn source");
    assert(folderPageIndex.value === 0, "folder edge drag should keep the committed page until release");
    assert(visualFolderPageIndex.value === 1, "folder edge drag should expose the visual target page before release");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 65, button: 0, clientX: 492, clientY: 180 });
    assert(calls.commitFolderPageTurnRequest.join(",") === "1", "releasing after a visual folder edge turn should commit the pending request");
    assert(folderPageIndex.value === 1, "releasing after a visual folder edge turn should land on the visual page");
    assert(calls.insertAppIntoFolder.at(-1)?.targetPageIndex === 1, "folder edge release should insert into the visual target page");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [
      { getBoundingClientRect: () => ({ left: 120, top: 120, right: 480, bottom: 360, width: 360, height: 240 }) },
      { getBoundingClientRect: () => ({ left: 120, top: 120, right: 480, bottom: 360, width: 360, height: 240 }) },
    ];
    const folderPages = ref([
      makeFolderApps(4, "page-zero"),
      [{ id: "app-a", type: "app", name: "App A" }],
    ]);
    const { app, calls, drag, folderPageIndex, openFolderId, pages } = createDragHarness({
      folderCols: ref(2),
      folderPageRefs,
      folderPages,
      folderPageSize: ref(6),
      folderPanelRef,
      visibleFolderRowCount: ref(2),
    });
    const folder = { id: "folder-edge-append", type: "folder", name: "Folder", childPages: folderPages.value, children: folderPages.value.flat() };
    pages.value = [[folder]];
    folderPageIndex.value = 1;
    openFolderId.value = "folder-edge-append";
    const target = {
      getBoundingClientRect: () => ({ left: 140, top: 140, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(66, target, { clientX: 150, clientY: 150 }), app, { type: "folder", folderId: "folder-edge-append", pageIndex: 1, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 66,
      buttons: 1,
      clientX: 108,
      clientY: 150,
      preventDefault: () => {},
    });
    runNextTimer(timers);
    runNextTimer(timers);

    listeners.get("pointerup")({ type: "pointerup", pointerId: 66, button: 0, clientX: 108, clientY: 150 });
    assert(folderPageIndex.value === 0, "post-turn folder release should commit to the previous page");
    assert(calls.insertAppIntoFolder.at(-1)?.targetPageIndex === 0, "post-turn folder release should target the committed page");
    assert(calls.insertAppIntoFolder.at(-1)?.insertIndex === 4, "post-turn edge release should append after the target page items instead of using the edge slot");
    await nextTick();
    const releaseTarget = drag.dragReleaseState.value?.targetRect;
    const releaseCenterX = releaseTarget ? releaseTarget.left + releaseTarget.width / 2 : 0;
    const releaseCenterY = releaseTarget ? releaseTarget.top + releaseTarget.height / 2 : 0;
    assert(Math.abs(releaseCenterX - 210) < 0.01, "post-turn edge release should target the appended column instead of the old edge slot");
    assert(Math.abs(releaseCenterY - 305.07) < 0.1, "post-turn edge release should project the row created by the drop");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 400, bottom: 400, width: 300, height: 300 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 120, right: 400, bottom: 340, width: 280, height: 220 }) }];
    const { app, drag, folderSession, openFolderId, pages } = createDragHarness({ folderPageRefs, folderPanelRef });
    const folder = { id: "folder-1", type: "folder", name: "Folder", childPages: [[app]], children: [app] };
    pages.value = [[folder]];
    openFolderId.value = "folder-1";
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(71, target), app, { type: "folder", folderId: "folder-1", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();
    assert(folderSession.value?.mode === "source-folder", "folder-sourced drag should enter a folder session");

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 71,
      buttons: 1,
      clientX: 20,
      clientY: 20,
      preventDefault: () => {},
    });
    runNextTimer(timers);

    assert(openFolderId.value === null, "leaving an entered folder should start closing the folder");
    assert(!pages.value[0].some((item) => item.id === "app-a"), "leaving a folder should not sort the dragged item onto the desktop before the close gate finishes");

    runNextTimer(timers);
    assert(!pages.value[0].some((item) => item.id === "app-a"), "close gate completion should not bypass the normal drag intent idle delay");
    assert(Array.from(timers.values()).some((timer) => timer.delay === DRAG_INTENT_IDLE_DELAY), "close gate completion should reschedule a normal drag intent evaluation");
    runNextTimer(timers);
    assert(pages.value[0].some((item) => item.id === "app-a"), "post-gate drag intent should return the dragged item to the desktop");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folder = { id: "folder-1", type: "folder", name: "Folder", childPages: [[]], children: [] };
    const iconBoundsRegistry = createIconBoundsRegistry();
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: "folder-1", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-1", item: folder, pageIndex: 0 }
    );
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 120, right: 400, bottom: 340, width: 280, height: 220 }) }];
    const { app, calls, drag, folderSession, openFolderId, pages } = createDragHarness({ folderPageRefs, folderPanelRef, iconBoundsRegistry });
    pages.value = [[app, folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(81, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 81,
      buttons: 1,
      clientX: 132,
      clientY: 132,
      preventDefault: () => {},
    });
    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value?.targetId === "folder-1", "hovering a folder target should expose the Pixi hover target");
    assert(drag.dragFolderHoverState.value?.phase === "hover", "folder target hover should start in the hover phase");
    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value?.phase === "flash", "folder target hover should enter the flash phase before opening");
    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value?.phase === "opening", "folder target hover should restore the drag preview before opening");
    runNextTimer(timers);

    assert(openFolderId.value === "folder-1", "hovering a folder target should open it for drag");
    assert(drag.dragFolderHoverState.value === null, "opening a folder target should clear Pixi hover state");
    assert(folderSession.value?.mode === "existing", "hovering an existing folder should enter an existing-folder drag session");
    assert(Array.from(timers.values()).some((timer) => timer.delay > 400), "opening a folder during drag should arm a sort gate timer");

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 81,
      buttons: 1,
      clientX: 160,
      clientY: 160,
      preventDefault: () => {},
    });
    assert(Array.from(timers.values()).some((timer) => timer.delay === DRAG_INTENT_IDLE_DELAY), "moving inside an opening folder should schedule a short drag intent evaluation");
    runNextTimer(timers);
    assert(calls.insertAppIntoFolder.length === 0, "folder open gate should delay folder sorting while the open animation is running");

    runNextTimer(timers);
    assert(calls.insertAppIntoFolder.length === 0, "folder open gate completion should not bypass the normal drag intent idle delay");
    assert(Array.from(timers.values()).some((timer) => timer.delay === DRAG_INTENT_IDLE_DELAY), "folder open gate completion should reschedule a normal drag intent evaluation");
    runNextTimer(timers);
    assert(calls.insertAppIntoFolder.length === 1, "folder sorting should commit only after the post-gate drag intent delay");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folder = { id: "folder-2", type: "folder", name: "Folder", childPages: [[]], children: [] };
    const iconBoundsRegistry = createIconBoundsRegistry();
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: "folder-2", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-2", item: folder, pageIndex: 0 }
    );
    const { app, drag, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(82, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 82,
      buttons: 1,
      clientX: 132,
      clientY: 132,
      preventDefault: () => {},
    });
    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value?.targetId === "folder-2", "folder hover state should be set while hovering a folder");

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 82,
      buttons: 1,
      clientX: 300,
      clientY: 132,
      preventDefault: () => {},
    });
    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value === null, "leaving the folder sticky zone should clear folder hover state");
    assert(!Array.from(timers.values()).some((timer) => timer.delay > 400), "leaving the folder sticky zone should cancel delayed folder hover timers");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folder = { id: "folder-3", type: "folder", name: "Folder", childPages: [[]], children: [] };
    const iconBoundsRegistry = createIconBoundsRegistry();
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: "folder-3", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-3", item: folder, pageIndex: 0 }
    );
    putLaunchBounds(
      iconBoundsRegistry,
      V.LIVE_TARGET,
      { area: "desktop", id: "folder-3", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-3", index: 1, item: folder, pageIndex: 0 }
    );
    const { app, calls, drag, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(83, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 83,
      buttons: 1,
      clientX: 132,
      clientY: 132,
      preventDefault: () => {},
    });
    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value?.targetId === "folder-3", "folder hover state should lock the target before layout motion");

    iconBoundsRegistry.clearBounds();
    putLaunchBounds(
      iconBoundsRegistry,
      V.RENDERED,
      { area: "desktop", id: "folder-3", pageIndex: 0 },
      { left: 400, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-3", item: folder, pageIndex: 0 }
    );
    putLaunchBounds(
      iconBoundsRegistry,
      V.LIVE_TARGET,
      { area: "desktop", id: "folder-3", pageIndex: 0 },
      { left: 220, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-3", index: 1, item: folder, pageIndex: 0 }
    );

    listeners.get("pointermove")({
      type: "pointermove",
      pointerId: 83,
      buttons: 1,
      clientX: 232,
      clientY: 132,
      preventDefault: () => {},
    });
    runNextTimer(timers);
    assert(drag.dragFolderHoverState.value?.targetId === "folder-3", "moving target bounds should refresh the locked folder hover target");
    assert(calls.commitPages.length === 0, "locked folder hover should block desktop sorting while the target is still sticky");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 83, button: 0, clientX: 232, clientY: 132 });
    assert(calls.insertAppIntoFolder.length === 1, "pointerup should prefer the locked folder target over moving visual bounds");
    assert(calls.insertAppIntoFolder[0].folderId === "folder-3", "locked folder drop should use the original folder id");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderApps = makeFolderApps(8, "preview-child");
    const folder = { id: "folder-preview-drop", type: "folder", name: "Folder", childPages: [folderApps], children: folderApps };
    const iconBoundsRegistry = createIconBoundsRegistry();
    registerDesktopFolderBounds(iconBoundsRegistry, folder, { left: 100, top: 100, width: 80, height: 80 });
    const { app, calls, drag, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(84, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 84, button: 0, clientX: 132, clientY: 132 });
    await nextTick();
    await nextTick();

    const release = drag.dragReleaseState.value;
    assert(calls.insertAppIntoFolder.length === 1, "direct folder drop should insert the app into the target folder");
    assert(release?.releaseMode === "folder-preview-slot", "one-page folder with visible preview room should release into a preview slot");
    assert(release?.targetFolderId === "folder-preview-drop", "preview release should track the target folder id");
    assert(release?.targetPreviewSlotIndex === 8, "preview release should target the first free visible preview slot");
    assert(release?.suppressFolderPreviewChildId === "app-a", "preview release should suppress the real inserted preview child while the ghost flies in");
    assert(!("targetRect" in release), "preview release should not publish a stale final target rectangle");
    assert(!("targetStageLayoutRect" in release), "preview release should not publish a stable-layout target rectangle");
    assert(!("targetVersion" in release), "preview release should not retain the legacy geometry retarget version");
    assert(!("provisionalLayoutTarget" in release), "preview release should not retain the legacy provisional geometry state");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderApps = makeFolderApps(9, "full-child");
    const folder = { id: "folder-full-drop", type: "folder", name: "Folder", childPages: [folderApps], children: folderApps };
    const iconBoundsRegistry = createIconBoundsRegistry();
    registerDesktopFolderBounds(iconBoundsRegistry, folder, { left: 100, top: 100, width: 80, height: 80 });
    const { app, drag, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(85, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 85, button: 0, clientX: 132, clientY: 132 });
    await nextTick();
    await nextTick();

    const release = drag.dragReleaseState.value;
    assert(release?.releaseMode === "folder-center-absorb", "full visible preview should release into the folder center");
    assert(release?.targetFolderId === "folder-full-drop", "center absorb release should retain the semantic target folder id");
    assert(release?.targetPreviewSlotIndex == null, "center absorb release should not expose a preview slot");
    assert(!release?.suppressFolderPreviewChildId, "center absorb release should not suppress a preview child");
    assert(!("targetRect" in release), "center absorb release should not publish a stale final target rectangle");
    assert(!("targetStageLayoutRect" in release), "center absorb release should not publish a stable-layout target rectangle");
    assert(!("targetVersion" in release), "center absorb release should not retain the legacy geometry retarget version");
    assert(!("provisionalLayoutTarget" in release), "center absorb release should not retain legacy provisional geometry state");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const firstPage = makeFolderApps(2, "first-page-child");
    const secondPage = makeFolderApps(1, "second-page-child");
    const folder = { id: "folder-multipage-drop", type: "folder", name: "Folder", childPages: [firstPage, secondPage], children: [...firstPage, ...secondPage] };
    const iconBoundsRegistry = createIconBoundsRegistry();
    registerDesktopFolderBounds(iconBoundsRegistry, folder, { left: 100, top: 100, width: 80, height: 80 });
    const { app, drag, pages } = createDragHarness({ iconBoundsRegistry });
    pages.value = [[app, folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(86, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 86, button: 0, clientX: 132, clientY: 132 });
    await nextTick();
    await nextTick();

    const release = drag.dragReleaseState.value;
    assert(release?.releaseMode === "folder-center-absorb", "multi-page folder drops should release into the folder center");
    assert(!("targetRect" in release), "multi-page center absorb should remain independent of target rectangles");
    iconBoundsRegistry.clearBounds();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderApps = makeFolderApps(4, "small-page-child");
    const folder = { id: "folder-small-page-drop", type: "folder", name: "Folder", childPages: [folderApps], children: folderApps };
    const iconBoundsRegistry = createIconBoundsRegistry();
    registerDesktopFolderBounds(iconBoundsRegistry, folder, { left: 100, top: 100, width: 80, height: 80 });
    const { app, calls, drag, pages } = createDragHarness({ folderPageSize: ref(4), iconBoundsRegistry });
    pages.value = [[app, folder]];
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(87, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 87, button: 0, clientX: 132, clientY: 132 });
    await nextTick();
    await nextTick();

    const release = drag.dragReleaseState.value;
    assert(release?.releaseMode === "folder-center-absorb", "folderPageSize below 9 should treat a full first page as center absorb");
    assert(!("targetRect" in release), "small-page center absorb should remain independent of target rectangles");
    assert(calls.insertAppIntoFolder[0]?.insertIndex === 4, "small page folder drop should still append at the current last page");
    iconBoundsRegistry.clearBounds();
  });
}
