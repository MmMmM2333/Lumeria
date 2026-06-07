import {
  cloneFrameSnapshot,
  makeOpeningInterruptionFrame,
} from "./folderOpeningInterruptionFrame.js";

export function runFolderOpeningInterruptionFrameTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder opening interruption frame test failed] ${message}`);
  };
  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

  const styleFrame = {
    fillAlpha: 0.3,
    fillColor: 0x123456,
    height: 120,
    left: 1,
    progress: 0.4,
    radius: 44,
    strokeAlpha: 0.5,
    strokeColor: 0xffffff,
    strokeWidth: 2,
    top: 2,
    width: 240,
  };
  const snapshot = cloneFrameSnapshot(styleFrame);
  assert(snapshot !== styleFrame && snapshot.left === 1 && snapshot.width === 240, "frame snapshot should clone the frame geometry");
  assert(snapshot.progress == null, "frame snapshot should only keep drawable frame fields");
  assert(cloneFrameSnapshot(null) === null, "frame snapshot should stay nullable");

  const iconOnlyFrame = makeOpeningInterruptionFrame([
    {
      sourceRect: { height: 30, left: 110, top: 220, width: 20 },
    },
  ], {
    left: 100,
    top: 200,
  }, styleFrame);
  assert(iconOnlyFrame.left === -38 && iconOnlyFrame.top === -28, "icon-only interruption frame should use local icon bounds plus padding");
  assert(iconOnlyFrame.width === 116 && iconOnlyFrame.height === 126, "icon-only interruption frame should include default padding");
  assert(iconOnlyFrame.fillColor === 0x123456 && iconOnlyFrame.strokeWidth === 2, "interruption frame should preserve style fields");
  assert(nearlyEqual(iconOnlyFrame.radius, 30.16), "interruption frame should derive radius from the padded rect");

  const labelFrame = makeOpeningInterruptionFrame([
    {
      cellWidth: 200,
      sourceLabelAlpha: 1,
      sourceRect: { height: 30, left: 110, top: 220, width: 20 },
      sourceScale: 1,
    },
  ], {
    left: 100,
    top: 200,
  }, styleFrame);
  assert(labelFrame.left === -108 && labelFrame.width === 256, "visible label should expand interruption frame horizontally");
  assert(labelFrame.height === 164, "visible label should expand interruption frame vertically");
  assert(nearlyEqual(labelFrame.radius, 42.64), "label-expanded frame should derive radius from the expanded rect");

  const hiddenLabelFrame = makeOpeningInterruptionFrame([
    {
      cellWidth: 200,
      sourceLabelAlpha: 0,
      sourceRect: { height: 30, left: 110, top: 220, width: 20 },
      sourceScale: 1,
    },
  ], {
    left: 100,
    top: 200,
  }, styleFrame);
  assert(hiddenLabelFrame.width === iconOnlyFrame.width, "hidden labels should not expand the interruption frame");
  assert(makeOpeningInterruptionFrame([], { left: 0, top: 0 }, styleFrame) === null, "empty targets should not create an interruption frame");
}
