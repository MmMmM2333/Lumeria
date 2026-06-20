import {
  getClosingPreviewTiming,
  getFolderPageDotsFrame,
  getFolderPageDotVisualState,
  getFolderPageMaskRect,
  makePanelVisualRect,
} from "./folderOverlayGeometry.js";
import {
  applyClosingHandoffOnlyOverlayState,
  applyClosingPresentationOverlayState,
  cancelClosingHandoffCleanup,
  finishClosingHandoff,
  getClosingPresentationStageHitRects,
} from "./folderClosingHandoff.js";
import {
  clearIconBoundsRegistry,
  getRenderedClientLaunchIconBounds,
} from "../geometry/iconBoundsRegistry.js";
import { motionRuntime } from "../animation/motionRuntime.js";

function makeClosingHandoffHarness(calls) {
  return {
    closingFrameComplete: true,
    closingGhostKeys: new Set(),
    closingHandoffCleanupFrame: null,
    closingHandoffCleanupToken: 0,
    closingPreviewSwapKeys: new Set(["swap"]),
    closingPreviewSwapLayer: {
      destroyed: false,
      removeChildren() {
        calls.push("clear-swap");
        return [];
      },
    },
    openingGhostKeys: new Set(),
    pageTrack: { visible: true },
    clearClosingGhostRevealTimer() {
      calls.push("clear-timer");
    },
    clearCompletedClosingPreviewGhosts() {
      calls.push("clear-preview");
    },
    clearFrameGhost() {
      calls.push("clear-frame");
    },
    flushCompletedClosingControllerGhosts() {
      calls.push("flush-controller");
    },
  };
}

