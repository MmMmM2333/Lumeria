import { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";

export function runFolderFrameGhostTests() {
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
}
