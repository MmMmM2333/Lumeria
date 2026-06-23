import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import { FolderCloseSession } from "./folderCloseSession.js";
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
    createClosingGhostSessionToken(folderId = null) {
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

export async function runFolderCloseSessionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder close session test failed] ${message}`);
  };

  {
    const layer = {};
    const session = new FolderCloseSession(layer);
    session.begin("folder-a");
    session.setSessionToken("close-token");
    session.setHandoffGeometry({
      detachedTarget: { height: 20, left: 1, top: 2, width: 20 },
      rect: { height: 64, left: 10, top: 20, width: 64 },
      target: { folderId: "folder-a" },
    });
    session.addGhostTarget({ isThumbnailChild: true, item: { id: "app-1" } }, "close-a");
    session.releaseFrameVisual("close-token");
    session.markControllerGhostComplete("close-b");

    const snapshot = session.snapshot();
    assert(snapshot.folderId === "folder-a", "begin should store the closing folder id in the session");
    assert(snapshot.token === "close-token", "session should store the transition token");
    assert(snapshot.ghostKeys.has("app-1"), "session should track active closing ghosts");
    assert(snapshot.visualGhostKeys.has("app-1"), "session should track visual-critical closing ghosts");
    assert(snapshot.frameVisualComplete === true, "session should track frame visual readiness");
    assert(snapshot.handoffTarget.folderId === "folder-a", "session should store handoff target metadata");
    assert(session.consumeControllerGhostKeys().join(",") === "close-a,close-b", "session should merge pending and completed controller keys once");
  }

  {
    const session = new FolderCloseSession({});
    session.begin("folder-a");
    session.setSessionToken("close-a");

    const staleEvents = session.releaseFrameComplete("close-old");
    const snapshot = session.snapshot();

    assert(staleEvents.length === 0, "stale frame release should not emit settlement events");
    assert(snapshot.frameComplete === false, "stale frame release should not mutate the active session");
    assert(snapshot.visualPendingKeys.has("frame:visual"), "stale frame release should keep visual pending state intact");
    assert(snapshot.overlayPendingKeys.has("frame:complete"), "stale frame release should keep overlay pending state intact");
  }

  {
    const session = new FolderCloseSession({});
    session.begin("folder-a");
    session.setSessionToken("close-a");

    const handoffEvents = session.releaseFrameVisual("close-a");
    const duplicateHandoffEvents = session.releaseFrameVisual("close-a");
    const overlayEvents = session.releaseFrameComplete("close-a");
    const duplicateOverlayEvents = session.releaseFrameComplete("close-a");

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
    assert(layer.visualOwnership.getOwner(sourceKey)?.kind === "closing", "session-backed closing should keep the desktop source hidden after opening clear");
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
    layer.closeSession = new FolderCloseSession(layer);
    layer.closeSession.begin("folder-a");
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

    assert(layer.closeSession.folderId === null, "close interrupted by open should clear the live closing folder id through the session");
    assert(calls.some((entry) => entry?.restorePageTrack === false && entry?.reveal === false), "close interrupted by open should clear closing visuals without revealing stale folder content");
  }
}
