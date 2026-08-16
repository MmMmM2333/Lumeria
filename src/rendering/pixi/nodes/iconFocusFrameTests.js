import {
  drawFocusFrame,
  getFocusFrameRadius,
  getFocusFrameRect,
  shouldDrawFocusFrame,
} from "./iconFocusFrame.js";

function makeGraphicsRecorder() {
  return {
    calls: [],
    clear() {
      this.calls.push(["clear"]);
      return this;
    },
    roundRect(...args) {
      this.calls.push(["roundRect", ...args]);
      return this;
    },
    fill(options) {
      this.calls.push(["fill", options]);
      return this;
    },
    stroke(options) {
      this.calls.push(["stroke", options]);
      return this;
    },
  };
}

export function runIconFocusFrameTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon focus frame test failed] ${message}`);
  };

  assert(getFocusFrameRadius(40) === 18, "radius should keep the lower bound");
  assert(getFocusFrameRadius(64) === 64 * 0.32, "radius should scale with regular icon sizes");
  assert(getFocusFrameRadius(120) === 28, "radius should keep the upper bound");

  const iconOnlyRect = getFocusFrameRect({ iconSize: 64, visualOffsetY: -4 });
  assert(iconOnlyRect.width >= 88, "icon-only frame should include minimum horizontal padding");
  assert(iconOnlyRect.height === 64 + 10 + 8, "icon-only frame should include vertical padding");
  assert(iconOnlyRect.top === -4 - 32 - 10, "icon-only frame should include visual offset and top padding");

  const labelRect = getFocusFrameRect({
    iconSize: 64,
    labelText: {
      height: 34,
      style: { fontSize: 13, lineHeight: 17, wordWrapWidth: 140 },
      text: "Long Application\nName",
      visible: true,
      width: 132,
      y: 42,
    },
  });
  assert(labelRect.width === 156, "label frame should expand to label width plus padding");
  assert(labelRect.height === 42 + 34 - -32 + 10 + 8, "label frame should include the visible label bottom");

  const heightDominatedRect = getFocusFrameRect({
    iconSize: 66,
    labelText: {
      height: 32,
      style: { fontSize: 13, lineHeight: 16, wordWrapWidth: 66 },
      text: "Adobe\nAfter Ef...",
      visible: true,
      width: 54,
      y: 33,
    },
    maxWidth: 90,
    visualOffsetY: -14,
  });
  assert(heightDominatedRect.width <= 90, "selection frames should stay within their cell width");
  assert(heightDominatedRect.width < heightDominatedRect.height, "two-line label height should not force a square frame");

  const spaciousLargeIconRect = getFocusFrameRect({
    iconSize: 128,
    labelText: {
      height: 16,
      style: { fontSize: 13, lineHeight: 16, wordWrapWidth: 160 },
      text: "New Folder",
      visible: true,
      width: 64,
      y: 64,
    },
    maxWidth: 255,
    visualOffsetY: -14,
  });
  assert(spaciousLargeIconRect.width === spaciousLargeIconRect.height, "large icons should keep a balanced frame when their cell has room");
  assert(spaciousLargeIconRect.width < 255, "balanced frames should not expand to fill a spacious cell");

  assert(shouldDrawFocusFrame({ focused: true }), "focused icons should draw a frame");
  assert(shouldDrawFocusFrame({ dropTarget: true }), "drop targets should draw a frame");
  assert(!shouldDrawFocusFrame({ dropTarget: true, isFolderDropHover: true }), "folder hovers should suppress drop frame");
  assert(!shouldDrawFocusFrame({ dropTarget: true, isAppFolderCreateHover: true }), "app-folder hovers should suppress drop frame");
  assert(!shouldDrawFocusFrame(), "inactive icons should not draw a frame");

  const hiddenFrame = makeGraphicsRecorder();
  drawFocusFrame(hiddenFrame, iconOnlyRect, 64, {});
  assert(hiddenFrame.calls.length === 1 && hiddenFrame.calls[0][0] === "clear", "hidden frames should only clear stale graphics");

  const focusedFrame = makeGraphicsRecorder();
  drawFocusFrame(focusedFrame, iconOnlyRect, 64, { focused: true });
  assert(focusedFrame.calls.some((call) => call[0] === "roundRect"), "focused icons should draw a rounded rectangle");
  assert(focusedFrame.calls.some((call) => call[0] === "fill" && call[1].color === 0x000000 && call[1].alpha === 0.3), "focused icons should use the focus fill");
  assert(focusedFrame.calls.some((call) => call[0] === "stroke" && call[1].width === 1), "focused icons should use a subtle stroke");

  const dropFrame = makeGraphicsRecorder();
  drawFocusFrame(dropFrame, iconOnlyRect, 64, { dropTarget: true });
  assert(dropFrame.calls.some((call) => call[0] === "fill" && call[1].color === 0xffffff && call[1].alpha === 0.18), "drop frames should use the drop fill");
  assert(dropFrame.calls.some((call) => call[0] === "stroke" && call[1].width === 2), "drop frames should use a stronger stroke");
}
