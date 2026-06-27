import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { FolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import {
  FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
} from "./folderVisualOwnershipRegistry.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import {
  clearMotionPreferencesForTests,
  setReducedMotionForTests,
} from "../animation/motionPreferences.js";

function makeTimerHost() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    runAll() {
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
    get size() {
      return timers.size;
    },
  };
}

function makeGhost() {
  return {
    alpha: 0,
    children: [],
    destroyed: false,
    eventMode: "static",
    item: null,
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
    setState(state) {
      this.item = state.item;
      this.state = state;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

function makeLayer() {
  const calls = [];
  const ghosts = [];
  const frameGhostCalls = [];
  const iconNode = { alpha: 1, item: { id: "app-1" }, visible: true };
  return {
    calls,
    frameGhostCalls,
    frameGhost: { alpha: 1, visible: true },
    iconNodes: new Map([["app-1", iconNode]]),
    openingGhostLayer: {
      children: ghosts,
      addChild(ghost) {
        ghosts.push(ghost);
      },
      removeChildren() {
        return ghosts.splice(0);
      },
    },
    pageTrack: { visible: true },
    panelMaterial: { alpha: 0, visible: false },
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    startFrameGhost(fromRect, toRect, options) {
      frameGhostCalls.push({ fromRect, options, toRect });
      this.panelMaterial.visible = options.exclusivePanelMaterialHandoff === true ? false : true;
      this.panelMaterial.alpha = options.exclusivePanelMaterialHandoff === true ? 0 : options.panelMaterialFromAlpha ?? 0;
      this.frameGhost.visible = true;
      this.frameGhost.alpha = options.frameGhostFromAlpha ?? 1;
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
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
      if (options.reveal !== false) this.revealIconNodes();
      if (options.restorePageTrack !== false) this.pageTrack.visible = true;
    },
    get ghosts() {
      return ghosts;
    },
    get iconNode() {
      return iconNode;
    },
  };
}

function makeState(completed) {
  return {
    folderOpenIconGhosts: [],
    folderPageIndex: 0,
    folderPageSize: 9,
    height: 800,
    isTextlessMode: false,
    launchTargetStatusById: {},
    showMissingLaunchTargetBadge: false,
    stageRect: { left: 0, top: 0 },
    width: 1200,
    completeFolderOpenIconGhost: (key) => completed.push(key),
    getFolderOpenIconGhostKey: () => "controller-open-key",
  };
}

function makeTarget(id = "app-1") {
  return {
    cellHeight: 80,
    cellWidth: 80,
    columnCount: 3,
    iconSize: 64,
    index: 0,
    item: { id, type: "app" },
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 64, left: 100, top: 120, width: 64 },
  };
}

function beginReadyOpenSession(layer, folderId = "folder-1", targetKey = "target-a") {
  const session = layer.folderHandoff.beginOpen(folderId, targetKey, { forceNew: true }).session;
  layer.folderHandoff.markPanelReady(session.token);
  return session.token;
}

function getBaseAnimation(target, prop) {
  const channel = motionRuntime.getChannel(target, prop);
  return Array.from(channel?.base?.values?.() || [])[0] || null;
}

export function runFolderOpeningGhostControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder opening ghost controller test failed] ${message}`);
  };

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    layer.currentFolderId = "folder-1";
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.acquireVisualOwnership = (key, owner) => layer.visualOwnership.acquire(key, owner);
    layer.releaseTransitionOwnership = (token, options = {}) => {
      layer.visualOwnership.releaseByToken(token);
      if (options.reveal !== false) layer.revealIconNodes();
      if (options.restorePageTrack !== false) layer.pageTrack.visible = true;
    };
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const sessionToken = beginReadyOpenSession(layer);
    const target = makeTarget();
    const frameCompletions = [];
    const state = {
      ...makeState(completed),
      folderOpenIconGhosts: [{ key: "controller-open-key", requestId: 7 }],
      renderedFolder: { id: "folder-1" },
      completeFolderOpenFrameGhost: (folderId, requestId) => frameCompletions.push(`${folderId}:${requestId}`),
    };
    controller.start(state, [target], {
      frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
      frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
      sessionToken,
    });

    assert(layer.folderHandoff.hasOpeningGhost("app-1"), "start should track active opening ghost item ids");
    assert(
      layer.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-1"), sessionToken),
      "opening should own the desktop source folder until reveal"
    );
    assert(layer.ghosts.length === 1, "start should create one opening ghost");
    assert(layer.iconNode.visible === false, "start should hide the real icon node");
    assert(layer.pageTrack.visible === false, "start should hide the page track");
    assert(layer.frameGhostCalls.length === 1, "start should morph an opening frame ghost from the source folder thumb");
    assert(layer.frameGhostCalls[0].fromRect.left === 10 && layer.frameGhostCalls[0].fromRect.width === 48, "opening frame should start at the source folder thumb rect");
    assert(layer.frameGhostCalls[0].toRect.left === 180 && layer.frameGhostCalls[0].toRect.width === 800, "opening frame should target the panel rect");
    assert(layer.frameGhostCalls[0].options.fromRadius === 14, "opening frame should keep the source folder thumb radius on its first frame");
    assert(layer.frameGhostCalls[0].options.toRadius === 48, "opening frame should morph to the panel radius");
    assert(layer.frameGhostCalls[0].options.exclusivePanelMaterialHandoff === true, "opening frame should keep one visible shell owner during the frame morph");
    assert(layer.frameGhostCalls[0].options.frameGhostPhase === "opening", "opening frame should mark its frame ghost phase");
    assert(layer.frameGhostCalls[0].options.folderId === "folder-1", "opening frame should carry the owning folder id");
    layer.frameGhostCalls[0].options.onArrive();
    assert(frameCompletions.join(",") === "folder-1:7", "opening frame arrive should unblock page dots with the current request id");
    assert(!layer.panelMaterial.visible && layer.panelMaterial.alpha === 0, "start should keep the real panel material hidden while the frame ghost owns the shell");
    assert(layer.frameGhost.visible && layer.frameGhost.alpha === 1, "start should show the frame ghost during the opening shell morph");
    assert(timerHost.size === 1, "start should schedule a fallback clear timer");

    controller.complete(makeState(completed), target, layer.ghosts[0]);
    assert(completed.join(",") === "controller-open-key", "complete should notify the controller ghost key");
    assert(layer.folderHandoff.getOpeningGhostKeys().size === 0, "complete should clear the finished key");
    assert(
      !layer.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")),
      "opening completion should release desktop source ownership"
    );
    assert(layer.iconNode.visible === true, "complete should reveal icon nodes after all ghosts finish");
    assert(layer.ghosts.length === 0, "complete should remove opening ghost visuals");
    assert(timerHost.size === 0, "complete should clear the fallback timer");
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    layer.folderHandoff = new FolderHandoffCoordinator(layer);
    const session = layer.folderHandoff.beginOpen("folder-1", "target-a").session;
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const target = makeTarget();
    controller.start(makeState(completed), [target], { sessionToken: session.token });
    controller.complete(makeState(completed), target, layer.ghosts[0]);

    assert(layer.folderHandoff.getOpeningGhostKeys().size === 0, "complete should clear ghost item ids even when reveal is gated");
    assert(layer.iconNode.visible === false, "ghost completion before panel ready should keep real icons hidden");
    assert(layer.pageTrack.visible === false, "ghost completion before panel ready should keep the page track hidden");
    assert(layer.ghosts.length === 1, "ghost completion before panel ready should retain ghost visuals");

    layer.folderHandoff.markPanelReady(session.token);
    controller.finishTransition({ sessionToken: session.token });
    assert(layer.iconNode.visible === true, "panel ready after ghosts should reveal real icons");
    assert(layer.pageTrack.visible === true, "panel ready after ghosts should restore the page track");
    assert(layer.ghosts.length === 0, "panel ready after ghosts should remove retained ghost visuals");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const frameCompletions = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    controller.start({
      ...makeState(completed),
      folderOpenIconGhosts: [{ key: "controller-open-key", requestId: 8 }],
      renderedFolder: { id: "folder-1" },
      completeFolderOpenFrameGhost: (folderId, requestId) => frameCompletions.push(`${folderId}:${requestId}`),
    }, [makeTarget()]);

    assert(frameCompletions.join(",") === "folder-1:8", "missing opening frame ghost should unblock page dots immediately");
    controller.clear();
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    controller.start(makeState(completed), [makeTarget()]);
    timerHost.runAll();

    assert(layer.folderHandoff.getOpeningGhostKeys().size === 0, "fallback should clear active item ids");
    assert(completed.join(",") === "controller-open-key", "fallback should complete pending controller keys");
    assert(layer.iconNode.visible === true, "fallback should reveal hidden icon nodes");
    assert(layer.ghosts.length === 0, "fallback should destroy opening ghost visuals");
    assert(layer.pageTrack.visible === true, "fallback should restore the page track");
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    controller.start({
      ...makeState(completed),
      folderOpenIconGhosts: [{ key: "open-a" }, { key: "open-b" }],
    }, [{ ...makeTarget(), sourceRect: null }]);

    assert(completed.join(",") === "open-a,open-b", "missing opening targets should complete published ghost keys");
    assert(layer.ghosts.length === 0, "missing opening targets should not create ghost visuals");
    assert(layer.pageTrack.visible === true, "missing opening targets should keep the page track visible");
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    const target = { ...makeTarget(), controllerGhostKey: "open-a" };
    const missingTarget = { ...makeTarget("app-2"), controllerGhostKey: "open-b" };
    delete missingTarget.targetStageLayoutRect;
    controller.start({
      ...makeState(completed),
      folderOpenIconGhosts: [{ key: "open-a" }, { key: "open-b" }],
    }, [target, missingTarget]);

    assert(completed.join(",") === "open-b", "missing opening target keys should complete immediately");
    assert(layer.ghosts.length === 1, "usable opening targets should still render ghost visuals");
    controller.complete(makeState(completed), target, layer.ghosts[0]);
    assert(completed.join(",") === "open-b,open-a", "usable opening target should complete after its animation");
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    controller.start(makeState(completed), [{
      ...makeTarget(),
      targetStageLayoutRect: { height: 64, left: 100, top: 120, width: 64 },
    }]);

    assert(layer.ghosts.length === 1, "stage layout opening targets should not require a client target rect");
    controller.clear();
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    const openingTarget = makeTarget();
    controller.start(makeState(completed), [openingTarget]);
    const ghost = layer.ghosts[0];
    const initialXTarget = getBaseAnimation(ghost, "x")?.to;
    const initialYTarget = getBaseAnimation(ghost, "y")?.to;
    const turnedPageTarget = {
      ...openingTarget,
      targetStageLayoutRect: { height: 64, left: 500, top: 520, width: 64 },
    };

    motionRuntime.step(0.016);

    assert(initialXTarget === 132, "current opening ghost should target the page slot captured at start");
    assert(getBaseAnimation(ghost, "x")?.to === initialXTarget, "current opening ghost should keep its initial x target after a folder page turn");
    assert(getBaseAnimation(ghost, "y")?.to === initialYTarget, "current opening ghost should keep its initial y target after a folder page turn");
    assert(
      getBaseAnimation(ghost, "x")?.to !== turnedPageTarget.targetStageLayoutRect.left + turnedPageTarget.targetStageLayoutRect.width / 2,
      "current opening ghost should not retarget to the new visual page slot"
    );
    controller.clear();
    motionRuntime.reset();
  }

  {
    const completed = [];
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    controller.start(makeState(completed), [makeTarget()]);
    controller.clear({
      completeControllerKeys: false,
      restorePageTrack: false,
      reveal: false,
    });

    assert(completed.join(",") === "", "interrupt clear should not complete opening controller keys");
    assert(layer.iconNode.visible === false, "interrupt clear should not reveal real icon nodes");
    assert(layer.pageTrack.visible === false, "interrupt clear should not restore the page track");
    assert(layer.ghosts.length === 0, "interrupt clear should still remove opening ghost visuals");
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    controller.start(makeState(completed), [makeTarget()]);
    const released = controller.releaseGhost("app-1");

    assert(released, "release should return the matching opening ghost");
    assert(!released.destroyed, "release should not destroy the ghost handed to closing");
    assert(layer.ghosts.length === 0, "release should remove the ghost from the opening layer");
    assert(!layer.folderHandoff.hasOpeningGhost("app-1"), "release should clear the active opening item id");
    assert(completed.join(",") === "", "release should not complete the opening controller key");
    assert(timerHost.size === 0, "release should clear the fallback timer when no opening ghosts remain");
    assert(motionRuntime.getChannel(released, "x")?.base?.size === 1, "release should keep opening ghost x spring available for closing retarget");
    assert(motionRuntime.getChannel(released, "y")?.base?.size === 1, "release should keep opening ghost y spring available for closing retarget");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const firstTarget = makeTarget("app-1");
    const secondTarget = makeTarget("app-2");
    layer.iconNodes.set("app-2", { alpha: 1, item: { id: "app-2" }, visible: true });
    controller.start(makeState(completed), [firstTarget, secondTarget]);
    const released = controller.releaseGhost("app-1");

    assert(released?.item?.id === "app-1", "release should return the requested ghost");
    assert(layer.ghosts.length === 1 && layer.ghosts[0].item.id === "app-2", "release should keep unrelated opening ghosts active");
    assert(layer.folderHandoff.hasOpeningGhost("app-2"), "release should preserve unrelated active opening item ids");
    assert(timerHost.size === 1, "release should keep the fallback timer while another opening ghost remains");
    assert(completed.join(",") === "", "release should not complete unrelated opening keys");
    controller.clear();
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const sessionToken = beginReadyOpenSession(layer);
    setReducedMotionForTests(true);
    try {
      layer.iconNodes.set("app-2", { alpha: 1, item: { id: "app-2" }, visible: true });
      controller.start(makeState(completed), [
        { ...makeTarget("app-1"), controllerGhostKey: "open-a" },
        { ...makeTarget("app-2"), controllerGhostKey: "open-b" },
      ], { sessionToken });
      assert(completed.join(",") === "open-a,open-b", "synchronous reduced-motion completion should notify every controller key");
      assert(layer.folderHandoff.getOpeningGhostKeys().size === 0, "synchronous reduced-motion completion should clear the active item id");
      assert(layer.ghosts.length === 0, "synchronous reduced-motion completion should not leave opening ghost visuals");
      assert(timerHost.size === 0, "synchronous reduced-motion completion should clear the fallback timer");
    } finally {
      clearMotionPreferencesForTests();
      motionRuntime.reset();
    }
  }
}
