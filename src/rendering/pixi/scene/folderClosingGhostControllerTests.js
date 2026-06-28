import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import {
  deleteLaunchpadDebugValue,
  readLaunchpadDebugValue,
  setLaunchpadDebugValue,
} from "../debugNamespace.js";
import {
  clearMotionPreferencesForTests,
  setReducedMotionForTests,
} from "../animation/motionPreferences.js";
import {
  FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
} from "./folderVisualOwnershipRegistry.js";

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
    labelText: { alpha: 1, scale: { x: 1, y: 1 }, visible: true },
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
    removeFromParent() {
      this.parent?.removeChild?.(this);
    },
    destroy() {
      this.destroyed = true;
    },
    getIconBounds() {
      return { height: 32, left: this.position.x - 16, top: this.position.y - 16, width: 32 };
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
    currentFolderId: "folder-1",
    closingGhostLayer: {
      addChild(ghost) {
        ghost.parent?.removeChild?.(ghost);
        ghost.parent = this;
        closingGhosts.push(ghost);
        return ghost;
      },
      removeChild(ghost) {
        const index = closingGhosts.indexOf(ghost);
        if (index >= 0) closingGhosts.splice(index, 1);
        if (ghost.parent === this) ghost.parent = null;
        return ghost;
      },
      removeChildren() {
        const removed = closingGhosts.splice(0);
        for (const ghost of removed) {
          if (ghost.parent === this) ghost.parent = null;
        }
        return removed;
      },
    },
    iconNodes: new Map([["app-1", iconNode]]),
    openingGhostLayer: { children: [] },
    openingGhosts: {
      clear() {
        calls.push("clear-opening");
      },
    },
    panel: { visible: true },
    pageTrack: { visible: false },
    visible: true,
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    onClosingHandoffVisualRelease(folderId) {
      calls.push(`release-visual:${folderId}`);
    },
    onInternalActivityChange(active) {
      activityChanges.push(active);
    },
    enableClosingFrameMask() {
      calls.push("enable-mask");
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    createClosingGhostToken(folderId = null) {
      return `closing:${folderId || ""}:test`;
    },
    hideIconNodesForTransition(itemId) {
      for (const node of this.iconNodes.values()) {
        if (node.item?.id === itemId) node.visible = false;
      }
    },
    hidePageTrackForTransition() {
      this.pageTrack.visible = false;
    },
    revealIconNodes() {
      calls.push("reveal-icons");
      for (const node of this.iconNodes.values()) {
        node.visible = true;
        node.alpha = 1;
      }
    },
    releaseTransitionOwnership(_token, options = {}) {
      if (options.restorePageTrack !== false) this.pageTrack.visible = true;
      if (options.reveal !== false) {
        this.revealIconNodes();
        this.rebuildPageTrackMask();
      }
    },
    startFrameGhost(fromRect, toRect, options = {}) {
      this.frameGhostState = { ...fromRect, progress: 0 };
      this.frameGhostTarget = toRect;
      this.frameGhostOptions = options;
    },
    get closingGhosts() {
      return closingGhosts;
    },
    get iconNode() {
      return iconNode;
    },
  };
}

function makeTarget(id = "app-1", pageIndex = 0) {
  return {
    iconSize: 64,
    index: 0,
    item: { id },
    pageIndex,
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 12, left: 100, top: 120, width: 12 },
  };
}

