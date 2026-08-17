import {
  drawBatchSelectionCheck,
  drawEditButton,
  drawMissingBadge,
  getMissingBadgeLayout,
} from "./iconControlDrawing.js";

function makePointRecorder() {
  return {
    x: null,
    y: null,
    set(x, y) {
      this.x = x;
      this.y = y;
    },
  };
}

function makeGraphicsRecorder() {
  return {
    calls: [],
    clear() {
      this.calls.push(["clear"]);
      return this;
    },
    circle(...args) {
      this.calls.push(["circle", ...args]);
      return this;
    },
    moveTo(...args) {
      this.calls.push(["moveTo", ...args]);
      return this;
    },
    lineTo(...args) {
      this.calls.push(["lineTo", ...args]);
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

export function runIconControlDrawingTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon control drawing test failed] ${message}`);
  };

  const layout = getMissingBadgeLayout(56);
  assert(layout.radius >= 8 && layout.radius <= 12, "missing badge radius should stay within its bounds");
  assert(layout.x === 28 - layout.edgeOffset && layout.y === 28 - layout.edgeOffset, "missing badge should sit near the icon edge");

  const hiddenBadge = { position: makePointRecorder(), visible: true };
  const hiddenBackground = makeGraphicsRecorder();
  const hiddenText = { position: makePointRecorder(), style: {}, text: "" };
  drawMissingBadge(hiddenBadge, hiddenBackground, hiddenText, 56, null);
  assert(!hiddenBadge.visible, "missing badge should hide for non-missing status");
  assert(hiddenBackground.calls.length === 1 && hiddenBackground.calls[0][0] === "clear", "missing badge should clear stale graphics");

  const badge = { position: makePointRecorder(), visible: false };
  const background = makeGraphicsRecorder();
  const textNode = { position: makePointRecorder(), style: {}, text: "" };
  drawMissingBadge(badge, background, textNode, 56, "missing");
  assert(badge.visible, "missing badge should show for missing status");
  assert(textNode.text === "!" && textNode.style.fontSize === layout.fontSize, "missing badge should configure its text");
  assert(background.calls.some((call) => call[0] === "circle"), "missing badge should draw a circular background");

  const hiddenButton = { background: makeGraphicsRecorder(), position: makePointRecorder(), textNode: { style: {}, text: "" } };
  drawEditButton(hiddenButton, 1, 2, "+", false);
  assert(!hiddenButton.visible && hiddenButton.position.x === null, "hidden edit buttons should not draw or move");

  const button = { background: makeGraphicsRecorder(), position: makePointRecorder(), textNode: { style: {}, text: "" } };
  drawEditButton(button, 3, 4, "×", true);
  assert(button.visible && button.position.x === 3 && button.position.y === 4, "visible edit buttons should move into position");
  assert(button.textNode.text === "×" && button.textNode.style.fontSize === 17, "remove edit button should use the larger glyph size");
  assert(button.background.calls.some((call) => call[0] === "circle"), "visible edit buttons should draw a circular background");

  const check = makeGraphicsRecorder();
  drawBatchSelectionCheck(check, 24);
  assert(check.calls.some((call) => call[0] === "moveTo"), "batch selection checks should start a vector path");
  assert(check.calls.filter((call) => call[0] === "lineTo").length === 2, "batch selection checks should use two vector segments");
  assert(check.calls.some((call) => call[0] === "stroke" && call[1].color === 0xffffff), "batch selection checks should use a white stroke");
  assert(check.calls.find((call) => call[0] === "stroke")?.[1]?.width < 3, "batch selection checks should keep a lighter stroke than the badge diameter");
}
