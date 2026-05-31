import {
  useLaunchpadDrag,
  isPrimaryPointerMoveEvent,
  isPrimaryPointerStartEvent,
  shouldFinishDragForPointerEvent,
} from "./useLaunchpadDrag.js";
import { nextTick, ref, shallowRef } from "vue";

async function withMockPointerEnvironment(run) {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
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
    setTimeout: (callback) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, callback);
      return id;
    },
  };
  globalThis.document = {
    elementsFromPoint: () => [],
  };

  try {
    await run({ listeners, timers });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
}

function createDragHarness() {
  const app = { id: "app-a", type: "app", name: "App A" };
  const pages = shallowRef([[app]]);
  const pageIndex = ref(0);
  const folderPageIndex = ref(0);
  const calls = {
    commitFolderSession: [],
    commitPageIndex: [],
    commitPages: [],
  };
  const drag = useLaunchpadDrag({
    canCreateDesktopPageAfterDrag: () => false,
    canCreateFolderPageAfterDrag: () => false,
    cloneItem: (item) => ({ ...item }),
    clonePages: (sourcePages) => sourcePages.map((page) => page.map((item) => ({ ...item }))),
    commitFolderPageIndex: (value) => {
      folderPageIndex.value = value;
    },
    commitFolderSession: (value) => calls.commitFolderSession.push(value),
    commitOpenFolder: () => {},
    commitPageIndex: (value) => {
      calls.commitPageIndex.push(value);
      pageIndex.value = value;
    },
    commitPages: (next) => {
      calls.commitPages.push(next);
      pages.value = next;
    },
    compactPages: (next) => next,
    dragPreviewRef: ref({ style: {} }),
    findFolder: () => null,
    findInFolder: () => null,
    findTopLevel: (sourcePages, id) => {
      for (let currentPageIndex = 0; currentPageIndex < sourcePages.length; currentPageIndex += 1) {
        const index = sourcePages[currentPageIndex].findIndex((item) => item.id === id);
        if (index >= 0) return { pageIndex: currentPageIndex, index, item: sourcePages[currentPageIndex][index] };
      }
      return null;
    },
    finishHomeRevealSettleWindow: () => {},
    folderCols: ref(4),
    folderPageIndex,
    folderPageRefs: [],
    folderPages: ref([[]]),
    folderPageSize: ref(16),
    folderPanelRef: ref(null),
    folderSession: ref(null),
    getFolderChildPages: () => [[]],
    getPageSlotMotionGeometry: () => null,
    getTopLevelIconMotionGeometry: () => null,
    gridCols: ref(7),
    gridRows: ref(5),
    insertAppIntoFolder: (sourcePages) => sourcePages,
    insertTopLevelItem: (sourcePages) => sourcePages,
    isFolderLayerActive: ref(false),
    isHomeRevealSettling: ref(false),
    isLaunchpadInteractionBlocked: () => false,
    makeId: (prefix) => `${prefix}-id`,
    openApp: () => {},
    openFolderId: ref(null),
    pageIndex,
    pageRefs: [
      {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 700, height: 500 }),
      },
    ],
    pages,
    pageSize: ref(35),
    previewAppIntoFolderWithoutOverflow: (sourcePages) => sourcePages,
    previewTopLevelItemWithoutOverflow: (sourcePages) => sourcePages,
    removeEverywhere: (sourcePages, itemId) =>
      sourcePages.map((page) => page.filter((item) => item.id !== itemId)),
    renderedFolder: ref(null),
    replaceFolderWithItem: (sourcePages) => sourcePages,
    visibleFolderRowCount: ref(4),
    withFolderPages: (folder, childPages) => ({ ...folder, childPages, children: childPages.flat() }),
    wouldFolderInsertOverflow: () => false,
    wouldTopLevelInsertOverflow: () => false,
  });

  return { app, calls, drag };
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
    const { app, drag } = createDragHarness();
    const target = {
      getBoundingClientRect: () => ({ left: 10, top: 12, width: 64, height: 64 }),
      querySelector: () => null,
    };

    drag.beginDrag(makePointerDownEvent(41, target), app, { type: "page", pageIndex: 0, index: 0 });
    Array.from(timers.values())[0]();
    await nextTick();
    assert(drag.dragMeta.value?.item.id === "app-a", "long press should enter active drag state");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 42, button: 0, clientX: 40, clientY: 50 });
    assert(drag.dragMeta.value?.item.id === "app-a", "different pointerup should not finish an active drag");

    listeners.get("pointerup")({ type: "pointerup", pointerId: 41, button: 0, clientX: 40, clientY: 50 });
    assert(drag.dragMeta.value === null, "matching pointerup should finish the active drag");
  });
}
