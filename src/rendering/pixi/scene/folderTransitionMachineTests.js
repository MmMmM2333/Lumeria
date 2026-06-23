import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import {
  FolderTransitionMachine,
  makeFolderPanelTargetKey,
} from "./folderTransitionMachine.js";
import {
  FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
} from "./folderVisualOwnershipRegistry.js";

function makeGhost() {
  return {
    alpha: 0.7,
    closingComplete: false,
    destroyed: false,
    eventMode: "static",
    item: { id: "app-1" },
    labelText: { alpha: 0.4, scale: { x: 1, y: 1 }, visible: true },
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
    getIconBounds() {
      return { height: 32, left: 10, top: 20, width: 32 };
    },
    setState(state) {
      this.state = state;
    },
  };
}

function makeClosingLayer() {
  const closingGhosts = [];
  const openingGhost = makeGhost();
  const sourceKey = makeDesktopSourceVisualKey("folder-1");
  const layer = {
    calls: [],
    closingGhostLayer: {
      addChild(ghost) {
        closingGhosts.push(ghost);
      },
      removeChildren() {
        return closingGhosts.splice(0);
      },
    },
    currentFolderId: "folder-1",
    iconNodes: new Map([["app-1", { item: { id: "app-1" }, visible: false }]]),
    openingGhostKeys: new Set(["app-1"]),
    openingGhostLayer: { children: [openingGhost] },
    openingGhostSessionToken: "open-token",
    openingGhosts: {
      clear() {
        layer.releaseTransitionOwnership("open-token");
      },
      releaseGhost(itemId) {
        layer.openingGhostKeys.delete(itemId);
        return itemId === "app-1" ? openingGhost : null;
      },
    },
    pageTrack: { visible: false },
    panel: { visible: true },
    visualOwnership: new FolderVisualOwnershipRegistry(),
    acquireVisualOwnership(key, owner) {
      const acquired = this.visualOwnership.acquire(key, owner);
      if (acquired && owner?.token != null) this.ownedVisualTokens.add(owner.token);
      return acquired;
    },
    clearFrameGhost() {
      this.calls.push("clear-frame");
    },
    createClosingGhostToken(folderId = null) {
      return `closing:${folderId || ""}:test`;
    },
    enableClosingFrameMask() {
      this.calls.push("enable-mask");
    },
    hideIconNodesForTransition(itemId) {
      for (const node of this.iconNodes.values()) {
        if (node.item?.id === itemId) node.visible = false;
      }
    },
    hidePageTrackForTransition() {
      this.pageTrack.visible = false;
    },
    releaseTransitionOwnership(token) {
      this.ownerKindAtOpeningClear = this.visualOwnership.getOwner(sourceKey)?.kind || null;
      return this.visualOwnership.releaseByToken(token);
    },
    startFrameGhost(fromRect, toRect, options = {}) {
      this.frameGhostState = { ...fromRect, progress: 0 };
      this.frameGhostTarget = toRect;
      this.frameGhostOptions = options;
    },
    ownedVisualTokens: new Set(),
    get closingGhosts() {
      return closingGhosts;
    },
  };
  layer.visualOwnership.acquire(sourceKey, {
    folderId: "folder-1",
    kind: "opening",
    token: "open-token",
  });
  return { layer, sourceKey };
}

function makeState() {
  return {
    completeFolderCloseIconGhost: () => {},
    getFolderCloseIconGhostKey: () => "close-key",
    height: 800,
    isTextlessMode: false,
    renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
    stageRect: { left: 0, top: 0 },
    width: 1200,
  };
}

function makeTarget() {
  return {
    iconSize: 64,
    index: 0,
    item: { id: "app-1", type: "app" },
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 12, left: 100, top: 120, width: 12 },
  };
}

