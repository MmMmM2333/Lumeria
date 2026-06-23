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
    labelText: { alpha: 0.5, visible: true },
    labelRevealCount: 0,
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
    setFolderHandoffVisualHidden(hidden) {
      this.visualWrap.visible = !hidden;
    },
    revealLabelAfterGhost() {
      this.labelRevealCount += 1;
      this.labelText.alpha = 0;
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
  layer.pageTrack = pageTrack;
  layer.desktopClosingUnderlayLayer = makeTransformNode();
  layer.singleStageFolderLayer = makeTransformNode();
  layer.visualOwnership = { snapshot: () => [] };
  layer.visualRoot = makeTransformNode();
  return layer;
}

function makeCloseSession(options = {}) {
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
    isHandoffActive() {
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
    clearIconBoundsRegistry,
    registerRenderedClientTopLevelFolderThumbBounds,
  } = await import("../geometry/iconBoundsRegistry.js");
  const {
    FolderVisualOwnershipRegistry,
    makeDesktopSourceVisualKey,
  } = await import("./folderVisualOwnershipRegistry.js");
  const { motionRuntime } = await import("../animation/motionRuntime.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[DesktopLayer test failed] ${message}`);
  };

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
    assert(!shouldFinishFolderHandoff({ folderClosingHandoffIds: ["folder-b"] }, { closeSession: makeCloseSession() }), "array closing handoff ids should keep the desktop handoff alive");
    assert(!shouldFinishFolderHandoffEntry({ folderClosingHandoffId: "folder-a" }, null, "folder-a"), "legacy singular closing handoff id should keep its folder handoff alive");
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
    assert(!shouldFinishFolderHandoff({}, { closeSession: makeCloseSession({ active: true }) }), "local Pixi handoff activity should keep the desktop handoff alive before the Vue bridge updates");
    assert(shouldFinishFolderHandoff({}, { closeSession: makeCloseSession({ active: false }) }), "idle state with no prop handoff should finish the desktop handoff");
    assert(!shouldFinishFolderHandoff({ folderClosingHandoffId: "folder-1" }, { closeSession: makeCloseSession({ active: false }) }), "active prop handoff should keep the desktop handoff alive");
    assert(!shouldFinishFolderHandoffEntry({}, { closeSession: makeCloseSession({ active: true, folderId: "folder-1" }) }, "folder-1"), "matching Pixi activity should keep its folder handoff alive");
    assert(!shouldFinishFolderHandoffEntry({}, { getDesktopSourceGhostedIds: () => new Set(["folder-1"]) }, "folder-1"), "detached desktop source ownership should keep its folder handoff alive");
    assert(shouldFinishFolderHandoffEntry({}, { closeSession: makeCloseSession({ active: true, folderId: "folder-2" }) }, "folder-1"), "different-folder Pixi activity should not keep an old handoff alive by itself");

    const actualLayer = new DesktopLayer();
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
      singleStageFolderLayerEnabled: true,
      singleStageFolderState: { renderedFolder: { id: "folder-1" } },
      width: 800,
    });
    assert(closingLayer.singleStageFolderLayer.scale.x === 1.08 && closingLayer.singleStageFolderLayer.scale.y === 1.08, "closing launchpad should scale the folder overlay layer");

    closingLayer.singleStageFolderLayer.scale.set(1.08);
    closingLayer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1, y: 0 },
      singleStageFolderLayerEnabled: true,
      singleStageFolderState: null,
      width: 800,
    });
    assert(closingLayer.singleStageFolderLayer.scale.x === 1 && closingLayer.singleStageFolderLayer.scale.y === 1, "inactive folder overlay should snap back to identity scale");
    assert(closingLayer.hasSingleStageFolderOverlayContent({
      singleStageFolderLayerEnabled: true,
      singleStageFolderState: { renderedFolder: { id: "folder-1" } },
    }), "folder overlay content should require an enabled layer and rendered folder");
    assert(!closingLayer.hasSingleStageFolderOverlayContent({
      singleStageFolderLayerEnabled: true,
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
    assert(folder.labelText.visible === true && folder.labelText.alpha === 0, "handoff should start the folder label fade from a hidden label");
    assert(folder.labelRevealCount === 1, "handoff should start the label fade when the icon arrives");
    folder.labelText.alpha = 0.4;
    layer.syncFolderHandoffNode(folder, { x: 12, y: 34 });
    assert(folder.labelText.alpha === 0.4, "handoff position sync should not reset an in-progress label fade");
    assert(folder.labelRevealCount === 1, "handoff position sync should not restart the label reveal");
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(folder.labelRevealCount === 1, "visual release should not restart the folder label fade");
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
    const originalDebug = globalThis.__LP_DEBUG_FOLDER_HANDOFF__;
    const originalLastDebug = globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__;
    const originalLog = console.log;
    globalThis.__LP_DEBUG_FOLDER_HANDOFF__ = { log: true };
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
      assert(
        globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__?.folderId === "folder-1" &&
          globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__?.phase === "desktop-restore-after",
        "desktop restore debug should publish the latest folder handoff snapshot"
      );
    } finally {
      console.log = originalLog;
      if (originalDebug === undefined) delete globalThis.__LP_DEBUG_FOLDER_HANDOFF__;
      else globalThis.__LP_DEBUG_FOLDER_HANDOFF__ = originalDebug;
      if (originalLastDebug === undefined) delete globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__;
      else globalThis.__LP_LAST_FOLDER_HANDOFF_DEBUG__ = originalLastDebug;
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
    assert(folder.labelRevealCount === 1, "ready handoff should start the label fade at handoff readiness");
    assert(folder.labelText.alpha === 0, "ready handoff should start the label fade from a hidden label");
    folder.labelText.alpha = 0.4;
    assert(layer.startClosingFolderHandoffNow("folder-1"), "duplicate ready handoff should keep the existing handoff active");
    assert(folder.labelRevealCount === 1, "duplicate ready handoff should not restart the label fade");
    assert(folder.labelText.alpha === 0.4, "duplicate ready handoff should keep the in-progress label fade");
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(folder.labelRevealCount === 1, "visual release should not restart the label fade after ready handoff");
  }

  {
    clearIconBoundsRegistry();
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

    registerRenderedClientTopLevelFolderThumbBounds("folder-1", { height: 60, left: 10, top: 20, width: 60 }, {
      area: "desktop",
      id: "folder-1",
    });

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });
    layer.clearFolderHandoffNode();

    assert(layer.folderHandoffNode === null, "debug snapshot should not prevent handoff cleanup");
    assert(layer.folderHandoffNodes.size === 0, "debug snapshot cleanup should remove the handoff entry");
    assert(layer.lastFolderHandoffDebugSnapshot?.childRows?.length === 1, "debug snapshot should include preview child rows");
    assert(layer.lastFolderHandoffDebugSnapshot.childRows[0].target, "debug snapshot should resolve preview child targets");
    clearIconBoundsRegistry();
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
      singleStageDragPreviewEnabled: true,
      stageRect: { height: 600, left: 10, top: 20, width: 800 },
      width: 800,
    });

    assert(calls[0].previewState === previewState, "root-stage drag preview should receive the active preview state");
    assert(calls[0].releaseState === releaseState, "root-stage drag preview should receive the active release state");

    layer.updateSingleStageDragPreviewLayer({
      dragPreviewState: previewState,
      dragReleaseState: releaseState,
      folderPageSize: 9,
      height: 600,
      iconSize: 64,
      isTextlessMode: false,
      launchTargetStatusById: {},
      showMissingLaunchTargetBadge: true,
      singleStageDragPreviewEnabled: false,
      stageRect: { height: 600, left: 10, top: 20, width: 800 },
      width: 800,
    });

    assert(calls[1].previewState === null, "disabled root-stage drag preview should clear the preview state");
    assert(calls[1].releaseState === null, "disabled root-stage drag preview should clear the release state");
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
      assert(folder.labelRevealCount === 1, "finish should not restart the label reveal after handoff readiness");
      assert(folder.visualWrap.visible === false, "finish should keep the real folder artwork hidden until settled overlay release");
      assert(pageTrack.children[1] === folder, "handoff should stay raised until the cleanup frame");
      layer.releaseClosingFolderHandoffVisual("folder-1");
      assert(folder.labelRevealCount === 1, "visual release should not restart the label reveal before cleanup");
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
        singleStageFolderLayerEnabled: true,
        singleStageFolderState: { renderedFolder: { id: "folder-1" } },
        width: 800,
      });
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1.08, y: 0 },
        singleStageFolderLayerEnabled: true,
        singleStageFolderState: { renderedFolder: { id: "folder-1" } },
        width: 800,
      });

      assert(queued.length === 0, "active folder overlay transform should wait for spring updates before flushing bounds");
      layer.applyFolderOverlayTransform({
        height: 600,
        launchpadVisualTransform: { scale: 1, y: 0 },
        singleStageFolderLayerEnabled: false,
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
