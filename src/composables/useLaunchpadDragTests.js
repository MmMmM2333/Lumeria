import { computed, nextTick, ref, shallowRef } from "vue";
import {
  isPrimaryPointerMoveEvent,
  isPrimaryPointerStartEvent,
  samplePointerVelocity,
  shouldFinishDragForPointerEvent,
  useLaunchpadDrag,
} from "./useLaunchpadDrag.js";
import { PAGE_TURN_DELAY } from "./launchpadConstants.js";
import { planGroupDrop } from "../domain/groupDropPlanner.js";
import {
  createIconBoundsRegistry,
  ICON_BOUNDS_KIND,
  ICON_BOUNDS_VARIANT,
} from "../rendering/pixi/geometry/iconBoundsRegistry.js";

function app(id) {
  return { id, name: id, type: "app" };
}

function folder(id, childIds) {
  const children = childIds.map(app);
  return {
    childPages: [children],
    children,
    id,
    name: id,
    type: "folder",
  };
}

function clonePages(pages) {
  return structuredClone(pages);
}

async function withMockPointerEnvironment(run) {
  const originalWindow = globalThis.window;
  const timers = new Map();
  const listeners = new Map();
  let nextTimerId = 1;
  globalThis.window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    cancelAnimationFrame: () => {},
    clearTimeout: (id) => timers.delete(id),
    innerHeight: 700,
    innerWidth: 900,
    removeEventListener: (name, handler) => {
      if (listeners.get(name) === handler) listeners.delete(name);
    },
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
    await run({ timers });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

function settleRelease(drag) {
  const state = drag?.groupDragState?.value;
  const plan = state?.releasePlan;
  if (!plan?.entries?.length) return;
  for (const entry of plan.entries) {
    drag.completeGroupRelease({
      entryId: entry.id,
      planKey: plan.key,
    });
  }
}

function flushTimers(timers, drag = null) {
  settleRelease(drag);
  const pending = [...timers.values()].sort((left, right) => left.delay - right.delay);
  timers.clear();
  for (const timer of pending) timer.callback();
}

function flushTimerByDelay(timers, delay) {
  const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
  if (!entry) return false;
  const [id, timer] = entry;
  timers.delete(id);
  timer.callback();
  return true;
}

function findTopLevel(pages, id) {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const index = pages[pageIndex].findIndex((item) => item?.id === id);
    if (index >= 0) return { index, item: pages[pageIndex][index], pageIndex };
  }
  return null;
}

function findFolder(pages, id) {
  const found = findTopLevel(pages, id);
  return found?.item?.type === "folder" ? found : null;
}

function getFolderChildPages(item) {
  return Array.isArray(item?.childPages)
    ? item.childPages
    : [Array.isArray(item?.children) ? item.children : []];
}

function makePointerEvent(pointerId, target, overrides = {}) {
  return {
    button: 0,
    buttons: 1,
    clientX: 48,
    clientY: 54,
    currentTarget: target,
    pointerId,
    preventDefault: () => {},
    stopPropagation: () => {},
    timeStamp: 100,
    type: "pointermove",
    ...overrides,
  };
}

