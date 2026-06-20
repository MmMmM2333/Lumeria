import { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";

export async function runFolderFrameGhostTests() {
  if (!("navigator" in globalThis)) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { userAgent: "node.js" },
    });
  }
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder frame ghost test failed] ${message}`);
  };
  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

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
    const calls = [];
    const makeGraphics = () => ({
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
    const layer = {
      closingGhostLayer: {},
      closingPreviewSwapLayer: {},
      frameGhost: makeGraphics(),
      panelMaterial: { alpha: 0, visible: false },
      notifyTitleFrame(frame) {
        this.titleFrame = frame;
      },
    };
    const springConfig = { snap: true };
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
    const state = layer.frameGhostState;
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
    assert(state.left === 50 && state.top === 60, "retargeted frame ghost should settle to the new target");
    assert(state.fillColor === 0x444444 && state.strokeColor === 0x555555, "retargeted frame ghost should update final colors");
  }

  {
    const { startFrameGhost } = await import("./folderFrameGhost.js");
    let arriveCount = 0;
    const makeGraphics = () => ({
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
    const layer = {
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
      springConfig: { snap: true },
    });

    assert(arriveCount === 1, "frame ghost onArrive should fire once after geometry tracks arrive");
  }
}