export async function runFolderTransitionMachineTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder transition machine test failed] ${message}`);
  };

  {
    const key = makeFolderPanelTargetKey("folder-1", 10.123, 20.456, { height: 300.333, width: 400.777 });
    assert(key === "folder-1:10.12:20.46:400.78:300.33", "target key should normalize folder panel geometry");
  }

  {
    const machine = new FolderTransitionMachine();
    const first = machine.beginOpen("folder-1", "target-a");
    const second = machine.beginOpen("folder-1", "target-a");

    assert(first.started, "first open should create a session");
    assert(!second.started, "same folder target should reuse the current session");
    assert(first.session.token === second.session.token, "same target reuse should preserve the token");
  }

  {
    const machine = new FolderTransitionMachine();
    const first = machine.beginOpen("folder-1", "target-a");
    machine.markPanelReady(first.session.token);
    const second = machine.beginOpen("folder-1", "target-b");

    assert(first.session.token === second.session.token, "same folder retarget should preserve the open token");
    assert(!second.session.panelReady, "unrevealed retarget should make panel readiness pending again");
  }

  {
    const machine = new FolderTransitionMachine();
    const session = machine.beginOpen("folder-1", "target-a").session;
    const snapshot = { folderId: "folder-1", layoutKey: "layout-a" };

    assert(machine.setOpenGeometrySnapshot(session.token, snapshot), "current open token should attach a geometry snapshot");
    assert(machine.getOpenGeometrySnapshot(session.token) === snapshot, "current open token should read its geometry snapshot");
    assert(machine.getOpenGeometrySnapshot("stale") === null, "stale open token should not read the current geometry snapshot");
    assert(!machine.setOpenGeometrySnapshot("stale", { layoutKey: "layout-b" }), "stale open token should not replace the geometry snapshot");
    assert(machine.getOpenGeometrySnapshot(session.token) === snapshot, "stale geometry writes should leave the current snapshot intact");

    machine.markPanelReady(session.token);
    assert(machine.setOpenGeometrySnapshot(session.token, { folderId: "folder-1", layoutKey: "layout-b" }), "layout changes should replace the geometry snapshot");
    assert(!machine.activeOpenSession.panelReady, "unrevealed layout changes should make panel readiness pending");
  }

  {
    const machine = new FolderTransitionMachine();
    const first = machine.beginOpen("folder-1", "target-a").session;
    const snapshot = { folderId: "folder-1", layoutKey: "layout-a" };
    machine.setOpenGeometrySnapshot(first.token, snapshot);
    const second = machine.beginOpen("folder-1", "target-b").session;

    assert(first.token === second.token, "same folder target changes should keep the open token");
    assert(machine.getOpenGeometrySnapshot(second.token) === null, "same folder retarget should invalidate stale geometry");
  }

  {
    const machine = new FolderTransitionMachine();
    const first = machine.beginOpen("folder-1", "target-a").session;
    const second = machine.beginOpen("folder-2", "target-b", { forceNew: true }).session;

    assert(first.token !== second.token, "new folder should get a new token");
    assert(!machine.markPanelReady(first.token), "stale token should not mark panel ready");
    assert(machine.markPanelReady(second.token), "current token should mark panel ready");
    assert(!machine.canReveal(second.token), "panel ready alone should not reveal");
    assert(machine.markGhostsReady(second.token), "current token should mark ghosts ready");
    assert(machine.canReveal(second.token), "panel and ghosts ready should allow reveal");
    assert(machine.finishReveal(second.token), "finishReveal should mark the current session revealed");
    assert(!machine.isRevealPending(), "revealed session should not block pageTrack visibility");
  }

  {
    const layer = {};
    const session = new FolderTransitionMachine(layer);
    session.beginCloseTransition("folder-a", { closeToken: "close-token" });
    session.setCloseHandoffGeometry({
      detachedTarget: { height: 20, left: 1, top: 2, width: 20 },
      rect: { height: 64, left: 10, top: 20, width: 64 },
      target: { folderId: "folder-a" },
    });
    session.trackCloseGhost({ isThumbnailChild: true, item: { id: "app-1" } }, "close-a");
    session.completeCloseFrameVisual("close-token");
    session.trackCloseGhost({ item: { id: "app-2" } }, "close-b");
    session.completeCloseGhost("close-token", "app-2");

    const snapshot = session.snapshot();
    assert(snapshot.folderId === "folder-a", "begin should store the closing folder id in the close transition");
    assert(snapshot.token === "close-token", "session should store the transition token");
    assert(snapshot.ghostKeys.has("app-1"), "close transition should track active closing ghosts");
    assert(snapshot.visualGhostKeys.has("app-1"), "close transition should track visual-critical closing ghosts");
    assert(snapshot.frameVisualComplete === true, "session should track frame visual readiness");
    assert(snapshot.handoffTarget.folderId === "folder-a", "session should store handoff target metadata");
    assert(session.consumeControllerGhostKeys().join(",") === "close-a,close-b", "session should merge pending and completed controller keys once");
  }

  {
    const session = new FolderTransitionMachine({});
    session.beginCloseTransition("folder-a", { closeToken: "close-a" });

    const staleEvents = session.completeCloseFrame("close-old");
    const snapshot = session.snapshot();

    assert(staleEvents.length === 0, "stale frame release should not emit settlement events");
    assert(snapshot.frameComplete === false, "stale frame release should not mutate the active session");
    assert(snapshot.visualPendingKeys.has("frame:visual"), "stale frame release should keep visual pending state intact");
    assert(snapshot.overlayPendingKeys.has("frame:complete"), "stale frame release should keep overlay pending state intact");
  }

  {
    const session = new FolderTransitionMachine({});
    session.beginCloseTransition("folder-a", { closeToken: "close-a" });

    const handoffEvents = session.completeCloseFrameVisual("close-a");
    const duplicateHandoffEvents = session.completeCloseFrameVisual("close-a");
    const overlayEvents = session.completeCloseFrame("close-a");
    const duplicateOverlayEvents = session.completeCloseFrame("close-a");

    assert(handoffEvents.map((event) => event.type).join(",") === "handoffReady", "visual release should emit handoff-ready once");
    assert(duplicateHandoffEvents.length === 0, "duplicate visual release should not emit handoff-ready twice");
    assert(overlayEvents.map((event) => event.type).join(",") === "overlaySettled", "frame complete should emit overlay-settled once");
    assert(duplicateOverlayEvents.length === 0, "duplicate frame complete should not emit overlay-settled twice");
  }

  {
    const { layer, sourceKey } = makeClosingLayer();
    const controller = new FolderClosingGhostController(layer, {
      ghostFactory: makeGhost,
      scheduler: {
        setTimeout: () => null,
        clearTimeout: () => {},
      },
    });
    controller.start(
      makeState(),
      [makeTarget()],
      { height: 72, left: 10, top: 20, width: 72 },
      { height: 300, left: 0, top: 0, width: 400 }
    );

    assert(layer.ownerKindAtOpeningClear === "closing", "open interrupted by close should transfer source ownership before clearing opening");
    assert(layer.visualOwnership.getOwner(sourceKey)?.kind === "closing", "token-backed closing should keep the desktop source hidden after opening clear");
    controller.clear();
    motionRuntime.reset();
  }

  {
    if (!("navigator" in globalThis)) {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { userAgent: "node.js" },
      });
    }
    const { FolderOverlayLayer } = await import("./FolderOverlayLayer.js");
    const layer = Object.create(FolderOverlayLayer.prototype);
    const calls = [];
    layer.onClosingHandoffReady = () => {};
    layer.onInternalActivityChange = () => {};
    layer.folderTransitions = new FolderTransitionMachine(layer);
    layer.folderTransitions.beginCloseTransition("folder-a");
    layer.closingGhostLayer = { removeChildren: () => [] };
    layer.closingPreviewSwapLayer = { removeChildren: () => [] };
    layer.closingGhosts = {
      clear(options) {
        calls.push(options);
      },
    };
    layer.clearDetachedClosingVisuals = () => {};
    layer.detachedClosingVisuals = [];
    layer.onClosingHandoffPrepare = () => calls.push("prepare");
    layer.pruneDetachedClosingVisuals = () => {};

    layer.detachClosingPresentationForOpen("folder-b");

    assert(layer.folderTransitions.folderId === null, "close interrupted by open should clear the live closing folder id through the transition");
    assert(calls.some((entry) => entry?.restorePageTrack === false && entry?.reveal === false), "close interrupted by open should clear closing visuals without revealing stale folder content");
  }
}