function createAtomicDragHarness(initialPages, options = {}) {
  const pages = shallowRef(clonePages(initialPages));
  const pageIndex = ref(0);
  const folderPageIndex = ref(0);
  const openFolderId = ref(options.openFolderId || null);
  const renderedFolder = computed(() => findFolder(pages.value, openFolderId.value)?.item || null);
  const folderPages = computed(() => getFolderChildPages(renderedFolder.value));
  const revision = ref(0);
  const calls = {
    commits: [],
    dragEnds: [],
    dragStarts: [],
    rejected: [],
  };
  const pageRect = options.pageRect || {
    bottom: 500,
    height: 400,
    left: 0,
    right: 400,
    top: 100,
    width: 400,
  };
  const desktopMainRect = options.desktopMainRect || {
    bottom: 520,
    height: 440,
    left: 0,
    right: 400,
    top: 80,
    width: 400,
  };
  const pageRefs = [
    { getBoundingClientRect: () => pageRect },
    { getBoundingClientRect: () => pageRect },
  ];
  const folderPageRefs = [
    { getBoundingClientRect: () => ({ ...pageRect, left: 150, right: 350, width: 200 }) },
  ];
  const folderPanelRect = options.folderPanelRect || {
    bottom: 520,
    height: 440,
    left: 100,
    right: 400,
    top: 80,
    width: 300,
  };
  const folderPanelRef = ref({
    getBoundingClientRect: () => folderPanelRect,
  });
  const folderPageTurnRequest = ref(null);
  const iconBoundsRegistry = createIconBoundsRegistry();
  const visualFolderPageIndex = computed(() => folderPageTurnRequest.value?.targetIndex ?? folderPageIndex.value);
  const gridCols = Math.max(1, Number(options.gridCols) || 2);
  const gridRows = Math.max(1, Number(options.gridRows) || 2);
  const pageSize = Math.max(1, Number(options.pageSize) || gridCols * gridRows);
  const folderPageSize = Math.max(1, Number(options.folderPageSize) || 4);

  const drag = useLaunchpadDrag({
    clearFolderPageTurnRequest: () => {
      folderPageTurnRequest.value = null;
    },
    cloneItem: (item) => structuredClone(item),
    clonePages,
    commitFolderPageIndex: (next) => {
      folderPageIndex.value = next;
    },
    commitFolderPageTurnRequest: () => false,
    commitGroupDrop: (plan, operation) => {
      if (operation.baseRevision !== revision.value) return false;
      calls.commits.push({ operation, plan });
      pages.value = plan.nextPages;
      revision.value += 1;
      return true;
    },
    commitOpenFolder: (next) => {
      openFolderId.value = next;
    },
    commitPageIndex: (next) => {
      pageIndex.value = next;
    },
    compactPages: (next) => next,
    desktopMainRef: ref({
      getBoundingClientRect: () => desktopMainRect,
    }),
    effectiveFolderIconSize: ref(56),
    findTopLevel,
    finishHomeRevealSettleWindow: () => {},
    folderCols: ref(2),
    folderPageIndex,
    folderPageRefs,
    folderPages,
    folderPageTurnRequest,
    folderPanelRef,
    folderPageSize: ref(folderPageSize),
    folderViewportHeight: ref(400),
    getGroupLayoutRevision: () => revision.value,
    getBatchCancelZoneRect: options.cancelZoneRect
      ? () => options.cancelZoneRect
      : undefined,
    getNewFolderName: () => "New Folder",
    gridCols: ref(gridCols),
    gridRows: ref(gridRows),
    iconBoundsRegistry,
    iconSize: ref(64),
    isFolderLayerActive: computed(() => Boolean(openFolderId.value)),
    isHomeRevealSettling: ref(false),
    isLayoutProjectionActive: ref(false),
    isLaunchpadInteractionBlocked: () => false,
    isTextlessMode: ref(false),
    makeId: () => "folder-created",
    onGroupDragEnd: (group) => calls.dragEnds.push(group),
    onGroupDragStart: (payload) => {
      calls.dragStarts.push(payload);
      return true;
    },
    onGroupDropRejected: (reason) => calls.rejected.push(reason),
    openFolderId,
    pageIndex,
    pageRefs,
    pages,
    pageSize: ref(pageSize),
    planGroupDrop: (request) => planGroupDrop({
      ...request,
      folderName: "New Folder",
      folderPageSize,
      makeFolderId: () => request.createdFolderId,
      pageSize,
    }),
    renderedFolder,
    requestFolderOpenWarmup: () => {},
    requestFolderPageTurn: () => null,
    visualFolderPageIndex,
    visibleFolderRowCount: ref(2),
  });

  return {
    calls,
    drag,
    folderPageIndex,
    iconBoundsRegistry,
    openFolderId,
    pageIndex,
    pages,
    revision,
  };
}

