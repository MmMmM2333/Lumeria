import { ref } from "vue";
import type { LaunchpadApp, LaunchpadFolder } from "../domain/launchpadLayout.js";
import type { LaunchSource } from "../domain/input/launchpadPointerTarget.js";
import type { CapturedFolderOriginBounds } from "../rendering/desktopScenePort.js";
import {
  useLaunchpadInputGestures,
  type LaunchpadDragPointerEvent,
  type LaunchpadGestureEventListener,
  type LaunchpadGesturePointerEvent,
  type LaunchpadGesturePointerTarget,
} from "./useLaunchpadInputGestures.js";

const appA: LaunchpadApp = { id: "app-a", name: "App A", type: "app" };
const appB: LaunchpadApp = { id: "app-b", name: "App B", type: "app" };
const folderB: LaunchpadFolder = {
  childPages: [[appB]],
  id: "folder-b",
  name: "Folder B",
  type: "folder",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Launchpad input gestures test failed] ${message}`);
}

type TestTimer = Readonly<{ at: number; callback: () => void }>;

function createEventTarget() {
  const listeners = new Map<string, LaunchpadGestureEventListener>();
  const timers = new Map<number, TestTimer>();
  let nextTimerId = 1;
  let now = 0;
  return {
    addEventListener(type: string, listener: LaunchpadGestureEventListener) {
      listeners.set(type, listener);
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
    dispatch(type: string, event: LaunchpadGesturePointerEvent) {
      listeners.get(type)?.(event);
    },
    listenerCount(type: string) {
      return listeners.has(type) ? 1 : 0;
    },
    setNow(value: number) {
      now = value;
    },
    setTimeout(callback: () => void, delay = 0) {
      const id = nextTimerId++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    advanceTo(value: number) {
      now = value;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((left, right) => left[1].at - right[1].at);
      for (const [id, timer] of due) {
        if (!timers.delete(id)) continue;
        timer.callback();
      }
    },
    removeEventListener(type: string, listener: LaunchpadGestureEventListener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
}

function createPointerCaptureTarget() {
  const listeners = new Map<string, LaunchpadGestureEventListener>();
  const capturedPointers = new Set<number>();
  const releasedPointers: number[] = [];
  return {
    addEventListener(type: string, listener: LaunchpadGestureEventListener) {
      listeners.set(type, listener);
    },
    closest: () => null,
    hasPointerCapture(pointerId: number) {
      return capturedPointers.has(pointerId);
    },
    losePointerCapture(pointerId: number, event: LaunchpadGesturePointerEvent) {
      capturedPointers.delete(pointerId);
      listeners.get("lostpointercapture")?.(event);
    },
    releasePointerCapture(pointerId: number) {
      releasedPointers.push(pointerId);
      capturedPointers.delete(pointerId);
    },
    releasedPointers,
    removeEventListener(type: string, listener: LaunchpadGestureEventListener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    setPointerCapture(pointerId: number) {
      capturedPointers.add(pointerId);
    },
  };
}

type PointerEventOverrides = Partial<LaunchpadGesturePointerEvent>;

function makePointerEvent(
  pointerId: number,
  overrides: PointerEventOverrides = {},
): LaunchpadGesturePointerEvent {
  return {
    button: overrides.button ?? 0,
    buttons: overrides.buttons,
    clientX: overrides.clientX ?? 300,
    clientY: overrides.clientY ?? 120,
    folderOriginBounds: overrides.folderOriginBounds,
    isPrimary: overrides.isPrimary ?? true,
    pointerId,
    pointerType: overrides.pointerType ?? "touch",
    preventDefault() {},
    stopPropagation() {},
    target: overrides.target || {
      closest: () => null,
      setPointerCapture() {},
    },
    timeStamp: overrides.timeStamp ?? 0,
    type: overrides.type || "pointerdown",
  };
}

type HarnessOptions = Readonly<{
  batch?: boolean;
  cancelFolderOpening?: boolean;
  desktopTarget?: LaunchpadGesturePointerTarget & Readonly<{
    folderOriginBounds?: CapturedFolderOriginBounds | null;
    id: string;
    meta: Readonly<{
      area: "desktop";
      index: number;
      item: LaunchpadFolder;
      pageIndex: number;
    }>;
  }>;
  isFolderClosing?: boolean;
  pageWidth?: number;
}>;

function createHarness(options: HarnessOptions = {}) {
  const eventTarget = createEventTarget();
  const pageWidth = options.pageWidth ?? 500;
  const activePageIndex = ref(0);
  const calls = {
    contextMenus: [] as string[],
    dragCancels: [] as LaunchpadDragPointerEvent[],
    dragFinishes: [] as LaunchpadDragPointerEvent[],
    dragStarts: [] as LaunchpadDragPointerEvent[],
    dragUpdates: [] as LaunchpadDragPointerEvent[],
    folderOpeningCancels: 0,
    folderOpenCommits: [] as Array<Readonly<{ folderId: string | null; options: unknown }>>,
    openFolders: [] as (string | null)[],
    openedApps: [] as string[],
    pageIndexes: [] as number[],
    preparedFolders: [] as Array<Readonly<{ folderId: string; originBounds: unknown }>>,
  };
  const gestures = useLaunchpadInputGestures({
    activePageIndex,
    activePages: ref([[appA], [appB], []]),
    commitActivePageIndex: (pageIndex) => {
      activePageIndex.value = pageIndex;
      calls.pageIndexes.push(pageIndex);
    },
    commitFolderPageIndex: () => {},
    cancelFolderOpening: () => {
      calls.folderOpeningCancels += 1;
      return options.cancelFolderOpening === true;
    },
    commitOpenFolder: (folderId, commitOptions) => {
      calls.openFolders.push(folderId);
      calls.folderOpenCommits.push({ folderId, options: commitOptions });
    },
    dragControls: {
      cancelDrag: (event = {}) => {
        calls.dragCancels.push(event);
        return true;
      },
      finishDrag: (event) => {
        calls.dragFinishes.push(event);
      },
      isDragActive: () => false,
      startDrag: (event) => {
        calls.dragStarts.push(event);
        return true;
      },
      updateDragPointer: (event) => {
        calls.dragUpdates.push(event);
      },
    },
    eventTarget,
    folderPageIndex: ref(0),
    folderPageRefs: [],
    folderPages: ref([]),
    folderPanelRef: ref(null),
    folderViewportRef: ref(null),
    getDesktopTargetAtPoint: () => options.desktopTarget || null,
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(options.isFolderClosing === true),
    isBatchSelectionActive: () => options.batch === true,
    isInteractionBlocked: () => false,
    isSearchMode: ref(false),
    openApp: (item) => calls.openedApps.push(item.id),
    openFolderId: ref<string | null>(null),
    openIconContextMenu: (_event, item) => calls.contextMenus.push(item.id),
    pageRefs: [{ getBoundingClientRect: () => ({ bottom: 640, height: 640, left: 0, right: pageWidth, top: 0, width: pageWidth }) }],
    prepareFolderOpen: (folder, originBounds) => {
      calls.preparedFolders.push({ folderId: folder.id, originBounds });
    },
    renderedFolder: ref<LaunchpadFolder | null>(null),
    rootRef: ref({ getBoundingClientRect: () => ({ bottom: 640, height: 640, left: 0, right: pageWidth, top: 0, width: pageWidth }) }),
  });
  return { calls, eventTarget, gestures };
}

export function runLaunchpadInputGesturesTests() {
  {
    const originBounds = {
      folderId: folderB.id,
      iconRect: { height: 96, left: 320, top: 100, width: 96 },
      previewChildRects: [],
      thumbRect: { height: 76, left: 330, top: 110, width: 76 },
    };
    const desktopTarget = {
      folderOriginBounds: originBounds,
      id: folderB.id,
      meta: {
        area: "desktop" as const,
        index: 1,
        item: folderB,
        pageIndex: 0,
      },
    };
    const { calls, eventTarget, gestures } = createHarness({
      desktopTarget,
      isFolderClosing: true,
    });
    const captureTarget = createPointerCaptureTarget();

    gestures.handleDesktopSurfacePointerDown(makePointerEvent(23, {
      pointerType: "mouse",
      target: captureTarget,
    }));
    eventTarget.dispatch("pointerup", makePointerEvent(23, {
      buttons: 0,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 40,
      type: "pointerup",
    }));

    const commit = calls.folderOpenCommits[0];
    assert(
      calls.preparedFolders[0]?.originBounds === originBounds &&
        (commit?.options as { originBounds?: unknown } | undefined)?.originBounds === originBounds,
      "a closing-state canvas hit should carry its stable folder origin through preparation and pointerup activation",
    );
    gestures.disposeInputGestures();
  }

  {
    const transientOriginBounds = {
      folderId: folderB.id,
      iconRect: { height: 92, left: 322, top: 102, width: 92 },
      previewChildRects: [],
      thumbRect: { height: 72, left: 332, top: 112, width: 72 },
    };
    const originBounds = {
      folderId: folderB.id,
      iconRect: { height: 96, left: 320, top: 100, width: 96 },
      previewChildRects: [],
      thumbRect: { height: 76, left: 330, top: 110, width: 76 },
    };
    const desktopTarget = {
      folderOriginBounds: originBounds,
      id: folderB.id,
      meta: {
        area: "desktop" as const,
        index: 1,
        item: folderB,
        pageIndex: 0,
      },
    };
    const { calls, eventTarget, gestures } = createHarness({
      desktopTarget,
      isFolderClosing: true,
    });
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 1 };
    const captureTarget = createPointerCaptureTarget();
    const pointerDown = makePointerEvent(24, {
      folderOriginBounds: transientOriginBounds,
      pointerType: "mouse",
      target: captureTarget,
    });
    const surfacePointerDown = makePointerEvent(24, {
      pointerType: "mouse",
      target: captureTarget,
    });

    // A Pixi icon event and the native canvas surface event are both emitted
    // for the same physical press. The Pixi event still reflects the closing
    // desktop transform, so the closing-state registry snapshot must win.
    gestures.handleIconPointerDown(pointerDown, folderB, source);
    gestures.handleDesktopSurfacePointerDown(surfacePointerDown);

    assert(
      calls.openFolders.length === 0 &&
        gestures.iconGesturePresentation.value?.phase === "pressing",
      "pressing a desktop folder during another folder's close should retain the normal gesture presentation until release",
    );
    assert(
      calls.preparedFolders.length === 1 &&
        calls.preparedFolders[0]?.folderId === folderB.id &&
        calls.preparedFolders[0]?.originBounds === originBounds,
      "the interrupted switch should preserve the same prepared folder origin as a normal icon press",
    );

    eventTarget.dispatch("pointerup", makePointerEvent(24, {
      buttons: 0,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 40,
      type: "pointerup",
    }));

    const commit = calls.folderOpenCommits[0];
    assert(
      calls.openFolders.join(",") === folderB.id &&
        commit?.folderId === folderB.id &&
        (commit.options as { originBounds?: unknown } | undefined)?.originBounds === originBounds,
      "the interrupted switch should commit exactly once on release with the captured origin bounds",
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, gestures } = createHarness({ cancelFolderOpening: true });
    gestures.handleFolderOverlayPointerDown();

    assert(
      calls.folderOpeningCancels === 1 && calls.openFolders.length === 0,
      "an outside pointer close should cancel an in-flight opening before issuing a generic close",
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, gestures } = createHarness();
    gestures.handleFolderOverlayPointerDown();

    assert(
      calls.folderOpeningCancels === 1 &&
        calls.openFolders.length === 1 &&
        calls.openFolders[0] === null,
      "an outside pointer close should fall through to the generic close when no opening is in flight",
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness({ batch: true });
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(17, {
        pointerType: "mouse",
        target: captureTarget,
      }),
      appA,
      source
    );
    eventTarget.advanceTo(420);
    const output = gestures.cancelInputGesture({
      cancelSource: "keyboard",
      userInitiatedCancel: true,
    });

    assert(output?.handled === true, "Escape cancellation should be handled by the active drag gesture");
    assert(calls.dragStarts.length === 1, "the batch hold should own a drag before cancellation");
    assert(
      calls.dragCancels.length === 1 &&
        calls.dragCancels[0]?.cancelSource === "keyboard" &&
        calls.dragCancels[0]?.userInitiatedCancel === true,
      "user cancellation metadata should reach the drag controller"
    );
    assert(calls.dragFinishes.length === 0, "cancelling must not reinterpret the interaction as a drop");
    assert(
      captureTarget.releasedPointers.join(",") === "17" &&
        eventTarget.listenerCount("pointermove") === 0,
      "cancelling should release pointer capture and global pointer ownership"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(18, { pointerType: "mouse", target: captureTarget }),
      appA,
      source
    );
    eventTarget.advanceTo(420);
    eventTarget.dispatch("pointerup", makePointerEvent(18, {
      buttons: 0,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 460,
      type: "pointerup",
    }));

    assert(
      calls.contextMenus.length === 0 &&
        calls.openedApps.length === 0 &&
        gestures.iconGesturePresentation.value === null &&
        captureTarget.releasedPointers.join(",") === "18",
      "a stationary mouse hold should put the icon back without opening or activating it"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(23, {
        clientX: 300,
        clientY: 120,
        pointerType: "mouse",
        target: captureTarget,
        timeStamp: 0,
      }),
      appA,
      source
    );
    eventTarget.dispatch("pointermove", makePointerEvent(23, {
      buttons: 1,
      clientX: 308,
      clientY: 120,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 200,
      type: "pointermove",
    }));
    eventTarget.advanceTo(420);
    eventTarget.dispatch("pointermove", makePointerEvent(23, {
      buttons: 1,
      clientX: 314,
      clientY: 120,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 440,
      type: "pointermove",
    }));
    assert(
      calls.dragStarts.length === 1 &&
        calls.dragStarts[0]?.dragAnchor?.x === 300 &&
        calls.dragStarts[0]?.dragAnchor?.y === 120,
      "a drag started after the hold slop should retain the original press anchor"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness({ batch: true });
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(181, { pointerType: "mouse", target: captureTarget }),
      appA,
      source
    );
    eventTarget.advanceTo(420);
    assert(
      calls.dragStarts.length === 1 &&
        calls.dragStarts[0]?.clientX === 300 &&
        calls.dragStarts[0]?.clientY === 120 &&
        gestures.iconGesturePresentation.value === null,
      "batch long-press should start gathering at the hold deadline without waiting for movement"
    );
    eventTarget.dispatch("pointerup", makePointerEvent(181, {
      buttons: 0,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 460,
      type: "pointerup",
    }));
    assert(calls.dragFinishes.length === 1, "a stationary batch gather should finish through drag controls");
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    gestures.handleIconPointerDown(
      makePointerEvent(19, { pointerType: "touch" }),
      appA,
      source
    );
    eventTarget.advanceTo(420);
    eventTarget.dispatch("pointerup", makePointerEvent(19, {
      buttons: 0,
      pointerType: "touch",
      timeStamp: 460,
      type: "pointerup",
    }));

    assert(
      calls.contextMenus.join(",") === "app-a" && calls.openedApps.length === 0,
      "a stationary touchscreen hold should still open the icon context menu"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(20, { pointerType: "mouse", target: captureTarget }),
      appA,
      source
    );

    const pressingPresentation = gestures.iconGesturePresentation.value;
    assert(
      pressingPresentation?.phase === "pressing" &&
        pressingPresentation.target?.id === "app-a",
      "the public adapter state should expose the icon's immediate pressing presentation"
    );
    eventTarget.advanceTo(420);
    const armedPresentation = gestures.iconGesturePresentation.value;
    assert(
      armedPresentation?.phase === "armed",
      "the public adapter state should expose the icon's armed presentation at the hold boundary"
    );

    captureTarget.losePointerCapture(20, makePointerEvent(20, {
      buttons: 0,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 430,
      type: "lostpointercapture",
    }));

    assert(
      gestures.iconGesturePresentation.value === null &&
        calls.contextMenus.length === 0 &&
        calls.dragStarts.length === 0 &&
        eventTarget.listenerCount("pointermove") === 0,
      "losing pointer capture should cancel the owned hold and detach its global listeners"
    );
    gestures.disposeInputGestures();
  }

  {
    const { eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(22, { pointerType: "mouse", target: captureTarget }),
      appA,
      source
    );
    eventTarget.dispatch("pointermove", makePointerEvent(22, {
      buttons: 0,
      pointerType: "mouse",
      target: captureTarget,
      timeStamp: 100,
      type: "pointermove",
    }));

    assert(
      gestures.iconGesturePresentation.value === null &&
        captureTarget.releasedPointers.join(",") === "22" &&
        eventTarget.listenerCount("pointermove") === 0,
      "a move that has lost its primary button should release adapter ownership immediately"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(21, { pointerType: "mouse", target: captureTarget }),
      appA,
      source
    );
    eventTarget.dispatch("blur", { timeStamp: 100 });

    assert(
      gestures.iconGesturePresentation.value === null &&
        captureTarget.releasedPointers.join(",") === "21" &&
        calls.openedApps.length === 0 &&
        eventTarget.listenerCount("pointermove") === 0,
      "window blur should cancel the press, release capture, and prevent a late activation"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    gestures.handleIconPointerDown(makePointerEvent(1), appA, source);
    gestures.handleIconPointerDown(makePointerEvent(2), appB, source);
    eventTarget.dispatch("pointerup", makePointerEvent(1, { type: "pointerup", timeStamp: 40 }));

    assert(calls.openedApps.join(",") === "app-a", "a second pointer must not replace the first pointer's icon target");
    gestures.disposeInputGestures();
  }

  {
    const { calls, gestures } = createHarness({ pageWidth: 1344 });
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 100,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 0,
    });

    assert(
      calls.pageIndexes.join(",") === "1",
      "a coarse mouse notch should commit when browser momentum metadata is unavailable"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness({ pageWidth: 1344 });
    for (const timeStamp of [0, 100, 299, 300]) {
      eventTarget.setNow(timeStamp);
      gestures.handleLaunchpadWheel({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 100,
        metaKey: false,
        momentum: false,
        preventDefault() {},
        stopPropagation() {},
        timeStamp,
      });
    }

    assert(
      calls.pageIndexes.join(",") === "1,2",
      "sustained coarse wheel input should cross the adapter one page at a time after its initial repeat delay"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness({ pageWidth: 1344 });
    for (const timeStamp of [0, 100, 299, 300]) {
      eventTarget.setNow(timeStamp);
      gestures.handleLaunchpadWheel({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 0,
        deltaY: 100,
        metaKey: false,
        momentum: false,
        preventDefault() {},
        stopPropagation() {},
        timeStamp,
      });
    }
    const committedSettleToken = gestures.pageTrackScrub.value?.settleToken;
    eventTarget.setNow(520);
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 100,
      metaKey: false,
      momentum: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 520,
    });

    assert(
      calls.pageIndexes.join(",") === "1,2" &&
        gestures.pageTrackScrub.value?.fromIndex === 1 &&
        gestures.pageTrackScrub.value?.toIndex === 2 &&
        gestures.pageTrackScrub.value?.settleToken === committedSettleToken,
      "continuing a coarse wheel burst at the last page should not replace the committed settle"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness({ pageWidth: 1344 });
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 100,
      metaKey: false,
      momentum: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 0,
    });
    eventTarget.advanceTo(360);
    eventTarget.setNow(400);
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 100,
      metaKey: false,
      momentum: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 400,
    });
    eventTarget.advanceTo(721);

    assert(calls.pageIndexes.join(",") === "1,2", "separate discrete bursts should advance one adjacent page each");
    assert(
      gestures.pageTrackScrub.value?.toIndex === 2,
      "an older settle cleanup must not clear the presentation owned by a newer wheel session"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness({ pageWidth: 1344 });
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 100,
      metaKey: false,
      momentum: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 0,
    });
    eventTarget.setNow(120);
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: -100,
      metaKey: false,
      momentum: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 120,
    });

    assert(
      calls.pageIndexes.join(",") === "1,0" && gestures.pageTrackScrub.value?.toIndex === 0,
      "an opposite mouse-wheel notch should reverse the committed page without waiting for the burst lock"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 30,
      deltaY: 0,
      metaKey: false,
      momentum: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 0,
    });
    eventTarget.setNow(20);
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 30,
      deltaY: 0,
      metaKey: false,
      momentum: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 20,
    });
    eventTarget.setNow(40);
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 0,
      metaKey: false,
      momentum: true,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 40,
    });

    assert(
      calls.pageIndexes.join(",") === "1" && gestures.pageTrackScrub.value?.settle === true,
      "the first momentum event should settle immediately even when its normalized delta is zero"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    gestures.handleIconPointerDown(makePointerEvent(5), appA, source);
    eventTarget.advanceTo(420);
    eventTarget.dispatch("pointermove", makePointerEvent(5, {
      button: -1,
      buttons: 1,
      clientX: 307,
      timeStamp: 440,
      type: "pointermove",
    }));
    eventTarget.dispatch("pointermove", makePointerEvent(5, {
      button: -1,
      buttons: 1,
      clientX: 320,
      timeStamp: 460,
      type: "pointermove",
    }));
    eventTarget.dispatch("pointerup", makePointerEvent(5, {
      buttons: 0,
      clientX: 320,
      timeStamp: 480,
      type: "pointerup",
    }));

    assert(
      calls.dragStarts.length === 1 &&
        calls.dragStarts[0]?.button === -1 &&
        calls.dragStarts[0]?.buttons === 1 &&
        calls.dragUpdates.length === 1 &&
        calls.dragFinishes.length === 1,
      "a held icon pointer should start, update, and finish one drag through the shared adapter"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 100,
      deltaY: 0,
      metaKey: false,
      momentum: true,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 0,
    });
    eventTarget.advanceTo(200);

    assert(
      gestures.pageTrackScrub.value === null && calls.pageIndexes.length === 0,
      "an orphan browser momentum event must not open or commit a page transition"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 30,
      deltaY: 0,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 0,
    });
    eventTarget.setNow(20);
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 30,
      deltaY: 0,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 20,
    });
    eventTarget.setNow(40);
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 0,
      deltaY: 0,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 40,
    });
    eventTarget.advanceTo(160);

    assert(
      calls.pageIndexes.join(",") === "1" && gestures.pageTrackScrub.value?.settle === true,
      "a zero-delta wheel event must preserve the active fallback deadline when momentum metadata is unavailable"
    );
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    const source: LaunchSource = { type: "page", pageIndex: 0, index: 0 };
    gestures.handleLaunchpadWheel({
      ctrlKey: false,
      deltaMode: 0,
      deltaX: 30,
      deltaY: 0,
      metaKey: false,
      preventDefault() {},
      stopPropagation() {},
      timeStamp: 0,
    });
    eventTarget.setNow(10);
    gestures.handleIconPointerDown(makePointerEvent(3, { timeStamp: 10 }), appA, source);
    eventTarget.advanceTo(150);
    eventTarget.advanceTo(440);
    eventTarget.dispatch("pointerup", makePointerEvent(3, { type: "pointerup", timeStamp: 450 }));

    assert(calls.pageIndexes.length === 0, "a new pointer gesture should cancel an unfinished wheel page session");
    assert(calls.contextMenus.join(",") === "app-a", "canceling the wheel session must preserve the new icon hold deadline");
    gestures.disposeInputGestures();
  }

  {
    const { calls, eventTarget, gestures } = createHarness();
    gestures.handleDesktopSurfacePointerDown(makePointerEvent(4, { clientX: 400 }));
    eventTarget.dispatch("pointermove", makePointerEvent(4, {
      buttons: 1,
      clientX: 250,
      timeStamp: 40,
      type: "pointermove",
    }));
    eventTarget.dispatch("pointerup", makePointerEvent(4, {
      clientX: 220,
      timeStamp: 70,
      type: "pointerup",
    }));

    assert(calls.pageIndexes.join(",") === "1", "surface pointer input should commit through the shared gesture adapter");
    gestures.disposeInputGestures();
  }
}
