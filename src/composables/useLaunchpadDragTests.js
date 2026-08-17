import { computed, nextTick, ref, shallowRef } from "vue";
import {
  isPrimaryPointerMoveEvent,
  isPrimaryPointerStartEvent,
  samplePointerVelocity,
  shouldFinishDragForPointerEvent,
  useLaunchpadDrag,
} from "./useLaunchpadDrag.js";
import { PAGE_TURN_DELAY } from "./launchpadConstants.js";
import { planGroupTransfer } from "../domain/groupTransferPlanner.js";
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
  const plan = state?.runtimePlan;
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
  return Array.isArray(item?.childPages) ? item.childPages : [[]];
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
    openFolders: [],
    pageIndexes: [],
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
  let nextFolderPageTurnToken = 1;
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
    commitFolderPageTurnRequest: (token) => {
      const request = folderPageTurnRequest.value;
      if (!request || request.token !== token) return false;
      folderPageIndex.value = request.targetIndex;
      folderPageTurnRequest.value = null;
      return true;
    },
    commitGroupDrop: (plan, operation) => {
      if (operation.baseRevision !== revision.value) return false;
      calls.commits.push({ operation, plan });
      pages.value = plan.nextPages;
      revision.value += 1;
      return true;
    },
    commitOpenFolder: (next, commitOptions) => {
      calls.openFolders.push({ next, options: commitOptions || null });
      openFolderId.value = next;
    },
    commitPageIndex: (next) => {
      calls.pageIndexes.push(next);
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
    folderViewportRef: ref({
      getBoundingClientRect: () => ({ ...pageRect, left: 150, right: 350, width: 200 }),
    }),
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
    planGroupTransfer: (request) => planGroupTransfer({
      ...request,
      folderName: "New Folder",
      folderPageSize,
      makeFolderId: () => request.createdFolderId,
      pageSize,
      selectedIds: request.draggedIds,
    }),
    renderedFolder,
    requestFolderOpenWarmup: () => {},
    requestFolderPageTurn: (targetIndex, requestOptions = {}) => {
      const token = nextFolderPageTurnToken;
      nextFolderPageTurnToken += 1;
      folderPageTurnRequest.value = {
        ...requestOptions,
        folderId: requestOptions.folderId || openFolderId.value,
        targetIndex,
        token,
      };
      return token;
    },
    visualFolderPageIndex,
    visibleFolderRowCount: ref(2),
  });

  return {
    calls,
    drag,
    folderPageIndex,
    folderPageTurnRequest,
    folderPanelRect,
    iconBoundsRegistry,
    openFolderId,
    pageIndex,
    pages,
    revision,
    visualFolderPageIndex,
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
  const idleVelocity = samplePointerVelocity(
    { pointer: velocity.pointer, time: velocity.time, velocity: velocity.velocity },
    { clientX: 30, clientY: 10, timeStamp: 240 },
    { maxDeltaMs: 80, smoothing: 0.5 }
  );
  assert(
    idleVelocity.velocity.x === 0 && idleVelocity.velocity.y === 0,
    "an unchanged pointer held beyond the velocity sampling window should release without stale momentum"
  );

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
        harness.drag.groupDragState.value?.runtimePlan?.entries.length === 13,
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
    const ownedIds = releaseEntries.flatMap((entry) => entry.memberIds || []);
    const overflowEntry = releaseEntries.find((entry) => (entry.memberIds?.length || 0) > 1);
    assert(
      new Set(ownedIds).size === 14 &&
        ownedIds.length === 14 &&
        ownedIds.includes(targetApp.id) &&
        overflowEntry?.memberIds.length === 5 &&
        harness.drag.groupDragState.value?.shellActors.length === 1,
      "folder creation should give all selected apps and target B one owner while aggregating overflow"
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
        harness.drag.projectedPages.value === null,
      "moving the captured pointer into the toolbar cancel geometry should arm cancellation and clear previews"
    );

    harness.drag.updateDragPointer(makePointerEvent(21, target, {
      clientX: 180,
      clientY: 180,
      timeStamp: 145,
    }));
    assert(
      harness.drag.groupDragState.value?.cancelArmed === false,
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
      cancelling?.phase === "returning" &&
        cancelling.outcome === "cancelled" &&
        cancelling.cancelSource === "drop-zone",
      "releasing in the cancel zone should enter a distinct user-cancelled return phase"
    );
    assert(
      cancelling?.runtimePlan?.entries.every((entry) => entry.mode === "return"),
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
        harness.calls.dragEnds[0]?.phase === "settled" &&
        harness.calls.dragEnds[0]?.outcome === "cancelled",
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
      harness.drag.groupDragState.value?.phase === "returning" &&
        harness.drag.groupDragState.value?.outcome === "cancelled" &&
        harness.drag.groupDragState.value?.cancelSource === "keyboard",
      "keyboard cancellation should use the same semantic return lifecycle as the top cancel zone"
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
    assert(harness.drag.groupDragState.value?.phase === "releasing", "overflowing representatives should release to committed slots");
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
    const plan = planGroupTransfer({
      basePages: harness.pages.value,
      baseRevision: 0,
      currentRevision: 0,
      folderName: "New Folder",
      folderPageSize: 4,
      intent: { anchorId: "a", type: "toolbar-folder-create" },
      leadId: "a",
      makeFolderId: () => "folder-created",
      pageSize: 4,
      selectedIds: ["a", "b"],
    });
    const presented = harness.drag.startCommittedGroupTransfer({
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
        harness.drag.groupDragState.value?.semanticPlan?.effects?.createdFolderId === "folder-created" &&
        harness.drag.groupDragState.value?.outcome === "accepted",
      "toolbar creation should enter the same committing session while source applications are actor-owned"
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
    assert(harness.drag.groupDragState.value?.phase === "releasing", "toolbar creation should resolve real landing targets after render");
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
    const plan = planGroupTransfer({
      basePages: harness.pages.value,
      baseRevision: 0,
      currentRevision: 0,
      folderName: "New Folder",
      folderPageSize: 35,
      intent: { anchorId: selected[0].id, type: "toolbar-folder-create" },
      leadId: selected[0].id,
      makeFolderId: () => "folder-created",
      pageSize: 35,
      selectedIds: selected.map((item) => item.id),
    });
    const presented = harness.drag.startCommittedGroupTransfer({
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
    const releaseOwnedIds = releaseState?.entries.flatMap((entry) => entry.memberIds || []) || [];
    assert(
      releaseState?.entries.length === 10 &&
        releaseState.runtimePlan?.entries.length === 10 &&
        new Set(releaseOwnedIds).size === 35 &&
        releaseOwnedIds.length === 35 &&
        releaseState.entries.filter((entry) => entry.memberIds.length > 1).length === 1,
      "full-page folder creation should render nine exact previews and one aggregate owning all overflow"
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
    const targetApp = app("previous-page-target");
    const draggedApp = app("previous-page-dragged");
    const harness = createAtomicDragHarness([[targetApp], [draggedApp]], {
      desktopMainRect: {
        bottom: 520,
        height: 440,
        left: 0,
        right: 400,
        top: 80,
        width: 400,
      },
    });
    harness.pageIndex.value = 1;
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }),
    };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: targetApp.id, pageIndex: 0 },
      { height: 64, left: -384, top: 120, width: 64 },
      { area: "desktop", id: targetApp.id, index: 0, pageIndex: 0 }
    );
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.TOP_LEVEL,
      ICON_BOUNDS_VARIANT.STABLE_STAGE_LAYOUT,
      targetApp.id,
      { height: 64, left: 16, top: 120, width: 64 },
      {
        area: "desktop",
        id: targetApp.id,
        index: 0,
        pageIndex: 0,
        stageHeight: 520,
        stageRect: { height: 520, left: 0, top: 0, width: 400 },
        stageWidth: 400,
      }
    );
    harness.drag.startDrag(
      makePointerEvent(161, sourceElement, { clientX: 48, clientY: 152 }),
      draggedApp,
      { index: 0, pageIndex: 1, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(161, sourceElement, {
      clientX: 10,
      clientY: 152,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, PAGE_TURN_DELAY), "the previous-page target fixture should turn after the full dwell");
    harness.drag.updateDragPointer(makePointerEvent(161, sourceElement, {
      clientX: 48,
      clientY: 152,
      timeStamp: 1_100,
    }));
    assert(flushTimerByDelay(timers, 42), "the previous-page target should resolve after navigation");
    assert(
      harness.drag.groupDragState.value?.intent?.targetAppId === targetApp.id,
      "an original target should remain hittable after its page moves into the viewport"
    );
    harness.drag.cancelDrag(makePointerEvent(161, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 48,
      clientY: 152,
      type: "pointercancel",
    }));
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = {
      childPages: [[app("x"), app("y")], [app("e"), app("f")]],
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
      clientX: 345,
      clientY: 220,
      timeStamp: 140,
    }));
    assert(
      harness.folderPageIndex.value === 1 &&
        harness.visualFolderPageIndex.value === 1 &&
        harness.folderPageTurnRequest.value === null,
      "folder edge navigation should remain on the source page until the full dwell elapses"
    );
    assert(flushTimerByDelay(timers, PAGE_TURN_DELAY), "the final folder edge should schedule a deferred virtual page turn");
    assert(
      findFolder(harness.pages.value, sourceFolder.id).item.childPages.length === 2,
      "turning onto a virtual folder page must not mutate authoritative children"
    );
    assert(harness.folderPageIndex.value === 2, "the folder track may display the requested virtual page before data commit");
    harness.drag.updateDragPointer(makePointerEvent(17, target, {
      clientX: 300,
      clientY: 220,
      timeStamp: 980,
    }));
    assert(
      harness.folderPageIndex.value === 2 && harness.visualFolderPageIndex.value === 2,
      "a completed folder edge turn should stay latched through a small inward retreat"
    );
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
      childPages: [[app("border-edge-a")], [app("border-edge-b")]],
      id: "folder-border-edge",
      name: "folder-border-edge",
      type: "folder",
    };
    const harness = createAtomicDragHarness([[sourceFolder]], {
      openFolderId: sourceFolder.id,
    });
    const target = {
      getBoundingClientRect: () => ({ height: 56, left: 220, top: 180, width: 56 }),
    };
    harness.drag.startDrag(
      makePointerEvent(171, target, { clientX: 248, clientY: 208 }),
      sourceFolder.childPages[0][0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 0, type: "folder" }
    );
    harness.drag.updateDragPointer(makePointerEvent(171, target, {
      clientX: harness.folderPanelRect.right - 2,
      clientY: 220,
      timeStamp: 140,
    }));
    assert(
      flushTimerByDelay(timers, PAGE_TURN_DELAY),
      "the visible folder panel border should be part of the drag page-turn envelope"
    );
    assert(
      harness.folderPageIndex.value === 1,
      "dwelling on the visible folder panel border should turn to the next page"
    );
    harness.drag.updateDragPointer(makePointerEvent(171, target, {
      clientX: 300,
      clientY: 220,
      timeStamp: 980,
    }));
    assert(
      !flushTimerByDelay(timers, PAGE_TURN_DELAY) && harness.folderPageIndex.value === 1,
      "a small retreat after a border turn should stay latched instead of immediately reversing direction"
    );
    harness.drag.cancelDrag(makePointerEvent(171, target, {
      button: 0,
      buttons: 0,
      clientX: harness.folderPanelRect.right - 2,
      clientY: 220,
      type: "pointercancel",
    }));
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = {
      childPages: [[app("offset-a")], [app("offset-b")]],
      id: "folder-offset-edge",
      name: "folder-offset-edge",
      type: "folder",
    };
    const harness = createAtomicDragHarness([[sourceFolder]], {
      openFolderId: sourceFolder.id,
    });
    const target = {
      getBoundingClientRect: () => ({ height: 56, left: 220, top: 180, width: 56 }),
    };
    harness.drag.startDrag(
      makePointerEvent(169, target, { clientX: 226, clientY: 208 }),
      sourceFolder.childPages[0][0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 0, type: "folder" }
    );
    harness.drag.updateDragPointer(makePointerEvent(169, target, {
      clientX: 345,
      clientY: 220,
      timeStamp: 140,
    }));
    assert(
      flushTimerByDelay(timers, PAGE_TURN_DELAY),
      "folder edge dwell should follow the pointer even when an off-center grab puts the drag visual outside the viewport"
    );
    assert(
      harness.folderPageIndex.value === 1,
      "an off-center folder drag should turn to the next page after the full dwell"
    );
    harness.drag.cancelDrag(makePointerEvent(169, target, {
      button: 0,
      buttons: 0,
      clientX: 345,
      clientY: 220,
      type: "pointercancel",
    }));
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = {
      childPages: [[app("pre-dwell-a"), app("pre-dwell-b")], [app("pre-dwell-c")]],
      id: "folder-pre-dwell-release",
      name: "folder-pre-dwell-release",
      type: "folder",
    };
    const harness = createAtomicDragHarness([[sourceFolder]], {
      openFolderId: sourceFolder.id,
    });
    const target = { getBoundingClientRect: () => ({ height: 56, left: 220, top: 180, width: 56 }) };
    harness.drag.startDrag(
      makePointerEvent(170, target, { clientX: 248, clientY: 208 }),
      sourceFolder.childPages[0][0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 0, type: "folder" }
    );
    harness.drag.updateDragPointer(makePointerEvent(170, target, {
      clientX: 345,
      clientY: 220,
      timeStamp: 140,
    }));
    harness.drag.finishDrag(makePointerEvent(170, target, {
      button: 0,
      buttons: 0,
      clientX: 280,
      clientY: 220,
      type: "pointerup",
    }));
    await nextTick();
    assert(
      harness.folderPageIndex.value === 0 &&
        harness.folderPageTurnRequest.value === null &&
        !flushTimerByDelay(timers, PAGE_TURN_DELAY),
      "releasing before the folder edge dwell completes must cancel navigation instead of force-committing the pending page"
    );
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = {
      childPages: [[app("x")], [app("e"), app("f")]],
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
      clientX: 345,
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
      harness.pages.value[0][2]?.childPages?.flat()?.map((item) => item.id).join(",") === "d,c",
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
      releaseState?.semanticPlan?.effects?.createdFolderId === "folder-created",
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
      harness.pages.value[0][0]?.childPages?.flat()?.map((item) => item.id).join(",") === "b,a",
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
    const previousPageApp = app("outer-edge-previous-page-app");
    const firstCellApp = app("outer-edge-first-cell-app");
    const draggedApp = app("outer-edge-dragged-app");
    const harness = createAtomicDragHarness([[previousPageApp], [firstCellApp, draggedApp]], {
      desktopMainRect: {
        bottom: 520,
        height: 440,
        left: 0,
        right: 960,
        top: 80,
        width: 960,
      },
      pageRect: {
        bottom: 500,
        height: 400,
        left: 96,
        right: 864,
        top: 100,
        width: 768,
      },
    });
    harness.pageIndex.value = 1;
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 300, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(156, sourceElement, { clientX: 301, clientY: 121 }),
      draggedApp,
      { index: 1, pageIndex: 1, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(156, sourceElement, {
      clientX: 100,
      clientY: 121,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, 42), "the first-cell slot fixture should resolve before release");
    assert(
      harness.drag.groupDragState.value?.intent?.type === "desktop-slot" &&
        harness.drag.groupDragState.value?.intent?.pageIndex === 1 &&
        harness.drag.groupDragState.value?.intent?.index === 0,
      "a top-left anchored drag should resolve the first desktop slot from its visual center"
    );
    assert(
      !flushTimerByDelay(timers, PAGE_TURN_DELAY),
      "the first desktop cell must stay outside the outer navigation hot zone"
    );
    harness.drag.finishDrag(makePointerEvent(156, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 100,
      clientY: 121,
      timeStamp: 160,
      type: "pointerup",
    }));
    assert(
      harness.pageIndex.value === 1 &&
        harness.pages.value[1].map((item) => item.id).join(",") === `${draggedApp.id},${firstCellApp.id}`,
      "the first-cell release should reorder the current page without visiting the previous page"
    );
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const firstSelectedApp = app("projected-first-selected-app");
    const projectedFirstApp = app("projected-first-target-app");
    const draggedApp = app("projected-first-dragged-app");
    const harness = createAtomicDragHarness([[firstSelectedApp, projectedFirstApp, draggedApp]], {
      desktopMainRect: {
        bottom: 520,
        height: 440,
        left: 0,
        right: 960,
        top: 80,
        width: 960,
      },
      pageRect: {
        bottom: 500,
        height: 400,
        left: 96,
        right: 864,
        top: 100,
        width: 768,
      },
    });
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 600, top: 300, width: 64 }),
    };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: firstSelectedApp.id, pageIndex: 0 },
      { height: 64, left: 145, top: 132, width: 64 },
      { area: "desktop", id: firstSelectedApp.id, index: 0, pageIndex: 0 }
    );
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: projectedFirstApp.id, pageIndex: 0 },
      { height: 64, left: 535, top: 132, width: 64 },
      { area: "desktop", id: projectedFirstApp.id, index: 1, pageIndex: 0 }
    );
    harness.drag.startDrag(
      makePointerEvent(159, sourceElement, { clientX: 601, clientY: 301 }),
      draggedApp,
      { index: 2, pageIndex: 0, type: "page" },
      {
        draggedIds: [firstSelectedApp.id, draggedApp.id],
        layoutRevision: 0,
        leadId: draggedApp.id,
        selectionRevision: 2,
      }
    );

    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: projectedFirstApp.id, pageIndex: 0 },
      { height: 64, left: 145, top: 132, width: 64 },
      { area: "desktop", id: projectedFirstApp.id, index: 0, pageIndex: 0 }
    );
    harness.drag.updateDragPointer(makePointerEvent(159, sourceElement, {
      clientX: 146,
      clientY: 133,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, 42), "the projected first-cell fixture should resolve before release");
    assert(
      harness.drag.groupDragState.value?.intent?.type === "desktop-slot" &&
        harness.drag.groupDragState.value?.intent?.index === 0,
      "an app that only moved under the pointer because of projection must not become a folder-create target"
    );
    harness.drag.finishDrag(makePointerEvent(159, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 146,
      clientY: 133,
      timeStamp: 160,
      type: "pointerup",
    }));
    assert(
      harness.pages.value[0].slice(0, 2).map((item) => item.id).join(",") ===
        `${firstSelectedApp.id},${draggedApp.id}`,
      "the first-cell release should commit the selected block into the slot instead of creating a folder"
    );
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const previousPageApp = app("pending-edge-previous-page-app");
    const firstCellApp = app("pending-edge-first-cell-app");
    const draggedApp = app("pending-edge-dragged-app");
    const harness = createAtomicDragHarness([[previousPageApp], [firstCellApp, draggedApp]], {
      desktopMainRect: {
        bottom: 520,
        height: 440,
        left: 0,
        right: 960,
        top: 80,
        width: 960,
      },
      pageRect: {
        bottom: 500,
        height: 400,
        left: 96,
        right: 864,
        top: 100,
        width: 768,
      },
    });
    harness.pageIndex.value = 1;
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 300, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(157, sourceElement, { clientX: 301, clientY: 121 }),
      draggedApp,
      { index: 1, pageIndex: 1, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(157, sourceElement, {
      clientX: 80,
      clientY: 121,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, 42), "the pending edge fixture should resolve before release");
    assert(
      harness.drag.groupDragState.value?.intent?.type === "desktop-slot" &&
        harness.drag.groupDragState.value?.intent?.pageIndex === 1 &&
        harness.drag.groupDragState.value?.intent?.index === 0,
      "the visual center should remain a valid current-page slot while the pointer arms navigation"
    );
    harness.drag.finishDrag(makePointerEvent(157, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 80,
      clientY: 121,
      timeStamp: 160,
      type: "pointerup",
    }));
    assert(
      harness.pageIndex.value === 1 &&
        !harness.calls.pageIndexes.includes(0) &&
        harness.pages.value[1].map((item) => item.id).join(",") === `${draggedApp.id},${firstCellApp.id}`,
      "releasing before the edge dwell expires should drop on the current page"
    );
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const firstCellApp = app("unavailable-edge-first-cell-app");
    const draggedApp = app("unavailable-edge-dragged-app");
    const harness = createAtomicDragHarness([[firstCellApp, draggedApp]], {
      desktopMainRect: {
        bottom: 520,
        height: 440,
        left: 0,
        right: 960,
        top: 80,
        width: 960,
      },
      pageRect: {
        bottom: 500,
        height: 400,
        left: 96,
        right: 864,
        top: 100,
        width: 768,
      },
    });
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 300, top: 120, width: 64 }),
    };
    harness.drag.startDrag(
      makePointerEvent(158, sourceElement, { clientX: 301, clientY: 121 }),
      draggedApp,
      { index: 1, pageIndex: 0, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(158, sourceElement, {
      clientX: 40,
      clientY: 121,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, 42), "the unavailable edge fixture should resolve before release");
    assert(
      harness.drag.groupDragState.value?.intent?.type === "invalid",
      "an icon whose visual center leaves the grid should not manufacture a desktop slot"
    );
    harness.drag.finishDrag(makePointerEvent(158, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 40,
      clientY: 121,
      timeStamp: 160,
      type: "pointerup",
    }));
    assert(
      harness.calls.commits.length === 0 && harness.calls.rejected.length === 0,
      "releasing against an unavailable navigation edge should return naturally without a warning"
    );
    assert(
      harness.pages.value[0].map((item) => item.id).join(",") === `${firstCellApp.id},${draggedApp.id}`,
      "an unavailable edge release must preserve the authoritative layout"
    );
    flushTimers(timers, harness.drag);
  });

  for (const [name, anchorOffset] of [
    ["top-left", 1],
    ["center", 32],
    ["bottom-right", 63],
  ]) {
    await withMockPointerEnvironment(async ({ timers }) => {
      const items = [app(`${name}-a`), app(`${name}-b`), app(`${name}-c`), app(`${name}-dragged`)];
      const harness = createAtomicDragHarness([items], {
        desktopMainRect: {
          bottom: 520,
          height: 440,
          left: 0,
          right: 960,
          top: 80,
          width: 960,
        },
        pageRect: {
          bottom: 500,
          height: 400,
          left: 96,
          right: 864,
          top: 100,
          width: 768,
        },
      });
      const sourceElement = {
        getBoundingClientRect: () => ({ height: 64, left: 600, top: 300, width: 64 }),
      };
      const pointerId = 160 + anchorOffset;
      harness.drag.startDrag(
        makePointerEvent(pointerId, sourceElement, {
          clientX: 600 + anchorOffset,
          clientY: 300 + anchorOffset,
        }),
        items[3],
        { index: 3, pageIndex: 0, type: "page" }
      );
      const destinationCenter = { x: 490, y: 170 };
      const releasePoint = {
        x: destinationCenter.x - (32 - anchorOffset),
        y: destinationCenter.y - (32 - anchorOffset),
      };
      harness.drag.updateDragPointer(makePointerEvent(pointerId, sourceElement, {
        clientX: releasePoint.x,
        clientY: releasePoint.y,
        timeStamp: 140,
      }));
      assert(flushTimerByDelay(timers, 42), `${name} anchor should resolve before release`);
      assert(
        harness.drag.groupDragState.value?.center?.x === destinationCenter.x &&
          harness.drag.groupDragState.value?.center?.y === destinationCenter.y,
        `${name} anchor should preserve the requested visual center`
      );
      harness.drag.finishDrag(makePointerEvent(pointerId, sourceElement, {
        button: 0,
        buttons: 0,
        clientX: releasePoint.x,
        clientY: releasePoint.y,
        timeStamp: 160,
        type: "pointerup",
      }));
      assert(
        harness.pages.value[0].map((item) => item.id).join(",") ===
          `${items[0].id},${items[3].id},${items[1].id},${items[2].id}`,
        `${name} anchor should resolve the same second desktop slot`
      );
      flushTimers(timers, harness.drag);
    });
  }

  await withMockPointerEnvironment(async ({ timers }) => {
    const previousPageApp = app("previous-page-app");
    const targetApp = app("first-cell-target");
    const draggedApp = app("first-cell-dragged");
    const harness = createAtomicDragHarness([[previousPageApp], [targetApp, draggedApp]]);
    harness.pageIndex.value = 1;
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 200, top: 120, width: 64 }),
    };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: targetApp.id, pageIndex: 1 },
      { height: 64, left: 16, top: 120, width: 64 },
      { area: "desktop", id: targetApp.id, index: 0, pageIndex: 1 }
    );
    harness.drag.startDrag(
      makePointerEvent(154, sourceElement, { clientX: 232, clientY: 152 }),
      draggedApp,
      { index: 1, pageIndex: 1, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(154, sourceElement, {
      clientX: 48,
      clientY: 152,
      timeStamp: 140,
    }));
    assert(flushTimerByDelay(timers, 42), "the first-cell fixture should resolve its target before pointer release");
    assert(
      harness.drag.groupDragState.value?.intent?.targetAppId === targetApp.id,
      "the overlapping edge zone should still resolve the rendered first-cell app"
    );
    assert(
      !flushTimerByDelay(timers, PAGE_TURN_DELAY),
      "an accepted first-cell target should disarm the overlapping desktop edge-turn timer"
    );
    harness.drag.finishDrag(makePointerEvent(154, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 48,
      clientY: 152,
      timeStamp: 160,
      type: "pointerup",
    }));
    assert(
      harness.pageIndex.value === 1 && harness.pages.value[1]?.[0]?.type === "folder",
      "an accepted first-cell app target should win over the overlapping desktop edge-turn zone"
    );
    assert(
      !harness.calls.pageIndexes.includes(0),
      "an accepted first-cell target must never publish the neighboring page, even transiently"
    );
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const previousPageApp = app("quick-previous-page-app");
    const targetApp = app("quick-first-cell-target");
    const draggedApp = app("quick-first-cell-dragged");
    const harness = createAtomicDragHarness([[previousPageApp], [targetApp, draggedApp]]);
    harness.pageIndex.value = 1;
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 64, left: 200, top: 120, width: 64 }),
    };
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.LAUNCH,
      ICON_BOUNDS_VARIANT.RENDERED,
      { area: "desktop", id: targetApp.id, pageIndex: 1 },
      { height: 64, left: 16, top: 120, width: 64 },
      { area: "desktop", id: targetApp.id, index: 0, pageIndex: 1 }
    );
    harness.drag.startDrag(
      makePointerEvent(155, sourceElement, { clientX: 232, clientY: 152 }),
      draggedApp,
      { index: 1, pageIndex: 1, type: "page" }
    );
    harness.drag.updateDragPointer(makePointerEvent(155, sourceElement, {
      clientX: 48,
      clientY: 152,
      timeStamp: 140,
    }));
    harness.drag.finishDrag(makePointerEvent(155, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 48,
      clientY: 152,
      timeStamp: 141,
      type: "pointerup",
    }));
    assert(
      !harness.calls.pageIndexes.includes(0) && harness.pages.value[1]?.[0]?.type === "folder",
      "a quick first-cell release should resolve its target before committing any pending edge turn"
    );
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const a = app("a");
    const b = app("b");
    const c = app("c");
    const harness = createAtomicDragHarness([[a, b, c]]);
    const target = { getBoundingClientRect: () => ({ height: 64, left: 16, top: 120, width: 64 }) };
    harness.drag.startDrag(
      makePointerEvent(12, target, { clientX: 48, clientY: 152 }),
      a,
      { index: 0, pageIndex: 0, type: "page" }
    );
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
    const sourceFolder = folder("folder-source-reentry", ["x", "y", "z"]);
    const harness = createAtomicDragHarness([[sourceFolder]], {
      folderPanelRect: {
        bottom: 500,
        height: 200,
        left: 100,
        right: 400,
        top: 300,
        width: 300,
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
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.TOP_LEVEL,
      ICON_BOUNDS_VARIANT.RENDERED,
      sourceFolder.id,
      { height: 64, left: 20, top: 208, width: 64 },
      { area: "desktop", id: sourceFolder.id, index: 0, item: sourceFolder, pageIndex: 0 }
    );
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 56, left: 220, top: 352, width: 56 }),
    };
    harness.drag.startDrag(
      makePointerEvent(171, sourceElement, { clientX: 248, clientY: 380 }),
      sourceFolder.childPages[0][0],
      { folderId: sourceFolder.id, index: 0, pageIndex: 0, type: "folder" }
    );
    harness.drag.updateDragPointer(makePointerEvent(171, sourceElement, {
      clientX: 50,
      clientY: 240,
      timeStamp: 140,
    }));
    assert(harness.openFolderId.value === null, "the source folder should close after the drag exits its panel");
    assert(flushTimerByDelay(timers, 42), "directly reaching the source folder should resolve a fresh target intent");
    assert(
      harness.drag.dragFolderTargetId.value === sourceFolder.id &&
        harness.drag.groupDragState.value?.intent?.type === "folder-thumbnail",
      "a one-row source folder should become a normal target directly after the drag exits its panel"
    );
    assert(flushTimerByDelay(timers, 540), "direct source-folder hover should reach the normal flash phase");
    assert(flushTimerByDelay(timers, 920), "direct source-folder hover should schedule the normal reopen dwell");
    assert(
      harness.openFolderId.value === sourceFolder.id,
      "a one-row source folder should reopen without requiring an artificial move away and back"
    );
    harness.drag.cancelDrag(makePointerEvent(171, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 50,
      clientY: 240,
      type: "pointercancel",
    }));
    flushTimers(timers, harness.drag);
  });

  await withMockPointerEnvironment(async ({ timers }) => {
    const sourceFolder = folder("folder-source-reentry-noop", ["x", "y", "z"]);
    const harness = createAtomicDragHarness([[sourceFolder]], {
      folderPanelRect: {
        bottom: 500,
        height: 200,
        left: 100,
        right: 400,
        top: 300,
        width: 300,
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
    harness.iconBoundsRegistry.registerBounds(
      ICON_BOUNDS_KIND.TOP_LEVEL,
      ICON_BOUNDS_VARIANT.RENDERED,
      sourceFolder.id,
      { height: 64, left: 20, top: 208, width: 64 },
      { area: "desktop", id: sourceFolder.id, index: 0, item: sourceFolder, pageIndex: 0 }
    );
    const sourceElement = {
      getBoundingClientRect: () => ({ height: 56, left: 220, top: 352, width: 56 }),
    };
    harness.drag.startDrag(
      makePointerEvent(172, sourceElement, { clientX: 248, clientY: 380 }),
      sourceFolder.childPages[0][2],
      { folderId: sourceFolder.id, index: 2, pageIndex: 0, type: "folder" }
    );
    harness.drag.updateDragPointer(makePointerEvent(172, sourceElement, {
      clientX: 50,
      clientY: 240,
      timeStamp: 140,
    }));
    assert(harness.openFolderId.value === null, "the last source-folder child should close its folder on exit");
    assert(flushTimerByDelay(timers, 42), "same-folder reentry should resolve after the close transition");
    assert(
      harness.drag.dragFolderTargetId.value === sourceFolder.id &&
        harness.drag.groupDragState.value?.intent?.type === "folder-thumbnail",
      "a same-folder reentry target must remain published even when the planner reports same-placement"
    );
    assert(flushTimerByDelay(timers, 540), "same-folder reentry should reach the normal hover flash phase");
    assert(flushTimerByDelay(timers, 920), "same-folder reentry should schedule the normal reopen dwell");
    assert(
      harness.openFolderId.value === sourceFolder.id,
      "dragging the last child back onto its source folder should reopen it without a detour"
    );
    harness.drag.cancelDrag(makePointerEvent(172, sourceElement, {
      button: 0,
      buttons: 0,
      clientX: 50,
      clientY: 240,
      type: "pointercancel",
    }));
    flushTimers(timers, harness.drag);
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
      sourceFolder.childPages[0][0],
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
    const closeCall = harness.calls.openFolders.find((call) => call.next === null);
    assert(
      closeCall?.options?.excludeCloseGhostIds?.join(",") === "x,y",
      "closing a folder during a drag should exclude the dragged children from close ghosts",
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
      committedFolder?.childPages?.flat()?.map((item) => item.id).join(",") === "z",
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
