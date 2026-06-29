function makePageTrack(children) {
  const pageTrack = {
    children,
    setChildIndex(child, index) {
      const currentIndex = this.children.indexOf(child);
      if (currentIndex < 0) return;
      this.children.splice(currentIndex, 1);
      this.children.splice(index, 0, child);
    },
  };
  for (const child of children) child.parent = pageTrack;
  return pageTrack;
}

function makeNode(id) {
  return {
    alpha: 0,
    cursor: "pointer",
    destroyed: false,
    eventMode: "static",
    id,
    labelText: { alpha: 0.5, renderable: true, visible: true },
    labelRevealCount: 0,
    labelRestoreCount: 0,
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
      x: 0.7,
      y: 0.7,
    },
    state: { draggable: false, ghosted: true, interactive: false },
    setFolderHandoffSourceHidden(hidden) {
      this.visualWrap.visible = !hidden;
      this.labelText.renderable = !hidden;
      if (hidden) {
        this.folderHandoffLabelRevealInProgress = false;
        this.folderHandoffLabelFadeFrame = null;
        this.labelText.alpha = 0;
      }
    },
    setFolderHandoffVisualHidden(hidden) {
      this.setFolderHandoffSourceHidden(hidden);
    },
    releaseFolderHandoffSource(options = {}) {
      this.setFolderHandoffSourceHidden(false);
      if (options.fadeLabel === false) this.restoreLabelAfterGhost();
      else this.revealLabelAfterGhost();
    },
    revealLabelAfterGhost() {
      this.labelRevealCount += 1;
      this.folderHandoffLabelRevealInProgress = true;
      this.folderHandoffLabelFadeFrame = 1;
      this.labelText.alpha = 0;
      this.labelText.renderable = true;
      this.labelText.visible = true;
    },
    restoreLabelAfterGhost() {
      this.labelRestoreCount += 1;
      this.folderHandoffLabelRevealInProgress = false;
      this.folderHandoffLabelFadeFrame = null;
      this.labelText.alpha = 1;
      this.labelText.renderable = true;
      this.labelText.visible = true;
    },
    visualWrap: { visible: true },
    visible: false,
  };
}

function makeLayer(DesktopLayer, pageTrack) {
  const makeTransformNode = () => ({
    alpha: 1,
    interactiveChildren: true,
    pivot: {
      set(x, y) {
        this.x = x;
        this.y = y;
      },
    },
    position: {
      set(x, y) {
        this.x = x;
        this.y = y;
      },
    },
    scale: {
      set(x, y = x) {
        this.x = x;
        this.y = y;
      },
    },
    visible: false,
  });
  const layer = Object.create(DesktopLayer.prototype);
  layer.emptyText = {
    position: {
      set() {},
    },
    visible: false,
  };
  layer.folderHandoffNode = null;
  layer.folderHandoffNodes = new Map();
  layer.hasDesktopVisualAlpha = false;
  layer.hasDesktopVisualTransform = false;
  layer.hasFolderOverlayAlpha = false;
  layer.hasFolderOverlayTransform = false;
  layer.iconNodes = new Map();
  layer.iconBoundsRegistry = makeLayer.iconBoundsRegistry;
  layer.pageTrack = pageTrack;
  layer.desktopClosingUnderlayLayer = makeTransformNode();
  layer.singleStageFolderLayer = {
    ...makeTransformNode(),
    getDesktopSourceGhostedIds: () => new Set(),
    hasVisibleFolderSubstitute: () => false,
  };
  layer.visualOwnership = { snapshot: () => [] };
  layer.visualRoot = makeTransformNode();
  return layer;
}

function makeHandoffCoordinator(options = {}) {
  const {
    active = false,
    folderId = null,
    ghostKeys = [],
    token = null,
  } = options;
  return {
    get folderId() {
      return folderId;
    },
    isCloseHandoffActive() {
      return active;
    },
    snapshot() {
      return {
        folderId,
        ghostKeys: new Set(ghostKeys),
        handoffActive: active,
        token,
      };
    },
  };
}

function makeDesktopQuiescenceState(item = { id: "app-a", type: "app" }) {
  return {
    activePageIndex: 0,
    activePages: [[item]],
    desktopFrame: { height: 320, left: 0, top: 0, width: 480 },
    deviceResolution: 1,
    folderPageSize: 9,
    folderSourceGhostedIds: new Set(),
    getDesktopPageRenderMode: () => "interactive",
    getVisibleDesktopPage: (page) => page,
    gridCols: 1,
    gridRows: 1,
    height: 320,
    iconSize: 64,
    isFolderOpeningPreviewFrameGhosted: () => false,
    isIconOpening: () => false,
    isIconSelected: () => false,
    isSearchMode: false,
    isTextlessMode: false,
    launchTargetStatusById: {},
    setPageRef: () => {},
    showMissingLaunchTargetBadge: false,
    stageRect: { height: 320, left: 0, top: 0, width: 480 },
    width: 480,
  };
}

function prepareLayerForDesktopQuiescenceTest(layer, item) {
  layer.applyDesktopVisualAlpha = () => {};
  layer.applyDesktopVisualTransform = () => {};
  layer.applyFolderOverlayAlpha = () => {};
  layer.applyFolderOverlayTransform = () => {};
  layer.flushInteractiveBounds = () => {};
  layer.markInteractiveBoundsDirty = () => {};
  layer.singleStageDiagnosticsLayer = { update() {} };
  layer.singleStageFolderLayer = {
    getDesktopSourceGhostedIds: () => new Set(),
    hasVisibleFolderSubstitute: () => false,
  };
  layer.updateSingleStageDragPreviewLayer = () => {};
  layer.updateSingleStageFolderLayer = () => {};
  layer.pageTrackMotion = {
    control: null,
    grabProgressOffset: 0,
    grabToken: null,
    key: null,
    mode: null,
    settleToken: null,
  };
  layer.visualOwnership = { snapshot: () => [] };
  const node = makeNode(item.id);
  node.item = item;
  node.setState = (nextState) => {
    node.state = nextState;
  };
  layer.iconNodes.set(`page:0:${item.id}`, node);
  return node;
}

