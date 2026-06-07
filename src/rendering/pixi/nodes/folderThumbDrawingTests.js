import {
  drawAppFolderCreateBackdrop,
  drawAppFolderCreateFlashOverlay,
  drawFolderFlashOverlay,
  drawFolderPreviewMask,
  drawFolderThumbFrame,
  getFolderPreviewMaskRect,
} from "./folderThumbDrawing.js";
import { getFolderThumbMetrics } from "./folderThumbMetrics.js";

function makeGraphicsRecorder() {
  return {
    calls: [],
    visible: true,
    clear() {
      this.calls.push(["clear"]);
      return this;
    },
    fill(options) {
      this.calls.push(["fill", options]);
      return this;
    },
    rect(...args) {
      this.calls.push(["rect", ...args]);
      return this;
    },
    roundRect(...args) {
      this.calls.push(["roundRect", ...args]);
      return this;
    },
    stroke(options) {
      this.calls.push(["stroke", options]);
      return this;
    },
  };
}

export function runFolderThumbDrawingTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder thumb drawing test failed] ${message}`);
  };

  const iconSize = 56;
  const thumb = getFolderThumbMetrics(iconSize);
  const maskRect = getFolderPreviewMaskRect(iconSize, thumb);
  assert(maskRect.width === maskRect.height, "folder preview mask should be square");
  assert(maskRect.width > thumb.childSize * 3, "folder preview mask should include padding around preview children");

  const frame = makeGraphicsRecorder();
  drawFolderThumbFrame(frame, iconSize, thumb, 4);
  const frameRect = frame.calls.find((call) => call[0] === "roundRect");
  assert(frameRect[3] === iconSize + 8 && frameRect[4] === iconSize + 8, "folder thumb frame should include hover padding");
  assert(frame.calls.some((call) => call[0] === "stroke"), "folder thumb frame should draw a stroke");

  const previewMask = makeGraphicsRecorder();
  drawFolderPreviewMask(previewMask, iconSize, thumb);
  assert(previewMask.calls.some((call) => call[0] === "rect"), "folder preview mask should draw a rectangular mask");

  const flash = makeGraphicsRecorder();
  drawFolderFlashOverlay(flash, iconSize, thumb, 3);
  assert(flash.calls.some((call) => call[0] === "fill" && call[1].alpha === 1), "folder flash overlay should draw an opaque fill");

  const hiddenBackdrop = makeGraphicsRecorder();
  drawAppFolderCreateBackdrop(hiddenBackdrop, iconSize, { alpha: 0, padding: 8 });
  assert(!hiddenBackdrop.visible, "app folder create backdrop should hide when alpha is zero");

  const visibleBackdrop = makeGraphicsRecorder();
  drawAppFolderCreateBackdrop(visibleBackdrop, iconSize, { alpha: 0.5, padding: 8 });
  assert(visibleBackdrop.visible, "app folder create backdrop should show when alpha is positive");
  assert(
    visibleBackdrop.calls.some((call) => call[0] === "fill" && call[1].alpha === 0.15),
    "app folder create backdrop should scale fill alpha"
  );

  const createFlash = makeGraphicsRecorder();
  drawAppFolderCreateFlashOverlay(createFlash, iconSize, { padding: 8 });
  assert(createFlash.calls.some((call) => call[0] === "roundRect"), "app folder create flash should draw a rounded rect");
}
