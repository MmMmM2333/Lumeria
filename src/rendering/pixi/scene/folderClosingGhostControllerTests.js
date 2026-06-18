import { FolderClosingGhostController } from "./folderClosingGhostController.js";

function makeTimerHost() {
  let nextId = 1;
  let nextFrameId = 1;
  const timers = new Map();
  const frames = new Map();
  return {
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(callback) {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    },
    runAllFrames() {
      const pending = Array.from(frames.entries());
      for (const [id, callback] of pending) {
        if (!frames.has(id)) continue;
        frames.delete(id);
        callback();
      }
    },
    runAllTimers() {
      const pending = Array.from(timers.entries());
      for (const [id, callback] of pending) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        callback();
      }
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      return id;
    },
    get frameCount() {
      return frames.size;
    },
    get timerCount() {
      return timers.size;
    },
  };
}

function makeGhost(id = "ghost") {
  return {
    alpha: 0,
    children: [],
    closingComplete: false,
    destroyed: false,
    id,
    labelText: { visible: true },
    position: {
      set(x, y) {
        this.x = x;
        this.y = y;
      },
      x: 0,
      y: 0,
    },
    scale: {
      set(x, y = x) {
        this.x = x;
        this.y = y;
      },
      x: 1,
      y: 1,
    },
    destroy() {
      this.destroyed = true;
    },
    setState(state) {
      this.state = state;
    },
  };
}

function makeLayer() {
  const calls = [];
  const activityChanges = [];
  const closingGhosts = [];
  const iconNode = { alpha: 0.4, item: { id: "app-1" }, visible: false };
  return {
    activityChanges,
    calls,
    closingHandoffActive: false,
    currentFolderId: "folder-1",
    closingGhostLayer: {
      addChild(ghost) {
        closingGhosts.push(ghost);
      },
      removeChildren() {
        return closingGhosts.splice(0);
      },
    },
    iconNodes: new Map([["app-1", iconNode]]),
    openingGhostLayer: { children: [] },
    openingGhostKeys: null,
    panel: { visible: true },
    pageTrack: { visible: false },
    visible: true,
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    revealIconNodes() {
      calls.push("reveal-icons");
      for (const node of this.iconNodes.values()) {
        node.visible = true;
        node.alpha = 1;
      }
    },
    setClosingHandoffActive(active) {
      const next = Boolean(active);
      if (this.closingHandoffActive === next) return;
      this.closingHandoffActive = next;
      activityChanges.push(next);
    },
    get closingGhosts() {
      return closingGhosts;
    },
    get iconNode() {
      return iconNode;
    },
  };
}

function makeTarget(id = "app-1") {
  return {
    iconSize: 64,
    index: 0,
    item: { id },
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetRect: { height: 12, left: 100, top: 120, width: 12 },
  };
}

function makeState(completed = []) {
  return {
    getFolderCloseIconGhostKey: () => "fallback-close-key",
    isTextlessMode: false,
    stageRect: { left: 0, top: 0 },
    completeFolderCloseIconGhost: (key) => completed.push(key),
  };
}

function makePreviewSwap(calls = []) {
  return {
    clear() {
      calls.push("clear-preview-swap");
    },
    start() {
      calls.push("start-preview-swap");
    },
  };
}

