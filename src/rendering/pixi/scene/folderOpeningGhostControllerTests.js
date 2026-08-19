import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { FolderVisualSession as FolderHandoffCoordinator } from "./folderVisualSession.js";
import {
  VisualOwnershipRegistry as FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
} from "./visualOwnershipRegistry.js";
import { motionRuntime } from "../animation/motionRuntime.js";
import {
  clearMotionPreferencesForTests,
  setReducedMotionForTests,
} from "../animation/motionPreferences.js";

function makeTimerHost() {
  let nextId = 1;
  const timers = new Map();
  const recordedTimers = new Map();
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
    runRecorded(id) {
      recordedTimers.get(id)?.();
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      recordedTimers.set(id, callback);
      return id;
    },
    get recordedIds() {
      return Array.from(recordedTimers.keys());
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
    removeFromParent() {
      this.parent?.removeChild?.(this);
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
  const frameRetargetCalls = [];
  const iconNode = { alpha: 1, item: { id: "app-1" }, state: { source: { folderId: "folder-1", pageIndex: 0 } }, visible: true };
  const visualOwnership = new FolderVisualOwnershipRegistry();
  return {
    calls,
    currentFolderId: "folder-1",
    frameGhostCalls,
    frameRetargetCalls,
    frameGhost: { alpha: 1, visible: true },
    iconNodes: new Map([["app-1", iconNode]]),
    lastOpeningBoundsTarget: null,
    openingGhostBoundsRefreshers: new Map(),
    openingGhostLayer: {
      children: ghosts,
      addChild(ghost) {
        ghost.parent?.removeChild?.(ghost);
        ghost.parent = this;
        ghosts.push(ghost);
        return ghost;
      },
      removeChild(ghost) {
        const index = ghosts.indexOf(ghost);
        if (index >= 0) ghosts.splice(index, 1);
        if (ghost.parent === this) ghost.parent = null;
        return ghost;
      },
      removeChildren() {
        const removed = ghosts.splice(0);
        for (const ghost of removed) {
          if (ghost.parent === this) ghost.parent = null;
        }
        return removed;
      },
    },
    pageTrack: { visible: true },
    panelMaterial: { alpha: 0, visible: false },
    visualOwnership,
    acquireDesktopSourceOwnership(owner = {}) {
      const key = makeDesktopSourceVisualKey(owner.folderId || this.currentFolderId);
      return key ? this.acquireVisualOwnership(key, owner) : false;
    },
    acquireVisualOwnership(key, owner) {
      return this.visualOwnership.acquire(key, owner);
    },
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    getIconNodeVisualKey(node, fallbackFolderId = null) {
      return makeFolderIconVisualKey(
        node?.state?.source?.folderId || fallbackFolderId || this.currentFolderId,
        node?.item?.id
      );
    },
    getCurrentFolderId() {
      return this.currentFolderId || null;
    },
    isOpeningGeometryTransitionActive() {
      return false;
    },
    startFrameGhost(fromRect, toRect, options) {
      frameGhostCalls.push({ fromRect, options, toRect });
      this.panelMaterial.visible = options.exclusivePanelMaterialHandoff === true ? false : true;
      this.panelMaterial.alpha = options.exclusivePanelMaterialHandoff === true ? 0 : options.panelMaterialFromAlpha ?? 0;
      this.frameGhost.visible = true;
      this.frameGhost.alpha = options.frameGhostFromAlpha ?? 1;
      return true;
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    refreshRegisteredIconBounds() {
      calls.push("refresh-bounds");
    },
    retargetFrameGhost(toRect, options) {
      frameRetargetCalls.push({ options, toRect });
      return true;
    },
    registerOpeningGhostBounds(_state, target) {
      this.lastOpeningBoundsTarget = target;
      return target;
    },
    removeOpeningGhost(ghost) {
      this.openingGhostLayer.removeChild(ghost);
      return ghost;
    },
    hideIconNodesForTransition(itemId, owner = {}) {
      for (const node of this.iconNodes.values()) {
        if (node.item?.id !== itemId) continue;
        const key = this.getIconNodeVisualKey(node, owner.folderId);
        if (key) this.acquireVisualOwnership(key, owner);
        node.visible = false;
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
      this.visualOwnership.releaseByToken(_token);
      if (options.reveal !== false) this.revealIconNodes();
      if (options.restorePageTrack !== false) this.pageTrack.visible = true;
    },
    releaseIconNodesForTransition(itemId, token, options = {}) {
      let released = 0;
      for (const node of this.iconNodes.values()) {
        if (node.item?.id !== itemId) continue;
        const key = this.getIconNodeVisualKey(node);
        if (!this.visualOwnership.release(key, token)) continue;
        released += 1;
        if (options.reveal !== false && !this.visualOwnership.hasOwner(key)) {
          node.visible = true;
          node.alpha = 1;
        }
      }
      return released;
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
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const state = {
      ...makeState(completed),
      acceptFolderOpenIconGhostSession: () => false,
      folderOpenIconGhosts: [{ key: "stale-open", requestId: 21 }],
      renderedFolder: { id: "folder-2" },
    };

    assert(controller.start(state, [makeTarget()]) === false, "stale staged opening sessions should be rejected before visual ownership changes");
    assert(layer.ghosts.length === 0, "rejected opening sessions should not mount ghost visuals");
    assert(!layer.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-2")), "rejected opening sessions should not hide the desktop source");
  }

  {
    const completed = [];
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: () => {
        const ghost = makeGhost();
        ghost.labelText = {
          alpha: 1,
          scale: {
            set(x, y = x) {
              this.x = x;
              this.y = y;
            },
            x: 1,
            y: 1,
          },
          visible: true,
        };
        return ghost;
      },
      scheduler: timerHost,
    });
    const sessionToken = layer.folderHandoff.beginOpen("folder-1", "target-a", { forceNew: true }).session.token;
    const target = {
      ...makeTarget(),
      columnCount: 7,
      index: 9,
      isThumbnailChild: false,
      sourceRect: { height: 8, left: 10, top: 20, width: 8 },
    };

    controller.start(makeState(completed), [target], { sessionToken });
    const ghost = layer.ghosts[0];
    assert(ghost.alpha === 0, "synthetic opening ghosts should start fully transparent");

    motionRuntime.step(0.06);

    assert(ghost.scale.x < 0.25, "collapsed synthetic opening ghosts should still be near thumbnail scale");
    assert(ghost.alpha <= 0.001, "collapsed synthetic opening ghosts should remain transparent instead of forming a visible pile");
    assert(ghost.labelText.alpha === 0, "synthetic labels should remain transparent while their icons are collapsed");

    let previousAlpha = ghost.alpha;
    for (let index = 0; index < 40; index += 1) {
      motionRuntime.step(0.05);
      assert(ghost.alpha + 0.0001 >= previousAlpha, "synthetic opening ghost alpha should remain monotonic while the spring settles");
      previousAlpha = ghost.alpha;
    }
    assert(ghost.alpha === 1, "synthetic opening ghosts should finish fully opaque");
    assert(ghost.labelText.alpha === 1 && ghost.labelText.scale.x === 1, "synthetic labels should finish fully visible with their icons");

    controller.clear();
    motionRuntime.reset();
  }

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
    assert(layer.pageTrack.visible === true, "start should keep the page track visible during opening");
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

    assert(layer.folderHandoff.getOpeningGhostKeys().size === 1, "complete should keep ghost item ids while reveal is gated");
    assert(layer.iconNode.visible === false, "ghost completion before panel ready should keep the real icon hidden");
    assert(layer.pageTrack.visible === true, "ghost completion before panel ready should keep the page track visible");
    assert(layer.ghosts.length === 1, "ghost completion before panel ready should keep completed ghost visuals mounted");
    assert(
      layer.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-1"), session.token),
      "ghost completion before panel ready should keep desktop source ownership until reveal"
    );

    layer.folderHandoff.markPanelReady(session.token);
    controller.finishTransition({ sessionToken: session.token });
    assert(layer.iconNode.visible === true, "panel ready after ghosts should keep real icons visible");
    assert(layer.pageTrack.visible === true, "panel ready after ghosts should leave the page track visible");
    assert(layer.ghosts.length === 0, "panel ready after ghosts should keep completed ghost visuals removed");
    assert(!layer.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "panel ready after ghosts should release desktop source ownership");
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
    const timerHost = makeTimerHost();
    const layer = makeLayer();
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: timerHost,
    });
    const openingTarget = makeTarget();
    controller.start(makeState(completed), [openingTarget]);
    const ghost = layer.ghosts[0];
    const initialXAnimation = getBaseAnimation(ghost, "x");
    const initialYTarget = getBaseAnimation(ghost, "y")?.to;
    const initialControl = layer.folderHandoff.getOpeningMotionControl("app-1");
    const turnedPageTarget = {
      ...openingTarget,
      iconSize: 32,
      pageIndex: 1,
      targetStageLayoutRect: { height: 64, left: 500, top: 520, width: 64 },
    };

    motionRuntime.step(0.016);
    const scaleBeforeMetricRetarget = ghost.scale.x;

    assert(initialXAnimation?.to === 132, "opening ghost should target the page slot captured at start");
    assert(initialXAnimation?.driver?.config?.stiffness === 340, "initial opening ghost motion should keep the existing handoff spring");
    assert(controller.retarget(makeState(completed), [turnedPageTarget]) === 1, "folder page turn should retarget the active opening ghost");
    const [staleTimerId, currentTimerId] = timerHost.recordedIds;
    assert(staleTimerId != null && currentTimerId != null, "retarget should bind a new fallback timer to the target generation");
    timerHost.runRecorded(staleTimerId);
    assert(layer.folderHandoff.hasOpeningGhost("app-1"), "a stale opening target timer must not clear the retargeted visual session");
    assert(layer.ghosts.length === 1, "retarget should reuse the existing opening ghost visual");
    assert(ghost.state.iconSize === 32, "retarget should refresh the opening ghost visual metrics when row growth changes icon size");
    assert(ghost.scale.x > scaleBeforeMetricRetarget, "retarget should compensate scale so an icon-size change does not snap the visible ghost size");
    assert(layer.folderHandoff.getOpeningMotionControl("app-1") !== initialControl, "retarget should replace the tracked motion control");
    assert(getBaseAnimation(ghost, "x")?.to === 532, "opening ghost should retarget x to the new visual page slot");
    assert(getBaseAnimation(ghost, "y")?.to !== initialYTarget, "opening ghost should retarget y to the new visual page slot");
    assert(getBaseAnimation(ghost, "x")?.driver?.config?.stiffness === 190, "retargeted opening ghost position should use the pageTrack layout spring");
    assert(controller.retarget(makeState(completed), [turnedPageTarget]) === 0, "unchanged opening ghost targets should not restart retarget motion");
    layer.openingGhostBoundsRefreshers.get("app-1")?.();
    assert(layer.lastOpeningBoundsTarget === turnedPageTarget, "retarget should replace the opening ghost bounds refresher target");
    for (let index = 0; index < 40; index += 1) motionRuntime.step(0.05);
    assert(completed.join(",") === "controller-open-key", "retargeted opening ghost should still complete the controller ghost key");
    assert(!layer.folderHandoff.hasOpeningGhost("app-1"), "retargeted opening ghost completion should clear the active item id");
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
    const sessionToken = beginReadyOpenSession(layer);
    const provisionalTarget = {
      ...makeTarget(),
      provisionalLayoutTarget: true,
    };
    controller.start(makeState(completed), [provisionalTarget], { sessionToken });
    const ghost = layer.ghosts[0];

    for (let index = 0; index < 50; index += 1) motionRuntime.step(0.05);

    assert(completed.join(",") === "", "provisional opening targets should not complete controller ghosts");
    assert(layer.folderHandoff.hasOpeningGhost("app-1"), "provisional opening targets should keep visual ownership active");
    assert(layer.iconNode.visible === false, "provisional opening targets should keep the real icon hidden");
    assert(layer.ghosts[0] === ghost, "provisional opening targets should keep the ghost visual mounted");

    assert(controller.retarget(makeState(completed), [{ ...provisionalTarget, provisionalLayoutTarget: false }]) === 1, "final opening target should retarget even when only the provisional flag changes");
    for (let index = 0; index < 50; index += 1) motionRuntime.step(0.05);

    assert(completed.join(",") === "controller-open-key", "final opening target should complete the controller ghost");
    assert(!layer.folderHandoff.hasOpeningGhost("app-1"), "final opening target should release visual ownership");
    assert(layer.iconNode.visible === true, "final opening target should reveal the real icon");
    assert(layer.ghosts.length === 0, "final opening target should remove the ghost visual");
    controller.clear();
    motionRuntime.reset();
  }

  {
    const completed = [];
    const layer = makeLayer();
    layer.openingGeometryActive = true;
    layer.isOpeningGeometryTransitionActive = () => layer.openingGeometryActive;
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    const sessionToken = beginReadyOpenSession(layer);
    const state = makeState(completed);
    const target = makeTarget();
    controller.start(state, [target], { sessionToken });
    const ghost = layer.ghosts[0];

    for (let index = 0; index < 50; index += 1) motionRuntime.step(0.05);

    assert(completed.join(",") === "", "final opening targets should not complete while opening resize geometry is active");
    assert(layer.folderHandoff.hasOpeningGhost("app-1"), "opening resize geometry should keep visual ownership active after ghost arrival");
    assert(layer.iconNode.visible === false, "opening resize geometry should keep the real icon hidden after ghost arrival");
    assert(layer.ghosts[0] === ghost, "opening resize geometry should keep the arrived ghost mounted for later retargets");

    layer.openingGeometryActive = false;
    controller.retarget(state, [target]);

    assert(completed.join(",") === "controller-open-key", "settled opening ghosts should complete after opening resize geometry ends");
    assert(!layer.folderHandoff.hasOpeningGhost("app-1"), "settled opening ghosts should release visual ownership after resize geometry ends");
    assert(layer.iconNode.visible === true, "settled opening ghosts should reveal the real icon after resize geometry ends");
    assert(layer.ghosts.length === 0, "settled opening ghosts should unmount after resize geometry ends");
    controller.clear();
    motionRuntime.reset();
  }

  {
    const completed = [];
    const layer = makeLayer();
    layer.openingGeometryActive = true;
    layer.isOpeningGeometryTransitionActive = () => layer.openingGeometryActive;
    const controller = new FolderOpeningGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: makeTimerHost(),
    });
    const sessionToken = beginReadyOpenSession(layer);
    controller.start(makeState(completed), [], { sessionToken });

    assert(layer.folderHandoff.activeOpenSession?.revealed === true, "targetless opening should reveal even while resize geometry reports active");
    assert(!layer.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "targetless opening should release desktop source ownership immediately");
    assert(layer.iconNode.visible === true, "targetless opening should leave real icons visible after reveal");
    controller.clear();
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
    const sessionToken = beginReadyOpenSession(layer);
    const target = makeTarget();
    const state = {
      ...makeState(completed),
      folderOpenIconGhosts: [{ key: "controller-open-key", requestId: 12 }],
      renderedFolder: { id: "folder-1" },
      completeFolderOpenFrameGhost: (folderId, requestId) => frameCompletions.push(`${folderId}:${requestId}`),
    };
    controller.start(state, [target], {
      frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
      frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
      sessionToken,
    });

    assert(controller.retarget(state, [target], {
      frameTargetRect: { height: 480, left: 180, top: 140, width: 800 },
    }) === 1, "opening layout growth should retarget the active frame shell without restarting icon ghosts");
    assert(layer.frameRetargetCalls.length === 1, "frame shell retarget should issue exactly one geometry retarget");
    assert(layer.frameRetargetCalls[0].toRect.height === 480, "frame shell should retarget to the expanded panel height");
    assert(layer.frameRetargetCalls[0].options.frameGhostPhase === "opening", "frame shell retarget should stay in the opening phase");
    assert(layer.frameRetargetCalls[0].options.preserveOnComplete === false, "frame shell retarget should still reveal the real panel material when it completes");
    layer.frameRetargetCalls[0].options.onArrive();
    assert(frameCompletions.join(",") === "folder-1:12", "retargeted opening frame should still complete the current frame ghost request");
    assert(controller.retarget(state, [target], {
      frameTargetRect: { height: 480, left: 180, top: 140, width: 800 },
    }) === 0, "unchanged opening frame targets should not restart the shell retarget");
    controller.complete(state, target, layer.ghosts[0]);
    assert(!layer.folderHandoff.hasActiveOpeningVisuals(), "frame-only retarget setup should have no active icon ghosts after reveal");
    assert(controller.retarget(state, [], {
      frameTargetRect: { height: 520, left: 180, top: 120, width: 800 },
    }) === 1, "active opening frame shell should keep retargeting after icon ghosts finish");
    assert(layer.frameRetargetCalls.length === 2, "frame-only opening retarget should not require an active icon ghost");
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
    assert(layer.pageTrack.visible === true, "interrupt clear should leave the opening page track visible");
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
