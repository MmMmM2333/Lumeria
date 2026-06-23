import { motionRuntime } from "../animation/motionRuntime.js";
import { FolderClosingGhostController } from "./folderClosingGhostController.js";
import { FolderOpeningGhostController } from "./folderOpeningGhostController.js";
import { FolderTransitionMachine } from "./folderTransitionMachine.js";
import {
  FolderVisualOwnershipRegistry,
  makeDesktopSourceVisualKey,
  makeFolderIconVisualKey,
  makeFolderPageTrackVisualKey,
} from "./folderVisualOwnershipRegistry.js";

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
      children.push(child);
      return child;
    },
    removeChildren() {
      return children.splice(0);
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

function makeTarget(id = "app-1", index = 0) {
  return {
    cellHeight: 80,
    cellWidth: 80,
    columnCount: 3,
    controllerGhostKey: `ghost-key-${id}`,
    iconSize: 64,
    index,
    item: { id, type: "app" },
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
    pageTrack: { visible: true },
    panel: { visible: true },
    panelMaterial: { alpha: 1, visible: true },
    visualOwnership,
    visible: true,
    acquireVisualOwnership(key, owner) {
      return visualOwnership.acquire(key, owner);
    },
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    createClosingGhostSessionToken(folderId = null) {
      const token = `close:${folderId || "folder"}:${closeTokenCounter}`;
      closeTokenCounter += 1;
      return token;
    },
    enableClosingFrameMask() {
      calls.push("enable-mask");
    },
    hideIconNodesForTransition(itemId, owner = {}) {
      for (const node of this.iconNodes.values()) {
        if (node.item?.id !== itemId) continue;
        const key = makeFolderIconVisualKey(owner.folderId || this.currentFolderId, itemId, node.source?.pageIndex ?? 0);
        if (key) this.acquireVisualOwnership(key, owner);
        node.visible = false;
      }
    },
    hidePageTrackForTransition(owner = {}) {
      const key = makeFolderPageTrackVisualKey(owner.folderId || this.currentFolderId);
      if (key) this.acquireVisualOwnership(key, owner);
      this.pageTrack.visible = false;
    },
    onClosingHandoffReady(folderId) {
      calls.push(`ready:${folderId}`);
    },
    onClosingHandoffVisualRelease(folderId) {
      calls.push(`visual-release:${folderId}`);
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
          const key = makeFolderIconVisualKey(entry.owner.folderId, node.item?.id, node.source?.pageIndex ?? 0);
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
    get iconNode() {
      return iconNode;
    },
  };

  layer.folderTransitions = new FolderTransitionMachine(layer);
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

function startClosing(harness) {
  harness.layer.closingGhosts.start(
    makeState(),
    [makeTarget()],
    { height: 72, left: 10, top: 20, width: 72 },
    { height: 360, left: 180, top: 200, width: 800 }
  );
  return harness.layer.folderTransitions.sessionToken;
}

function interruptCloseWithOpen(harness, token) {
  harness.layer.folderTransitions.clearFolderId();
  harness.layer.closingGhosts.clear({ restorePageTrack: false, reveal: false });
  startOpening(harness, token);
}

function hasOwnerToken(registry, token) {
  return registry.snapshot().some((entry) => entry.owner?.token === token);
}

function collectEventTypes(events) {
  return events.map((event) => event.type);
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

    interruptCloseWithOpen(harness, "open:second");

    assert(harness.layer.closingGhostLayer.children.length === 0, "open after close should clear closing ghost visuals");
    assert(harness.layer.openingGhostLayer.children.length === 1, "open after close should leave only the new opening ghost");
    assert(harness.layer.folderTransitions.sessionToken === null, "open after close should clear the stale closing token");
    assert(harness.layer.folderTransitions.folderId === null, "open after close should clear the stale closing folder id");
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
    assert(harness.layer.folderTransitions.sessionToken === null, "open interrupt should clear the first close token");

    const secondCloseToken = startClosing(harness);

    assert(secondCloseToken !== firstCloseToken, "second close should use a new close session token");
    assert(harness.layer.openingGhostLayer.children.length === 0, "second close should consume the interrupted opening ghost");
    assert(harness.layer.closingGhostLayer.children.length === 1, "second close should leave only the current closing ghost");
    assert(harness.visualOwnership.isOwnedBy(makeDesktopSourceVisualKey("folder-1"), secondCloseToken), "second close should own the desktop source");
    assert(!hasOwnerToken(harness.visualOwnership, firstCloseToken), "second close should not leak the first close token");
    assert(!hasOwnerToken(harness.visualOwnership, "open:middle"), "second close should not leak the interrupted opening token");
    motionRuntime.reset();
  }

  {
    const session = new FolderTransitionMachine({});
    session.beginClose("folder-1");
    session.setSessionToken("close:ordered");
    session.addGhostTarget({ isThumbnailChild: true, item: { id: "app-1" } }, "close-key");
    session.addPreviewSwapKey("swap");

    const events = [
      ...session.releaseFrameComplete("close:ordered"),
      ...session.releasePreviewSwap("close:ordered", "swap"),
      ...session.releaseGhostVisual("close:ordered", "app-1"),
      ...session.releaseGhostComplete("close:ordered", "app-1"),
      ...session.releaseFrameComplete("close:ordered"),
      ...session.releaseGhostComplete("close:ordered", "app-1"),
    ];

    assert(collectEventTypes(events).join(",") === "handoffReady,overlaySettled", "out-of-order releases should settle handoff and overlay exactly once");
    assert(session.snapshot().visualPendingKeys.size === 0, "out-of-order releases should clear visual pending state");
    assert(session.snapshot().overlayPendingKeys.size === 0, "out-of-order releases should clear overlay pending state");
  }

  {
    const session = new FolderTransitionMachine({});
    session.beginClose("folder-1");
    session.setSessionToken("close:first");
    session.addGhostTarget({ item: { id: "old-app" } }, "old-key");
    session.beginClose("folder-1");
    session.setSessionToken("close:current");
    session.addGhostTarget({ item: { id: "current-app" } }, "current-key");

    const staleEvents = [
      ...session.releaseFrameComplete("close:first"),
      ...session.releaseGhostComplete("close:first", "current-app"),
      ...session.releasePreviewSwap("close:first", "swap"),
    ];
    const staleSnapshot = session.snapshot();

    assert(staleEvents.length === 0, "stale releases should not emit session events");
    assert(staleSnapshot.token === "close:current", "stale releases should not replace the current token");
    assert(staleSnapshot.frameComplete === false, "stale releases should not mutate current frame completion");
    assert(staleSnapshot.ghostKeys.has("current-app"), "stale releases should not clear current ghost keys");
    assert(!staleSnapshot.ghostKeys.has("old-app"), "new session should not retain old ghost keys");

    const currentEvents = [
      ...session.releaseFrameComplete("close:current"),
      ...session.releaseGhostComplete("close:current", "current-app"),
    ];
    assert(collectEventTypes(currentEvents).join(",") === "handoffReady,overlaySettled", "current token releases should still settle normally");
  }
}
