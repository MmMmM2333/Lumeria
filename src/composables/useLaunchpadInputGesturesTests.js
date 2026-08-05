import { ref } from "vue";
import { useLaunchpadInputGestures } from "./useLaunchpadInputGestures.js";

function assert(condition, message) {
  if (!condition) throw new Error(`[Launchpad input gestures test failed] ${message}`);
}

function createEventTarget() {
  const listeners = new Map();
  const timers = new Map();
  let nextTimerId = 1;
  let now = 0;
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    dispatch(type, event) {
      listeners.get(type)?.(event);
    },
    listenerCount(type) {
      return listeners.has(type) ? 1 : 0;
    },
    setNow(value) {
      now = value;
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    advanceTo(value) {
      now = value;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((left, right) => left[1].at - right[1].at);
      for (const [id, timer] of due) {
        if (!timers.delete(id)) continue;
        timer.callback();
      }
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
}

function createPointerCaptureTarget() {
  const listeners = new Map();
  const capturedPointers = new Set();
  const releasedPointers = [];
  return {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    closest: () => null,
    hasPointerCapture(pointerId) {
      return capturedPointers.has(pointerId);
    },
    losePointerCapture(pointerId, event) {
      capturedPointers.delete(pointerId);
      listeners.get("lostpointercapture")?.(event);
    },
    releasePointerCapture(pointerId) {
      releasedPointers.push(pointerId);
      capturedPointers.delete(pointerId);
    },
    releasedPointers,
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    setPointerCapture(pointerId) {
      capturedPointers.add(pointerId);
    },
  };
}

function makePointerEvent(pointerId, overrides = {}) {
  return {
    button: overrides.button ?? 0,
    buttons: overrides.buttons,
    clientX: overrides.clientX ?? 300,
    clientY: overrides.clientY ?? 120,
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

function createHarness(options = {}) {
  const eventTarget = createEventTarget();
  const pageWidth = options.pageWidth ?? 500;
  const activePageIndex = ref(0);
  const calls = {
    contextMenus: [],
    dragFinishes: [],
    dragStarts: [],
    dragUpdates: [],
    openedApps: [],
    pageIndexes: [],
  };
  const gestures = useLaunchpadInputGestures({
    activePageIndex,
    activePages: ref([[{ id: "app-a" }], [{ id: "app-b" }], []]),
    commitActivePageIndex: (pageIndex) => {
      activePageIndex.value = pageIndex;
      calls.pageIndexes.push(pageIndex);
    },
    commitFolderPageIndex: () => {},
    commitOpenFolder: () => {},
    dragControls: {
      finishDrag: (event) => calls.dragFinishes.push(event),
      startDrag: (event) => calls.dragStarts.push(event),
      updateDragPointer: (event) => calls.dragUpdates.push(event),
    },
    eventTarget,
    folderPageIndex: ref(0),
    folderPageRefs: [],
    folderPages: ref([]),
    folderPanelRef: ref(null),
    folderViewportRef: ref(null),
    getDesktopTargetAtPoint: () => null,
    isFolderAppLaunchClosing: ref(false),
    isFolderClosing: ref(false),
    isInteractionBlocked: () => false,
    isSearchMode: ref(false),
    openApp: (item) => calls.openedApps.push(item.id),
    openFolderId: ref(null),
    openIconContextMenu: (_event, item) => calls.contextMenus.push(item.id),
    pageRefs: [{ getBoundingClientRect: () => ({ width: pageWidth }) }],
    renderedFolder: ref(null),
    rootRef: ref({ getBoundingClientRect: () => ({ width: pageWidth }) }),
  });
  return { calls, eventTarget, gestures };
}

export function runLaunchpadInputGesturesTests() {
  {
    const { calls, eventTarget, gestures } = createHarness();
    const source = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(18, { pointerType: "mouse", target: captureTarget }),
      { id: "app-a", type: "app" },
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
    const source = { type: "page", pageIndex: 0, index: 0 };
    gestures.handleIconPointerDown(
      makePointerEvent(19, { pointerType: "touch" }),
      { id: "app-a", type: "app" },
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
    const source = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(20, { pointerType: "mouse", target: captureTarget }),
      { id: "app-a", type: "app" },
      source
    );

    assert(
      gestures.iconGesturePresentation.value?.phase === "pressing" &&
        gestures.iconGesturePresentation.value?.target?.id === "app-a",
      "the public adapter state should expose the icon's immediate pressing presentation"
    );
    eventTarget.advanceTo(420);
    assert(
      gestures.iconGesturePresentation.value?.phase === "armed",
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
    const source = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(22, { pointerType: "mouse", target: captureTarget }),
      { id: "app-a", type: "app" },
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
    const source = { type: "page", pageIndex: 0, index: 0 };
    const captureTarget = createPointerCaptureTarget();
    gestures.handleIconPointerDown(
      makePointerEvent(21, { pointerType: "mouse", target: captureTarget }),
      { id: "app-a", type: "app" },
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
    const source = { type: "page", pageIndex: 0, index: 0 };
    gestures.handleIconPointerDown(makePointerEvent(1), { id: "app-a", type: "app" }, source);
    gestures.handleIconPointerDown(makePointerEvent(2), { id: "app-b", type: "app" }, source);
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
    const source = { type: "page", pageIndex: 0, index: 0 };
    gestures.handleIconPointerDown(makePointerEvent(5), { id: "app-a", type: "app" }, source);
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
        calls.dragStarts[0].button === -1 &&
        calls.dragStarts[0].buttons === 1 &&
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
    const source = { type: "page", pageIndex: 0, index: 0 };
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
    gestures.handleIconPointerDown(makePointerEvent(3, { timeStamp: 10 }), { id: "app-a", type: "app" }, source);
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
