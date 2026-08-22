import {
  makeIconRect,
  makeContainerTargetIconBounds,
  makeSyntheticPointerEvent,
  makeTargetIconBounds,
} from "./iconSceneHelpers.js";
import type { StagePoint } from "../geometry/stageCoordinates.js";

function makeMatrix(transform: (point: StagePoint) => StagePoint) {
  return {
    apply(point: StagePoint): StagePoint {
      return transform(point);
    },
  };
}

export function runIconSceneHelpersTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi icon scene helper test failed] ${message}`);
  };

  const iconRect = makeIconRect(100, 80, 40);
  assert(iconRect.left === 80, "icon rect should center horizontally");
  assert(iconRect.top === 60, "icon rect should center vertically");
  assert(iconRect.width === 40 && iconRect.height === 40, "icon rect should preserve size");

  const targetBounds = makeTargetIconBounds(
    { left: 10, top: 20, width: 400, height: 300 },
    200,
    150,
    50,
    40,
    20,
    6
  );
  assert(targetBounds.left === 90, "target bounds should map local x into stage coordinates");
  assert(targetBounds.top === 92, "target bounds should apply visual offset before stage mapping");
  assert(targetBounds.width === 40 && targetBounds.height === 40, "target bounds should scale size into stage coordinates");

  const containerTargetBounds = makeContainerTargetIconBounds(
    {
      getGlobalTransform: () => makeMatrix(({ x, y }) => ({ x: x * 0.5 + 100, y: y * 0.5 + 10 })),
    },
    { left: 0, top: 0, width: 200, height: 200 },
    200,
    200,
    50,
    40,
    20,
    4
  );
  assert(containerTargetBounds.left === 120, "container target bounds should include container x transform");
  assert(containerTargetBounds.top === 27, "container target bounds should include container y transform and visual offset");
  assert(containerTargetBounds.width === 10 && containerTargetBounds.height === 10, "container target bounds should include container scale");

  let prevented = false;
  let stopped = false;
  const original = {
    button: 2,
    buttons: 1,
    clientX: 12,
    clientY: 34,
    isPrimary: true,
    pointerId: 7,
    pointerType: "pen",
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {
      stopped = true;
    },
    target: "target",
    type: "rightdown",
  };
  const node = {
    state: {
      cellHeight: 80,
      cellWidth: 100,
      compact: true,
      iconSize: 56,
      singleLineLabel: true,
    },
    stageRect: { left: 5, top: 6 },
    getIconBounds: () => ({ left: 1, top: 2, width: 3, height: 4 }),
  };
  const event = makeSyntheticPointerEvent(original, node);
  event.preventDefault();
  event.stopPropagation();

  assert(
    event.button === 2 && event.pointerId === 7 && event.pointerType === "pen" && event.isPrimary === true,
    "synthetic event should preserve pointer metadata"
  );
  assert(event.currentTarget.getBoundingClientRect().width === 3, "synthetic event should expose node bounds");
  assert(event.dragVisualState.compact === true && event.dragVisualState.singleLineLabel === true, "synthetic event should expose source label layout state");
  assert(event.dragVisualState.iconSize === 56, "synthetic event should expose source icon sizing state");
  assert(prevented && stopped, "synthetic event should forward prevention methods");
}
