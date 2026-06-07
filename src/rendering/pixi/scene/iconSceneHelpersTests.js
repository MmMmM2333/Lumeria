import {
  makeIconRect,
  makeSyntheticPointerEvent,
  makeTargetIconBounds,
} from "./iconSceneHelpers.js";

export function runIconSceneHelpersTests() {
  const assert = (condition, message) => {
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

  let prevented = false;
  let stopped = false;
  const original = {
    button: 2,
    buttons: 1,
    clientX: 12,
    clientY: 34,
    pointerId: 7,
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
    stageRect: { left: 5, top: 6 },
    getIconBounds: () => ({ left: 1, top: 2, width: 3, height: 4 }),
  };
  const event = makeSyntheticPointerEvent(original, node);
  event.preventDefault();
  event.stopPropagation();

  assert(event.button === 2 && event.pointerId === 7, "synthetic event should preserve pointer metadata");
  assert(event.currentTarget.getBoundingClientRect().width === 3, "synthetic event should expose node bounds");
  assert(prevented && stopped, "synthetic event should forward prevention methods");
}
