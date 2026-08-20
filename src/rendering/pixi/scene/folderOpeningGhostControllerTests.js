import { motionRuntime } from "../animation/motionRuntime.js";
import {
  clearMotionPreferencesForTests,
  setReducedMotionForTests,
} from "../animation/motionPreferences.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { FolderVisualSession } from "./folderVisualSession.js";
import {
  VisualOwnershipRegistry as FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
} from "./visualOwnershipRegistry.js";

function makeTimerHost() {
  let nextId = 1;
  const recorded = new Map();
  const timers = new Map();
  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    runAll() {
      const pending = Array.from(timers.entries());
      for (const [id, callback] of pending) {
        if (!timers.delete(id)) continue;
        callback();
      }
    },
    runRecorded(id) {
      recorded.get(id)?.();
    },
    setTimeout(callback) {
      const id = nextId++;
      timers.set(id, callback);
      recorded.set(id, callback);
      return id;
    },
    get recordedIds() {
      return Array.from(recorded.keys());
    },
    get size() {
      return timers.size;
    },
  };
}

function makePoint(x = 0, y = x) {
  return {
    x,
    y,
    set(nextX, nextY = nextX) {
      this.x = nextX;
      this.y = nextY;
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
    labelText: { alpha: 1, scale: makePoint(1), visible: true },
    position: makePoint(),
    scale: makePoint(1),
    destroy() {
      this.destroyed = true;
    },
    removeFromParent() {
      this.parent?.removeChild?.(this);
    },
    setState(state) {
      this.item = state.item;
      this.state = state;
    },
  };
}

function makeChildLayer() {
  const children = [];
  return {
    children,
    addChild(child) {
      child.parent?.removeChild?.(child);
      child.parent = this;
      children.push(child);
      return child;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (child.parent === this) child.parent = null;
      return child;
    },
    removeChildren() {
      const removed = children.splice(0);
      for (const child of removed) {
        if (child.parent === this) child.parent = null;
      }
      return removed;
    },
  };
}

function makeHarness() {
  const calls = [];
  const frameGhostCalls = [];
  const frameRetargetCalls = [];
  const openingGhostLayer = makeChildLayer();
  const timerHost = makeTimerHost();
  const visualOwnership = new FolderVisualOwnershipRegistry();
  const iconNodes = new Map([
    ["app-1", { alpha: 1, item: { id: "app-1" }, state: { source: { folderId: "folder-1" } }, visible: true }],
    ["app-2", { alpha: 1, item: { id: "app-2" }, state: { source: { folderId: "folder-1" } }, visible: true }],
  ]);
  const layer = {
    calls,
    currentFolderId: "folder-1",
    frameGhost: { alpha: 0, visible: false },
    frameGhostCalls,
    frameRetargetCalls,
    iconNodes,
    lastOpeningBoundsTarget: null,
    openingGeometryActive: false,
    openingGhostBoundsRefreshers: new Map(),
    openingGhostLayer,
    pageTrack: { visible: true },
    panelMaterial: { alpha: 0, visible: false },
    visualOwnership,
    acquireDesktopSourceOwnership(owner) {
      return this.acquireVisualOwnership(makeDesktopSourceVisualKey(owner.folderId), owner);
    },
    acquireVisualOwnership(key, owner) {
      return visualOwnership.acquire(key, owner);
    },
    clearFrameGhost() {
      calls.push("clear-frame");
      this.frameGhost.visible = false;
      this.frameGhost.alpha = 0;
    },
    getCurrentFolderId() {
      return this.currentFolderId;
    },
    getIconNodeVisualKey(node, fallbackFolderId = null) {
      return makeFolderIconVisualKey(node.state?.source?.folderId || fallbackFolderId, node.item?.id);
    },
    hideIconNodesForTransition(itemId, owner) {
      const node = iconNodes.get(itemId);
      if (!node) return;
      this.acquireVisualOwnership(this.getIconNodeVisualKey(node, owner.folderId), owner);
      node.visible = false;
    },
    isOpeningGeometryTransitionActive() {
      return this.openingGeometryActive;
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    refreshRegisteredIconBounds() {
      calls.push("refresh-bounds");
    },
    registerOpeningGhostBounds(_state, target) {
      this.lastOpeningBoundsTarget = target;
    },
    releaseTransitionOwnership(token, options = {}) {
      visualOwnership.releaseByToken(token);
      if (options.restorePageTrack !== false) this.pageTrack.visible = true;
      if (options.reveal !== false) {
        for (const node of iconNodes.values()) {
          node.visible = true;
          node.alpha = 1;
        }
      }
    },
    removeOpeningGhost(ghost) {
      return openingGhostLayer.removeChild(ghost);
    },
    retargetFrameGhost(toRect, options) {
      frameRetargetCalls.push({ options, toRect });
      return true;
    },
    startFrameGhost(fromRect, toRect, options) {
      frameGhostCalls.push({ fromRect, options, toRect });
      this.frameGhost.visible = true;
      this.frameGhost.alpha = 1;
      this.panelMaterial.visible = options.exclusivePanelMaterialHandoff !== true;
      this.panelMaterial.alpha = this.panelMaterial.visible ? 1 : 0;
      return true;
    },
  };
  const controller = new FolderOpeningGhostController(layer, {
    ghostFactory: makeGhost,
    scheduler: timerHost,
  });
  const session = new FolderVisualSession({
    openingAdapter: controller,
    ownershipRevision: () => visualOwnership.getRevision(),
  });
  return { calls, controller, layer, session, timerHost, visualOwnership };
}

function makeState(completed = [], overrides = {}) {
  return {
    completeFolderOpenIconGhost: (key) => completed.push(key),
    folderOpenIconGhosts: [],
    folderPageIndex: 0,
    folderPageSize: 9,
    getFolderOpenIconGhostKey: (_itemId, index) => `controller-open-${index}`,
    height: 800,
    isTextlessMode: false,
    launchTargetStatusById: {},
    renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
    showMissingLaunchTargetBadge: false,
    stageRect: { left: 0, top: 0 },
    width: 1200,
    ...overrides,
  };
}

function makeTarget(id = "app-1", index = 0, overrides = {}) {
  return {
    cellHeight: 80,
    cellWidth: 80,
    columnCount: 3,
    controllerGhostKey: `controller-${id}`,
    iconSize: 64,
    index,
    item: { id, type: "app" },
    pageIndex: 0,
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 64, left: 100 + index * 80, top: 120, width: 64 },
    ...overrides,
  };
}

function presentOpen(harness, targets = [makeTarget()], state = makeState(), options = {}) {
  const lease = harness.session.open({
    folderId: state.renderedFolder.id,
    forceNew: options.forceNew,
    targetKey: options.targetKey || "target-a",
  });
  const report = lease.present({
    options: options.adapterOptions || {},
    state,
    targets,
  });
  return { lease, report };
}

function advanceMotion(seconds = 3) {
  for (let remaining = seconds; remaining > 0; remaining -= 0.05) {
    motionRuntime.step(Math.min(0.05, remaining));
  }
}

export function runFolderOpeningGhostControllerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder opening ghost controller test failed] ${message}`);
  };

  {
    const harness = makeHarness();
    let thrown = null;
    try {
      harness.controller.start({ state: makeState(), targets: [] }, {
        ghostsReady() {},
        owner: () => ({ folderId: "folder-1", kind: "opening", token: "owner-a" }),
      });
    } catch (error) {
      thrown = error;
    }
    assert(/fail/.test(String(thrown)), "opening adapter setup should reject reporters missing required capabilities");
  }

  {
    const expected = new Error("opening ghost construction failed");
    const harness = makeHarness();
    harness.controller.ghostFactory = () => {
      throw expected;
    };
    let thrown = null;
    try {
      presentOpen(harness, [makeTarget()]);
    } catch (error) {
      thrown = error;
    }
    assert(thrown === expected, "opening adapter start failures should propagate unchanged");
    assert(!harness.controller.snapshot().active, "failed opening startup should release the controller reporter");
    assert(harness.layer.openingGhostLayer.children.length === 0, "failed opening startup should not leave orphan ghosts");
    assert(!harness.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "failed opening startup should release source ownership before Session receives a scope");
  }

  {
    const harness = makeHarness();
    const prepared = harness.controller.prepare({
      targets: [makeTarget(), makeTarget("app-2", 1, { targetStageLayoutRect: null })],
    });
    assert(prepared.ghostIds.join(",") === "app-1", "prepare should publish only usable opening participants");
  }

  {
    const harness = makeHarness();
    const state = makeState([], {
      acceptFolderOpenIconGhostSession: () => false,
      folderOpenIconGhosts: [{ key: "staged", requestId: 21 }],
    });
    const { lease, report } = presentOpen(harness, [makeTarget()], state);

    assert(report.status === "stale" && !lease.isCurrent(), "a synchronously rejected staged session should retire its lease");
    assert(lease.snapshot().error instanceof Error, "staged-session rejection should be an observable failure");
    assert(harness.layer.openingGhostLayer.children.length === 0, "rejected sessions should not mount orphan visuals");
    assert(!harness.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "rejected sessions should not retain desktop source ownership");
  }

  {
    const completed = [];
    const frameCompletions = [];
    const harness = makeHarness();
    const state = makeState(completed, {
      completeFolderOpenFrameGhost: (folderId, requestId) => frameCompletions.push(`${folderId}:${requestId}`),
      folderOpenIconGhosts: [{ key: "controller-app-1", requestId: 7 }],
    });
    const { lease } = presentOpen(harness, [makeTarget()], state, {
      adapterOptions: {
        frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
        frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
      },
    });

    assert(harness.layer.openingGhostLayer.children.length === 1, "present should install one opening ghost");
    assert(!harness.layer.iconNodes.get("app-1").visible, "present should hide the real icon while its substitute owns the visual");
    assert(harness.visualOwnership.getOwner(makeDesktopSourceVisualKey("folder-1"))?.kind === "opening", "opening should own the desktop source through its lease-bound owner");
    assert(harness.layer.frameGhostCalls.length === 1, "opening should install one frame shell morph");
    assert(harness.layer.frameGhostCalls[0].options.frameGhostPhase === "opening", "the frame shell should carry its opening phase");
    assert(harness.layer.frameGhostCalls[0].options.exclusivePanelMaterialHandoff, "frame and panel material should have one exclusive shell owner");
    harness.layer.frameGhostCalls[0].options.onArrive();
    assert(frameCompletions.join(",") === "folder-1:7", "frame arrival should complete the current request identity");

    advanceMotion();
    assert(lease.snapshot().ghostsReady, "ghost arrival should report readiness through the opening reporter");
    assert(lease.snapshot().revealPending, "ghost readiness should remain gated until panel geometry is ready");
    assert(harness.layer.openingGhostLayer.children.length === 1, "the settled substitute should remain mounted while panel readiness is pending");
    lease.panelReady();
    assert(lease.snapshot().revealed, "panel readiness should complete the two-party reveal gate");
    assert(completed.join(",") === "controller-app-1", "reveal should complete the controller key once");
    assert(harness.layer.openingGhostLayer.children.length === 0 && harness.layer.iconNodes.get("app-1").visible, "reveal should atomically replace substitutes with real icons");
    assert(!harness.visualOwnership.hasOwner(makeDesktopSourceVisualKey("folder-1")), "reveal should release desktop source ownership");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const harness = makeHarness();
    const { lease } = presentOpen(harness, [makeTarget()], makeState(completed));
    lease.panelReady();
    harness.controller.complete(makeState(completed), makeTarget(), harness.layer.openingGhostLayer.children[0]);

    assert(lease.snapshot().revealed, "ghost readiness arriving after panel readiness should reveal through the same gate");
    assert(completed.join(",") === "controller-app-1", "manual ghost arrival should complete its controller key only at reveal");
    assert(harness.timerHost.size === 0, "reveal should disarm the geometry watchdog");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const harness = makeHarness();
    const { lease } = presentOpen(harness, [makeTarget()], makeState(completed));
    lease.panelReady();
    harness.timerHost.runAll();

    assert(lease.snapshot().revealed, "the opening watchdog should settle geometry and enter the normal reveal gate");
    assert(completed.join(",") === "controller-app-1", "watchdog settlement should still complete controller ownership once");
    assert(harness.layer.openingGhostLayer.children.length === 0, "watchdog settlement should not leave substitute visuals behind");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const harness = makeHarness();
    const target = makeTarget();
    const { lease } = presentOpen(harness, [target], makeState(completed), {
      adapterOptions: {
        frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
        frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
      },
    });
    const ghost = harness.layer.openingGhostLayer.children[0];
    const firstControl = harness.controller.motionControlsByItemId.get("app-1");
    const nextTarget = makeTarget("app-1", 0, {
      iconSize: 32,
      pageIndex: 1,
      targetStageLayoutRect: { height: 64, left: 500, top: 520, width: 64 },
    });
    lease.present({
      options: { frameTargetRect: { height: 480, left: 180, top: 140, width: 800 } },
      state: makeState(completed),
      targets: [nextTarget],
    });

    const secondControl = harness.controller.motionControlsByItemId.get("app-1");
    assert(harness.layer.openingGhostLayer.children[0] === ghost, "retarget should preserve the opening ghost object");
    assert(firstControl !== secondControl, "retarget should replace motion ownership instead of accumulating controls");
    assert(ghost.state.iconSize === 32 && ghost.openingPageIndex === 1, "retarget should refresh icon metrics and page identity");
    assert(harness.layer.frameRetargetCalls[0].toRect.height === 480, "retarget should update the active opening frame shell");
  assert(harness.controller.snapshot().motionControlCount === 1, "the controller should expose bounded local motion ownership to its own tests");
    harness.layer.openingGhostBoundsRefreshers.get("app-1")?.();
    assert(harness.layer.lastOpeningBoundsTarget === nextTarget, "bounds refresh should follow the current retarget plan");
    const timerIds = harness.timerHost.recordedIds;
    assert(timerIds.length >= 2, "retarget should replace the watchdog generation");
    harness.timerHost.runRecorded(timerIds[0]);
    assert(lease.isCurrent() && lease.snapshot().ghostIds.includes("app-1"), "a stale watchdog callback must not settle a retargeted lease");
    lease.cancel({ completeControllerKeys: false, restorePageTrack: false, reveal: false });
    motionRuntime.reset();
  }

  {
    const completed = [];
    const harness = makeHarness();
    harness.layer.openingGeometryActive = true;
    const state = makeState(completed);
    const target = makeTarget();
    const { lease } = presentOpen(harness, [target], state);
    lease.panelReady();
    harness.controller.complete(state, target, harness.layer.openingGhostLayer.children[0]);

    assert(!lease.snapshot().ghostsReady, "active resize geometry should keep an arrived ghost behind the geometry gate");
    assert(harness.layer.openingGhostLayer.children.length === 1, "geometry-gated arrival should retain its substitute for future retargeting");
    harness.layer.openingGeometryActive = false;
    lease.present({ state, targets: [target] });
    assert(lease.snapshot().revealed, "ending the geometry transition should release already-settled ghosts through the normal gate");
    assert(completed.join(",") === "controller-app-1", "geometry gate release should complete controller ownership once");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const harness = makeHarness();
    const provisional = makeTarget("app-1", 0, { provisionalLayoutTarget: true });
    const { lease } = presentOpen(harness, [provisional], makeState(completed));
    lease.panelReady();
    advanceMotion();

    assert(!lease.snapshot().ghostsReady && harness.layer.openingGhostLayer.children.length === 1, "a provisional target must retain visual ownership after arrival");
    lease.present({
      state: makeState(completed),
      targets: [{ ...provisional, provisionalLayoutTarget: false }],
    });
    advanceMotion();
    assert(lease.snapshot().revealed, "a final target should settle the retained provisional ghost");
    assert(completed.join(",") === "controller-app-1", "final target settlement should complete the staged key");
    motionRuntime.reset();
  }

  {
    const harness = makeHarness();
    const { lease } = presentOpen(harness);
    lease.cancel({ completeControllerKeys: false, restorePageTrack: false, reveal: false });

    assert(!harness.layer.iconNodes.get("app-1").visible, "non-reveal cancellation should not expose stale real icons");
    assert(harness.layer.openingGhostLayer.children.length === 0, "cancellation should remove opening substitutes");
    assert(!lease.isCurrent() && harness.session.snapshot().opening === null, "cancellation should retire opening identity at the Session boundary");
    motionRuntime.reset();
  }

  {
    const completed = [];
    const harness = makeHarness();
    setReducedMotionForTests(true);
    try {
      const { lease } = presentOpen(harness, [
        makeTarget("app-1", 0),
        makeTarget("app-2", 1),
      ], makeState(completed));
      lease.panelReady();
      assert(lease.snapshot().revealed, "synchronous reduced-motion ghosts should still pass through the reveal gate");
      assert(completed.join(",") === "controller-app-1,controller-app-2", "synchronous completion should flush every staged controller key once");
  assert(harness.controller.snapshot().motionControlCount === 0, "synchronous completion should not register stale controller motion controls");
    } finally {
      clearMotionPreferencesForTests();
      motionRuntime.reset();
    }
  }
}
