import {
  drawSelectionFrame,
  getSelectionFrameRadius,
  getSelectionFrameRect,
  shouldDrawSelectionFrame,
} from "./iconSelectionFrame.js";

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

export function runIconSelectionFrameTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon selection frame test failed] ${message}`);
  };

  assert(getSelectionFrameRadius(40) === 18, "radius should keep the lower bound");
  assert(getSelectionFrameRadius(64) === 64 * 0.32, "radius should scale with regular icon sizes");
  assert(getSelectionFrameRadius(120) === 28, "radius should keep the upper bound");

  const iconOnlyRect = getSelectionFrameRect({ iconSize: 64, visualOffsetY: -4 });
  assert(iconOnlyRect.width >= 88, "icon-only frame should include minimum horizontal padding");
  assert(iconOnlyRect.height === 64 + 10 + 8, "icon-only frame should include vertical padding");
  assert(iconOnlyRect.top === -4 - 32 - 10, "icon-only frame should include visual offset and top padding");

  const labelRect = getSelectionFrameRect({
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

  const heightDominatedRect = getSelectionFrameRect({
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

  const spaciousLargeIconRect = getSelectionFrameRect({
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

  assert(shouldDrawSelectionFrame({ selected: true }), "selected icons should draw a frame");
  assert(shouldDrawSelectionFrame({ dropTarget: true }), "drop targets should draw a frame");
  assert(!shouldDrawSelectionFrame({ dropTarget: true, isFolderDropHover: true }), "folder hovers should suppress drop frame");
  assert(!shouldDrawSelectionFrame({ dropTarget: true, isAppFolderCreateHover: true }), "app-folder hovers should suppress drop frame");
  assert(!shouldDrawSelectionFrame(), "inactive icons should not draw a frame");

  const hiddenFrame = makeGraphicsRecorder();
  drawSelectionFrame(hiddenFrame, iconOnlyRect, 64, {});
  assert(hiddenFrame.calls.length === 1 && hiddenFrame.calls[0][0] === "clear", "hidden frames should only clear stale graphics");

  const selectedFrame = makeGraphicsRecorder();
  drawSelectionFrame(selectedFrame, iconOnlyRect, 64, { selected: true });
  assert(selectedFrame.calls.some((call) => call[0] === "roundRect"), "selected frames should draw a rounded rectangle");
  assert(selectedFrame.calls.some((call) => call[0] === "fill" && call[1].color === 0x000000 && call[1].alpha === 0.3), "selected frames should use the selected fill");
  assert(selectedFrame.calls.some((call) => call[0] === "stroke" && call[1].width === 1), "selected frames should use a subtle stroke");

  const dropFrame = makeGraphicsRecorder();
  drawSelectionFrame(dropFrame, iconOnlyRect, 64, { dropTarget: true });
  assert(dropFrame.calls.some((call) => call[0] === "fill" && call[1].color === 0xffffff && call[1].alpha === 0.18), "drop frames should use the drop fill");
  assert(dropFrame.calls.some((call) => call[0] === "stroke" && call[1].width === 2), "drop frames should use a stronger stroke");
}