export async function runLaunchpadDragTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad drag test failed] ${message}`);
  };

  assert(isPrimaryPointerStartEvent({ button: 0, buttons: 1 }), "left pointer ownership should be accepted");
  assert(!isPrimaryPointerStartEvent({ button: 2, buttons: 2 }), "right pointer ownership should be rejected");
  assert(isPrimaryPointerMoveEvent({ buttons: 1 }), "held primary pointer movement should be accepted");
  assert(!isPrimaryPointerMoveEvent({ buttons: 0 }), "released pointer movement should be rejected");
  assert(
    shouldFinishDragForPointerEvent({ pointerId: 7 }, { button: 0, pointerId: 7, type: "pointerup" }),
    "the owning pointer should finish a drag"
  );
  assert(
    !shouldFinishDragForPointerEvent({ pointerId: 7 }, { button: 0, pointerId: 8, type: "pointerup" }),
    "another pointer must not finish a drag"
  );
  const velocity = samplePointerVelocity(
    { pointer: { x: 10, y: 20 }, time: 100, velocity: { x: 0, y: 0 } },
    { clientX: 30, clientY: 10, timeStamp: 120 },
    { smoothing: 0.5 }
  );
  assert(velocity.velocity.x === 500 && velocity.velocity.y === -250, "velocity should use elapsed milliseconds");

  await withMockPointerEnvironment(async () => {
    const a = app("anchor-source");
    const harness = createAtomicDragHarness([[a]]);
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(150, sourceElement, {
        clientX: 54,
        clientY: 152,
        dragAnchor: { x: 48, y: 152 },
      }),
      a,
      { index: 0, pageIndex: 0, type: "page" }
    );
    assert(
      harness.drag.groupDragState.value?.center?.x === 54 &&
        harness.drag.groupDragState.value?.center?.y === 152,
      "the drag visual should preserve the original press anchor instead of jumping back toward the icon center"
    );
    harness.drag.cancelDrag(makePointerEvent(150, sourceElement, {
      button: 0,
      buttons: 0,
      type: "pointercancel",
    }));
  });

  await withMockPointerEnvironment(async () => {
    const selected = Array.from({ length: 13 }, (_, index) => app(`release-${index}`));
    const harness = createAtomicDragHarness([selected], {
      folderPageSize: 13,
      gridCols: 13,
      gridRows: 1,
      pageSize: 13,
    });
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    selected.forEach((item, index) => {
      harness.iconBoundsRegistry.registerBounds(
        ICON_BOUNDS_KIND.LAUNCH,
        ICON_BOUNDS_VARIANT.RENDERED,
        { area: "desktop", id: item.id, pageIndex: 0 },
        { height: 64, left: 12 + index * 28, top: 300, width: 64 },
        { area: "desktop", id: item.id, index, pageIndex: 0 }
      );
    });
    harness.drag.startDrag(
      makePointerEvent(153, sourceElement, { clientX: 48, clientY: 152 }),
      selected[0],
      { index: 0, pageIndex: 0, type: "page" },
      {
        draggedIds: selected.map((item) => item.id),
        layoutRevision: 0,
        leadId: selected[0].id,
        selectionRevision: 13,
      }
    );
    assert(
      harness.drag.groupDragState.value?.entries.length === 12,
      "the interactive drag should remain bounded to twelve representatives"
    );
    harness.drag.cancelDrag({ cancelSource: "keyboard", userInitiatedCancel: true });
    assert(
      harness.drag.groupDragState.value?.entries.length === 13 &&
        harness.drag.groupDragState.value?.releasePlan?.entries.length === 13,
      "releasing a thirteen-item group should expand ownership to every selected application"
    );
    settleRelease(harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const selected = Array.from({ length: 13 }, (_, index) => app(`folder-release-${index}`));
    const targetApp = app("folder-target-b");
    const harness = createAtomicDragHarness([[...selected, targetApp]], {
      folderPageSize: 14,
      gridCols: 14,
      gridRows: 1,
      pageSize: 14,
    });
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    selected.forEach((item, index) => {
      harness.iconBoundsRegistry.registerBounds(
        ICON_BOUNDS_KIND.LAUNCH,
        ICON_BOUNDS_VARIANT.RENDERED,
        { area: "desktop", id: item.id, pageIndex: 0 },
        { height: 64, left: 12 + index * 28, top: 300, width: 64 },
        { area: "desktop", id: item.id, index, pageIndex: 0 }
      );
    });
    const targetRect = { height: 64, left: 200, top: 150, width: 64 };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: targetApp.id, pageIndex: 0 },
      targetRect,
      { area: "desktop", id: targetApp.id, index: 13, pageIndex: 0 }
    );
    harness.drag.startDrag(
      makePointerEvent(154, sourceElement, { clientX: 48, clientY: 152 }),
      selected[0],
      { index: 0, pageIndex: 0, type: "page" },
      {
        draggedIds: selected.map((item) => item.id),
        layoutRevision: 0,
        leadId: selected[0].id,
        selectionRevision: 14,
      }
    );
    harness.drag.updateDragPointer(makePointerEvent(154, sourceElement, {
      clientX: 232,
      clientY: 182,
      timeStamp: 130,
    }));
    flushTimers(timers, harness.drag);
    harness.drag.finishDrag(makePointerEvent(154, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 232,
      clientY: 182,
      type: "pointerup",
    }));
    const releaseEntries = harness.drag.groupDragState.value?.entries || [];
    assert(
      releaseEntries.length === 14 &&
        releaseEntries.slice(0, 13).map((entry) => entry.item.id).join(",") ===
          selected.map((item) => item.id).join(",") &&
        releaseEntries.at(-1)?.item?.id === targetApp.id,
      "folder creation should release every selected app and append target B without replacement"
    );
    settleRelease(harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const c = app("c");
    const harness = createAtomicDragHarness([[a, b], [c]]);
    const target = { getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }) };
    harness.drag.startDrag(
      makePointerEvent(10, target),
      a,
      { index: 0, pageIndex: 0, type: "page" },
      {
        draggedIds: ["a", "c"],
        layoutRevision: 0,
        leadId: "a",
        selectionRevision: 2,
      }
    );
    assert(harness.drag.dragMeta.value?.draggedIds?.join(",") === "a,c", "group visual ownership should include every selected id");
    assert(
      harness.drag.groupDragState.value?.entries.some((entry) => entry.originKind === "desktop-page-bundle"),
      "off-page selections should use a bounded page-edge proxy"
    );
    harness.drag.updateDragPointer(makePointerEvent(10, target, { clientX: 250, clientY: 180, timeStamp: 130 }));
    assert(harness.calls.commits.length === 0 && harness.revision.value === 0, "moving must not mutate authoritative pages or revision");
    harness.drag.finishDrag(makePointerEvent(10, target, {
      button: 0,
      buttons: 0,
      clientX: 250,
      clientY: 180,
      timeStamp: 150,
      type: "pointerup",
    }));
    await nextTick();
    assert(harness.calls.commits.length === 1, "an accepted group should commit once");
    assert(harness.pages.value[0].map((item) => item.id).join(",") === "b,a,c", "lead-first placement should match the planner");
    assert(harness.revision.value === 1, "the accepted drop should advance layout revision once");
    flushTimers(timers, harness.drag);
    assert(harness.calls.dragEnds.length === 1, "visual ownership should release once after landing");
  });

  await withMockPointerEnvironment(async () => {
    const a = app("cancel-zone-a");
    const b = app("cancel-zone-b");
    const originalPages = [[a, b]];
    const harness = createAtomicDragHarness(originalPages, {
      cancelZoneRect: {
        bottom: 80,
        height: 60,
        left: 0,
        right: 400,
        top: 20,
        width: 400,
      },
    });
    const target = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(21, target, { clientX: 48, clientY: 152 }),
      a,
      { index: 0, pageIndex: 0, type: "page" },
      {
        draggedIds: [a.id, b.id],
        layoutRevision: 0,
        leadId: a.id,
        selectionRevision: 2,
      }
    );
    harness.drag.updateDragPointer(makePointerEvent(21, target, {
      clientX: 180,
      clientY: 40,
      timeStamp: 130,
    }));
    assert(
      harness.drag.groupDragState.value?.cancelArmed === true &&
        harness.drag.groupDragState.value?.dropStatus === "cancel" &&
        harness.drag.projectedPages.value === null,
      "moving the captured pointer into the toolbar cancel geometry should arm cancellation and clear previews"
    );

    harness.drag.updateDragPointer(makePointerEvent(21, target, {
      clientX: 180,
      clientY: 180,
      timeStamp: 145,
    }));
    assert(
      harness.drag.groupDragState.value?.cancelArmed === false &&
        harness.drag.groupDragState.value?.dropStatus !== "cancel",
      "leaving the cancel geometry before release should resume normal drop planning"
    );

    harness.drag.updateDragPointer(makePointerEvent(21, target, {
      clientX: 180,
      clientY: 40,
      timeStamp: 160,
    }));
    harness.drag.finishDrag(makePointerEvent(21, target, {
      button: 0,
      buttons: 0,
      clientX: 180,
      clientY: 40,
      timeStamp: 175,
      type: "pointerup",
    }));
    const cancelling = harness.drag.groupDragState.value;
    assert(
      cancelling?.phase === "cancelling" &&
        cancelling.dropStatus === "cancelled" &&
        cancelling.cancelSource === "drop-zone",
      "releasing in the cancel zone should enter a distinct user-cancelled return phase"
    );
    assert(
      cancelling?.releasePlan?.entries.every((entry) => entry.mode === "return-to-origin"),
      "cancelled representatives should animate back to their original positions"
    );
    assert(
      harness.calls.commits.length === 0 &&
        harness.calls.rejected.length === 0 &&
        JSON.stringify(harness.pages.value) === JSON.stringify(originalPages),
      "cancellation should neither commit nor report a rejected drop"
    );
    settleRelease(harness.drag);
    assert(
      harness.drag.groupDragState.value === null &&
        harness.calls.dragEnds[0]?.phase === "cancelling",
      "the cancelled return should release drag ownership only after every representative settles"
    );
  });

  await withMockPointerEnvironment(async () => {
    const a = app("escape-a");
    const b = app("escape-b");
    const harness = createAtomicDragHarness([[a, b]]);
    const target = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(22, target, { clientX: 48, clientY: 152 }),
      a,
      { index: 0, pageIndex: 0, type: "page" },
      {
        draggedIds: [a.id, b.id],
        layoutRevision: 0,
        leadId: a.id,
        selectionRevision: 3,
      }
    );
    harness.drag.updateDragPointer(makePointerEvent(22, target, {
      clientX: 220,
      clientY: 210,
      timeStamp: 130,
    }));
    const cancelled = harness.drag.cancelDrag({
      cancelSource: "keyboard",
      userInitiatedCancel: true,
    });
    assert(cancelled === true, "Escape should be accepted for an active batch drag");
    assert(
      harness.drag.groupDragState.value?.phase === "cancelling" &&
        harness.drag.groupDragState.value?.cancelSource === "keyboard",
      "keyboard cancellation should use the same return-to-origin lifecycle as the top cancel zone"
    );
    assert(
      harness.calls.commits.length === 0 && harness.calls.rejected.length === 0,
      "keyboard cancellation should remain separate from accepted and rejected drops"
    );
    settleRelease(harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const c = app("c");
    const d = app("d");
    const e = app("e");
    const f = app("f");
    const harness = createAtomicDragHarness([[a, b, c, d], [e, f]]);
    const target = { getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }) };
    harness.drag.startDrag(
      makePointerEvent(11, target),
      a,
      { index: 0, pageIndex: 0, type: "page" },
      {
        draggedIds: ["a", "e", "f"],
        layoutRevision: 0,
        leadId: "a",
        selectionRevision: 5,
      }
    );
    harness.drag.finishDrag(makePointerEvent(11, target, {
      button: 0,
      buttons: 0,
      clientX: 250,
      clientY: 180,
      type: "pointerup",
    }));
    assert(harness.calls.commits.length === 1, "desktop overflow should commit the whole group atomically");
    assert(
      harness.pages.value.map((page) => page.map((item) => item.id).join(",")).join("|") ===
        "b,a,e,f|c,d",
      "desktop overflow should preserve stable group and displaced-item order across pages"
    );
    assert(harness.drag.groupDragState.value?.phase === "accepted", "overflowing representatives should release to committed slots");
    assert(harness.calls.rejected.length === 0, "valid desktop overflow should not cross the rejection boundary");
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const c = app("c");
    const harness = createAtomicDragHarness([[a, b, c]]);
    let commitCount = 0;
    let completed = 0;
    const plan = planGroupDrop({
      basePages: harness.pages.value,
      baseRevision: 0,
      createdFolderId: "folder-created",
      currentRevision: 0,
      draggedIds: ["a", "b"],
      folderName: "New Folder",
      folderPageSize: 4,
      intent: { type: "app-folder-create" },
      leadId: "a",
      makeFolderId: () => "folder-created",
      pageSize: 4,
    });
    const presented = harness.drag.presentCommittedFolderCreation({
      basePages: harness.pages.value,
      baseRevision: 0,
      commit: () => {
        commitCount += 1;
        harness.pages.value = plan.nextPages;
        harness.revision.value += 1;
        return true;
      },
      draggedIds: ["a", "b"],
      leadId: "a",
      onComplete: () => {
        completed += 1;
      },
      plan,
      selectionRevision: 3,
    });
    assert(presented && commitCount === 1, "toolbar folder creation should commit once through the shared presentation owner");
    assert(
      harness.drag.groupDragState.value?.phase === "committing" &&
        harness.drag.groupDragState.value?.releaseCreatedFolderId === "folder-created" &&
        harness.drag.groupDragState.value?.releaseLayoutAnchorId === "a" &&
        harness.drag.groupDragState.value?.releaseLayoutPages?.[0]?.map((item) => item.id).join(",") === "a,b,c",
      "toolbar creation should hide the real folder and retain the pre-commit desktop layout while source applications are release-owned"
    );
    harness.drag.finishDrag(makePointerEvent(99, { getBoundingClientRect: () => ({}) }, {
      button: 0,
      buttons: 0,
      type: "pointerup",
    }));
    assert(
      harness.drag.groupDragState.value?.phase === "committing",
      "an unrelated pointer release must not reinterpret a committed toolbar presentation as another drop"
    );
    await nextTick();
    assert(harness.drag.groupDragState.value?.phase === "accepted", "toolbar creation should resolve real landing targets after render");
    flushTimers(timers, harness.drag);
    assert(completed === 1 && !harness.drag.isDragActive(), "the lightweight gather should complete once and release interaction ownership");
  });

  await withMockPointerEnvironment(async () => {
    const selected = Array.from({ length: 35 }, (_, index) => app(`full-page-${index}`));
    const harness = createAtomicDragHarness([selected], {
      folderPageSize: 35,
      gridCols: 7,
      gridRows: 5,
      pageSize: 35,
    });
    const plan = planGroupDrop({
      basePages: harness.pages.value,
      baseRevision: 0,
      createdFolderId: "folder-created",
      currentRevision: 0,
      draggedIds: selected.map((item) => item.id),
      folderName: "New Folder",
      folderPageSize: 35,
      intent: { type: "app-folder-create" },
      leadId: selected[0].id,
      makeFolderId: () => "folder-created",
      pageSize: 35,
    });
    const presented = harness.drag.presentCommittedFolderCreation({
      basePages: harness.pages.value,
      baseRevision: 0,
      commit: () => {
        harness.pages.value = plan.nextPages;
        harness.revision.value += 1;
        return true;
      },
      draggedIds: selected.map((item) => item.id),
      leadId: selected[0].id,
      plan,
      selectionRevision: 35,
    });
    assert(presented, "full-page toolbar folder creation should enter the shared release presentation");
    assert(
      harness.drag.groupDragState.value?.entries.length <= 12 &&
        harness.drag.groupDragState.value?.releaseVisualCount === 35,
      "the committing gather should retain twelve visuals while advertising the full release-pool target"
    );
    await nextTick();
    const releaseState = harness.drag.groupDragState.value;
    assert(
      releaseState?.entries.length === 35 &&
        releaseState.releasePlan?.entries.length === 35 &&
        releaseState.entries.map((entry) => entry.item.id).join(",") ===
          selected.map((item) => item.id).join(","),
      "creating a folder from a complete 5x7 page should animate all thirty-five source applications"
    );
    settleRelease(harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const f = app("f");
    const g = app("g");
    const harness = createAtomicDragHarness([[a], [f, g]]);
    harness.pageIndex.value = 1;
    const target = { getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }) };
    harness.drag.startDrag(
      makePointerEvent(16, target, { clientX: 48, clientY: 152 }),
      f,
      { index: 0, pageIndex: 1, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(16, target, {
      clientX: 390,
      clientY: 220,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, PAGE_TURN_DELAY), "the final desktop edge should schedule a deferred virtual page turn");
    assert(harness.pages.value.length === 2, "turning onto a virtual desktop page must not mutate authoritative pages");
    assert(
      harness.drag.groupDragState.value?.desktopPageIndex === 2 &&
        harness.drag.projectedPages.value?.length === 3,
      "the edge turn should render the planner projection on the virtual page"
    );
    harness.drag.finishDrag(makePointerEvent(16, target, {
      button: 0,
      buttons: 0,
      clientX: 200,
      clientY: 220,
      type: "pointerup",
    }));
    await nextTick();
    assert(harness.calls.commits.length === 1, "dropping on the virtual desktop page should commit once");
    assert(harness.pages.value[2]?.map((item) => item.id).join(",") === "f", "the committed layout should materialize the new desktop page");
    assert(harness.pageIndex.value === 2, "the final desktop page should become authoritative only after commit");
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = {
      childPages: [[app("x"), app("y")], [app("e"), app("f")]],
      children: [app("x"), app("y"), app("e"), app("f")],
      id: "folder-source",
      name: "folder-source",
      type: "folder",
    };
    const harness = createAtomicDragHarness([[sourceFolder]], {
      openFolderId: sourceFolder.id,
    });
    harness.folderPageIndex.value = 1;
    const target = { getBoundingClientRect: () => ({ height: 56, left: 220, top: 180, width: 56 }) };
    harness.drag.startDrag(
      makePointerEvent(17, target, { clientX: 248, clientY: 208 }),
      sourceFolder.childPages[1][0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 1, type: "folder" }
    );
    harness.drag.updateDragPointer(makePointerEvent(17, target, {
      clientX: 390,
      clientY: 220,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, PAGE_TURN_DELAY), "the final folder edge should schedule a deferred virtual page turn");
    assert(
      findFolder(harness.pages.value, sourceFolder.id).item.childPages.length === 2,
      "turning onto a virtual folder page must not mutate authoritative children"
    );
    assert(harness.folderPageIndex.value === 2, "the folder track may display the requested virtual page before data commit");
    harness.drag.finishDrag(makePointerEvent(17, target, {
      button: 0,
      buttons: 0,
      clientX: 280,
      clientY: 220,
      type: "pointerup",
    }));
    await nextTick();
    const committedFolder = findFolder(harness.pages.value, sourceFolder.id).item;
    assert(harness.calls.commits.length === 1, "dropping on the virtual folder page should commit once");
    assert(committedFolder.childPages[2]?.map((item) => item.id).join(",") === "e", "the folder commit should materialize the requested page");
    assert(harness.folderPageIndex.value === 2, "the materialized folder page should remain active after commit");
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = {
      childPages: [[app("x")], [app("e"), app("f")]],
      children: [app("x"), app("e"), app("f")],
      id: "folder-cancel",
      name: "folder-cancel",
      type: "folder",
    };
    const harness = createAtomicDragHarness([[sourceFolder]], {
      openFolderId: sourceFolder.id,
    });
    harness.folderPageIndex.value = 1;
    const target = { getBoundingClientRect: () => ({ height: 56, left: 220, top: 180, width: 56 }) };
    harness.drag.startDrag(
      makePointerEvent(18, target, { clientX: 248, clientY: 208 }),
      sourceFolder.childPages[1][0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 1, type: "folder" }
    );
    harness.drag.updateDragPointer(makePointerEvent(18, target, {
      clientX: 390,
      clientY: 220,
      timeStamp: 140,
    }));
    flushTimerByDelay(timers, PAGE_TURN_DELAY);
    assert(harness.folderPageIndex.value === 2, "the cancellation fixture should reach a virtual folder page");
    harness.drag.cancelDrag(makePointerEvent(18, target, {
      button: 0,
      buttons: 0,
      type: "pointercancel",
    }));
    assert(harness.calls.commits.length === 0, "cancelling from a virtual folder page must not commit layout data");
    assert(harness.folderPageIndex.value === 1, "cancelling should clamp the folder track back to the last authoritative page");
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = {
      childPages: [[app("e")], [app("f"), app("g")]],
      children: [app("e"), app("f"), app("g")],
      id: "folder-rebase",
      name: "folder-rebase",
      type: "folder",
    };
    const harness = createAtomicDragHarness([[sourceFolder]], {
      openFolderId: sourceFolder.id,
    });
    harness.folderPageIndex.value = 1;
    const target = { getBoundingClientRect: () => ({ height: 56, left: 120, top: 180, width: 56 }) };
    harness.drag.startDrag(
      makePointerEvent(19, target, { clientX: 148, clientY: 208 }),
      sourceFolder.childPages[0][0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 0, type: "folder" }
    );
    harness.drag.finishDrag(makePointerEvent(19, target, {
      button: 0,
      buttons: 0,
      clientX: 250,
      clientY: 240,
      type: "pointerup",
    }));
    await nextTick();
    assert(harness.calls.commits.length === 1, "a drop whose earlier folder page empties should still commit once");
    assert(harness.folderPageIndex.value === 0, "the open folder should follow the planner's compacted destination page");
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const c = app("c");
    const d = app("d");
    const harness = createAtomicDragHarness([[a, b, c, d]]);
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(152, sourceElement, { clientX: 48, clientY: 152 }),
      c,
      { index: 2, pageIndex: 0, type: "page" }
    );

    harness.drag.updateDragPointer(makePointerEvent(152, sourceElement, {
      clientX: 250,
      clientY: 420,
      timeStamp: 130,
    }));
    flushTimers(timers, harness.drag);
    assert(
      harness.drag.projectedPages.value?.[0]?.map((item) => item.id).join(",") === "a,b,d,c",
      "a temporary desktop placement should publish its reordered presentation"
    );
    assert(
      harness.pages.value[0].map((item) => item.id).join(",") === "a,b,c,d",
      "a temporary desktop placement must not mutate authoritative pages"
    );

    const targetRect = { height: 64, left: 200, top: 150, width: 64 };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: d.id, pageIndex: 0 },
      targetRect,
      { area: "desktop", id: d.id, index: 2, pageIndex: 0 }
    );
    harness.drag.updateDragPointer(makePointerEvent(152, sourceElement, {
      clientX: 232,
      clientY: 182,
      timeStamp: 160,
    }));
    flushTimers(timers, harness.drag);
    assert(
      harness.drag.groupDragState.value?.intent?.targetAppId === d.id,
      "moving from a temporary placement onto a later app should acquire folder-create intent"
    );
    assert(
      harness.drag.projectedPages.value?.[0]?.map((item) => item.id).join(",") === "a,b,d,c",
      "folder-create hover should retain the last valid placement projection"
    );

    harness.drag.finishDrag(makePointerEvent(152, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 232,
      clientY: 182,
      type: "pointerup",
    }));
    assert(harness.calls.commits.length === 1, "the retained projection should still commit folder creation once");
    assert(
      harness.pages.value[0].map((item) => item.id).join(",") === "a,b,folder-created",
      "folder creation should commit against authoritative pages, not the presentation projection"
    );
    assert(
      harness.pages.value[0][2]?.children?.map((item) => item.id).join(",") === "d,c",
      "the target app should remain before the dragged app in the created folder"
    );
    await nextTick();
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const harness = createAtomicDragHarness([[a, b]]);
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    const targetRect = { height: 64, left: 200, top: 150, width: 64 };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: b.id, pageIndex: 0 },
      targetRect,
      { area: "desktop", id: b.id, index: 1, pageIndex: 0 }
    );
    harness.drag.startDrag(
      makePointerEvent(15, sourceElement, { clientX: 48, clientY: 152 }),
      a,
      { index: 0, pageIndex: 0, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(15, sourceElement, {
      clientX: 232,
      clientY: 182,
      timeStamp: 130,
    }));
    flushTimers(timers, harness.drag);
    assert(
      harness.drag.groupDragState.value?.intent?.targetAppId === b.id &&
        harness.drag.projectedPages.value === null,
      "an accepted app target should stay on the authoritative geometry until release"
    );
    harness.drag.finishDrag(makePointerEvent(15, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 232,
      clientY: 182,
      type: "pointerup",
    }));
    const releaseState = harness.drag.groupDragState.value;
    assert(harness.calls.commits.length === 1, "app-on-app folder creation should commit exactly once");
    assert(
      releaseState?.releaseCreatedFolderId === "folder-created",
      `folder creation should retain the real folder id until visual release completes (intent: ${releaseState?.intent?.type || "none"})`
    );
    assert(
      harness.drag.dragFolderTargetId.value === null && harness.drag.dragFolderHoverState.value === null,
      "accepting a folder creation must clear the pre-release hover ownership immediately"
    );
    assert(
      releaseState?.entries.some((entry) => entry.item.id === b.id && entry.originKind === "folder-create-target"),
      "the target app should join the shared release presentation from its real origin"
    );
    assert(harness.pages.value[0][0]?.id === "folder-created", "the accepted app pair should become the planned folder");
    assert(
      harness.pages.value[0][0]?.children?.map((item) => item.id).join(",") === "b,a",
      "the stable target app should remain the first child even after the hover plan is published"
    );
    await nextTick();
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("edge-source");
    const b = app("edge-target");
    const harness = createAtomicDragHarness([[a, b]]);
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    const targetRect = { height: 64, left: 200, top: 150, width: 64 };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: b.id, pageIndex: 0 },
      targetRect,
      { area: "desktop", id: b.id, index: 1, pageIndex: 0 }
    );
    harness.drag.startDrag(
      makePointerEvent(151, sourceElement, { clientX: 48, clientY: 152 }),
      a,
      { index: 0, pageIndex: 0, type: "page" }
    );

    // x=206 is six pixels inside the rendered target: it is inside the
    // historical full-size intent, but outside the migrated 62% shrink.
    harness.drag.updateDragPointer(makePointerEvent(151, sourceElement, {
      clientX: 206,
      clientY: 182,
      timeStamp: 130,
    }));
    flushTimers(timers, harness.drag);
    assert(
      harness.drag.groupDragState.value?.intent?.targetAppId === b.id,
      "the full rendered target should acquire folder-create intent at its edge"
    );

    // Moving slightly outside the icon must not immediately throw away an
    // already acquired target while the pointer is still in its sticky zone.
    harness.drag.updateDragPointer(makePointerEvent(151, sourceElement, {
      clientX: 180,
      clientY: 182,
      timeStamp: 160,
    }));
    flushTimers(timers, harness.drag);
    assert(
      harness.drag.groupDragState.value?.intent?.targetAppId === b.id,
      "an acquired folder target should remain sticky through a small edge excursion"
    );

    harness.drag.finishDrag(makePointerEvent(151, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 180,
      clientY: 182,
      type: "pointerup",
    }));
    assert(harness.calls.commits.length === 1, "a sticky edge release should commit folder creation");
    assert(harness.pages.value[0][0]?.type === "folder", "the sticky release should create a folder instead of a slot reorder");
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const c = app("c");
    const harness = createAtomicDragHarness([[a, b, c]]);
    const target = { getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }) };
    harness.drag.startDrag(makePointerEvent(12, target), a, { index: 0, pageIndex: 0, type: "page" });
    assert(harness.calls.dragStarts[0].standalone === true, "ordinary single-item drags should normalize into the shared payload");
    assert(harness.drag.groupDragState.value?.draggedIds.join(",") === "a", "ordinary drags should expose the shared group visual state");
    harness.drag.finishDrag(makePointerEvent(12, target, {
      button: 0,
      buttons: 0,
      clientX: 390,
      clientY: 490,
      type: "pointerup",
    }));
    await nextTick();
    assert(harness.calls.commits.length === 1, "a single app should commit through the group planner once");
    assert(harness.pages.value[0].map((item) => item.id).join(",") === "b,c,a", "single-item reorder should use the requested slot");
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async () => {
    const a = app("visual-source");
    const harness = createAtomicDragHarness([[a]]);
    const target = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(20, target, {
        dragVisualState: {
          cellHeight: 132,
          cellWidth: 116,
          compact: false,
          iconSize: 64,
          singleLineLabel: false,
        },
      }),
      a,
      { index: 0, pageIndex: 0, type: "page" }
    );
    const visualSpec = harness.drag.groupDragState.value?.visualSpec;
    assert(
      visualSpec?.cellHeight === 132 &&
        visualSpec.cellWidth === 116 &&
        visualSpec.compact === false &&
        visualSpec.singleLineLabel === false &&
        visualSpec.textless === false,
      "the group state should carry the source visual specification for a single drag"
    );
    harness.drag.cancelDrag(makePointerEvent(20, target, {
      button: 0,
      buttons: 0,
      type: "pointercancel",
    }));
  });

  await withMockPointerEnvironment(async () => {
    const a = app("a");
    const harness = createAtomicDragHarness([[a, folder("folder-a", ["x", "y"])]]);
    const target = { getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }) };
    harness.drag.startDrag(makePointerEvent(13, target), a, { index: 0, pageIndex: 0, type: "page" });
    harness.drag.cancelDrag(makePointerEvent(13, target, {
      button: 0,
      buttons: 0,
      type: "pointercancel",
    }));
    assert(harness.calls.commits.length === 0, "pointer cancellation should need no compensating commit");
    assert(harness.drag.dragMeta.value === null && harness.drag.groupDragState.value === null, "cancellation should release all visual ownership immediately");
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("auto-open-source");
    const targetFolder = folder("auto-open-folder", ["x", "y"]);
    const harness = createAtomicDragHarness([[a, targetFolder]], {
      folderPanelRect: {
        bottom: 520,
        height: 220,
        left: 100,
        right: 400,
        top: 300,
        width: 300,
      },
    });
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    const targetRect = { height: 64, left: 200, top: 150, width: 64 };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: targetFolder.id, pageIndex: 0 },
      targetRect,
      { area: "desktop", id: targetFolder.id, index: 1, item: targetFolder, pageIndex: 0 }
    );
    harness.drag.startDrag(
      makePointerEvent(21, sourceElement, { clientX: 48, clientY: 152 }),
      a,
      { index: 0, pageIndex: 0, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(21, sourceElement, {
      clientX: 232,
      clientY: 182,
      timeStamp: 130,
    }));
    flushTimers(timers, harness.drag);
    flushTimers(timers, harness.drag);
    assert(harness.openFolderId.value === targetFolder.id, "hovering a folder should auto-open it for the active drag");

    harness.drag.updateDragPointer(makePointerEvent(21, sourceElement, {
      clientX: 233,
      clientY: 182,
      timeStamp: 160,
    }));
    assert(
      harness.openFolderId.value === targetFolder.id,
      "an auto-opened folder must stay open while the pointer has not entered its panel"
    );

    harness.drag.updateDragPointer(makePointerEvent(21, sourceElement, {
      clientX: 180,
      clientY: 340,
      timeStamp: 190,
    }));
    flushTimers(timers, harness.drag);
    assert(harness.openFolderId.value === targetFolder.id, "entering the auto-opened panel should retain folder ownership");

    harness.drag.updateDragPointer(makePointerEvent(21, sourceElement, {
      clientX: 50,
      clientY: 240,
      timeStamp: 220,
    }));
    flushTimers(timers, harness.drag);
    flushTimers(timers, harness.drag);
    assert(
      harness.openFolderId.value === null,
      "leaving an entered auto-opened panel should close once without stale hover timers reopening it"
    );
    harness.drag.cancelDrag(makePointerEvent(21, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 50,
      clientY: 240,
      type: "pointercancel",
    }));
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = folder("folder-drag-out", ["x", "y", "z"]);
    const harness = createAtomicDragHarness([[sourceFolder]], {
      desktopMainRect: {
        bottom: 520,
        height: 440,
        left: 0,
        right: 400,
        top: 80,
        width: 400,
      },
      openFolderId: sourceFolder.id,
      pageRect: {
        bottom: 500,
        height: 400,
        left: 80,
        right: 360,
        top: 100,
        width: 280,
      },
    });
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 56, left: 220, top: 180, width: 56 }),
    };
    harness.drag.startDrag(
      makePointerEvent(22, sourceElement, { clientX: 248, clientY: 208 }),
      sourceFolder.children[0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 0, type: "folder" },
      {
        draggedIds: ["x", "y"],
        layoutRevision: 0,
        leadId: "x",
        selectionRevision: 2,
      }
    );
    harness.drag.updateDragPointer(makePointerEvent(22, sourceElement, {
      clientX: 50,
      clientY: 240,
      timeStamp: 140,
    }));
    assert(
      harness.openFolderId.value === null,
      "a folder-source group drag should close the folder as soon as it crosses outside the entered panel"
    );

    harness.drag.finishDrag(makePointerEvent(22, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 50,
      clientY: 240,
      timeStamp: 170,
      type: "pointerup",
    }));
    await nextTick();
    const committedFolder = findFolder(harness.pages.value, sourceFolder.id)?.item;
    assert(harness.calls.commits.length === 1, "dragging a selected folder group onto the desktop should commit exactly once");
    assert(
      findTopLevel(harness.pages.value, "x")?.item?.type === "app" &&
        findTopLevel(harness.pages.value, "y")?.item?.type === "app",
      "every dragged folder child should become a top-level desktop item"
    );
    assert(
      committedFolder?.children?.map((item) => item.id).join(",") === "z",
      "the source folder should retain only children outside the dragged selection"
    );
    settleRelease(harness.drag);
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const harness = createAtomicDragHarness([[a, b]]);
    const target = { getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }) };
    harness.drag.startDrag(makePointerEvent(14, target), a, { index: 0, pageIndex: 0, type: "page" });
    harness.revision.value = 1;
    harness.drag.finishDrag(makePointerEvent(14, target, {
      button: 0,
      buttons: 0,
      clientX: 250,
      clientY: 180,
      type: "pointerup",
    }));
    assert(harness.calls.commits.length === 0, "a stale base revision should reject before commit");
    assert(harness.calls.rejected[0] === "revision-stale", "stale revision should be explicit");
    flushTimers(timers, harness.drag);
  });
}
