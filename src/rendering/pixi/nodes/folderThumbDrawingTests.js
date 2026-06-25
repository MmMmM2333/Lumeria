import {
  drawAppFolderCreateBackdrop,
  drawAppFolderCreateFlashOverlay,
  drawFolderFlashOverlay,
  drawFolderPreviewMask,
  drawFolderThumbFrame,
  getFolderPreviewMaskRect,
  getPaddedFrameScale,
} from "./folderThumbDrawing.js";
import { getFolderThumbChildLocalRect, getFolderThumbMetrics } from "./folderThumbMetrics.js";

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
  const firstChildRect = getFolderThumbChildLocalRect(thumb, 0);
  const centerChildRect = getFolderThumbChildLocalRect(iconSize, 4);
  const overflowChildRect = getFolderThumbChildLocalRect(thumb, 9);
  assert(firstChildRect.width === thumb.childSize && firstChildRect.height === thumb.childSize, "folder thumb child rect should use child size");
  assert(centerChildRect.left + centerChildRect.width / 2 === 0, "center folder thumb child should be centered on x");
  assert(centerChildRect.top + centerChildRect.height / 2 === 0, "center folder thumb child should be centered on y");
  assert(overflowChildRect.top > getFolderThumbChildLocalRect(thumb, 6).top, "folder thumb overflow rows should remain below the visible 3x3 grid");
  const maskRect = getFolderPreviewMaskRect(iconSize, thumb);
  assert(maskRect.width === maskRect.height, "folder preview mask should be square");
  assert(maskRect.width > thumb.childSize * 3, "folder preview mask should include padding around preview children");
  assert(getPaddedFrameScale(iconSize, 0, 8) === iconSize / (iconSize + 16), "padded frame scale should map base size into target padded size");
  assert(getPaddedFrameScale(iconSize, 8, 8) === 1, "padded frame scale should be one when current and target padding match");
  assert(getPaddedFrameScale(0, -2, -4) === 1, "padded frame scale should clamp invalid size and padding");

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
