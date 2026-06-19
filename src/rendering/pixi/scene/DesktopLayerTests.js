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
  layer.folderHandoffNode = null;
  layer.hasDesktopVisualAlpha = false;
  layer.hasDesktopVisualTransform = false;
  layer.hasFolderOverlayAlpha = false;
  layer.hasFolderOverlayTransform = false;
  layer.iconNodes = new Map();
  layer.pageTrack = pageTrack;
  layer.singleStageFolderLayer = makeTransformNode();
  layer.visualRoot = makeTransformNode();
  return layer;
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
    resolveDesktopVisualAlpha,
    resolveLaunchpadVisualAlpha,
    resolveLaunchpadVisualTransform,
    shouldFinishFolderHandoff,
  } = await import("./DesktopLayer.js");
  const {
    clearIconBoundsRegistry,
    registerRenderedClientTopLevelFolderThumbBounds,
  } = await import("../geometry/iconBoundsRegistry.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[DesktopLayer test failed] ${message}`);
  };

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
    assert(!shouldFinishFolderHandoff({}, { closingHandoffActive: true }), "local Pixi handoff activity should keep the desktop handoff alive before the Vue bridge updates");
    assert(shouldFinishFolderHandoff({}, { closingHandoffActive: false }), "idle state with no prop handoff should finish the desktop handoff");
    assert(!shouldFinishFolderHandoff({ folderClosingHandoffId: "folder-1" }, { closingHandoffActive: false }), "active prop handoff should keep the desktop handoff alive");

    const pageTrack = makePageTrack([]);
    const layer = makeLayer(DesktopLayer, pageTrack);
    layer.applyDesktopVisualAlpha({ desktopVisualAlpha: 0 });

    assert(layer.visualRoot.visible === true, "hidden desktop should stay renderable so alpha can animate");
    assert(layer.visualRoot.alpha === 0, "hidden desktop should apply the requested alpha");
    assert(layer.visualRoot.interactiveChildren === false, "hidden desktop should not receive icon interaction");
    assert(layer.singleStageFolderLayer.alpha === 1, "desktop alpha should not hide the folder overlay layer");

    layer.applyFolderOverlayTransform({
      height: 600,
      launchpadVisualTransform: { scale: 1, y: 0 },
      width: 800,
    });
    assert(layer.singleStageFolderLayer.scale.x === 1 && layer.singleStageFolderLayer.scale.y === 1, "open folder overlay should keep identity scale");
    assert(layer.singleStageFolderLayer.position.x === 400 && layer.singleStageFolderLayer.position.y === 300, "folder overlay should pivot around the stage center");

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
    const before = makeNode("before");
    const folder = makeNode("folder");
    const after = makeNode("after");
    const pageTrack = makePageTrack([before, folder, after]);
    const layer = makeLayer(DesktopLayer, pageTrack);

    layer.ensureFolderHandoffNode("folder-1", folder, { x: 12, y: 34 });

    assert(pageTrack.children.length === 3, "handoff should reuse the real folder node");
    assert(pageTrack.children[2] === folder, "handoff should raise the real folder node");
    assert(layer.folderHandoffNode.node === folder, "handoff state should reference the real node");
    assert(folder.position.x === 12 && folder.position.y === 34, "handoff should snap node to the target");
    assert(folder.scale.x === 1 && folder.scale.y === 1, "handoff should reset node scale");
    assert(folder.visible === true && folder.alpha === 1, "handoff should make the real node visible");
    assert(folder.visualWrap.visible === false, "handoff should hide the real folder artwork while the Pixi overlay owns the thumbnail");
    assert(folder.eventMode === "static" && folder.cursor === "pointer", "handoff should restore folder interaction once the real node owns the icon");
    assert(folder.state.draggable === true && folder.state.interactive === true, "handoff should restore the node state used by pointer handling");
    assert(folder.state.ghosted === false, "handoff should clear the stale ghost flag before the next setState");
    assert(folder.labelText.visible === true && folder.labelText.alpha === 0, "handoff should keep the folder label hidden until the ready signal");
    assert(folder.labelRevealCount === 0, "plain handoff sync should not start the label fade");
    layer.revealFolderHandoffLabel();
    assert(folder.labelRevealCount === 1, "handoff ready should start the folder label fade");
    folder.labelText.alpha = 0.4;
    layer.syncFolderHandoffNode(folder, { x: 12, y: 34 });
    assert(folder.labelText.alpha === 0.4, "handoff position sync should not hide an in-progress label fade");
    assert(folder.labelRevealCount === 1, "handoff position sync should not restart the label reveal");
    layer.releaseClosingFolderHandoffVisual("folder-1");
    assert(folder.visualWrap.visible === true, "settled overlay visual release should restore the real folder artwork");
    layer.syncFolderHandoffNode(folder, { x: 12, y: 34 });
    assert(folder.visualWrap.visible === true, "handoff position sync should not hide artwork after settled overlay release");

    layer.clearFolderHandoffNode();

    assert(layer.folderHandoffNode === null, "clear should remove handoff state");
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

    assert(folderA.visualWrap.visible === true, "replacing a handoff should restore the previous folder artwork");
    assert(folderB.visualWrap.visible === false, "new handoff should hide only the new folder artwork");
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
    assert(folder.labelRevealCount === 1, "ready handoff should start the label fade immediately");
    folder.labelText.alpha = 0.4;
    assert(layer.startClosingFolderHandoffNow("folder-1"), "duplicate ready handoff should keep the existing handoff active");
    assert(folder.labelRevealCount === 1, "duplicate ready handoff should not restart the label fade");
    assert(folder.labelText.alpha === 0.4, "duplicate ready handoff should not hide an in-progress label fade");
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
    const hadRequestAnimationFrame = "requestAnimationFrame" in globalThis;
    const hadCancelAnimationFrame = "cancelAnimationFrame" in globalThis;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    let queuedFrame = null;
    globalThis.requestAnimationFrame = (callback) => {
      queuedFrame = callback;
      return 9;
    };
    globalThis.cancelAnimationFrame = () => {};

    try {
      layer.ensureFolderHandoffNode("folder-1", folder, { x: 20, y: 30 });
      layer.finishFolderHandoffNodeAfterFrame();

      assert(layer.folderHandoffNode.cleanupFrame === 9, "finish should wait one frame before cleanup");
      assert(folder.labelRevealCount === 1, "finish should not restart the label reveal before cleanup");
      assert(folder.visualWrap.visible === false, "finish should keep the real folder artwork hidden until settled overlay release");
      assert(pageTrack.children[1] === folder, "handoff should stay raised until the cleanup frame");
      layer.releaseClosingFolderHandoffVisual("folder-1");
      assert(folder.visualWrap.visible === true, "settled overlay release should restore artwork before final handoff cleanup");

      queuedFrame();

      assert(layer.folderHandoffNode === null, "cleanup frame should clear handoff state");
      assert(pageTrack.children[1] === folder, "cleanup frame should preserve the restored z order");
      assert(folder.visualWrap.visible === true, "cleanup frame should keep the real folder artwork visible");
      assert(folder.labelRevealCount === 1, "cleanup frame should not restart the label reveal");
    } finally {
      if (hadRequestAnimationFrame) globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      else delete globalThis.requestAnimationFrame;
      if (hadCancelAnimationFrame) globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
      else delete globalThis.cancelAnimationFrame;
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
