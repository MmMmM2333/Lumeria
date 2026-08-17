import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { FolderHandoffCoordinator } from "./folderHandoffCoordinator.js";
import {
  VisualOwnershipRegistry as FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
  makeFolderPageTrackVisualKey,
} from "./visualOwnershipRegistry.js";

function makeTimerHost() {
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  return {
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(callback) {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
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

function makePoint() {
  return {
    x: 0,
    y: 0,
    set(x, y = x) {
      this.x = x;
      this.y = y;
    },
  };
}

function makeGhost(id = "ghost") {
  return {
    alpha: 1,
    closingComplete: false,
    destroyed: false,
    eventMode: "static",
    id,
    item: null,
    labelText: {
      alpha: 1,
      scale: makePoint(),
      visible: true,
    },
    position: makePoint(),
    scale: makePoint(),
    removeFromParent() {
      this.parent?.removeChild?.(this);
    },
    destroy() {
      this.destroyed = true;
    },
    getIconBounds() {
      return {
        height: 32,
        left: this.position.x - 16,
        top: this.position.y - 16,
        width: 32,
      };
    },
    setState(state) {
      this.item = state.item;
      this.state = state;
    },
  };
}

function makeLayerList() {
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

function makeState(completed = []) {
  return {
    completeFolderCloseIconGhost: (key) => completed.push(`close:${key}`),
    completeFolderOpenIconGhost: (key) => completed.push(`open:${key}`),
    folderOpenIconGhosts: [],
    folderPageIndex: 0,
    folderPageSize: 9,
    getFolderCloseIconGhostKey: (_itemId, index) => `close-key-${index}`,
    getFolderOpenIconGhostKey: (_itemId, index) => `open-key-${index}`,
    height: 800,
    isTextlessMode: false,
    launchTargetStatusById: {},
    renderedFolder: { id: "folder-1", name: "Folder", type: "folder" },
    showMissingLaunchTargetBadge: false,
    stageRect: { left: 0, top: 0 },
    width: 1200,
  };
}

function makeTarget(id = "app-1", index = 0, pageIndex = 0) {
  return {
    cellHeight: 80,
    cellWidth: 80,
    columnCount: 3,
    controllerGhostKey: `ghost-key-${id}`,
    iconSize: 64,
    index,
    item: { id, type: "app" },
    pageIndex,
    sourceRect: { height: 32, left: 10, top: 20, width: 32 },
    targetStageLayoutRect: { height: 64, left: 100, top: 120, width: 64 },
  };
}

function makeRaceHarness() {
  const activityChanges = [];
  const calls = [];
  const closingLayer = makeLayerList();
  const openingLayer = makeLayerList();
  const timerHost = makeTimerHost();
  const visualOwnership = new FolderVisualOwnershipRegistry();
  const desktopSource = {
    item: { id: "folder-1", type: "folder" },
    visible: true,
    visualWrap: { visible: true },
  };
  const iconNode = {
    alpha: 1,
    item: { id: "app-1" },
    source: { folderId: "folder-1", pageIndex: 0 },
    visible: true,
  };
  let closeTokenCounter = 1;

  const layer = {
    activityChanges,
    calls,
    closingGhostLayer: closingLayer,
    currentFolderId: "folder-1",
    frameGhost: { alpha: 0, visible: false },
    iconNodes: new Map([["app-1", iconNode]]),
    openingGhostLayer: openingLayer,
    openingGhostBoundsRefreshers: new Map(),
    pageTrack: { visible: true },
    panel: { visible: true },
    panelMaterial: { alpha: 1, visible: true },
    visualOwnership,
    visible: true,
    acquireVisualOwnership(key, owner) {
      return visualOwnership.acquire(key, owner);
    },
    acquireDesktopSourceOwnership(owner = {}) {
      const key = makeDesktopSourceVisualKey(owner.folderId || this.currentFolderId);
      return key ? this.acquireVisualOwnership(key, owner) : false;
    },
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    clearCurrentFolder() {
      this.currentFolderId = null;
    },
    createClosingGhostToken(folderId = null) {
      const token = `close:${folderId || "folder"}:${closeTokenCounter}`;
      closeTokenCounter += 1;
      return token;
    },
    getClosingFrameStartRect(panelRect) {
      return panelRect;
    },
    getTransitionDebugSnapshot() {
      return {
        closingGhostCount: this.closingGhostLayer.children.length,
        framePresentation: this.frameGhostState || null,
        panelVisible: this.panel.visible,
        pageTrackVisible: this.pageTrack.visible,
      };
    },
    enableClosingFrameMask() {
      calls.push("enable-mask");
    },
    hideIconNodesForTransition(itemId, owner = {}) {
      for (const node of this.iconNodes.values()) {
        if (node.item?.id !== itemId) continue;
        const key = makeFolderIconVisualKey(owner.folderId || this.currentFolderId, itemId);
        if (key) this.acquireVisualOwnership(key, owner);
        node.visible = false;
      }
    },
    hidePageTrackForTransition(owner = {}) {
      const key = makeFolderPageTrackVisualKey(owner.folderId || this.currentFolderId);
      if (key) this.acquireVisualOwnership(key, owner);
      this.pageTrack.visible = false;
    },
    getCurrentFolderId() {
      return this.currentFolderId || null;
    },
    isOpeningGeometryTransitionActive() {
      return false;
    },
    registerOpeningGhostBounds() {
      calls.push("register-opening-bounds");
    },
    revealIconNodes() {
      for (const node of this.iconNodes.values()) {
        node.visible = true;
        node.alpha = 1;
      }
    },
    onClosingHandoffReady(folderId) {
      calls.push(`ready:${folderId}`);
    },
    onClosingHandoffPrepare(folderId) {
      calls.push(`prepare:${folderId}`);
      if (folderId === desktopSource.item.id) desktopSource.visualWrap.visible = false;
    },
    onClosingHandoffVisualRelease(folderId) {
      calls.push(`visual-release:${folderId}`);
      if (folderId === desktopSource.item.id) desktopSource.visualWrap.visible = true;
    },
    onInternalActivityChange(active, folderId = null) {
      activityChanges.push({ active, folderId });
    },
    rebuildPageTrackMask() {
      calls.push("rebuild-mask");
    },
    refreshRegisteredIconBounds() {
      calls.push("refresh-bounds");
    },
    removeOpeningGhost(ghost) {
      openingLayer.removeChild(ghost);
      return ghost;
    },
    releaseTransitionOwnership(token, options = {}) {
      if (token == null) return;
      const reveal = options.reveal !== false;
      const restorePageTrack = options.restorePageTrack !== false;
      const entries = visualOwnership.snapshot();
      for (const entry of entries) {
        if (entry.owner?.token !== token) continue;
        visualOwnership.release(entry.key, token);
        if (!reveal || !entry.key?.startsWith("folderIcon:")) continue;
        for (const node of this.iconNodes.values()) {
          const key = makeFolderIconVisualKey(entry.owner.folderId, node.item?.id);
          if (key === entry.key && !visualOwnership.hasOwner(key)) {
            node.visible = true;
            node.alpha = 1;
          }
        }
      }
      if (restorePageTrack && !visualOwnership.snapshot().some((entry) => entry.key?.startsWith("folderPageTrack:"))) {
        this.pageTrack.visible = true;
      }
    },
    startFrameGhost(fromRect, toRect, options = {}) {
      this.frameGhostState = { ...fromRect, progress: 0 };
      this.frameGhostOptions = options;
      this.frameGhostTarget = toRect;
      this.frameGhost.visible = true;
    },
    retargetFrameGhost(toRect, options = {}) {
      this.frameGhostTarget = toRect;
      this.frameGhostOptions = options;
      return true;
    },
    get iconNode() {
      return iconNode;
    },
  };

  layer.folderHandoff = new FolderHandoffCoordinator(layer);
  layer.openingGhosts = new FolderOpeningGhostController(layer, {
    ghostFactory: () => makeGhost("opening"),
    scheduler: timerHost,
  });
  layer.closingGhosts = new FolderClosingGhostController(layer, {
    ghostFactory: () => makeGhost("closing"),
    previewSwap: {
      clear() {
        calls.push("clear-preview");
      },
      start() {
        calls.push("start-preview");
      },
    },
    scheduler: timerHost,
  });

  return {
    activityChanges,
    calls,
    desktopSource,
    layer,
    timerHost,
    visualOwnership,
  };
}

function startOpening(harness, token = "open:folder-1") {
  harness.layer.openingGhosts.start(makeState(), [makeTarget()], {
    frameSourceRect: { height: 48, left: 10, top: 20, width: 48 },
    frameTargetRect: { height: 360, left: 180, top: 200, width: 800 },
    sessionToken: token,
  });
}

function startClosing(harness, targets = [makeTarget()], stateOverrides = {}) {
  harness.layer.closingGhosts.start(
    { ...makeState(), ...stateOverrides },
    targets,
    { height: 72, left: 10, top: 20, width: 72 },
    { height: 360, left: 180, top: 200, width: 800 }
  );
  return harness.layer.folderHandoff.closeToken;
}

function interruptCloseWithOpen(harness, token) {
  harness.layer.folderHandoff.clearCloseFolderId();
  harness.layer.closingGhosts.clear({ restorePageTrack: false, reveal: false });
  startOpening(harness, token);
}

function hasOwnerToken(registry, token) {
  return registry.snapshot().some((entry) => entry.owner?.token === token);
}

function collectEventTypes(events) {
  return events.map((event) => event.type);
}

function hasFolderSubstituteVisual(harness) {
  return Boolean(
    harness.layer.frameGhost?.visible ||
    harness.layer.openingGhostLayer.children.length ||
    harness.layer.closingGhostLayer.children.length
  );
}

function isDesktopSourceArtworkVisible(harness) {
  return Boolean(harness.desktopSource.visible && harness.desktopSource.visualWrap.visible);
}

export function runFolderCloseRaceTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder close race test failed] ${message}`);
  };

  {
    const harness = makeRaceHarness();
    startOpening(harness, "open:first");
    assert(harness.layer.openingGhostLayer.children.length === 1, "opening should start with one opening ghost");

    const closeToken = startClosing(harness);
    assert(harness.layer.openingGhostLayer.children.length === 0, "close should consume interrupted opening ghosts");
    assert(harness.layer.closingGhostLayer.children.length === 1, "close should retarget the opening ghost into the closing layer");
    assert(harness.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-1"), closeToken), "close should own the desktop source after interrupting open");
    assert(harness.calls.includes("prepare:folder-1"), "close should prepare the desktop source handoff in the start frame");
    assert(hasFolderSubstituteVisual(harness), "close should keep an overlay substitute visible when the desktop source artwork is hidden");
    assert(!isDesktopSourceArtworkVisible(harness), "close should not show the desktop source artwork while opening or closing ghosts are visible");

    interruptCloseWithOpen(harness, "open:second");

    assert(harness.layer.closingGhostLayer.children.length === 0, "open after close should clear closing ghost visuals");
    assert(harness.layer.openingGhostLayer.children.length === 1, "open after close should leave only the new opening ghost");
    assert(harness.layer.folderHandoff.closeToken === null, "open after close should clear the stale closing token");
    assert(harness.layer.folderHandoff.folderId === null, "open after close should clear the stale closing folder id");
    assert(!hasOwnerToken(harness.visualOwnership, closeToken), "open after close should not leak the stale closing ownership token");
    motionRuntime.reset();
  }

  {
    const harness = makeRaceHarness();
    const firstCloseToken = startClosing(harness);
    assert(harness.layer.closingGhostLayer.children.length === 1, "initial close should create one closing ghost");

    interruptCloseWithOpen(harness, "open:middle");
    assert(harness.layer.closingGhostLayer.children.length === 0, "open interrupt should clear the first closing ghost");
    assert(harness.layer.openingGhostLayer.children.length === 1, "open interrupt should create one opening ghost");
    assert(harness.layer.folderHandoff.closeToken === null, "open interrupt should clear the first close token");

    const secondCloseToken = startClosing(harness);

    assert(secondCloseToken !== firstCloseToken, "second close should use a new close session token");
    assert(harness.layer.openingGhostLayer.children.length === 0, "second close should consume the interrupted opening ghost");
    assert(harness.layer.closingGhostLayer.children.length === 1, "second close should leave only the current closing ghost");
    assert(harness.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-1"), secondCloseToken), "second close should own the desktop source");
    assert(hasFolderSubstituteVisual(harness), "second close should keep a substitute visual during desktop source handoff");
    assert(!isDesktopSourceArtworkVisible(harness), "second close should keep desktop source artwork hidden while ghosts are visible");
    assert(!hasOwnerToken(harness.visualOwnership, firstCloseToken), "second close should not leak the first close token");
    assert(!hasOwnerToken(harness.visualOwnership, "open:middle"), "second close should not leak the interrupted opening token");
    motionRuntime.reset();
  }

  {
    const harness = makeRaceHarness();
    startOpening(harness, "open:page-0");
    harness.layer.iconNodes.set("app-2", {
      alpha: 1,
      item: { id: "app-2" },
      source: { folderId: "folder-1", pageIndex: 1 },
      visible: true,
    });

    const committedPageTarget = makeTarget("app-2", 0, 1);
    startClosing(harness, [committedPageTarget], { folderPageIndex: 1 });

    assert(harness.layer.openingGhostLayer.children.length === 0, "open-turn-close should clear the interrupted non-current opening ghost");
    assert(harness.layer.closingGhostLayer.children.length === 1, "open-turn-close should create one closing ghost for the close anchor page");
    assert(harness.layer.closingGhostLayer.children[0].item.id === "app-2", "open-turn-close should hand off the current visual page item");
    assert(!hasOwnerToken(harness.visualOwnership, "open:page-0"), "open-turn-close should not keep stale origin-page opening ownership");
    motionRuntime.reset();
  }

  {
    const session = new FolderHandoffCoordinator({});
    session.beginCloseTransition("folder-1", { closeToken: "close:ordered" });
    session.trackCloseGhost({ isThumbnailChild: true, item: { id: "app-1" } }, "close-key");
    session.trackClosePreviewSwap("swap");

    const events = [
      ...session.completeCloseFrame("close:ordered"),
      ...session.completeClosePreviewSwap("close:ordered", "swap"),
      ...session.completeCloseGhostVisual("close:ordered", "app-1"),
      ...session.completeCloseGhost("close:ordered", "app-1"),
      ...session.completeCloseFrame("close:ordered"),
      ...session.completeCloseGhost("close:ordered", "app-1"),
    ];

    assert(collectEventTypes(events).join(",") === "handoffReady,overlaySettled", "out-of-order releases should settle handoff and overlay exactly once");
    assert(session.snapshot().visualPendingKeys.size === 0, "out-of-order releases should clear visual pending state");
    assert(session.snapshot().overlayPendingKeys.size === 0, "out-of-order releases should clear overlay pending state");
  }

  {
    const session = new FolderHandoffCoordinator({});
    session.beginCloseTransition("folder-1", { closeToken: "close:first" });
    session.trackCloseGhost({ item: { id: "old-app" } }, "old-key");
    session.beginCloseTransition("folder-1", { closeToken: "close:current" });
    session.trackCloseGhost({ item: { id: "current-app" } }, "current-key");

    const staleEvents = [
      ...session.completeCloseFrame("close:first"),
      ...(session.completeCloseGhost("close:first", "current-app") || []),
      ...(session.completeClosePreviewSwap("close:first", "swap") || []),
    ];
    const staleSnapshot = session.snapshot();

    assert(staleEvents.length === 0, "stale releases should not emit session events");
    assert(staleSnapshot.token === "close:current", "stale releases should not replace the current token");
    assert(staleSnapshot.frameComplete === false, "stale releases should not mutate current frame completion");
    assert(staleSnapshot.ghostKeys.has("current-app"), "stale releases should not clear current ghost keys");
    assert(!staleSnapshot.ghostKeys.has("old-app"), "new session should not retain old ghost keys");

    const currentEvents = [
      ...session.completeCloseFrame("close:current"),
      ...session.completeCloseGhost("close:current", "current-app"),
    ];
    assert(collectEventTypes(currentEvents).join(",") === "handoffReady,overlaySettled", "current token releases should still settle normally");
  }
}