function makeState(completed = []) {
  return {
    getFolderCloseIconGhostKey: () => "fallback-close-key",
    height: 800,
    isTextlessMode: false,
    stageRect: { left: 0, top: 0 },
    width: 1200,
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

function completeFrameVisual(controller, state = makeState(), token = controller.handoffCoordinator.closeToken) {
  controller.handleSettlementEvents(state, controller.handoffCoordinator.completeCloseFrameVisual(token));
}

function completeFrame(controller, state = makeState(), token = controller.handoffCoordinator.closeToken) {
  controller.handleSettlementEvents(state, controller.handoffCoordinator.completeCloseFrame(token));
}

function getBaseAnimation(target, prop) {
  const channel = motionRuntime.getChannel(target, prop);
  return Array.from(channel?.base?.values?.() || [])[0] || null;
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
    controller.handoffCoordinator.beginCloseTransition("folder-1", { closeToken: "close-token" });
    controller.handoffCoordinator.trackCloseGhost({ item: { id: "app-1" } });
    controller.handoffCoordinator.trackClosePreviewSwap("swap");
    controller.scheduleRevealFallback([makeTarget()]);

    assert(timerHost.timerCount === 1, "fallback should schedule one timer");
    timerHost.runAllTimers();

    assert(controller.handoffCoordinator.getGhostKeys().size === 0, "fallback should clear active closing keys");
    assert(controller.handoffCoordinator.getPreviewSwapKeys().size === 0, "fallback should clear preview swap keys");
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
    const order = [];
    const releaseCalls = [];
    layer.onClosingHandoffReady = (folderId) => order.push(`ready:${folderId}`);
    layer.releaseTransitionOwnership = (token, options) => releaseCalls.push({ options, token });
    const previewSwapCalls = [];
    const controller = new FolderClosingGhostController(layer, {
      previewSwap: makePreviewSwap(previewSwapCalls),
      scheduler: timerHost,
    });
    const completedPreviewGhost = makeGhost("preview");
    controller.handoffCoordinator.beginCloseTransition("folder-1", { closeToken: "close-token" });
    controller.handoffCoordinator.trackCloseGhost({ item: { id: "app-1" } }, "close-key");
    controller.handoffCoordinator.completeCloseGhost("close-token", "app-1");
    controller.handoffCoordinator.addCompletedPreviewGhost(completedPreviewGhost);

    completeFrame(controller, {
      completeFolderCloseIconGhost: (key) => {
        completed.push(key);
        order.push(`flush:${key}`);
      },
    }, "close-token");
    assert(timerHost.frameCount === 1, "settled finish should schedule deferred final handoff cleanup");
    assert(completed.join(",") === "close-key", "finish should flush completed controller ghost keys");
    assert(order.join(",") === "ready:folder-1,flush:close-key", "finish should publish handoff-ready before flushing through the Vue bridge");
    assert(layer.activityChanges.join(",") === "true", "finish should mark Pixi internal handoff active");
    assert(layer.panel.visible === false, "finish should hide the stale folder panel during handoff");
    assert(layer.pageTrack.visible === false, "finish should keep page track hidden until handoff cleanup");
    assert(completedPreviewGhost.destroyed, "finish should clear overlay preview ghosts at the visual handoff point");
    assert(previewSwapCalls.includes("clear-preview-swap"), "finish should clear preview swap visuals at the visual handoff point");
    assert(layer.calls.includes("clear-frame"), "finish should clear the frame ghost at the visual handoff point");
    assert(releaseCalls.length === 1, "finish should release closing transition ownership at the visual handoff point");
    assert(releaseCalls[0].token === "close-token", "handoff release should use the close token");
    assert(
      releaseCalls[0].options?.reveal === false && releaseCalls[0].options?.restorePageTrack === false,
      "handoff release should not reveal real folder visuals or restore the page track"
    );
    assert(controller.handoffCoordinator.closeToken === null, "handoff visual cleanup should clear the closing token");
    assert(
      layer.calls.indexOf("release-visual:folder-1") >= 0 &&
      layer.calls.indexOf("clear-frame") < layer.calls.indexOf("release-visual:folder-1"),
      "visual handoff should clear the overlay frame before restoring desktop folder artwork"
    );
    assert(layer.visible === true && layer.currentFolderId === "folder-1", "first handoff frame should keep internal handoff ownership active");
    timerHost.runAllFrames();
    assert(layer.activityChanges.join(",") === "true,false", "handoff cleanup should clear Pixi internal handoff activity");
    assert(layer.visible === false && layer.currentFolderId === null, "handoff cleanup should hide the stale overlay state");
    assert(controller.handoffCoordinator.folderId === null, "handoff cleanup should clear the closing folder id");
    assert(releaseCalls.length === 1, "final handoff cleanup should not release transition ownership twice");
  }

  {
    const layer = makeLayer();
    const order = [];
    layer.onClosingHandoffReady = (folderId) => order.push(`ready:${folderId}`);
    layer.onInternalActivityChange = (active, folderId) => order.push(`activity:${active}:${folderId}`);
    const controller = new FolderClosingGhostController(layer, { scheduler: makeTimerHost() });
    controller.handoffCoordinator.beginCloseTransition("folder-1");

    completeFrame(controller, makeState());

    assert(
      order.join(",") === "ready:folder-1,activity:true:folder-1",
      "closing handoff activation should publish ready and internal activity callbacks"
    );
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const readyCalls = [];
    layer.onClosingHandoffReady = (folderId) => readyCalls.push(folderId);
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    controller.handoffCoordinator.beginCloseTransition("folder-1", { closeToken: "close-token" });

    completeFrameVisual(controller, makeState(), "close-token");
    completeFrameVisual(controller, makeState(), "close-token");
    completeFrame(controller, makeState(), "close-token");

    assert(readyCalls.join(",") === "folder-1", "settled session should not publish handoff ready twice");
    assert(timerHost.frameCount === 1, "settled session should not schedule duplicate handoff cleanup frames");
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
    controller.handoffCoordinator.beginCloseTransition("folder-1");
    controller.handoffCoordinator.setCloseHandoffGeometry({
      rect: { height: 64, left: 100, top: 120, width: 64 },
    });
    controller.handoffCoordinator.trackCloseGhost({ item: { id: "app-1" } }, "close-key");
    controller.handoffCoordinator.completeCloseGhost(controller.handoffCoordinator.closeToken, "app-1");

    completeFrame(controller, {
      completeFolderCloseIconGhost: (key) => completed.push(key),
      folderPageIndex: 0,
      folderPageSize: 9,
      height: 800,
      isTextlessMode: false,
      renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
      stageRect: { left: 0, top: 0 },
      width: 1200,
    });

    assert(controller.handoffCoordinator.getFolderHandoffGhost() === null, "finish should not create a second overlay folder handoff ghost");
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
    let prepareSnapshot = null;
    layer.onClosingHandoffPrepare = (folderId) => {
      prepareSnapshot = {
        closingGhostCount: layer.closingGhosts.length,
        folderId,
        frameGhostPhase: layer.frameGhostOptions?.frameGhostPhase || null,
      };
    };
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });

    controller.start(makeState(), [makeTarget()], { height: 72, left: 10, top: 20, width: 72 }, { height: 300, left: 0, top: 0, width: 400 });

    assert(prepareSnapshot?.folderId === "folder-1", "closing start should prepare the desktop handoff immediately");
    assert(prepareSnapshot.frameGhostPhase === "closing", "desktop handoff prepare should run after the closing frame ghost exists");
    assert(prepareSnapshot.closingGhostCount === 1, "desktop handoff prepare should run after closing ghosts are installed");
    assert(controller.handoffCoordinator.isCloseHandoffActive() === false, "early prepare should not mark the visual handoff ready");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    let prepareSnapshot = null;
    layer.onClosingHandoffPrepare = (folderId) => {
      prepareSnapshot = {
        folderId,
        frameGhostPhase: layer.frameGhostOptions?.frameGhostPhase || null,
      };
    };
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });

    controller.start(
      makeState(),
      [{ ...makeTarget(), targetStageLayoutRect: null }],
      { height: 72, left: 10, top: 20, width: 72 },
      { height: 300, left: 0, top: 0, width: 400 }
    );

    assert(prepareSnapshot?.folderId === "folder-1", "no-target closing should still prepare the desktop source handoff");
    assert(prepareSnapshot.frameGhostPhase === "closing", "no-target closing should prepare after the frame substitute exists");
    assert(layer.closingGhosts.length === 0, "no-target closing should not install child ghosts");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    controller.start(makeState(), [{
      ...makeTarget(),
      targetStageLayoutRect: { height: 12, left: 100, top: 120, width: 12 },
    }], { height: 72, left: 10, top: 20, width: 72 }, { height: 300, left: 0, top: 0, width: 400 });

    assert(layer.closingGhosts.length === 1, "stage layout closing targets should not require a client target rect");
    assert(controller.handoffCoordinator.hasCloseGhost("app-1"), "stage layout closing targets should be tracked as active ghosts");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const previewSwapCalls = [];
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      previewSwap: makePreviewSwap(previewSwapCalls),
      scheduler: timerHost,
    });

    controller.start(makeState(), [makeTarget()], { height: 72, left: 10, top: 20, width: 72 }, { height: 360, left: 0, top: 0, width: 420 }, {
      previewSwapTargets: [{ item: { id: "preview-1" } }],
    });

    assert(layer.frameGhostOptions.progressMilestones?.length === 1, "closing frame should declare a preview-swap progress milestone");
    const startCount = () => previewSwapCalls.filter((call) => call === "start-preview-swap").length;
    layer.frameGhostOptions.onUpdate?.({ progress: layer.frameGhostOptions.progressMilestones[0].progress - 0.01 });
    assert(startCount() === 0, "frame onUpdate below the milestone should not start preview swap");
    layer.frameGhostOptions.progressMilestones[0].callback();
    assert(startCount() === 1, "preview swap should start from the frame progress milestone");
    layer.frameGhostOptions.onUpdate?.({ progress: 1 });
    layer.frameGhostOptions.onComplete?.();
    assert(startCount() === 1, "preview swap milestone should be one-shot across update and complete fallbacks");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const order = [];
    layer.onClosingHandoffReady = (folderId) => order.push(`ready:${folderId}`);
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });

    controller.start(makeState(completed), [makeTarget()], { height: 72, left: 10, top: 20, width: 72 }, { height: 360, left: 0, top: 0, width: 420 });

    assert(controller.handoffCoordinator.isCloseHandoffActive() === false, "closing handoff should wait for frame visual arrival");
    layer.frameGhostOptions.onArrive?.();
    assert(controller.handoffCoordinator.snapshot().frameVisualComplete === true, "frame onArrive should mark the closing frame visually complete");
    assert(controller.handoffCoordinator.isCloseHandoffActive() === true, "frame visual arrival should start handoff before ghost physical completion");
    assert(order.join(",") === "ready:folder-1", "frame visual arrival should publish the handoff ready signal");
    assert(completed.join(",") === "fallback-close-key", "frame visual arrival should flush pending controller ghost keys");
    assert(!controller.handoffCoordinator.hasCloseGhost("app-1"), "frame visual arrival should clear overlay ghosts before desktop artwork release");
    assert(timerHost.frameCount === 1, "early frame handoff should schedule final cleanup after visual release");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const logs = [];
    const originalDebug = readLaunchpadDebugValue("folderHandoff");
    const originalLastDebug = readLaunchpadDebugValue("lastFolderHandoff");
    const originalLog = console.log;
    setLaunchpadDebugValue("folderHandoff", { log: true, timeline: true });
    console.log = (...args) => logs.push(args);
    try {
      const ghost = makeGhost();
      const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
      layer.closingGhostLayer.addChild(ghost);
      controller.handoffCoordinator.beginCloseTransition("folder-1");
      controller.handoffCoordinator.trackCloseGhost({ isThumbnailChild: true, item: { id: "app-1" } }, "close-key");
      completeFrameVisual(controller, makeState(completed));

      controller.markClosingGhostVisuallyArrived(makeState(completed), {
        ...makeTarget(),
        isThumbnailChild: true,
        previewSlotIndex: 2,
      }, ghost);

      assert(
        logs.some(([label]) => label === "[folder-closing-ghost-visual-arrive]"),
        "visual arrival debug should log before ghost complete"
      );
      assert(
        logs.some(([label, payload]) => label === "[folder-handoff-debug] overlay-release" && payload?.phase === "overlay-release-before-clear"),
        "visual handoff release debug should log before overlay visuals are cleared"
      );
      assert(
        readLaunchpadDebugValue("lastFolderHandoff")?.folderId === "folder-1" &&
          readLaunchpadDebugValue("lastFolderHandoff")?.phase === "overlay-release-after-clear",
        "visual handoff debug should publish the latest folder handoff snapshot"
      );
      assert(completed.join(",") === "close-key", "debug logging should not change visual arrival completion");
    } finally {
      console.log = originalLog;
      if (originalDebug === undefined) deleteLaunchpadDebugValue("folderHandoff");
      else setLaunchpadDebugValue("folderHandoff", originalDebug);
      if (originalLastDebug === undefined) deleteLaunchpadDebugValue("lastFolderHandoff");
      else setLaunchpadDebugValue("lastFolderHandoff", originalLastDebug);
      motionRuntime.reset();
    }
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    const order = [];
    const completedPreviewGhost = makeGhost("preview");
    controller.handoffCoordinator.beginCloseTransition("folder-1");
    controller.handoffCoordinator.trackCloseGhost({ item: { id: "app-1" } }, "close-key");
    controller.handoffCoordinator.completeCloseGhost(controller.handoffCoordinator.closeToken, "app-1");
    controller.handoffCoordinator.addCompletedPreviewGhost(completedPreviewGhost);
    layer.clearFrameGhost = () => order.push("cleanup");

    completeFrame(controller, {
      completeFolderCloseIconGhost: () => {
        order.push("flush");
        timerHost.requestAnimationFrame(() => order.push("finish-close"));
      },
    });

    assert(order.join(",") === "cleanup,flush", "visual handoff should clear Pixi overlay before releasing the folder flow");
    timerHost.runAllFrames();
    assert(order.join(",") === "cleanup,flush,finish-close", "folder flow reveal should run after Pixi overlay visual cleanup");
    timerHost.runAllFrames();
    assert(order.join(",") === "cleanup,flush,finish-close", "final handoff cleanup should not redraw overlay visuals");
  }

  {
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer);
    const target = makeTarget();
    controller.handoffCoordinator.beginOpeningVisuals({ sessionToken: "open-token" });
    controller.handoffCoordinator.registerOpeningGhost("app-1");
    layer.frameGhostFolderId = "folder-1";
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
    const reusedGhost = makeGhost("reused");
    reusedGhost.alpha = 0.7;
    reusedGhost.item = { id: "app-1" };
    reusedGhost.labelText.alpha = 0.4;
    reusedGhost.position.set(60, 71);
    layer.openingGhostLayer.children = [reusedGhost];

    let factoryCalls = 0;
    let releasedItemId = null;
    layer.openingGhosts.releaseGhost = (itemId) => {
      releasedItemId = itemId;
      controller.handoffCoordinator.releaseOpeningGhost(itemId);
      return reusedGhost;
    };
    controller.ghostFactory = () => {
      factoryCalls += 1;
      return makeGhost("unexpected");
    };

    controller.start(makeState(), [target], { height: 72, left: 10, top: 20, width: 72 }, { height: 300, left: 0, top: 0, width: 400 });

    assert(releasedItemId === "app-1", "closing should release the matching opening ghost");
    assert(factoryCalls === 0, "closing should reuse a released opening ghost instead of creating a new ghost");
    assert(layer.closingGhosts[0] === reusedGhost, "closing should move the released ghost into the closing layer");
    assert(reusedGhost.alpha === 0.7, "closing should preserve the released ghost alpha as the motion source");
    assert(reusedGhost.labelText.alpha === 0.4, "closing should preserve the released label alpha before fade out");
    assert(layer.frameGhostState.left === 20 && layer.frameGhostState.width === 240, "closing frame should start from the current frame presentation");
    assert(layer.frameGhostOptions.frameGhostPhase === "closing", "closing frame should mark its frame ghost phase");
    assert(layer.frameGhostOptions.folderId === "folder-1", "closing frame should carry the owning folder id");
    assert(layer.frameGhostOptions.fromFillColor === 0xffffff && layer.frameGhostOptions.fromFillAlpha === 0.22, "closing frame should use folder thumb fill presentation at phase handoff");
    controller.clear();
  }

  {
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer);
    const target = makeTarget("app-1", 1);
    controller.handoffCoordinator.beginOpeningVisuals({ sessionToken: "open-token" });
    controller.handoffCoordinator.registerOpeningGhost("app-1");
    const stalePageGhost = makeGhost("stale-page-opening");
    stalePageGhost.item = { id: "app-1" };
    stalePageGhost.openingPageIndex = 0;
    layer.openingGhostLayer.children = [stalePageGhost];

    let releaseCalls = 0;
    let clearCalls = 0;
    layer.openingGhosts.releaseGhost = () => {
      releaseCalls += 1;
      throw new Error("closing should not reuse an opening ghost from a different page");
    };
    layer.openingGhosts.clear = (options = {}) => {
      clearCalls += 1;
      assert(options.cancelSession === true, "closing should cancel the stale opening visual session");
      controller.handoffCoordinator.clearOpeningVisuals();
      layer.openingGhostLayer.children = [];
    };
    let factoryCalls = 0;
    controller.ghostFactory = () => {
      factoryCalls += 1;
      return makeGhost("fresh-close");
    };

    controller.start(makeState(), [target], { height: 72, left: 10, top: 20, width: 72 }, { height: 300, left: 0, top: 0, width: 400 });

    assert(releaseCalls === 0, "closing should not release a different-page opening ghost as a close source");
    assert(clearCalls === 1, "closing should still clear stale opening visuals after taking close ownership");
    assert(factoryCalls === 1, "closing should create a fresh ghost for the current visual page");
    assert(layer.closingGhosts.length === 1 && layer.closingGhosts[0] !== stalePageGhost, "closing layer should not contain the stale opening-page ghost");
    assert(layer.openingGhostLayer.children.length === 0, "stale opening ghost visuals should be removed during close takeover");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    layer.frameGhostFolderId = "folder-a";
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

    controller.start(makeState(), [makeTarget()], { height: 72, left: 10, top: 20, width: 72 }, { height: 300, left: 400, top: 500, width: 420 });

    assert(layer.frameGhostState.left === 400 && layer.frameGhostState.width === 420, "closing a different folder should not start from a stale folder frame");
    assert(layer.frameGhostOptions.folderId === "folder-1", "cross-folder stale frame fallback should still tag the new closing folder");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const sourceKey = makeDesktopSourceVisualKey("folder-1");
    const reusedGhost = makeGhost("reused");
    reusedGhost.alpha = 0.7;
    reusedGhost.item = { id: "app-1" };
    controller.handoffCoordinator.beginOpeningVisuals({ sessionToken: "open-token" });
    controller.handoffCoordinator.registerOpeningGhost("app-1");
    layer.openingGhostLayer.children = [reusedGhost];
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.ownedVisualTokens = new Set();
    layer.acquireVisualOwnership = (key, owner) => {
      const acquired = layer.visualOwnership.acquire(key, owner);
      if (acquired && owner?.token != null) layer.ownedVisualTokens.add(owner.token);
      return acquired;
    };
    layer.releaseTransitionOwnership = (token) => {
      const ownerAtRelease = layer.visualOwnership.getOwner(sourceKey);
      layer.ownerKindAtOpeningClear = ownerAtRelease?.kind || null;
      return layer.visualOwnership.releaseByToken(token);
    };
    layer.openingGhosts.releaseGhost = (itemId) => {
      controller.handoffCoordinator.releaseOpeningGhost(itemId);
      return reusedGhost;
    };
    layer.openingGhosts.clear = () => {
      controller.handoffCoordinator.clearOpeningVisuals();
      layer.releaseTransitionOwnership("open-token");
    };
    layer.acquireVisualOwnership(sourceKey, {
      folderId: "folder-1",
      kind: "opening",
      token: "open-token",
    });

    controller.start(makeState(), [makeTarget()], { height: 72, left: 10, top: 20, width: 72 }, { height: 300, left: 0, top: 0, width: 400 });

    assert(layer.ownerKindAtOpeningClear === "closing", "closing should own the desktop source before clearing the interrupted opening owner");
    assert(layer.visualOwnership.getOwner(sourceKey)?.kind === "closing", "opening clear should not reveal a source already transferred to closing");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const sourceKey = makeDesktopSourceVisualKey("folder-1");
    controller.handoffCoordinator.beginOpeningVisuals({ sessionToken: "open-token" });
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.ownedVisualTokens = new Set();
    layer.acquireVisualOwnership = (key, owner) => {
      const acquired = layer.visualOwnership.acquire(key, owner);
      if (acquired && owner?.token != null) layer.ownedVisualTokens.add(owner.token);
      return acquired;
    };
    layer.releaseTransitionOwnership = (token) => {
      const ownerAtRelease = layer.visualOwnership.getOwner(sourceKey);
      layer.ownerKindAtOpeningClear = ownerAtRelease?.kind || null;
      return layer.visualOwnership.releaseByToken(token);
    };
    layer.openingGhosts.clear = () => {
      controller.handoffCoordinator.clearOpeningVisuals();
      layer.releaseTransitionOwnership("open-token");
    };
    layer.acquireVisualOwnership(sourceKey, {
      folderId: "folder-1",
      kind: "opening",
      token: "open-token",
    });

    controller.start(
      makeState(),
      [{ ...makeTarget(), targetStageLayoutRect: null }],
      { height: 72, left: 10, top: 20, width: 72 },
      { height: 300, left: 0, top: 0, width: 400 }
    );

    assert(layer.ownerKindAtOpeningClear === "closing", "closing should own the desktop source before clearing opening even without usable close targets");
    assert(layer.visualOwnership.getOwner(sourceKey)?.kind === "closing", "no-target closing fallback should keep the source folder hidden");
    assert(layer.frameGhostOptions?.frameGhostPhase === "closing", "no-target closing fallback should still start the folder frame handoff");
    assert(timerHost.timerCount === 0, "no-target closing fallback should not schedule child ghost fallback timers");
    layer.frameGhostOptions.onArrive();
    assert(controller.handoffCoordinator.isCloseHandoffActive() === true, "no-target closing frame arrival should start handoff activity");
    layer.frameGhostOptions.onComplete();
    timerHost.runAllFrames();
    assert(!layer.visualOwnership.hasOwner(sourceKey), "no-target closing handoff cleanup should release the desktop source");
    timerHost.runAllFrames();
    assert(controller.handoffCoordinator.isCloseHandoffActive() === false, "no-target closing handoff cleanup should end handoff activity");
    controller.clear();
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    const ghost = makeGhost();
    const target = { ...makeTarget(), controllerGhostKey: "close-key" };
    layer.closingGhostLayer.addChild(ghost);
    controller.handoffCoordinator.beginCloseTransition("folder-1");
    controller.handoffCoordinator.trackCloseGhost({ item: { id: "app-1" } });

    controller.completeGhost(makeState(completed), target, ghost);
    completeFrame(controller, makeState(completed));
    assert(ghost.destroyed, "regular complete should clear the closing ghost at the visual handoff point");
    assert(ghost.closingComplete, "regular complete should mark the ghost complete");
    assert(controller.handoffCoordinator.getGhostKeys().size === 0, "regular complete should remove the active key");
    assert(completed.join(",") === "close-key", "regular complete should flush the controller ghost key");
    assert(timerHost.frameCount === 1, "regular complete should schedule handoff cleanup when the frame is done");
    timerHost.runAllFrames();
    assert(ghost.destroyed, "handoff cleanup should not recreate cleared closing ghosts");

    controller.completeGhost(makeState(completed), target, ghost);
    assert(completed.join(",") === "close-key", "duplicate complete should not flush the key twice");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const completed = [];
    const order = [];
    layer.onClosingHandoffReady = (folderId) => order.push(`ready:${folderId}`);
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    const trailingGhost = makeGhost("trailing");
    layer.closingGhostLayer.addChild(trailingGhost);
    controller.handoffCoordinator.beginCloseTransition("folder-1");
    controller.handoffCoordinator.trackCloseGhost({ isThumbnailChild: true, item: { id: "thumb-1" } }, "thumb-key");
    controller.handoffCoordinator.trackCloseGhost({ item: { id: "extra-1" } }, "extra-key");
    completeFrameVisual(controller, makeState(completed));

    controller.markClosingGhostVisuallyArrived(makeState(completed), {
      ...makeTarget("thumb-1"),
      isThumbnailChild: true,
    });

    assert(controller.handoffCoordinator.isCloseHandoffActive() === true, "critical visual arrival should start handoff before non-thumbnail ghosts settle");
    assert(order.join(",") === "ready:folder-1", "critical handoff should publish the ready signal");
    assert(completed.join(",") === "thumb-key,extra-key", "critical handoff should flush all controller ghost keys so Vue does not fall back");
    assert(!controller.handoffCoordinator.hasCloseGhost("extra-1"), "visual handoff should clear non-thumbnail overlay ghosts instead of waiting for final cleanup");
    assert(trailingGhost.destroyed, "visual handoff should remove remaining overlay ghosts before restoring desktop artwork");
    assert(timerHost.frameCount === 1, "critical handoff should schedule final cleanup after visual release");

    assert(controller.handoffCoordinator.getGhostKeys().size === 0, "settled handoff visual cleanup should clear remaining closing ghost keys");
    assert(
      layer.calls.indexOf("release-visual:folder-1") >= 0 &&
      layer.calls.indexOf("clear-frame") < layer.calls.indexOf("release-visual:folder-1"),
      "visual handoff should clear overlay visuals before restoring desktop artwork"
    );
    timerHost.runAllFrames();
    assert(controller.handoffCoordinator.isCloseHandoffActive() === false, "handoff cleanup should end internal activity after visual cleanup");
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
      targetStageLayoutRect: { height: 16, left: 90, top: 110, width: 16 },
    };
    controller.handoffCoordinator.beginCloseTransition("folder-1");
    controller.handoffCoordinator.trackCloseGhost({ isThumbnailChild: true, item: { id: "app-1" } });

    controller.completeGhost(makeState(completed), target, ghost);
    completeFrame(controller, makeState(completed));
    assert(ghost.destroyed, "thumbnail complete should clear the preview ghost at the visual handoff point");
    assert(controller.handoffCoordinator.getCompletedPreviewGhosts().length === 0, "visual handoff should remove retained preview ghost references");
    assert(completed.join(",") === "fallback-close-key", "thumbnail complete should flush the fallback controller ghost key");

    timerHost.runAllFrames();
    assert(ghost.destroyed, "handoff cleanup should not recreate cleared preview ghosts");
    assert(controller.handoffCoordinator.getCompletedPreviewGhosts().length === 0, "handoff cleanup should keep preview ghost references clear");
    timerHost.runAllFrames();
    assert(controller.handoffCoordinator.isCloseHandoffActive() === false, "handoff cleanup should end internal activity");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, { scheduler: timerHost });
    controller.handoffCoordinator.beginCloseTransition("old-folder");
    controller.handoffCoordinator.trackCloseGhost({ item: { id: "stale" } });
    controller.handoffCoordinator.completeCloseFrame(controller.handoffCoordinator.closeToken);
    controller.begin("folder-1");

    assert(controller.handoffCoordinator.folderId === "folder-1", "begin should store the closing folder id");
    assert(controller.handoffCoordinator.getGhostKeys().size === 0, "begin should reset active closing keys");
    assert(controller.handoffCoordinator.snapshot().frameComplete === false, "begin should reset frame completion");
  }

  {
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer);
    layer.panel.visible = false;
    controller.clear();

    assert(layer.panel.visible === true, "clear should restore the panel for the next folder render");
  }

  {
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer);
    controller.handoffCoordinator.beginCloseTransition("folder-1");
    controller.handoffCoordinator.trackCloseGhost({ isThumbnailChild: true, item: { id: "app-1" } });
    controller.handoffCoordinator.trackClosePreviewSwap("swap");
    layer.closingGhostLayer.addChild(makeGhost());
    layer.panel.visible = false;
    layer.pageTrack.visible = false;
    layer.iconNode.visible = false;

    controller.clear({ restorePageTrack: false, reveal: false });

    assert(layer.panel.visible === true, "non-reveal clear should still restore the panel container for the next render");
    assert(layer.pageTrack.visible === false, "non-reveal clear should not restore the page track");
    assert(layer.iconNode.visible === false, "non-reveal clear should not reveal real icon nodes");
    assert(!layer.calls.includes("reveal-icons"), "non-reveal clear should not call revealIconNodes");
    assert(layer.closingGhosts.length === 0, "non-reveal clear should still remove closing ghost visuals");
  }

  {
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    layer.iconNodes.set("app-2", { alpha: 0.4, item: { id: "app-2" }, visible: false });
    setReducedMotionForTests(true);
    try {
      controller.start(makeState(), [
        { ...makeTarget("app-1"), controllerGhostKey: "close-a" },
        { ...makeTarget("app-2"), controllerGhostKey: "close-b" },
      ], { height: 72, left: 10, top: 20, width: 72 }, { height: 360, left: 0, top: 0, width: 420 });

      const snapshot = controller.handoffCoordinator.snapshot();
      assert(snapshot.ghostKeys.size === 0, "synchronous reduced-motion completion should clear every active closing key");
      assert(snapshot.motionControlCount === 0, "synchronous reduced-motion completion should not register stale motion controls");
      assert(snapshot.completedControllerGhostKeys.join(",") === "close-a,close-b", "synchronous reduced-motion completion should collect every close key");
      assert(layer.closingGhosts.every((ghost) => !ghost.destroyed), "synchronous reduced-motion completion should retain completed closing ghosts until handoff cleanup");
      layer.frameGhostOptions.onComplete();
      timerHost.runAllFrames();
      assert(layer.closingGhosts.length === 0, "handoff cleanup should remove retained reduced-motion closing ghosts");
    } finally {
      clearMotionPreferencesForTests();
      motionRuntime.reset();
      controller.clear();
    }
  }

  {
    motionRuntime.reset();
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    let createTokenCount = 0;
    let ownershipCount = 0;
    layer.createClosingGhostToken = (folderId = null) => {
      createTokenCount += 1;
      return `closing:${folderId || ""}:retarget`;
    };
    layer.acquireVisualOwnership = () => {
      ownershipCount += 1;
      return true;
    };
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const folderRect = { height: 72, left: 10, top: 20, width: 72 };
    const panelRect = { height: 360, left: 0, top: 0, width: 420 };
    controller.start(makeState(), [makeTarget()], folderRect, panelRect, {
      handoffRect: { height: 60, left: 100, top: 110, width: 60 },
      handoffTarget: { folderId: "folder-1", trackingKey: "initial" },
    });
    const token = controller.handoffCoordinator.closeToken;
    const ghost = layer.closingGhosts[0];
    const previousRecord = controller.activeGhostsByItemId.get("app-1");
    const previousControl = previousRecord?.motionControl;
    const retargetedTarget = {
      ...makeTarget(),
      targetStageLayoutRect: { height: 20, left: 220, top: 260, width: 20 },
    };

    const retargeted = controller.retarget(makeState(), [retargetedTarget], {
      height: 80,
      left: 30,
      top: 40,
      width: 80,
    }, panelRect, {
      handoffRect: { height: 64, left: 44, top: 55, width: 64 },
      handoffTarget: { folderId: "folder-1", trackingKey: "retargeted" },
    });

    const nextRecord = controller.activeGhostsByItemId.get("app-1");
    const detachedMotion = controller.handoffCoordinator.getDetachedClosingGhostMotion(ghost);
    assert(retargeted === 1, "same-session close update should retarget the existing ghost");
    assert(controller.handoffCoordinator.closeToken === token, "retarget should keep the original close token");
    assert(createTokenCount === 1, "retarget should not create a second close token");
    assert(ownershipCount === 1, "retarget should not re-acquire desktop source ownership");
    assert(layer.closingGhosts.length === 1 && layer.closingGhosts[0] === ghost, "retarget should not create or replace closing ghost visuals");
    assert(previousControl?.released === true, "retarget should release the previous motion owner before rebinding callbacks");
    assert(nextRecord?.motionControl && nextRecord.motionControl !== previousControl, "retarget should install a fresh motion control for the same ghost");
    assert(controller.handoffCoordinator.snapshot().motionControlCount === 1, "retarget should replace the tracked motion control instead of accumulating controls");
    assert(detachedMotion?.x === 230 && detachedMotion?.y > 0, "retarget should update detached ghost motion to the new landing rect");
    assert(getBaseAnimation(ghost, "x")?.to === 230, "retarget should retarget the ghost x spring to the new target");
    assert(controller.handoffCoordinator.snapshot().handoffRect?.left === 44, "retarget should update handoff geometry to the current rendered rect");
    controller.clear();
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const folderRect = { height: 72, left: 10, top: 20, width: 72 };
    const panelRect = { height: 360, left: 0, top: 0, width: 420 };
    controller.start(makeState(), [makeTarget()], folderRect, panelRect);
    const ghost = layer.closingGhosts[0];
    const activeBefore = controller.activeGhostsByItemId.get("app-1")?.motionControl;

    assert(
      controller.retarget(makeState(), [makeTarget("app-2")], folderRect, panelRect) === 0,
      "retarget should skip targets that do not already have an active closing ghost"
    );
    assert(layer.closingGhosts.length === 1 && layer.closingGhosts[0] === ghost, "unknown target retarget should not create a new ghost");
    assert(controller.activeGhostsByItemId.get("app-1")?.motionControl === activeBefore, "unknown target retarget should leave active ghost control untouched");
    assert(
      controller.retarget({
        ...makeState(),
        renderedFolder: { id: "other-folder" },
      }, [makeTarget()], folderRect, panelRect) === 0,
      "retarget should ignore a different closing folder"
    );
    const token = controller.handoffCoordinator.closeToken;
    controller.handoffCoordinator.releaseCloseOverlayVisuals(token);
    assert(
      controller.retarget(makeState(), [{
        ...makeTarget(),
        targetStageLayoutRect: { height: 20, left: 280, top: 300, width: 20 },
      }], folderRect, panelRect) === 0,
      "retarget should no-op after handoff visual release"
    );
    controller.clear();
    motionRuntime.reset();
  }
}