export function runFolderClosingGhostControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder closing ghost controller test failed] ${message}`);
  };

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const previewSwapCalls = [];
    const controller = new FolderClosingGhostController(layer, {
      previewSwap: makePreviewSwap(previewSwapCalls),
      scheduler: timerHost,
    });
    const ghost = makeGhost();
    layer.closingGhostLayer.addChild(ghost);
    layer.closingGhostKeys = new Set(["app-1"]);
    layer.closingPreviewSwapKeys = new Set(["swap"]);
    controller.scheduleRevealFallback([makeTarget()]);

    assert(timerHost.timerCount === 1, "fallback should schedule one timer");
    timerHost.runAllTimers();

    assert(layer.closingGhostKeys.size === 0, "fallback should clear active closing keys");
    assert(layer.closingPreviewSwapKeys.size === 0, "fallback should clear preview swap keys");
    assert(layer.closingGhosts.length === 0, "fallback should remove closing ghost visuals");
    assert(ghost.destroyed, "fallback should destroy closing ghosts");
    assert(layer.iconNode.visible === true && layer.iconNode.alpha === 1, "fallback should reveal hidden icon nodes");
    assert(layer.pageTrack.visible === true, "fallback should restore the page track");
    assert(previewSwapCalls.includes("clear-preview-swap"), "fallback should clear preview swap visuals");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const previewSwapCalls = [];
    const controller = new FolderClosingGhostController(layer, {
      previewSwap: makePreviewSwap(previewSwapCalls),
      scheduler: timerHost,
    });
    const completedPreviewGhost = makeGhost("preview");
    layer.closingFrameComplete = true;
    layer.completedClosingControllerGhostKeys = ["close-key"];
    layer.completedClosingPreviewGhosts = [completedPreviewGhost];

    controller.finishTransition({
      completeFolderCloseIconGhost: (key) => completed.push(key),
    });
    assert(timerHost.frameCount === 1, "finish should schedule deferred handoff cleanup");
    assert(completed.join(",") === "close-key", "finish should flush completed controller ghost keys");
    assert(layer.activityChanges.join(",") === "true", "finish should mark Pixi internal handoff active");
    assert(layer.panel.visible === false, "finish should hide the stale folder panel during handoff");
    assert(layer.pageTrack.visible === false, "finish should keep page track hidden until handoff cleanup");
    assert(!completedPreviewGhost.destroyed, "finish should keep overlay preview ghosts until the next handoff frame");
    assert(!previewSwapCalls.includes("clear-preview-swap"), "finish should keep preview swap visuals until the next handoff frame");
    assert(!layer.calls.includes("clear-frame"), "finish should keep the frame ghost until the next handoff frame");

    timerHost.runAllFrames();
    assert(layer.activityChanges.join(",") === "true", "first handoff frame should wait for desktop bounds refresh");
    assert(completedPreviewGhost.destroyed, "first handoff frame should clear overlay preview ghosts before paint");
    assert(previewSwapCalls.includes("clear-preview-swap"), "first handoff frame should clear preview swap visuals");
    assert(layer.calls.includes("clear-frame"), "first handoff frame should clear the frame ghost");
    assert(layer.visible === true && layer.currentFolderId === "folder-1", "first handoff frame should keep internal handoff ownership active");
    timerHost.runAllFrames();
    assert(layer.activityChanges.join(",") === "true,false", "handoff cleanup should clear Pixi internal handoff activity");
    assert(layer.visible === false && layer.currentFolderId === null, "handoff cleanup should hide the stale overlay state");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const folderGhost = makeGhost("folder-handoff");
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: () => folderGhost,
      scheduler: timerHost,
    });
    layer.closingFrameComplete = true;
    layer.closingFolderHandoffRect = { height: 64, left: 100, top: 120, width: 64 };
    layer.completedClosingControllerGhostKeys = ["close-key"];

    controller.finishTransition({
      completeFolderCloseIconGhost: (key) => completed.push(key),
      folderPageIndex: 0,
      folderPageSize: 9,
      height: 800,
      isTextlessMode: false,
      renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
      stageRect: { left: 0, top: 0 },
      width: 1200,
    });

    assert(layer.closingFolderHandoffGhost === null, "finish should not create a second overlay folder handoff ghost");
    assert(!folderGhost.state, "desktop handoff should own the final full folder ghost");
    assert(completed.join(",") === "close-key", "finish should still release the desktop ghost state");

    timerHost.runAllFrames();
    assert(!folderGhost.destroyed, "first handoff frame should leave unused overlay handoff ghosts untouched");
    timerHost.runAllFrames();
    assert(!folderGhost.destroyed, "handoff cleanup should not manage the desktop-owned handoff ghost");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    const order = [];
    const completedPreviewGhost = makeGhost("preview");
    layer.closingFrameComplete = true;
    layer.completedClosingControllerGhostKeys = ["close-key"];
    layer.completedClosingPreviewGhosts = [completedPreviewGhost];
    layer.clearFrameGhost = () => order.push("cleanup");

    controller.finishTransition({
      completeFolderCloseIconGhost: () => {
        order.push("flush");
        timerHost.requestAnimationFrame(() => order.push("finish-close"));
      },
    });

    assert(order.join(",") === "flush", "folder flow should be released after scheduling Pixi overlay cleanup");
    timerHost.runAllFrames();
    assert(order.join(",") === "flush,cleanup,finish-close", "Pixi overlay cleanup should run in the same frame as folder flow reveal");
    timerHost.runAllFrames();
    assert(order.join(",") === "flush,cleanup,finish-close", "final handoff cleanup should not redraw overlay visuals");
  }

  {
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer);
    const target = makeTarget();
    layer.openingGhostKeys = new Set(["app-1"]);
    layer.frameGhostState = {
      fillAlpha: 0.26,
      fillColor: 0x111111,
      height: 180,
      left: 20,
      radius: 42,
      strokeAlpha: 0.2,
      strokeColor: 0xffffff,
      strokeWidth: 1,
      top: 30,
      width: 240,
    };
    layer.openingGhostLayer.children = [{
      alpha: 0.7,
      destroyed: false,
      item: { id: "app-1" },
      labelText: { alpha: 0.4 },
      getIconBounds: () => ({ height: 32, left: 44, top: 55, width: 32 }),
    }];

    const interruption = controller.captureOpeningInterruption(makeState(), [target], { height: 300, left: 0, top: 0, width: 400 });
    assert(interruption.targets.length === 1, "capture should keep one interrupted target");
    assert(interruption.targets[0].interrupted, "capture should mark the target interrupted");
    assert(interruption.targets[0].sourceAlpha === 0.7, "capture should preserve ghost alpha");
    assert(interruption.targets[0].sourceLabelAlpha === 0.4, "capture should preserve label alpha");
    assert(interruption.targets[0].sourceScale === 0.5, "capture should derive source scale from the captured rect");
    assert(interruption.frameRect?.width > 0, "capture should resolve a frame rect");

    layer.openingGhostKeys = new Set();
    assert(controller.captureOpeningInterruption(makeState(), [target], null) === null, "capture should be inactive without opening ghosts");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    const ghost = makeGhost();
    const target = { ...makeTarget(), controllerGhostKey: "close-key" };
    layer.closingGhostKeys = new Set(["app-1"]);
    layer.closingFrameComplete = true;

    controller.completeGhost(makeState(completed), target, ghost);
    assert(ghost.destroyed, "regular complete should destroy the closing ghost");
    assert(ghost.closingComplete, "regular complete should mark the ghost complete");
    assert(layer.closingGhostKeys.size === 0, "regular complete should remove the active key");
    assert(completed.join(",") === "close-key", "regular complete should flush the controller ghost key");
    assert(timerHost.frameCount === 1, "regular complete should schedule handoff cleanup when the frame is done");

    controller.completeGhost(makeState(completed), target, ghost);
    assert(completed.join(",") === "close-key", "duplicate complete should not flush the key twice");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    const ghost = makeGhost();
    const target = {
      ...makeTarget(),
      isThumbnailChild: true,
      targetRect: { height: 16, left: 90, top: 110, width: 16 },
    };
    layer.closingGhostKeys = new Set(["app-1"]);
    layer.closingFrameComplete = true;

    controller.completeGhost(makeState(completed), target, ghost);
    assert(!ghost.destroyed, "thumbnail complete should retain the preview ghost through the handoff frame");
    assert(layer.completedClosingPreviewGhosts.length === 1, "finish should keep retained preview ghosts until handoff cleanup");
    assert(completed.join(",") === "fallback-close-key", "thumbnail complete should flush the fallback controller ghost key");

    timerHost.runAllFrames();
    assert(ghost.destroyed, "first handoff frame should clear the retained preview ghost before paint");
    assert(layer.completedClosingPreviewGhosts.length === 0, "first handoff frame should remove retained preview ghost references");
    timerHost.runAllFrames();
    assert(layer.closingHandoffActive === false, "handoff cleanup should end internal activity");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    layer.closingGhostKeys = new Set(["stale"]);
    controller.begin("folder-1");

    assert(layer.closingGhostFolderId === "folder-1", "begin should store the closing folder id");
    assert(layer.closingGhostKeys.size === 0, "begin should reset active closing keys");
    assert(layer.closingFrameComplete === false, "begin should reset frame completion");
  }

  {
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer);
    layer.panel.visible = false;
    controller.clear();

    assert(layer.panel.visible === true, "clear should restore the panel for the next folder render");
  }
}
