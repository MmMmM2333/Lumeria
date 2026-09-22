import {
  drawBatchSelectionCheck,
  drawEditButton,
  drawMissingBadge,
  getMissingBadgeLayout,
} from "./iconControlDrawing.js";
import type { EditButton } from "./iconControlDrawing.js";
import type { Container, Graphics, Text } from "pixi.js";

interface PointRecorder {
  x: number | null;
  y: number | null;
  set(x: number, y: number): void;
}

interface PaintOptions {
  alpha?: number;
  cap?: string;
  color?: number;
  join?: string;
  width?: number;
}

type ClearCall = ["clear"];
type CircleCall = ["circle", number, number, number];
type MoveToCall = ["moveTo", number, number];
type LineToCall = ["lineTo", number, number];
type FillCall = ["fill", PaintOptions];
type StrokeCall = ["stroke", PaintOptions];
type GraphicsCall = ClearCall | CircleCall | MoveToCall | LineToCall | FillCall | StrokeCall;

interface GraphicsRecorder {
  calls: GraphicsCall[];
  circle(x: number, y: number, radius: number): GraphicsRecorder;
  clear(): GraphicsRecorder;
  fill(options: PaintOptions): GraphicsRecorder;
  lineTo(x: number, y: number): GraphicsRecorder;
  moveTo(x: number, y: number): GraphicsRecorder;
  stroke(options: PaintOptions): GraphicsRecorder;
}

interface TextRecorder {
  position: PointRecorder;
  style: {
    fontSize?: number;
    lineHeight?: number;
  };
  text: string;
}

function makePointRecorder(): PointRecorder {
  return {
    x: null,
    y: null,
    set(x: number, y: number) {
      this.x = x;
      this.y = y;
    },
  };
}

function makeGraphicsRecorder(): GraphicsRecorder {
  return {
    calls: [],
    clear() {
      this.calls.push(["clear"]);
      return this;
    },
    circle(x: number, y: number, radius: number) {
      this.calls.push(["circle", x, y, radius]);
      return this;
    },
    moveTo(x: number, y: number) {
      this.calls.push(["moveTo", x, y]);
      return this;
    },
    lineTo(x: number, y: number) {
      this.calls.push(["lineTo", x, y]);
      return this;
    },
    fill(options: PaintOptions) {
      this.calls.push(["fill", options]);
      return this;
    },
    stroke(options: PaintOptions) {
      this.calls.push(["stroke", options]);
      return this;
    },
  };
}

export function runIconControlDrawingTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Pixi icon control drawing test failed] ${message}`);
  }

  const layout = getMissingBadgeLayout(56);
  assert(layout.radius >= 8 && layout.radius <= 12, "missing badge radius should stay within its bounds");
  assert(layout.x === 28 - layout.edgeOffset && layout.y === 28 - layout.edgeOffset, "missing badge should sit near the icon edge");

  const hiddenBadge = { position: makePointRecorder(), visible: true };
  const hiddenBackground = makeGraphicsRecorder();
  const hiddenText: TextRecorder = { position: makePointRecorder(), style: {}, text: "" };
  drawMissingBadge(
    hiddenBadge as unknown as Container,
    hiddenBackground as unknown as Graphics,
    hiddenText as unknown as Text,
    56,
    null,
  );
  assert(!hiddenBadge.visible, "missing badge should hide for non-missing status");
  assert(hiddenBackground.calls.length === 1 && hiddenBackground.calls[0]?.[0] === "clear", "missing badge should clear stale graphics");

  const badge = { position: makePointRecorder(), visible: false };
  const background = makeGraphicsRecorder();
  const textNode: TextRecorder = { position: makePointRecorder(), style: {}, text: "" };
  drawMissingBadge(
    badge as unknown as Container,
    background as unknown as Graphics,
    textNode as unknown as Text,
    56,
    "missing",
  );
  assert(badge.visible, "missing badge should show for missing status");
  assert(textNode.text === "?" && textNode.style.fontSize === layout.fontSize, "missing badge should configure its text");
  assert(background.calls.some((call) => call[0] === "circle"), "missing badge should draw a circular background");

  const hiddenButton = {
    background: makeGraphicsRecorder(),
    position: makePointRecorder(),
    textNode: { position: makePointRecorder(), style: {}, text: "" } as TextRecorder,
    visible: true,
  };
  drawEditButton(hiddenButton as unknown as EditButton, 1, 2, "+", false);
  assert(!hiddenButton.visible && hiddenButton.position.x === null, "hidden edit buttons should not draw or move");

  const button = {
    background: makeGraphicsRecorder(),
    position: makePointRecorder(),
    textNode: { position: makePointRecorder(), style: {}, text: "" } as TextRecorder,
    visible: false,
  };
  drawEditButton(button as unknown as EditButton, 3, 4, "×", true);
  assert(button.visible && button.position.x === 3 && button.position.y === 4, "visible edit buttons should move into position");
  assert(button.background.calls.filter(call=>call[0]==="lineTo").length===2, "remove uses two centered vector strokes instead of font metrics");
  assert(button.background.calls.some((call) => call[0] === "circle"), "visible edit buttons should draw a circular background");

  const check = makeGraphicsRecorder();
  drawBatchSelectionCheck(check as unknown as Graphics, 24);
  assert(check.calls.some((call) => call[0] === "moveTo"), "batch selection checks should start a vector path");
  assert(check.calls.filter((call) => call[0] === "lineTo").length === 2, "batch selection checks should use two vector segments");
  assert(check.calls.some((call) => call[0] === "stroke" && call[1].color === 0xffffff), "batch selection checks should use a white stroke");
  const checkStroke = check.calls.find((call): call is StrokeCall => call[0] === "stroke");
  assert(checkStroke?.[1].width != null && checkStroke[1].width < 3, "batch selection checks should keep a lighter stroke than the badge diameter");
}