export async function runFolderOverlayLayerTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const { FolderOverlayLayer } = await import("./FolderOverlayLayer.js");
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder overlay layer test failed] ${message}`);
  };

  const geometry = {
    grid: { height: 420, width: 884 },
    panel: { height: 560, width: 1000 },
  };
  const mask = getFolderPageMaskRect(geometry, 58, 64);

  assert(mask.left === 58, "folder page mask should start at the grid left edge");
  assert(mask.width === 884, "folder page mask should match the grid width, not the full panel width");
  assert(mask.top === 64, "folder page mask should preserve the grid top edge");
  assert(mask.height === 476, "folder page mask should keep the existing vertical panel coverage");

  const dotsFrame = getFolderPageDotsFrame({
    grid: { height: 240, left: 220, top: 270, width: 720 },
    panel: { height: 360, left: 180, top: 200, width: 800 },
  });
  assert(dotsFrame.left === 180 && dotsFrame.width === 800, "Pixi page dots should span the panel width");
  assert(dotsFrame.top === 521, "Pixi page dots should sit in the lower panel padding below the grid");
  assert(dotsFrame.height === 28, "Pixi page dots should keep a stable hit height");

  const fallbackDotsFrame = getFolderPageDotsFrame({
    panel: { height: 360, left: 180, top: 200, width: 800 },
  });
  assert(fallbackDotsFrame.top === 519, "Pixi page dots should have a panel-only fallback position");
  assert(getFolderPageDotVisualState().alpha === 0.28, "idle Pixi page dots should match the DOM idle alpha");
  assert(getFolderPageDotVisualState({ hovered: true }).alpha === 0.5, "hovered Pixi page dots should match the DOM hover alpha");
  const activeDot = getFolderPageDotVisualState({ active: true, hovered: true });
  assert(activeDot.alpha === 0.96 && activeDot.scale === 1.02, "active Pixi page dots should keep the active visual while hovered");

  const visualRect = makePanelVisualRect(
    {
      pivot: { x: 500, y: 280 },
      scale: { x: 0.5, y: 0.25 },
      x: 620,
      y: 360,
    },
    { height: 560, width: 1000 },
    { progress: 0.6, radius: 48 }
  );
  assert(visualRect.left === 370, "panel visual rect should use the current scaled panel left");
  assert(visualRect.top === 290, "panel visual rect should use the current scaled panel top");
  assert(visualRect.width === 500, "panel visual rect should use the current scaled panel width");
  assert(visualRect.height === 140, "panel visual rect should use the current scaled panel height");
  assert(visualRect.radius === 12, "panel visual rect should scale the corner radius");
  assert(visualRect.progress === 0.6, "panel visual rect should preserve progress");

  {
    const layer = {
      hitArea: { width: 100 },
      pageTrack: { visible: true },
      panel: { visible: true },
    };

    applyClosingHandoffOnlyOverlayState(layer);
    assert(layer.hitArea === null, "handoff-only overlay should not keep a full-screen pointer hit area");
    assert(layer.panel.visible === false && layer.pageTrack.visible === false, "handoff-only overlay should hide stale folder visuals");
  }

  {
    const layer = {
      frameGhostState: { height: 60, left: 20, top: 30, width: 60 },
      hitArea: null,
      pageDotsLayer: { eventMode: "static", hitArea: { width: 100 }, visible: true },
      stageRect: { left: 100, top: 200, width: 800, height: 600 },
    };

    const hitArea = applyClosingPresentationOverlayState(layer);
    assert(hitArea.contains(24, 34), "closing presentation overlay should keep the closing folder hit target active");
    assert(!hitArea.contains(200, 200), "closing presentation overlay should not block unrelated desktop icon positions");
    assert(layer.pageDotsLayer.visible === false && layer.pageDotsLayer.eventMode === "none" && layer.pageDotsLayer.hitArea === null, "closing presentation overlay should disable stale page dots");
  }

  {
    const layer = {
      closingFolderHandoffRect: { height: 60, left: 140, top: 260, width: 60 },
      frameGhostState: null,
      stageRect: { left: 100, top: 200, width: 800, height: 600 },
    };
    const rects = getClosingPresentationStageHitRects(layer);
    assert(rects.length === 1, "handoff rect should project into a stage hit rect");
    assert(rects[0].left === 40 && rects[0].top === 60, "handoff client rect should be converted to stage coordinates");
  }

  {
    const layer = Object.create(FolderOverlayLayer.prototype);
    const calls = [];
    layer.isClosing = false;
    layer.onOutsidePointerDown = () => calls.push("outside");
    layer.onPanelPointerDown = () => calls.push("panel");
    layer.panelGeometry = { height: 220, left: 120, top: 140, width: 360 };
    layer.stageRect = { height: 600, left: 0, top: 0, width: 800 };

    const makeEvent = (clientX, clientY) => ({
      nativeEvent: {
        clientX,
        clientY,
        preventDefault() {
          calls.push("prevent");
        },
        stopPropagation() {
          calls.push("stop");
        },
      },
    });

    layer.handlePointerDown(makeEvent(180, 200));
    layer.handlePointerDown(makeEvent(40, 200));
    assert(calls.join(",") === "prevent,stop,panel,prevent,stop,outside", "folder pointer down should route panel hits separately from outside hits");
  }

  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.currentFolderId = null;
    layer.markRegisteredBoundsDirty = () => {};
    layer.notifyPanelTitleFrame = () => {};
    layer.panel = {
      alpha: 1,
      x: 0,
      y: 0,
      scale: {
        x: 1,
        y: 1,
        set(x, y = x) {
          this.x = x;
          this.y = y;
        },
      },
    };
    layer.panel.position = {
      set(x, y) {
        layer.panel.x = x;
        layer.panel.y = y;
      },
    };
    const panelRect = { height: 360, left: 180, top: 200, width: 800 };
    const stageRect = { height: 600, left: 0, top: 0, width: 1000 };
    const baseState = {
      isFolderAppLaunchClosing: false,
      renderedFolder: { id: "folder-1" },
      stageRect,
    };

    layer.animatePanel({ ...baseState, isFolderClosing: false }, 580, 380, panelRect, null);
    motionRuntime.step(0.02);
    layer.animatePanel(
      { ...baseState, isFolderClosing: true },
      580,
      380,
      panelRect,
      { height: 64, left: 200, top: 240, width: 64 }
    );

    const handoffSnapCount = motionRuntime.debugSnapshot().counters.canceledByReason["folder-panel-handoff-snap"] || 0;
    assert(handoffSnapCount >= 1, "folder panel handoff snap should use a specific cancel reason");
    assert(layer.panel.alpha === 0, "folder panel handoff snap should still hide the panel immediately");
    motionRuntime.reset();
  }

  {
    motionRuntime.reset();
    const layer = Object.create(FolderOverlayLayer.prototype);
    const dot = {
      alpha: 0,
      clear() {
        return this;
      },
      circle() {
        return this;
      },
      fill() {
        return this;
      },
      scale: {
        x: 1,
        y: 1,
        set(value) {
          this.x = value;
          this.y = value;
        },
      },
    };
    const idleVisual = getFolderPageDotVisualState({ active: false, hovered: false });
    const hoverVisual = getFolderPageDotVisualState({ active: false, hovered: true });

    layer.setPageDotHover(dot, false, false, { immediate: true });
    assert(dot.alpha === idleVisual.alpha && dot.scale.x === idleVisual.scale, "immediate page dot state should apply the visual target directly");
    layer.setPageDotHover(dot, false, true);
    motionRuntime.step(0.04);
    assert(dot.alpha > idleVisual.alpha && dot.alpha < hoverVisual.alpha, "page dot hover-in should animate alpha toward the hover state");

    const alphaBeforeHoverOut = dot.alpha;
    layer.setPageDotHover(dot, false, false);
    const blendSnapshot = motionRuntime.debugSnapshot();
    const alphaBlend = blendSnapshot.animations.find((animation) => animation.prop === "alpha" && animation.laneKey === "overlay");

    assert(nearlyEqual(dot.alpha, alphaBeforeHoverOut), "page dot hover-out blend should keep the current visual value on takeover");
    assert((blendSnapshot.counters.canceledByReason.blend || 0) >= 1, "page dot hover interruption should be observable as a blend cancellation");
    assert(alphaBlend?.blendDuration === 0.08, "page dot hover should use a short blend window");

    motionRuntime.step(0.04);
    assert(dot.alpha < alphaBeforeHoverOut && dot.alpha > idleVisual.alpha, "page dot hover-out should blend back toward idle without jumping");
    for (let index = 0; index < 20; index += 1) motionRuntime.step(0.05);
    assert(nearlyEqual(dot.alpha, idleVisual.alpha), "page dot hover-out should settle on the idle alpha");
    motionRuntime.reset();
  }

  const compactTiming = getClosingPreviewTiming({ height: 490 }, { height: 70 });
  assert(compactTiming.progress === 0.76, "compact folder preview swap should keep the default start progress");
  assert(compactTiming.iconDuration === 0.22, "compact folder preview icons should keep the default duration");
  assert(compactTiming.swapDuration === 0.18, "compact folder preview wrap should keep the default duration");

  const midTiming = getClosingPreviewTiming({ height: 665 }, { height: 70 });
  assert(nearlyEqual(midTiming.factor, 0.5), "preview timing should scale from the panel-to-thumbnail ratio");
  assert(nearlyEqual(midTiming.progress, 0.72), "mid-height preview swap should start between compact and tall timings");
  assert(nearlyEqual(midTiming.iconDuration, 0.24), "mid-height preview icons should interpolate duration");
  assert(nearlyEqual(midTiming.swapDuration, 0.2), "mid-height preview wrap should interpolate duration");

  const tallTiming = getClosingPreviewTiming({ height: 840 }, { height: 70 });
  assert(tallTiming.progress === 0.68, "tall folder preview swap should start earlier");
  assert(tallTiming.iconDuration === 0.26, "tall folder preview icons should run slightly longer");
  assert(tallTiming.swapDuration === 0.22, "tall folder preview wrap should run slightly longer");

  {
    const originalRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => 1;
    try {
      const layer = Object.create(FolderOverlayLayer.prototype);
      layer.iconBoundsRefreshers = new Map();
      layer.openingGhostBoundsRefreshers = new Map();
      layer.registeredBoundsDirty = false;
      layer.registeredBoundsFlushQueued = false;
      let refreshCount = 0;
      layer.refreshRegisteredIconBounds = () => {
        refreshCount += 1;
        return refreshCount;
      };

      layer.markRegisteredBoundsDirty();
      layer.markRegisteredBoundsDirty();
      assert(refreshCount === 0, "registered bounds dirty should wait until the runtime frame-end flush");
      motionRuntime.flushAfterFrameForTests();
      assert(refreshCount === 1, "registered bounds dirty should coalesce repeated marks into one refresh");
      assert(layer.registeredBoundsDirty === false && layer.registeredBoundsFlushQueued === false, "registered bounds flush should clear queued flags");
    } finally {
      globalThis.requestAnimationFrame = originalRaf;
      motionRuntime.reset();
    }
  }

  {
    clearIconBoundsRegistry();
    const layer = Object.create(FolderOverlayLayer.prototype);
    layer.iconBoundsRefreshers = new Map();
    layer.openingGhostBoundsRefreshers = new Map();

    const app = { id: "app-1", type: "app" };
    const makeNode = (left) => ({
      getIconBounds: () => ({ height: 20, left, top: 10, width: 20 }),
    });
    const state = {
      folderPageIndex: 0,
      height: 100,
      stageRect: { height: 100, left: 0, top: 0, width: 100 },
      width: 100,
    };
    const target = {
      folderId: "folder-1",
      iconSize: 20,
      index: 0,
      item: app,
      pageIndex: 0,
      targetStageLayoutRect: { height: 20, left: 30, top: 40, width: 20 },
    };

    layer.iconBoundsRefreshers.set("real", () => layer.registerOpeningGhostBounds(state, target, makeNode(12)));
    layer.openingGhostBoundsRefreshers.set("app-1", () => layer.registerOpeningGhostBounds(state, target, makeNode(52)));
    layer.refreshRegisteredIconBounds();

    const rect = getRenderedClientLaunchIconBounds(
      { area: "folder", folderId: "folder-1", id: "app-1", pageIndex: 0 },
      { area: "folder", folderId: "folder-1", id: "app-1", pageIndex: 0 }
    );
    assert(rect.left === 52, "opening ghost bounds should refresh after hidden real icon bounds and win during folder open");
    clearIconBoundsRegistry();
  }

  {
    const scheduler = {
      frames: [],
      cancelAnimationFrame() {
        this.frames = [];
      },
      requestAnimationFrame(callback) {
        this.frames.push(callback);
        return this.frames.length;
      },
    };

    const clearOverlay = (layer) => {
      layer.clearCompletedClosingPreviewGhosts();
      layer.closingPreviewSwapKeys.clear();
      layer.closingPreviewSwapLayer.removeChildren();
      layer.clearFrameGhost();
    };

    const calls = [];
    const layer = makeClosingHandoffHarness(calls);
    finishClosingHandoff(layer, {}, () => clearOverlay(layer), scheduler);
    assert(layer.pageTrack.visible === false, "closing handoff should keep the page track hidden");
    assert(calls.join(",") === "clear-timer,flush-controller", "closing handoff should release controller ghosts before clearing overlay visuals");
    assert(scheduler.frames.length === 1, "closing handoff should schedule deferred overlay cleanup");
    scheduler.frames.shift()();
    assert(
      calls.join(",") === "clear-timer,flush-controller,clear-preview,clear-swap,clear-frame",
      "closing handoff should clear overlay visuals on the deferred frame"
    );

    const orderingCalls = [];
    const orderingLayer = makeClosingHandoffHarness(orderingCalls);
    orderingLayer.flushCompletedClosingControllerGhosts = () => {
      orderingCalls.push("flush-controller");
      scheduler.requestAnimationFrame(() => orderingCalls.push("finish-flow"));
    };
    scheduler.frames = [];
    finishClosingHandoff(orderingLayer, {}, () => clearOverlay(orderingLayer), scheduler);
    scheduler.frames.shift()();
    scheduler.frames.shift()();
    assert(
      orderingCalls.join(",") === "clear-timer,flush-controller,clear-preview,clear-swap,clear-frame,finish-flow",
      "Pixi overlay cleanup should run before the folder flow reveals the real icon"
    );

    const cancelCalls = [];
    const cancelLayer = makeClosingHandoffHarness(cancelCalls);
    scheduler.frames = [];
    finishClosingHandoff(cancelLayer, {}, () => clearOverlay(cancelLayer), scheduler);
    const canceledFrame = scheduler.frames[0];
    cancelClosingHandoffCleanup(cancelLayer, (id) => scheduler.cancelAnimationFrame(id));
    canceledFrame();
    assert(
      cancelCalls.join(",") === "clear-timer,flush-controller",
      "canceling a closing handoff should prevent stale deferred cleanup"
    );
  }

}