export async function runDesktopLayerTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const {
    DesktopLayer,
    normalizeDesktopHandoffState,
    resolveDesktopVisualAlpha,
    resolveLaunchpadVisualAlpha,
    resolveLaunchpadVisualTransform,
    shouldFinishFolderHandoff,
    shouldFinishFolderHandoffEntry,
  } = await import("./DesktopLayer.js");
  const {
    createIconBoundsRegistry,
    ICON_BOUNDS_KIND,
    ICON_BOUNDS_VARIANT,
  } = await import("../geometry/iconBoundsRegistry.js");
  const K = ICON_BOUNDS_KIND;
  const V = ICON_BOUNDS_VARIANT;
  makeLayer.iconBoundsRegistry = createIconBoundsRegistry();
  const {
    FolderVisualOwnershipRegistry,
    makeDesktopSourceVisualKey,
  } = await import("./folderVisualOwnershipRegistry.js");
  const { motionRuntime } = await import("../animation/motionRuntime.js");
  const {
    deleteLaunchpadDebugValue,
    readLaunchpadDebugValue,
    setLaunchpadDebugValue,
  } = await import("../debugNamespace.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[DesktopLayer test failed] ${message}`);
  };

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    const renderRequests = [];
    const layer = new DesktopLayer({
      iconBoundsRegistry,
      onFolderRenderRequest: (reason) => renderRequests.push(reason),
    });
    layer.singleStageFolderLayer.onRenderRequest("folder-resize-layout");
    assert(renderRequests[0] === "folder-resize-layout", "folder overlay render requests should be forwarded to the desktop surface scheduler");
    layer.destroy({ children: true });
    iconBoundsRegistry.clearBounds();
  }

  {
    const normalized = normalizeDesktopHandoffState({
      folderClosingHandoffId: "folder-a",
      folderClosingHandoffIds: ["folder-b", "folder-c"],
      folderSourceGhostedId: "folder-d",
      folderSourceGhostedIds: new Set(["folder-e"]),
    });

    assert(normalized.folderClosingHandoffIds instanceof Set, "closing handoff ids should normalize to a Set");
    assert(normalized.folderClosingHandoffId === "folder-a", "closing handoff normalizer should preserve the legacy singular id as primary");
    assert(normalized.folderClosingHandoffIds.has("folder-a"), "closing handoff normalizer should keep the legacy singular id");
    assert(normalized.folderClosingHandoffIds.has("folder-b") && normalized.folderClosingHandoffIds.has("folder-c"), "closing handoff normalizer should keep array ids");
    assert(normalized.folderSourceGhostedIds instanceof Set, "source ghosted ids should normalize to a Set");
    assert(normalized.folderSourceGhostedId === "folder-d", "source ghosted normalizer should preserve the legacy singular id as primary");
    assert(normalized.folderSourceGhostedIds.has("folder-d") && normalized.folderSourceGhostedIds.has("folder-e"), "source ghosted normalizer should merge singular and Set ids");
    assert(!shouldFinishFolderHandoff({ folderClosingHandoffIds: ["folder-b"] }, { folderHandoff: makeHandoffCoordinator() }), "array closing handoff ids should keep the desktop handoff alive");
    assert(!shouldFinishFolderHandoffEntry({ folderClosingHandoffId: "folder-a" }, null, "folder-a"), "legacy singular closing handoff id should keep its folder handoff alive");
    {
      // A stale closing id keeps a never-revealed handoff entry alive while no
      // substitute covers the folder: reconcile must REVEAL it in place (real icon
      // shown) WITHOUT retiring — retiring would let the stale id recreate + re-hide
      // it every frame (the icon/label flash regression).
      const folder = makeNode("folder");
      folder.item = { id: "folder-a", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.singleStageFolderLayer = {
        folderHandoff: { folderId: null, isCloseHandoffActive: () => false },
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      };
      layer.ensureFolderHandoffNode("folder-a", folder, { x: 0, y: 0 }, { revealLabel: false });
      const entry = layer.getFolderHandoffEntry("folder-a");
      assert(folder.visualWrap.visible === false && entry.visualReleased !== true, "test setup: a fresh handoff entry hides the real icon");

      layer.reconcileFolderHandoffEntry({ folderClosingHandoffId: "folder-a" }, entry);
      assert(layer.getFolderHandoffEntry("folder-a") === entry, "a stale-id orphan should be healed in place, not retired (avoids the recreate/flash loop)");
      assert(entry.visualReleased === true && folder.visualWrap.visible === true, "a stale-id orphan with no visible substitute should reveal the real folder icon");
    }

    {
      // While a visible substitute still covers the folder (normal close handoff),
      // the entry stays hidden — no premature reveal / flash.
      const folder = makeNode("folder");
      folder.item = { id: "folder-a", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.singleStageFolderLayer = {
        folderHandoff: { folderId: "folder-a", isCloseHandoffActive: () => false },
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: (folderId) => folderId === "folder-a",
      };
      layer.ensureFolderHandoffNode("folder-a", folder, { x: 0, y: 0 }, { revealLabel: false });
      const entry = layer.getFolderHandoffEntry("folder-a");

      layer.reconcileFolderHandoffEntry({ folderClosingHandoffId: "folder-a" }, entry);
      assert(layer.getFolderHandoffEntry("folder-a") === entry && entry.visualReleased !== true && folder.visualWrap.visible === false, "a closing handoff with a visible substitute should keep the real icon hidden");
    }

    {
      // If the close finishes while a desktop page turn is still moving, the
      // raised handoff node is the only stable desktop source. Do not reveal or
      // retire it until the pageTrack has reached the new page target.
      const folder = makeNode("folder");
      folder.item = { id: "folder-a", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      pageTrack.x = -120;
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.singleStageFolderLayer = {
        folderHandoff: { folderId: null, isCloseHandoffActive: () => false },
        getDesktopSourceGhostedIds: () => new Set(),
        hasVisibleFolderSubstitute: () => false,
      };
      layer.pageTrackMotion = {
        control: { completed: false, released: false },
        targetX: -480,
      };
      layer.ensureFolderHandoffNode("folder-a", folder, { x: 0, y: 0 }, { revealLabel: false });
      const entry = layer.getFolderHandoffEntry("folder-a");

      assert(!layer.reconcileFolderHandoffEntry({}, entry), "in-flight desktop page motion should block handoff cleanup");
      assert(entry.cleanupFrame == null, "blocked handoff cleanup should not schedule a cleanup frame");
      assert(folder.visualWrap.visible === false, "blocked handoff cleanup should keep real folder artwork hidden");

      layer.pageTrackMotion.control = { completed: true, released: false };
      assert(!layer.reconcileFolderHandoffEntry({}, entry), "pageTrack geometry that has not reached target should still block cleanup");
      assert(entry.cleanupFrame == null, "target mismatch should keep the handoff entry alive");

      pageTrack.x = -480;
      assert(layer.reconcileFolderHandoffEntry({}, entry), "settled desktop page motion should allow handoff cleanup");
      assert(entry.cleanupFrame?.cancelled === false, "settled handoff cleanup should schedule the normal cleanup frame");
      motionRuntime.flushAfterFrameForTests();
      assert(!layer.getFolderHandoffEntry("folder-a"), "settled cleanup frame should clear the handoff entry");
      motionRuntime.reset();
    }
  }

  {
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    try {
      const pageTrack = makePageTrack([]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      let refreshCount = 0;
      let folderRefreshCount = 0;
      layer.refreshInteractiveBounds = () => {
        refreshCount += 1;
      };
      layer.singleStageFolderLayer.refreshRegisteredIconBounds = () => {
        folderRefreshCount += 1;
      };

      layer.markInteractiveBoundsDirty();
      layer.markInteractiveBoundsDirty();
      assert(refreshCount === 0, "bounds dirty should wait until the runtime frame-end flush");
      motionRuntime.flushAfterFrameForTests();
      assert(refreshCount === 1, "bounds dirty should coalesce repeated marks into one refresh");
      assert(folderRefreshCount === 1, "bounds dirty flush should refresh folder overlay bounds once");
      assert(layer.boundsDirty === false && layer.boundsFlushQueued === false, "bounds dirty flush should clear queued flags");
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      motionRuntime.reset();
    }
  }

  {
    assert(resolveDesktopVisualAlpha({ desktopVisualAlpha: -1 }) === 0, "desktop alpha should clamp low values");
    assert(resolveDesktopVisualAlpha({ desktopVisualAlpha: 2 }) === 1, "desktop alpha should clamp high values");
    assert(resolveDesktopVisualAlpha({}) === 1, "desktop alpha should default to visible");
    assert(resolveLaunchpadVisualAlpha({ launchpadVisualAlpha: -1 }) === 0, "launchpad alpha should clamp low values");
    assert(resolveLaunchpadVisualAlpha({ launchpadVisualAlpha: 2 }) === 1, "launchpad alpha should clamp high values");
    assert(resolveLaunchpadVisualAlpha({}) === 1, "launchpad alpha should default to visible");
    assert(resolveLaunchpadVisualTransform({ launchpadVisualTransform: { scale: -1, y: 12 } }).scale === 0.01, "launchpad transform should clamp scale low");
    assert(resolveLaunchpadVisualTransform({ launchpadVisualTransform: { scale: 1.08, y: 12 } }).y === 12, "launchpad transform should preserve y offset");
    assert(resolveLaunchpadVisualTransform({}).scale === 1, "launchpad transform should default to identity scale");
    assert(!shouldFinishFolderHandoff({}, { folderHandoff: makeHandoffCoordinator({ active: true }) }), "local Pixi handoff activity should keep the desktop handoff alive before the Vue bridge updates");
    assert(shouldFinishFolderHandoff({}, { folderHandoff: makeHandoffCoordinator({ active: false }) }), "idle state with no prop handoff should finish the desktop handoff");
    assert(!shouldFinishFolderHandoff({ folderClosingHandoffId: "folder-1" }, { folderHandoff: makeHandoffCoordinator({ active: false }) }), "active prop handoff should keep the desktop handoff alive");
    assert(!shouldFinishFolderHandoffEntry({}, { folderHandoff: makeHandoffCoordinator({ active: true, folderId: "folder-1" }) }, "folder-1"), "matching Pixi activity should keep its folder handoff alive");
    assert(!shouldFinishFolderHandoffEntry({}, { getDesktopSourceGhostedIds: () => new Set(["folder-1"]) }, "folder-1"), "detached desktop source ownership should keep its folder handoff alive");
    assert(!shouldFinishFolderHandoffEntry({}, { hasVisibleFolderSubstitute: () => true }, "folder-1"), "visible folder substitutes should keep their folder handoff alive");
    assert(shouldFinishFolderHandoffEntry({}, { folderHandoff: makeHandoffCoordinator({ active: true, folderId: "folder-2" }), hasVisibleFolderSubstitute: () => false }, "folder-1"), "different-folder Pixi activity should not keep an old handoff alive by itself");

    const actualLayer = new DesktopLayer({ iconBoundsRegistry: createIconBoundsRegistry() });
    assert(
      actualLayer.children.indexOf(actualLayer.visualRoot) <
        actualLayer.children.indexOf(actualLayer.desktopClosingUnderlayLayer),
      "desktop closing underlay should render above the desktop icons"
    );
    assert(
      actualLayer.children.indexOf(actualLayer.desktopClosingUnderlayLayer) <
        actualLayer.children.indexOf(actualLayer.singleStageFolderLayer),
      "desktop closing underlay should render below the folder opening overlay"
    );
    assert(
      actualLayer.singleStageFolderLayer.detachedClosingVisualLayer === actualLayer.desktopClosingUnderlayLayer,
      "folder detached closing visuals should mount in the desktop underlay"
    );
    actualLayer.destroy({ children: true });

    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha({ desktopVisualAlpha: 0 });

    assert(layer.visualRoot.visible === true, "hidden desktop should stay renderable so alpha can animate");
    assert(layer.visualRoot.alpha === 0, "hidden desktop should apply the requested alpha");
    assert(layer.desktopClosingUnderlayLayer.alpha === 0, "desktop closing underlay should fade with the desktop");
    assert(layer.visualRoot.interactiveChildren === false, "hidden desktop should not receive icon interaction");
    assert(layer.singleStageFolderLayer.alpha === 1, "desktop alpha should not hide the folder overlay layer");

    layer.applyDesktopVisualTransform({
      desktopVisualTransform: { scale: 0.92, y: 44 },
      height: 600,
      width: 800,
    });
    assert(layer.desktopClosingUnderlayLayer.scale.x === 0.92 && layer.desktopClosingUnderlayLayer.scale.y === 0.92, "desktop closing underlay should scale with the desktop");
    assert(layer.desktopClosingUnderlayLayer.position.x === 400 && layer.desktopClosingUnderlayLayer.position.y === 344, "desktop closing underlay should move with the desktop");

    layer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1, y: 0 },
      width: 800,
    });
    assert(layer.singleStageFolderLayer.scale.x === 1 && layer.singleStageFolderLayer.scale.y === 1, "open folder overlay should keep identity scale");
    assert(layer.singleStageFolderLayer.position.x === 400 && layer.singleStageFolderLayer.position.y === 300, "folder overlay should pivot around the stage center");
    assert(layer.desktopClosingUnderlayLayer.alpha === 0, "folder overlay changes should not reveal desktop closing underlay");

    layer.applyFolderOverlayAlpha({ launchpadVisualAlpha: 0 });
    assert(layer.singleStageFolderLayer.visible === true, "hidden launchpad folder overlay should stay renderable so alpha can animate");
    assert(layer.singleStageFolderLayer.alpha === 0, "hidden launchpad should apply alpha to the folder overlay");
    assert(layer.singleStageFolderLayer.interactiveChildren === false, "hidden folder overlay should not receive interaction");

    const closingLayer = makeLayer(DesktopLayer, pageTrack);
    closingLayer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1.08, y: 0 },
      singleStageFolderState: { renderedFolder: { id: "folder-1" } },
      width: 800,
    });
    assert(closingLayer.singleStageFolderLayer.scale.x === 1.08 && closingLayer.singleStageFolderLayer.scale.y === 1.08, "closing launchpad should scale the folder overlay layer");

    closingLayer.singleStageFolderLayer.scale.set(1.08);
    closingLayer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1, y: 0 },
      singleStageFolderState: null,
      width: 800,
    });
    assert(closingLayer.singleStageFolderLayer.scale.x === 1 && closingLayer.singleStageFolderLayer.scale.y === 1, "inactive folder overlay should snap back to identity scale");
    assert(closingLayer.hasSingleStageFolderOverlayContent({
      singleStageFolderState: { renderedFolder: { id: "folder-1" } },
    }), "folder overlay content should require a rendered folder");
    assert(!closingLayer.hasSingleStageFolderOverlayContent({
      singleStageFolderState: null,
    }), "missing folder state should count as no overlay content");
  }

  {
    const makeFolderNode = (id) => ({
      alpha: 1,
      item: { id, type: "folder" },
      setState(nextState) {
        this.state = nextState;
      },
      state: { ghosted: false },
    });
    const folderA = makeFolderNode("folder-a");
    const folderB = makeFolderNode("folder-b");
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("folder-a", folderA);
    layer.iconNodes.set("folder-b", folderB);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-a"]);

    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(["folder-b"]),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });

    assert(folderA.state.ghosted === true, "overlay-owned detached folder source should stay ghosted on the desktop");
    assert(folderB.state.ghosted === true, "Vue-owned opening folder source should stay ghosted on the desktop");
    assert(folderA.__folderSourceGhostedByOwnership === true, "overlay-owned source ghosting should be tracked as ownership");
    assert(folderB.__folderSourceGhostedByOwnership === true, "Vue-owned source ghosting should be tracked as ownership");

    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-a"]);
    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });

    assert(folderA.state.ghosted === true, "clearing folder B source ghosting should not reveal detached folder A");
    assert(folderB.state.ghosted === false, "clearing folder B source ghosting should reveal only folder B");

    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-a"), {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: "detached-a",
    });
    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });
    assert(folderA.state.ghosted === true, "root ownership should ghost a detached desktop source");
    layer.visualOwnership.release(makeDesktopSourceVisualKey("folder-a"), "detached-a");
    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });
    assert(folderA.state.ghosted === false, "root ownership release should restore the desktop source");

    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-a"), {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: "detached-a-2",
    });
    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(["folder-b"]),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });
    assert(folderA.state.ghosted === true && folderB.state.ghosted === true, "raw and ownership source ghosting should compose while both are active");
    layer.visualOwnership.release(makeDesktopSourceVisualKey("folder-a"), "detached-a-2");
    layer.commitFolderSourceGhosting();
    assert(folderA.state.ghosted === false, "ownership release should not be reintroduced from stale cached source ghosting");
    assert(folderB.state.ghosted === true, "raw Vue source ghosting should remain after ownership release");
  }

  {
    motionRuntime.reset();
    const makeFolderNode = (id) => ({
      alpha: 1,
      item: { id, type: "folder" },
      setState(nextState) {
        this.state = nextState;
      },
      state: { ghosted: false },
      x: 0,
      y: 0,
    });
    const folderA = makeFolderNode("folder-a");
    const folderB = makeFolderNode("folder-b");
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha = () => {};
    layer.applyDesktopVisualTransform = () => {};
    layer.applyFolderOverlayAlpha = () => {};
    layer.applyFolderOverlayTransform = () => {};
    layer.flushInteractiveBounds = () => {};
    layer.markInteractiveBoundsDirty = () => {};
    layer.singleStageDiagnosticsLayer = { update() {} };
    layer.singleStageFolderLayer = {
      getDesktopSourceGhostedIds: () => new Set(),
      hasVisibleFolderSubstitute: () => false,
    };
    layer.updateSingleStageDragPreviewLayer = () => {};
    layer.updateSingleStageFolderLayer = () => {};
    layer.pageTrackMotion = {
      control: null,
      grabProgressOffset: 0,
      grabToken: null,
      key: null,
      mode: null,
      settleToken: null,
    };
    layer.visualOwnership = new FolderVisualOwnershipRegistry();
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-a"), {
      folderId: "folder-a",
      kind: "detachedClosing",
      token: "detached-a",
    });
    layer.iconNodes.set("page:0:folder-a", folderA);
    layer.iconNodes.set("page:0:folder-b", folderB);

    layer.update({
      activePageIndex: 0,
      activePages: [[
        { id: "folder-a", type: "folder" },
        { id: "folder-b", type: "folder" },
      ]],
      desktopFrame: { height: 300, left: 0, top: 0, width: 400 },
      deviceResolution: 1,
      folderPageSize: 9,
      folderSourceGhostedIds: new Set(["folder-b"]),
      getDesktopPageRenderMode: () => "interactive",
      getVisibleDesktopPage: (page) => page,
      gridCols: 2,
      gridRows: 1,
      height: 300,
      iconSize: 64,
      isFolderOpeningPreviewFrameGhosted: () => false,
      isIconOpening: () => false,
      isIconSelected: () => false,
      isSearchMode: false,
      isTextlessMode: false,
      launchTargetStatusById: {},
      setPageRef: () => {},
      showMissingLaunchTargetBadge: false,
      stageRect: { height: 300, left: 0, top: 0, width: 400 },
      width: 400,
    });

    assert(folderA.state.ghosted === true && folderB.state.ghosted === true, "update should compose raw Vue ghosting with live detached ownership");
    layer.visualOwnership.release(makeDesktopSourceVisualKey("folder-a"), "detached-a");
    layer.commitFolderSourceGhosting();
    assert(folderA.state.ghosted === false, "update should cache raw source ghosting, not ownership-expanded source ghosting");
    assert(folderB.state.ghosted === true, "update should keep the raw Vue folder source ghosted after detached ownership release");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const item = { id: "app-a", type: "app" };
    const pageTrack = makePageTrack([]);
    pageTrack.x = 0;
    const layer = makeLayer(DesktopLayer, pageTrack);
    prepareLayerForDesktopQuiescenceTest(layer, item);
    const state = makeDesktopQuiescenceState(item);
    let scheduledFrameCount = 0;
    let pendingRender = true;

    try {
      layer.update(state);
      for (let frame = 0; frame < 600 && motionRuntime.hasActiveWork(); frame += 1) {
        motionRuntime.step(1 / 60);
      }
      assert(!motionRuntime.hasActiveWork(), "test setup should settle the initial desktop mount animation before checking idle rendering");
      motionRuntime.reset();

      for (let frame = 0; frame < 12; frame += 1) {
        scheduledFrameCount += 1;
        motionRuntime.step(frame === 0 ? 0 : 1 / 60);
        if (motionRuntime.debug.writesLastFrame > 0) pendingRender = true;
        if (pendingRender) {
          pendingRender = false;
          layer.update(state);
        }
        if (!pendingRender && !motionRuntime.hasActiveWork()) break;
      }

      assert(
        !motionRuntime.hasActiveWork(),
        `unchanged desktop render plan should settle to idle motion work, got ${motionRuntime.debugSnapshot().summary.activeAnimationCount} active animation(s)`
      );
      assert(scheduledFrameCount <= 4, `unchanged desktop render plan should stop scheduling frames after settling, got ${scheduledFrameCount}`);
    } finally {
      motionRuntime.reset();
    }
  }

  {
    motionRuntime.reset();
    const makeFolderNode = (id) => {
      const node = makeNode(id);
      node.alpha = 1;
      node.item = { id, type: "folder" };
      node.setState = (nextState) => {
        node.state = nextState;
        node.visible = !nextState.ghosted;
      };
      return node;
    };
    const folderA = makeFolderNode("folder-a");
    const folderB = makeFolderNode("folder-b");
    const pageTrack = makePageTrack([folderA, folderB]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha = () => {};
    layer.applyDesktopVisualTransform = () => {};
    layer.applyFolderOverlayAlpha = () => {};
    layer.applyFolderOverlayTransform = () => {};
    layer.flushInteractiveBounds = () => {};
    layer.markInteractiveBoundsDirty = () => {};
    layer.singleStageDiagnosticsLayer = { update() {} };
    layer.singleStageFolderLayer = {
      folderHandoff: makeHandoffCoordinator({ active: true, folderId: "folder-b" }),
      getDesktopSourceGhostedIds: () => new Set(["folder-a"]),
      hasVisibleFolderSubstitute: () => false,
    };
    layer.updateSingleStageDragPreviewLayer = () => {};
    layer.updateSingleStageFolderLayer = () => {};
    layer.pageTrackMotion = {
      control: null,
      grabProgressOffset: 0,
      grabToken: null,
      key: null,
      mode: null,
      settleToken: null,
    };
    layer.iconNodes.set("page:0:folder-a", folderA);
    layer.iconNodes.set("page:0:folder-b", folderB);
    layer.ensureFolderHandoffNode("folder-a", folderA, { x: 12, y: 34 }, { revealLabel: false });

    layer.update({
      activePageIndex: 0,
      activePages: [[
        { id: "folder-a", type: "folder" },
        { id: "folder-b", type: "folder" },
      ]],
      desktopFrame: { height: 300, left: 0, top: 0, width: 400 },
      deviceResolution: 1,
      folderClosingHandoffIds: new Set(["folder-b"]),
      folderPageSize: 9,
      folderSourceGhostedIds: new Set(["folder-a", "folder-b"]),
      getDesktopPageRenderMode: () => "interactive",
      getVisibleDesktopPage: (page) => page,
      gridCols: 2,
      gridRows: 1,
      height: 300,
      iconSize: 64,
      isFolderOpeningPreviewFrameGhosted: () => false,
      isIconOpening: () => false,
      isIconSelected: () => false,
      isSearchMode: false,
      isTextlessMode: false,
      launchTargetStatusById: {},
      setPageRef: () => {},
      showMissingLaunchTargetBadge: false,
      stageRect: { height: 300, left: 0, top: 0, width: 400 },
      width: 400,
    });

    assert(layer.getFolderHandoffEntry("folder-a"), "detached folder A handoff should survive folder B's live close update");
    assert(folderA.visualWrap.visible === false, "detached folder A artwork should stay hidden until its detached visual releases");
    assert(folderA.visible === true && folderA.state.ghosted === false, "detached folder A handoff node should not fall back to the ordinary ghosted path");
    assert(folderA.__folderSourceGhostedByOwnership === true, "detached folder A handoff should still track ownership ghosting");
    motionRuntime.reset();
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const after = makeNode("after");
    const pageTrack = makePageTrack([before, folder, after]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });

    assert(pageTrack.children.length === 3, "handoff should reuse the real folder node");
    assert(pageTrack.children[2] === folder, "handoff should raise the real folder node");
    assert(!Object.prototype.hasOwnProperty.call(layer, "folderHandoffNode"), "primary handoff node should be derived from the handoff map");
    assert(layer.folderHandoffNode.node === folder, "handoff state should reference the real node");
    assert(folder.position.x === 12 && folder.position.y === 34, "handoff should snap node to the target");
    assert(folder.scale.x === 1 && folder.scale.y === 1, "handoff should reset node scale");
    assert(folder.visible === true && folder.alpha === 1, "handoff should make the real node visible");
    assert(folder.visualWrap.visible === false, "handoff should hide the real folder artwork while the Pixi overlay owns the thumbnail");
    assert(folder.eventMode === "static" && folder.cursor === "pointer", "handoff should restore folder interaction once the real node owns the icon");
    assert(folder.state.draggable === true && folder.state.interactive === true, "handoff should restore the node state used by pointer handling");
    assert(folder.state.ghosted === false, "handoff should clear the stale ghost flag before the next setState");
    assert(folder.labelText.visible === true && folder.labelText.renderable === false && folder.labelText.alpha === 0, "handoff should hide the folder label while the overlay owns the source");
    assert(folder.labelRevealCount === 0, "handoff should not start the label fade before source release");
    folder.labelText.alpha = 0.4;
    layer.syncFolderHandoffNode(folder, { x: 12, y: 34 });
    assert(folder.labelText.alpha === 0, "handoff position sync should keep a hidden label parked at zero alpha");
    assert(folder.labelRevealCount === 0, "handoff position sync should not start the label reveal");
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(folder.labelRevealCount === 1, "visual release should start the folder label fade exactly once");
    assert(folder.labelText.renderable === true, "visual release should make the folder label renderable");
    assert(folder.visualWrap.visible === true, "settled overlay visual release should restore the real folder artwork");
    folder.labelText.alpha = 0.4;
    layer.syncFolderHandoffNode(folder, { x: 12, y: 34 });
    assert(folder.visualWrap.visible === true, "handoff position sync should not hide artwork after settled overlay release");
    assert(folder.labelText.alpha === 0.4, "handoff position sync should not hide an in-progress label fade after visual release");

    layer.clearFolderHandoffNode();

    assert(layer.folderHandoffNode === null, "clear should remove handoff state");
    assert(layer.folderHandoffNodes.size === 0, "clear should remove all handoff entries");
    assert(pageTrack.children[1] === folder, "clear should restore original z order");
    assert(folder.visualWrap.visible === true, "clear should restore the real folder artwork after overlay cleanup");
    assert(folder.labelRevealCount === 1, "clear should not restart the folder label fade-in");
  }

  {
    const folderA = makeNode("folder-a");
    const folderB = makeNode("folder-b");
    const pageTrack = makePageTrack([folderA, folderB]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-a", folderA, { x: 12, y: 34 });
    assert(folderA.visualWrap.visible === false, "interrupted handoff should initially hide folder A artwork under the overlay");
    layer.clearFolderHandoffNode();
    assert(folderA.visualWrap.visible === true, "clearing an interrupted handoff should restore folder A artwork even without overlay release");
    layer.ensureFolderHandoffNode("folder-a", folderA, { x: 12, y: 34 });
    layer.ensureFolderHandoffNode("folder-b", folderB, { x: 56, y: 78 });

    assert(layer.folderHandoffNodes.size === 2, "different folder handoffs should coexist");
    assert(folderA.visualWrap.visible === false, "starting folder B handoff should keep folder A hidden while its overlay visual is active");
    assert(folderB.visualWrap.visible === false, "new handoff should hide the new folder artwork");
    layer.releaseClosingFolderHandoffVisual("folder-a");
    assert(folderA.visualWrap.visible === true && folderB.visualWrap.visible === false, "releasing folder A should not reveal folder B");
  }

  {
    const logs = [];
    const originalDebug = readLaunchpadDebugValue("folderHandoff");
    const originalLastDebug = readLaunchpadDebugValue("lastFolderHandoff");
    const originalLog = console.log;
    setLaunchpadDebugValue("folderHandoff", { log: true });
    console.log = (...args) => logs.push(args);
    try {
      const folder = makeNode("folder");
      folder.item = { id: "folder-1", type: "folder" };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);

      layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
      layer.releaseClosingFolderHandoffVisual("folder-1");

      const before = logs.find(([label, payload]) =>
        label === "[folder-handoff-debug] desktop-restore" && payload?.phase === "desktop-restore-before"
      );
      const after = logs.find(([label, payload]) =>
        label === "[folder-handoff-debug] desktop-restore" && payload?.phase === "desktop-restore-after"
      );
      assert(before?.[1]?.node?.visualWrapVisible === false, "desktop restore debug should capture hidden artwork before release");
      assert(after?.[1]?.node?.visualWrapVisible === true, "desktop restore debug should capture restored artwork after release");
      assert(after?.[1]?.visualRoot, "desktop restore debug should include desktop transform context");
      assert(after?.[1]?.singleStageFolderLayer, "desktop restore debug should include folder overlay transform context");
      const lastDebug = readLaunchpadDebugValue("lastFolderHandoff");
      assert(
        lastDebug?.folderId === "folder-1" &&
          lastDebug?.phase === "desktop-restore-after",
        "desktop restore debug should publish the latest folder handoff snapshot"
      );
    } finally {
      console.log = originalLog;
      if (originalDebug === undefined) deleteLaunchpadDebugValue("folderHandoff");
      else setLaunchpadDebugValue("folderHandoff", originalDebug);
      if (originalLastDebug === undefined) deleteLaunchpadDebugValue("lastFolderHandoff");
      else setLaunchpadDebugValue("lastFolderHandoff", originalLastDebug);
    }
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: true, suppressLabelRevealAfterGhost: true };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.labelText.alpha = 1;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", folder);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    folder.__folderSourceGhostedByOwnership = true;
    folder.labelText.alpha = 0.4;
    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });

    assert(setStateCount === 0, "source ghosting commits should not use normal setState while a handoff entry owns the folder node");
    assert(folder.labelText.alpha === 0.4, "source ghosting commits should not force an in-progress handoff label fade to full opacity");
    assert(folder.__folderSourceGhostedByOwnership === false, "handoff source ghosting metadata should still track the latest ownership state");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", folder);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    assert(layer.getFolderHandoffEntry("folder-1"), "test setup should create a handoff entry");

    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(["folder-1"]),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });

    assert(!layer.getFolderHandoffEntry("folder-1"), "new raw source ghosting should clear a stale handoff entry");
    assert(setStateCount === 1, "new raw source ghosting should be committed through normal icon state");
    assert(folder.state.ghosted === true && folder.visible === false, "new raw source ghosting should hide the real folder icon");

    const rememberedState = layer.lastFolderSourceGhostingState;
    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    }, { remember: false });
    assert(layer.lastFolderSourceGhostingState === rememberedState, "immediate source ghosting should not replace the full remembered desktop state");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", folder);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.visualOwnership = new FolderVisualOwnershipRegistry();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(layer.getFolderHandoffEntry("folder-1")?.visualReleased === true, "test setup should leave a released stale handoff entry");
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-1"), {
      folderId: "folder-1",
      kind: "closing",
      token: "close-folder-1",
    });

    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });

    assert(!layer.getFolderHandoffEntry("folder-1"), "ownership source ghosting should clear a released stale handoff entry");
    assert(setStateCount === 1, "ownership source ghosting should be committed through normal icon state after stale handoff cleanup");
    assert(folder.state.ghosted === true && folder.visible === false, "ownership source ghosting should hide the real folder icon");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", folder);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.visualOwnership = new FolderVisualOwnershipRegistry();

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 }, { revealLabel: false });
    layer.visualOwnership.acquire(makeDesktopSourceVisualKey("folder-1"), {
      folderId: "folder-1",
      kind: "detachedClosing",
      token: "detached-folder-1",
    });

    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });

    assert(layer.getFolderHandoffEntry("folder-1"), "ownership source ghosting should keep an unreleased prepared handoff entry");
    assert(setStateCount === 0, "prepared handoff should not route ownership ghosting through normal setState");
    assert(folder.visualWrap.visible === false, "prepared handoff should keep the real folder artwork hidden");
    assert(folder.__folderSourceGhostedByOwnership === true, "prepared handoff should still track ownership ghosting metadata");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    let setStateCount = 0;
    folder.setState = (nextState) => {
      setStateCount += 1;
      folder.state = nextState;
      folder.visible = !nextState.ghosted;
    };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", folder);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-1"]);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 }, { revealLabel: false });
    layer.applyFolderSourceGhosting({
      folderSourceGhostedIds: new Set(["folder-1"]),
      isFolderOpeningPreviewFrameGhosted: () => false,
    });

    assert(layer.getFolderHandoffEntry("folder-1"), "closing-owned raw source ghosting should keep the prepared handoff entry");
    assert(setStateCount === 0, "closing-owned prepared handoff should not fall back to normal ghosted setState");
    assert(folder.visualWrap.visible === false, "closing-owned prepared handoff should keep desktop artwork hidden while ghosts own the source");
    assert(folder.__folderSourceGhostedByOwnership === true, "closing-owned prepared handoff should track source ownership ghosting");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    folder.state = { ghosted: false };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(folder.visualWrap.visible === true, "test setup should restore artwork after visual release");
    assert(layer.getFolderHandoffEntry("folder-1")?.visualReleased === true, "test setup should leave a released handoff entry");

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 18, y: 42 }, { revealLabel: false });

    const entry = layer.getFolderHandoffEntry("folder-1");
    assert(entry?.visualReleased === true, "ordinary handoff sync should not restart visual ownership after release");
    assert(folder.visualWrap.visible === true, "ordinary handoff sync should not hide released folder artwork again");

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 20, y: 44 }, { resetVisual: true, revealLabel: false });

    assert(entry?.visualReleased === false, "explicit handoff prepare should restart visual ownership");
    assert(entry?.labelRevealStarted === false, "explicit handoff prepare should reset stale label reveal state");
    assert(folder.visualWrap.visible === false, "explicit handoff prepare should hide the real folder artwork again");
  }

  {
    try {
      const folder = makeNode("folder");
      folder.item = { id: "folder-1", type: "folder" };
      folder.state = { ghosted: false };
      const pageTrack = makePageTrack([folder]);
      const layer = makeLayer(DesktopLayer, pageTrack);
      layer.iconNodes.set("page:0:folder-1", folder);
      layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();

      layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
      layer.releaseClosingFolderHandoffVisual("folder-1");
      layer.lastFolderSourceGhostingState = {
        folderSourceGhostedIds: new Set(),
        isFolderOpeningPreviewFrameGhosted: () => false,
      };

      layer.commitFolderSourceGhosting();
      assert(layer.getFolderHandoffEntry("folder-1")?.cleanupFrame?.cancelled === false, "source ghosting commit should schedule eligible handoff cleanup");
      motionRuntime.flushAfterFrameForTests();
      assert(!layer.getFolderHandoffEntry("folder-1"), "scheduled source ghosting reconciliation should clear eligible handoff entries");
    } finally {
      motionRuntime.reset();
    }
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.iconNodes.set("page:0:folder-1", folder);
    layer.boundsRegistration = {
      entries: [{
        area: "desktop",
        item: folder.item,
        node: folder,
        x: 22,
        y: 44,
      }],
    };

    assert(layer.startClosingFolderHandoffNow("folder-1"), "ready handoff should find the current desktop folder node");
    assert(pageTrack.children[1] === folder, "ready handoff should raise the folder node");
    assert(folder.position.x === 22 && folder.position.y === 44, "ready handoff should snap to the current desktop target");
    assert(folder.visualWrap.visible === false, "ready handoff should keep the real folder artwork hidden under the overlay");
    assert(folder.labelRevealCount === 0, "ready handoff should keep the real folder label hidden while the overlay owns the transition");
    assert(folder.labelText.renderable === false && folder.labelText.alpha === 0, "ready handoff should park the folder label as non-renderable at a hidden alpha");
    folder.labelText.alpha = 0.4;
    assert(layer.startClosingFolderHandoffNow("folder-1"), "duplicate ready handoff should keep the existing handoff active");
    assert(folder.labelRevealCount === 0, "duplicate ready handoff should not reveal the label");
    assert(folder.labelText.renderable === false && folder.labelText.alpha === 0, "duplicate ready handoff should keep the label hidden until source release");
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(folder.labelRevealCount === 1, "visual release should start the folder label fade exactly once");
    assert(folder.labelRestoreCount === 0 && folder.labelText.renderable === true && folder.labelText.alpha === 0, "visual release should hand the label to the fade path instead of restoring immediately");
  }

  {
    const folder = makeNode("folder");
    folder.item = { id: "folder-1", type: "folder" };
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set(["folder-1"]);
    layer.singleStageFolderLayer.hasVisibleFolderSubstitute = () => false;

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 }, { revealLabel: false });
    layer.releaseClosingFolderHandoffVisual("folder-1");

    assert(folder.visualWrap.visible === true, "visual release should restore artwork");
    assert(folder.labelRevealCount === 1, "visual release should fade the label from zero");
    assert(folder.labelRestoreCount === 0 && folder.labelText.renderable === true && folder.labelText.alpha === 0, "visual release should hand the label to the fade path as soon as the closing ghost returns");

    layer.singleStageFolderLayer.getDesktopSourceGhostedIds = () => new Set();
    layer.singleStageFolderLayer.hasVisibleFolderSubstitute = () => false;
    layer.lastFolderSourceGhostingState = {
      folderSourceGhostedIds: new Set(["folder-1"]),
      isFolderOpeningPreviewFrameGhosted: () => false,
    };
    assert(!layer.revealFolderHandoffLabelWhenSettled(layer.getFolderHandoffEntry("folder-1")), "raw Vue source ghosting should still suppress the handoff label reveal");
    assert(folder.labelRevealCount === 1 && folder.labelRestoreCount === 0, "raw Vue source ghosting should not restart an already released label fade");

    layer.lastFolderSourceGhostingState = {
      folderSourceGhostedIds: new Set(),
      isFolderOpeningPreviewFrameGhosted: () => false,
    };
    assert(layer.revealFolderHandoffLabelWhenSettled(layer.getFolderHandoffEntry("folder-1")), "settled source ownership should accept the already released label state");
    assert(folder.labelRevealCount === 1 && folder.labelRestoreCount === 0, "settled source ownership should not restart the released label fade");
  }

  {
    const iconBoundsRegistry = createIconBoundsRegistry();
    makeLayer.iconBoundsRegistry = iconBoundsRegistry;
    const folder = makeNode("folder");
    folder.item = {
      children: [{ id: "child-1" }],
      id: "folder-1",
      type: "folder",
    };
    folder.getFolderThumbBounds = () => ({ height: 60, left: 10, top: 20, width: 60 });
    folder.getIconBounds = () => ({ height: 80, left: 0, top: 10, width: 80 });
    folder.getFolderPreviewChildBounds = () => ({ height: 12, left: 18, top: 28, width: 12 });
    const pageTrack = makePageTrack([folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    iconBoundsRegistry.registerBounds(K.FOLDER_THUMB, V.RENDERED, "folder-1", { height: 60, left: 10, top: 20, width: 60 }, {
      area: "desktop",
      id: "folder-1",
    });

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.clearFolderHandoffNode();

    assert(layer.folderHandoffNode === null, "debug snapshot should not prevent handoff cleanup");
    assert(layer.folderHandoffNodes.size === 0, "debug snapshot cleanup should remove the handoff entry");
    assert(layer.lastFolderHandoffDebugSnapshot?.childRows?.length === 1, "debug snapshot should include preview child rows");
    assert(layer.lastFolderHandoffDebugSnapshot.childRows[0].target, "debug snapshot should resolve preview child targets");
    iconBoundsRegistry.clearBounds();
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, {
      scaleX: 1.087,
      scaleY: 1.086,
      x: 18,
      y: 42,
    });

    assert(folder.position.x === 18 && folder.position.y === 42, "handoff should apply the pinned position");
    assert(folder.scale.x === 1.087 && folder.scale.y === 1.086, "handoff should apply inverse shell scale");
  }

  {
    const calls = [];
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.singleStageDragPreviewLayer = {
      update(state) {
        calls.push(state);
      },
    };
    const previewState = { item: { id: "app-a", type: "app" } };
    const releaseState = { item: { id: "app-a", type: "app" } };

    layer.updateSingleStageDragPreviewLayer({
      dragFolderHoverState: { phase: "hover", targetType: "folder" },
      dragPreviewState: previewState,
      dragReleaseState: releaseState,
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 10, top: 20, width: 800 },
      width: 800,
    });

    assert(calls[0].previewState === previewState, "root-stage drag preview should receive the active preview state");
    assert(calls[0].releaseState === releaseState, "root-stage drag preview should receive the active release state");

    layer.updateSingleStageDragPreviewLayer({
      dragPreviewState: null,
      dragReleaseState: null,
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      stageRect: { height: 600, left: 10, top: 20, width: 800 },
      width: 800,
    });

    assert(calls[1].previewState === null, "root-stage drag preview should clear when no preview state is active");
    assert(calls[1].releaseState === null, "root-stage drag preview should clear when no release state is active");
  }

  {
    const calls = [];
    const geometries = [];
    const pageTrack = makePageTrack([]);
    pageTrack.x = -123.25;
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.lastDesktopRenderPlan = { targetX: -480 };
    layer.onFolderGeometryChange = (geometry) => geometries.push(geometry);
    layer.singleStageFolderLayer = {
      update(state) {
        calls.push(state);
        return { folderRect: state.renderedFolder ? { left: 1, top: 2, width: 3, height: 4 } : null };
      },
    };

    layer.updateSingleStageFolderLayer({
      singleStageFolderState: {
        height: 600,
        renderedFolder: { id: "folder-1" },
        stageRect: { height: 600, left: 0, top: 0, width: 800 },
        width: 800,
      },
    });

    assert(calls[0].desktopPageTrackOffset.liveX === -123.25, "folder overlay state should receive the desktop pageTrack live x");
    assert(calls[0].desktopPageTrackOffset.targetX === -480, "folder overlay state should receive the desktop render target x");
    assert(geometries[0].folderRect.left === 1, "folder geometry changes should still be forwarded after offset injection");

    layer.lastDesktopRenderPlan = null;
    pageTrack.x = 18;
    layer.updateSingleStageFolderLayer({
      height: 500,
      singleStageFolderState: null,
      stageRect: { height: 500, left: 10, top: 20, width: 700 },
      width: 700,
    });

    assert(calls[1].renderedFolder === null, "empty folder overlay state should still clear rendered folder");
    assert(calls[1].desktopPageTrackOffset.liveX === 18, "empty folder overlay state should receive desktop pageTrack live x");
    assert(calls[1].desktopPageTrackOffset.targetX === 18, "missing render plan target should fall back to live x");
  }

  {
    const before = makeNode("before");
    const folder = makeNode("folder");
    const pageTrack = makePageTrack([before, folder]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    try {
      layer.ensureFolderHandoffNode("folder-1", folder, { x: 20, y: 30 });
      layer.finishFolderHandoffNodeAfterFrame();

      assert(layer.folderHandoffNode.cleanupFrame?.cancelled === false, "finish should wait one runtime frame before cleanup");
      assert(folder.labelRevealCount === 1, "finish should release the source label fade before cleanup when no substitute remains");
      assert(folder.visualWrap.visible === true, "finish should restore the real folder artwork before final cleanup when no substitute remains");
      assert(pageTrack.children[1] === folder, "handoff should stay raised until the cleanup frame");
      layer.releaseClosingFolderHandoffVisual("folder-1");
      assert(folder.labelRevealCount === 1, "late visual release should not restart the label reveal before cleanup");
      assert(folder.visualWrap.visible === true, "settled overlay release should restore artwork before final handoff cleanup");

      motionRuntime.flushAfterFrameForTests();

      assert(layer.folderHandoffNode === null, "cleanup frame should clear handoff state");
      assert(layer.folderHandoffNodes.size === 0, "cleanup frame should clear handoff entries");
      assert(pageTrack.children[1] === folder, "cleanup frame should preserve the restored z order");
      assert(folder.visualWrap.visible === true, "cleanup frame should keep the real folder artwork visible");
      assert(folder.labelRevealCount === 1, "cleanup frame should not restart the label reveal");
    } finally {
      motionRuntime.reset();
    }
  }

  {
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const overlayDebug = {
      openingGeometry: {
        session: { folderId: "folder-1", token: 7 },
        snapshot: { folderId: "folder-1", targetKey: "target-a" },
      },
    };
    layer.singleStageFolderLayer.getVisualDebugSnapshot = () => overlayDebug;

    const snapshot = layer.getFolderVisualDebugSnapshot();

    assert(snapshot.overlay.debug === overlayDebug, "folder visual debug snapshot should expose overlay geometry diagnostics");
  }

  {
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const originalQueueMicrotask = globalThis.queueMicrotask;
    const queued = [];
    let refreshCount = 0;
    globalThis.queueMicrotask = (callback) => queued.push(callback);
    layer.refreshInteractiveBounds = () => {
      refreshCount += 1;
    };
    layer.singleStageFolderLayer.refreshRegisteredIconBounds = () => {
      refreshCount += 10;
    };

    try {
      layer.markInteractiveBoundsDirty();
      layer.markInteractiveBoundsDirty();
      layer.markInteractiveBoundsDirty();

      assert(refreshCount === 0, "dirty bounds should not refresh synchronously");
      assert(queued.length === 1, "dirty bounds should schedule one coalesced flush");
      queued.shift()();
      assert(refreshCount === 11, "coalesced bounds flush should refresh desktop and folder overlay bounds once");
      layer.flushInteractiveBounds();
      assert(refreshCount === 11, "clean bounds flush should not refresh again");
      layer.flushInteractiveBounds({ force: true });
      assert(refreshCount === 22, "forced bounds flush should refresh desktop and folder overlay bounds even when clean");
    } finally {
      if (originalQueueMicrotask) globalThis.queueMicrotask = originalQueueMicrotask;
      else delete globalThis.queueMicrotask;
    }
  }

  {
    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    const originalQueueMicrotask = globalThis.queueMicrotask;
    const queued = [];
    let refreshCount = 0;
    globalThis.queueMicrotask = (callback) => queued.push(callback);
    layer.refreshInteractiveBounds = () => {
      refreshCount += 1;
    };
    layer.singleStageFolderLayer.refreshRegisteredIconBounds = () => {
      refreshCount += 10;
    };

    try {
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1, y: 0 },
        singleStageFolderState: { renderedFolder: { id: "folder-1" } },
        width: 800,
      });
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1.08, y: 0 },
        singleStageFolderState: { renderedFolder: { id: "folder-1" } },
        width: 800,
      });

      assert(queued.length === 0, "active folder overlay transform should wait for spring updates before flushing bounds");
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1, y: 0 },
        singleStageFolderState: null,
        width: 800,
      });
      assert(queued.length === 1, "inactive folder overlay transform snap should refresh stale bounds immediately");
      queued.shift()();
      assert(refreshCount === 11, "inactive folder overlay snap should flush desktop and folder overlay bounds");
    } finally {
      if (originalQueueMicrotask) globalThis.queueMicrotask = originalQueueMicrotask;
      else delete globalThis.queueMicrotask;
    }
  }
}
