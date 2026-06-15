import {
  getClosingPreviewTiming,
  getFolderPageMaskRect,
  resolveOpeningInterruptionFrame,
} from "./folderOverlayGeometry.js";
import {
  cancelClosingHandoffCleanup,
  finishClosingHandoff,
} from "./folderClosingHandoff.js";

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

export function runFolderOverlayLayerTests() {
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

  const visibleOpeningFrame = { height: 520, left: 96, top: 84, width: 920 };
  const fullPanelRect = { height: 560, left: 72, top: 64, width: 1000 };
  const oneRowContentRect = { height: 180, left: 310, top: 160, width: 420 };

  assert(
    resolveOpeningInterruptionFrame(visibleOpeningFrame, fullPanelRect, oneRowContentRect) === visibleOpeningFrame,
    "interrupted close should start from the visible opening frame"
  );
  assert(
    resolveOpeningInterruptionFrame(null, fullPanelRect, oneRowContentRect) === fullPanelRect,
    "interrupted close should fall back to the full panel before current-page content bounds"
  );
  assert(
    resolveOpeningInterruptionFrame(null, null, oneRowContentRect) === oneRowContentRect,
    "interrupted close should use content bounds only as a last fallback"
  );

  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;
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
    assert(scheduler.frames.length === 1, "closing handoff should defer overlay cleanup by one frame");
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
      "folder background cleanup should run before the controller clears the rendered folder"
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
