import { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";
import type {
  FolderFrameGhostLayer,
  FolderFrameGraphics,
  FolderFramePresentation,
} from "./folderFrameGhost.js";

type TestDrawnFrame = Readonly<{
  height: number;
  left: number;
  radius: number;
  top: number;
  width: number;
}>;

interface TestFrameGraphics extends FolderFrameGraphics {
  drawn?: TestDrawnFrame | undefined;
}

type TestFrameLayer = FolderFrameGhostLayer & {
  frameGhost: TestFrameGraphics;
  titleFrame?: FolderFramePresentation | undefined;
};

function requireFrameState(layer: FolderFrameGhostLayer): FolderFramePresentation {
  const state = layer.frameGhostState;
  if (!state) throw new Error("[Pixi folder frame ghost test fixture failed] Missing frame state");
  return state;
}

export async function runFolderFrameGhostTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder frame ghost test failed] ${message}`);
  };
  const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.0001;

  assert(getFrameRadius(null, 32) === 32, "missing frame rect should use the fallback radius");
  assert(getFrameRadius({ height: 20, width: 20 }) === 14, "small frame radius should keep the minimum radius");
  assert(nearlyEqual(getFrameRadius({ height: 120, width: 120 }), 31.2), "medium frame radius should scale with the shorter side");
  assert(getFrameRadius({ height: 400, width: 400 }) === 48, "large frame radius should cap at the maximum radius");

  assert(lerpColor(0x000000, 0xffffff, 0) === 0x000000, "color interpolation should keep the start color at progress 0");
  assert(lerpColor(0x000000, 0xffffff, 0.5) === 0x808080, "color interpolation should round channel midpoints");
  assert(lerpColor(0x000000, 0xffffff, 2) === 0xffffff, "color interpolation should clamp progress above 1");
  assert(lerpColor(0xff0000, 0x00ff00, -1) === 0xff0000, "color interpolation should clamp progress below 0");

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const calls: string[] = [];
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        calls.push("clear");
        return this;
      },
      fill() {
        return this;
      },
      roundRect(left, top, width, height, radius) {
        this.drawn = { height, left, radius, top, width };
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 0, visible: false },
      notifyTitleFrame(frame) {
        this.titleFrame = frame;
      },
    };
    const springConfig = {};
    const from = { height: 100, left: 10, top: 20, width: 200 };
    const firstTo = { height: 120, left: 30, top: 40, width: 220 };
    const secondTo = { height: 90, left: 50, top: 60, width: 140 };

    startFrameGhost(layer, from, firstTo, {
      preserveOnComplete: true,
      snap: true,
      springConfig,
      toFillColor: 0x222222,
      toStrokeColor: 0x333333,
    });
    const state = requireFrameState(layer);
    assert(state.left === 30 && state.width === 220, "frame ghost spring should settle geometry to the first target");
    assert(state.progress === 1, "frame ghost spring should settle progress");
    assert(layer.frameGhostMotionControl === null, "completed preserved frame motion should release its control");

    startFrameGhost(layer, state, secondTo, {
      preserveOnComplete: true,
      snap: true,
      springConfig,
      toFillColor: 0x444444,
      toStrokeColor: 0x555555,
    });
    assert(layer.frameGhostState === state, "retargeted frame ghost should reuse the existing presentation object");
    assert((state.left as number) === 50 && (state.top as number) === 60, "retargeted frame ghost should settle to the new target");
    assert(state.fillColor === 0x444444 && state.strokeColor === 0x555555, "retargeted frame ghost should update final colors");
    motionRuntime.reset();
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect() {
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 1, visible: true },
      notifyTitleFrame() {},
    };

    motionRuntime.reset();
    const desktopRect = { height: 80, left: 120, top: 130, width: 80 };
    const panelRect = { height: 320, left: 40, top: 50, width: 420 };
    startFrameGhost(layer, desktopRect, panelRect, {
      folderId: "folder-1",
      frameGhostPhase: "opening",
      preserveOnComplete: true,
      springConfig: { damping: 3, mass: 1, stiffness: 90 },
    });
    motionRuntime.step(0.08);
    const openingFrame = requireFrameState(layer);
    const beforeClose = { ...openingFrame };
    const beforeVelocity = motionRuntime.debugSnapshot({ includeChannels: true }).animations
      .find((animation) => animation.prop === "value")?.velocity || 0;

    startFrameGhost(layer, beforeClose, desktopRect, {
      folderId: "folder-1",
      frameGhostPhase: "closing",
      preserveOnComplete: true,
      springConfig: { damping: 3, mass: 1, stiffness: 90 },
    });

    assert(layer.frameGhostState === openingFrame, "cross-phase frame ghost retarget should reuse the active presentation object");
    assert(layer.frameGhostPhase === "closing", "cross-phase retarget should record the new frame ghost phase");
    const frameState = requireFrameState(layer);
    assert(nearlyEqual(frameState.left, beforeClose.left) && nearlyEqual(frameState.top, beforeClose.top), "cross-phase retarget should preserve the current physical position on its first frame");
    assert(nearlyEqual(frameState.width, beforeClose.width) && nearlyEqual(frameState.height, beforeClose.height), "cross-phase retarget should preserve the current physical size on its first frame");
    const afterVelocity = motionRuntime.debugSnapshot({ includeChannels: true }).animations
      .find((animation) => animation.prop === "value")?.velocity || 0;
    assert(Math.abs(beforeVelocity) > 0.01 && Math.abs(afterVelocity) > 0.01, "cross-phase retarget should carry the active progress velocity into closing");
    layer.frameGhostMotionControl?.cancel?.();
    motionRuntime.reset();
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect() {
        return this;
      },
      stroke() {
        return this;
      },
    });
    const staleClosingFrame = {
      fillAlpha: 0.8,
      fillColor: 0x123456,
      height: 320,
      left: 40,
      progress: 0.6,
      radius: 48,
      strokeAlpha: 0.7,
      strokeColor: 0x654321,
      strokeWidth: 3,
      top: 50,
      width: 420,
    };
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      frameGhostFolderId: "folder-a",
      frameGhostPhase: "closing",
      frameGhostState: staleClosingFrame,
      panelMaterial: { alpha: 1, visible: true },
      notifyTitleFrame() {},
    };
    const fromRect = { height: 90, left: 120, top: 130, width: 90 };

    motionRuntime.reset();
    startFrameGhost(layer, fromRect, { height: 80, left: 140, top: 150, width: 80 }, {
      folderId: "folder-b",
      frameGhostPhase: "closing",
      fromFillAlpha: 0.22,
      fromFillColor: 0xffffff,
      fromRadius: 18,
      fromStrokeAlpha: 0.26,
      fromStrokeColor: 0xffffff,
      fromStrokeWidth: 1,
      preserveOnComplete: true,
      toFillColor: 0xffffff,
      toStrokeColor: 0xffffff,
    });

    assert(layer.frameGhostState !== staleClosingFrame, "cross-folder frame ghost retarget should not reuse stale same-phase presentation state");
    assert(layer.frameGhostFolderId === "folder-b", "cross-folder retarget should record the new frame ghost folder");
    const frameState = requireFrameState(layer);
    assert(frameState.left === fromRect.left && frameState.width === fromRect.width, "cross-folder retarget should start from the new folder frame");
    assert(frameState.fillAlpha === 0.22 && frameState.fillColor === 0xffffff, "cross-folder retarget should use the new folder fill presentation");
    layer.frameGhostMotionControl?.cancel?.();
    motionRuntime.reset();
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect() {
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 0, visible: false },
      notifyTitleFrame() {},
    };

    motionRuntime.reset();
    const stepFrames = (seconds: number) => {
      let remaining = seconds;
      while (remaining > 0) {
        const delta = Math.min(0.05, remaining);
        motionRuntime.step(delta);
        remaining -= delta;
      }
    };
    startFrameGhost(layer, { height: 100, left: 10, top: 20, width: 200 }, { height: 120, left: 30, top: 40, width: 220 }, {
      crossfadePanelMaterial: true,
      duration: 1,
      ease: (progress) => progress,
      fadeStart: 0.5,
      preserveOnComplete: true,
    });

    const initialPanelAlpha = layer.panelMaterial.alpha;
    const initialFrameAlpha = layer.frameGhost.alpha;
    stepFrames(0.55);
    const midPanelAlpha = layer.panelMaterial.alpha;
    const midFrameAlpha = layer.frameGhost.alpha;
    stepFrames(0.2);
    const laterPanelAlpha = layer.panelMaterial.alpha;
    const laterFrameAlpha = layer.frameGhost.alpha;

    assert(initialPanelAlpha === 0 && initialFrameAlpha === 1, "crossfade should start from a frame-only shell");
    assert(midPanelAlpha > initialPanelAlpha && midFrameAlpha < initialFrameAlpha, "crossfade should move panel and frame alpha in opposite directions on the same frame");
    assert(laterPanelAlpha > midPanelAlpha && laterFrameAlpha < midFrameAlpha, "crossfade should keep the opening shell opacity trend monotonic");
    assert(nearlyEqual(midPanelAlpha + midFrameAlpha, 1), "crossfade should preserve combined shell opacity at mid progress");
    assert(nearlyEqual(laterPanelAlpha + laterFrameAlpha, 1), "crossfade should preserve combined shell opacity at later progress");
    layer.frameGhostMotionControl?.cancel?.();
    motionRuntime.reset();
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect() {
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 1, visible: true },
      notifyTitleFrame() {},
    };

    startFrameGhost(layer, { height: 100, left: 10, top: 20, width: 200 }, { height: 120, left: 30, top: 40, width: 220 }, {
      exclusivePanelMaterialHandoff: true,
      preserveOnComplete: true,
    });

    assert(!layer.panelMaterial.visible && layer.panelMaterial.alpha === 0, "exclusive handoff should hide panel material while frame ghost owns the shell");
    assert(layer.frameGhost.visible && layer.frameGhost.alpha === 1, "exclusive handoff should keep the frame ghost as the only visible shell");
    layer.frameGhostMotionControl?.cancel?.();
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect() {
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 1, visible: true },
      notifyTitleFrame() {},
    };

    startFrameGhost(layer, { height: 100, left: 10, top: 20, width: 200 }, { height: 120, left: 30, top: 40, width: 220 }, {
      exclusivePanelMaterialHandoff: true,
      snap: true,
      springConfig: {},
    });

    assert(layer.panelMaterial.visible && layer.panelMaterial.alpha === 1, "exclusive handoff completion should reveal panel material");
    assert(!layer.frameGhost.visible && layer.frameGhost.alpha === 0, "exclusive handoff completion should hide the frame ghost");
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect(left, top, width, height, radius) {
        this.drawn = { height, left, radius, top, width };
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 1, visible: true },
      notifyTitleFrame() {},
    };
    const fromRect = { height: 64, left: 240, top: 180, width: 64 };
    const toRect = { height: 520, left: 100, top: 80, width: 900 };

    motionRuntime.reset();
    startFrameGhost(layer, fromRect, toRect, {
      folderId: "folder-1",
      frameGhostPhase: "opening",
      preserveOnComplete: true,
      snap: true,
    });
    const staleFullPanelFrame = requireFrameState(layer);
    startFrameGhost(layer, fromRect, toRect, {
      exclusivePanelMaterialHandoff: true,
      folderId: "folder-1",
      frameGhostPhase: "opening",
      fromFillAlpha: 0.18,
      fromRadius: 14,
      preserveOnComplete: true,
    });

    assert(layer.frameGhostState === staleFullPanelFrame, "same opening frame can reuse its presentation object");
    assert(layer.frameGhostState.progress === 0, "fresh opening handoff should restart frame progress");
    assert(layer.frameGhostState.left === fromRect.left && layer.frameGhostState.top === fromRect.top, "fresh opening handoff should reset stale panel position to the source rect");
    assert(layer.frameGhostState.width === fromRect.width && layer.frameGhostState.height === fromRect.height, "fresh opening handoff should reset stale panel size to the source rect");
    assert(layer.frameGhostState.fillAlpha === 0.18 && layer.frameGhostState.radius === 14, "fresh opening handoff should reset stale source presentation");
    const drawnFrame = layer.frameGhost.drawn;
    assert(drawnFrame !== undefined, "opening frame should be drawn before motion starts");
    assert(drawnFrame.left === fromRect.left && drawnFrame.width === fromRect.width, "first drawn opening frame should not flash the stale full-size panel");
    assert(!layer.panelMaterial.visible && layer.panelMaterial.alpha === 0, "exclusive opening handoff should still hide the real panel material on the first frame");
    layer.frameGhostMotionControl?.cancel?.();
    motionRuntime.reset();
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    let arriveCount = 0;
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect() {
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 0, visible: false },
      notifyTitleFrame() {},
    };

    startFrameGhost(layer, { height: 100, left: 10, top: 20, width: 200 }, { height: 120, left: 30, top: 40, width: 220 }, {
      onArrive: () => {
        arriveCount += 1;
      },
      preserveOnComplete: true,
      snap: true,
      springConfig: {},
    });

    assert(arriveCount === 1, "frame ghost onArrive should fire once after geometry tracks arrive");
  }

  {
    const { retargetFrameGhost, startFrameGhost } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect(left, top, width, height, radius) {
        this.drawn = { height, left, radius, top, width };
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 0, visible: false },
      notifyTitleFrame(frame) {
        this.titleFrame = frame;
      },
    };
    const target = { height: 90, left: 50, top: 60, width: 140 };
    const stepFrames = (seconds: number) => {
      let remaining = seconds;
      while (remaining > 0) {
        const delta = Math.min(0.05, remaining);
        motionRuntime.step(delta);
        remaining -= delta;
      }
    };

    motionRuntime.reset();
    startFrameGhost(
      layer,
      { height: 260, left: 20, top: 30, width: 420 },
      { height: 100, left: 10, top: 20, width: 160 },
      {
        folderId: "folder-1",
        frameGhostPhase: "closing",
        preserveOnComplete: true,
        springConfig: { damping: 4, mass: 1, stiffness: 90 },
      },
    );
    motionRuntime.step(0.08);
    const frame = requireFrameState(layer);
    const beforeProgress = frame.progress;
    const beforeRect = { ...frame };
    const retargeted = retargetFrameGhost(layer, target, {
      folderId: "folder-1",
      frameGhostPhase: "closing",
      preserveOnComplete: true,
      toFillColor: 0x444444,
      toStrokeColor: 0x555555,
    });

    assert(retargeted === true, "frame ghost retarget should accept an active frame presentation");
    assert(layer.frameGhostState === frame, "frame ghost retarget should keep the current presentation object");
    assert(nearlyEqual(frame.progress, beforeProgress), "frame ghost retarget should preserve current progress before the new spring advances");
    assert(nearlyEqual(frame.left, beforeRect.left) && nearlyEqual(frame.top, beforeRect.top), "frame ghost retarget should preserve its current position while changing endpoint geometry");
    assert(nearlyEqual(frame.width, beforeRect.width) && nearlyEqual(frame.height, beforeRect.height), "frame ghost retarget should preserve its current size while changing endpoint geometry");
    stepFrames(3);
    assert(Math.abs(frame.left - 50) < 0.5 && Math.abs(frame.top - 60) < 0.5, "frame ghost retarget should settle to the new target position");
    assert(Math.abs(frame.width - 140) < 0.5 && Math.abs(frame.height - 90) < 0.5, "frame ghost retarget should settle to the new target size");
    assert(frame.fillColor === 0x444444 && frame.strokeColor === 0x555555, "frame ghost retarget should settle to the new final colors");
    layer.frameGhostMotionControl?.cancel?.();
    motionRuntime.reset();
  }

  {
    const { retargetFrameGhost, startFrameGhost } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect() {
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 0, visible: false },
      notifyTitleFrame() {},
    };

    motionRuntime.reset();
    const springConfig = { damping: 2, mass: 1, stiffness: 120 };
    startFrameGhost(layer, { height: 80, left: 0, top: 0, width: 80 }, { height: 100, left: 160, top: 0, width: 100 }, {
      folderId: "folder-1",
      frameGhostPhase: "closing",
      preserveOnComplete: true,
      springConfig,
    });
    motionRuntime.step(0.1);
    const beforeRetarget = motionRuntime.debugSnapshot({ includeChannels: true }).animations
      .find((animation) => animation.prop === "value");
    assert(beforeRetarget && Math.abs(beforeRetarget.velocity ?? 0) > 0.01, "retarget fixture should have a moving frame before interruption");

    retargetFrameGhost(layer, { height: 90, left: 20, top: 0, width: 90 }, {
      folderId: "folder-1",
      frameGhostPhase: "closing",
      preserveOnComplete: true,
      springConfig,
    });
    const afterRetarget = motionRuntime.debugSnapshot({ includeChannels: true }).animations
      .find((animation) => animation.prop === "value");
    assert(afterRetarget && Math.abs(afterRetarget.velocity ?? 0) > 0.01, "retarget should preserve the active spring velocity instead of restarting from rest");
    motionRuntime.reset();
  }

  {
    const {
      startFrameGhost,
      updateFrameGhostTargetGeometry,
    } = await import("./folderFrameGhost.js");
    const { motionRuntime } = await import("../animation/motionRuntime.js");
    const makeGraphics = (): TestFrameGraphics => ({
      alpha: 0,
      visible: false,
      clear() {
        return this;
      },
      fill() {
        return this;
      },
      roundRect(left, top, width, height, radius) {
        this.drawn = { height, left, radius, top, width };
        return this;
      },
      stroke() {
        return this;
      },
    });
    const layer: TestFrameLayer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 0, visible: false },
      notifyTitleFrame() {},
    };
    const firstPanel = { height: 320, left: 220, top: 160, width: 640 };
    const resizedPanel = { height: 420, left: 140, top: 110, width: 840 };
    let arriveCount = 0;

    motionRuntime.reset();
    startFrameGhost(layer, { height: 72, left: 80, top: 90, width: 72 }, firstPanel, {
      folderId: "folder-resize",
      frameGhostPhase: "opening",
      onArrive: () => {
        arriveCount += 1;
      },
      preserveOnComplete: true,
      springConfig: { damping: 10, mass: 1, stiffness: 100 },
    });
    motionRuntime.step(0.08);
    const frame = requireFrameState(layer);
    const control = layer.frameGhostMotionControl;
    const before = { ...frame };
    const updated = updateFrameGhostTargetGeometry(layer, resizedPanel, {
      folderId: "folder-resize",
      frameGhostPhase: "opening",
      notifyTitleFrame: false,
      toRadius: 48,
    });

    assert(updated, "resize geometry update should accept an active frame transition");
    assert(layer.frameGhostMotionControl === control, "resize geometry update should retain the active spring and its lifecycle callbacks");
    assert(nearlyEqual(frame.left, before.left) && nearlyEqual(frame.top, before.top), "resize geometry update should preserve the current physical position on the update frame");
    assert(nearlyEqual(frame.width, before.width) && nearlyEqual(frame.height, before.height), "resize geometry update should preserve the current physical size on the update frame");
    for (let elapsed = 0; elapsed < 3; elapsed += 0.05) motionRuntime.step(0.05);
    assert(Math.abs(frame.left - resizedPanel.left) < 0.5 && Math.abs(frame.top - resizedPanel.top) < 0.5, "resize geometry update should settle at the resized panel position");
    assert(Math.abs(frame.width - resizedPanel.width) < 0.5 && Math.abs(frame.height - resizedPanel.height) < 0.5, "resize geometry update should settle at the resized panel size");
    assert(arriveCount === 1, "resize geometry update should not lose or duplicate the original arrival callback");
    motionRuntime.reset();
  }
}
