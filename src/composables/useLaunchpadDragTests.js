import {
  useLaunchpadDrag,
  isPrimaryPointerMoveEvent,
  isPrimaryPointerStartEvent,
  shouldFinishDragForPointerEvent,
} from "./useLaunchpadDrag.js";
import {
  clearIconBoundsRegistry,
  registerLiveClientLaunchIconTargetBounds,
  registerRenderedClientLaunchIconBounds,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";
import { nextTick, ref, shallowRef } from "vue";

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
  const isLayoutProjectionActive = ref(false);
  const folderSession = ref(null);
  const openFolderId = ref(null);
  const calls = {
    commitFolderSession: [],
    commitOpenFolder: [],
    commitPageIndex: [],
    commitPages: [],
    insertAppIntoFolder: [],
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
  const drag = useLaunchpadDrag({
    canCreateDesktopPageAfterDrag: overrides.canCreateDesktopPageAfterDrag || (() => false),
    canCreateFolderPageAfterDrag: overrides.canCreateFolderPageAfterDrag || (() => false),
    cloneItem,
    clonePages,
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
    finishHomeRevealSettleWindow: overrides.finishHomeRevealSettleWindow || (() => {}),
    folderCols: ref(4),
    folderPageIndex,
    folderPageRefs,
    folderPages: ref([[]]),
    folderPageSize: ref(16),
    folderPanelRef,
    folderSession,
    getFolderChildPages,
    getPageSlotMotionGeometry: () => null,
    getTopLevelIconMotionGeometry: () => null,
    gridCols: ref(7),
    gridRows: ref(5),
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
    replaceFolderWithItem,
    visibleFolderRowCount: ref(4),
    withFolderPages: (folder, childPages) => ({ ...folder, childPages, children: childPages.flat() }),
    wouldFolderInsertOverflow: () => false,
    wouldTopLevelInsertOverflow: () => false,
  });

  return { app, calls, drag, folderPanelRef, folderSession, isLayoutProjectionActive, openFolderId, pages };
}

function makePointerDownEvent(pointerId, target) {
  return {
    button: 0,
    buttons: 1,
    clientX: 24,
    clientY: 32,
    currentTarget: target,
    pointerId,
    preventDefault: () => {},
    stopPropagation: () => {},
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

  await withMockPointerEnvironment(async ({ timers }) => {
    clearIconBoundsRegistry();
    const isHomeRevealSettling = ref(true);
    let finishSettleCalls = 0;
    const { app, drag } = createDragHarness({
      finishHomeRevealSettleWindow: () => {
        finishSettleCalls += 1;
        isHomeRevealSettling.value = false;
        registerRenderedClientLaunchIconBounds(
          { area: "desktop", id: "app-a", pageIndex: 0 },
          { left: 20, top: 22, width: 64, height: 64 },
          { area: "desktop", id: "app-a", index: 0, pageIndex: 0 }
        );
      },
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
    clearIconBoundsRegistry();
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    clearIconBoundsRegistry();
    const isHomeRevealSettling = ref(true);
    const { app, drag } = createDragHarness({
      isHomeRevealSettling,
    });
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(43, target), app, { type: "page", pageIndex: 0, index: 0 });
    isHomeRevealSettling.value = false;
    registerRenderedClientLaunchIconBounds(
      { area: "desktop", id: "app-a", pageIndex: 0 },
      { left: 20, top: 22, width: 64, height: 64 },
      { area: "desktop", id: "app-a", index: 0, pageIndex: 0 }
    );
    runNextTimer(timers);
    await nextTick();
    await nextTick();

    assert(drag.dragPreviewState.value?.offset.x === 4 && drag.dragPreviewState.value?.offset.y === 10, "desktop drag should refresh bounds when pointerdown happened during reveal settle");
    clearIconBoundsRegistry();
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
    const { app, drag } = createDragHarness();
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
    };

    drag.beginDrag(makePointerDownEvent(91, target), app, { type: "page", pageIndex: 0, index: 0 });
    runNextTimer(timers);
    await nextTick();

    listeners.get("pointerup")({ type: "pointerup", pointerId: 91, button: 0, clientX: 690, clientY: 490 });
    await nextTick();

    const rect = drag.dragReleaseState.value?.targetRect;
    assert(Math.round(rect?.left) === 18 && Math.round(rect?.top) === 4, "desktop release should animate to the committed compact visual slot, not the empty pointer slot");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    clearIconBoundsRegistry();
    const { app, drag, pages } = createDragHarness({
      onCommitPages: () => {
        registerLiveClientLaunchIconTargetBounds(
          { area: "desktop", id: "app-a", pageIndex: 0 },
          { left: 123, top: 45, width: 64, height: 64 },
          { area: "desktop", id: "app-a", index: 1, pageIndex: 0 }
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
    assert(Math.round(rect?.left) === 123 && Math.round(rect?.top) === 45, "desktop release should prefer Pixi target bounds over fallback slot geometry");
    clearIconBoundsRegistry();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 120, right: 400, bottom: 340, width: 280, height: 220 }) }];
    const { app, drag, openFolderId, pages } = createDragHarness({ folderPageRefs, folderPanelRef });
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
    assert(Math.round(rect?.left) === 128 && Math.round(rect?.top) === 106, "folder release should animate to the committed compact visual slot, not the empty pointer slot");
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
    assert(pages.value[0].some((item) => item.id === "app-a"), "close gate completion should return the dragged item to the desktop");
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folder = { id: "folder-1", type: "folder", name: "Folder", childPages: [[]], children: [] };
    clearIconBoundsRegistry();
    registerRenderedClientLaunchIconBounds(
      { area: "desktop", id: "folder-1", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-1", item: folder, pageIndex: 0 }
    );
    const folderPanelRef = ref({ getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 420, width: 400, height: 320 }) });
    const folderPageRefs = [{ getBoundingClientRect: () => ({ left: 120, top: 120, right: 400, bottom: 340, width: 280, height: 220 }) }];
    const { app, calls, drag, folderSession, openFolderId, pages } = createDragHarness({ folderPageRefs, folderPanelRef });
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
    assert(Array.from(timers.values()).some((timer) => timer.delay === 140), "moving inside an opening folder should schedule a short drag intent evaluation");
    runNextTimer(timers);
    assert(calls.insertAppIntoFolder.length === 0, "folder open gate should delay folder sorting while the open animation is running");

    for (let index = 0; index < 5 && calls.insertAppIntoFolder.length === 0; index += 1) runNextTimer(timers);
    assert(calls.insertAppIntoFolder.length === 1, "folder open gate completion should allow folder sorting at the current pointer");
    clearIconBoundsRegistry();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folder = { id: "folder-2", type: "folder", name: "Folder", childPages: [[]], children: [] };
    clearIconBoundsRegistry();
    registerRenderedClientLaunchIconBounds(
      { area: "desktop", id: "folder-2", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-2", item: folder, pageIndex: 0 }
    );
    const { app, drag, pages } = createDragHarness();
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
    clearIconBoundsRegistry();
  });

  await withMockPointerEnvironment(async ({ listeners, timers }) => {
    const folder = { id: "folder-3", type: "folder", name: "Folder", childPages: [[]], children: [] };
    clearIconBoundsRegistry();
    registerRenderedClientLaunchIconBounds(
      { area: "desktop", id: "folder-3", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-3", item: folder, pageIndex: 0 }
    );
    registerLiveClientLaunchIconTargetBounds(
      { area: "desktop", id: "folder-3", pageIndex: 0 },
      { left: 100, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-3", index: 1, item: folder, pageIndex: 0 }
    );
    const { app, calls, drag, pages } = createDragHarness();
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

    clearIconBoundsRegistry();
    registerRenderedClientLaunchIconBounds(
      { area: "desktop", id: "folder-3", pageIndex: 0 },
      { left: 400, top: 100, width: 80, height: 80 },
      { area: "desktop", id: "folder-3", item: folder, pageIndex: 0 }
    );
    registerLiveClientLaunchIconTargetBounds(
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
    clearIconBoundsRegistry();
  });
}
