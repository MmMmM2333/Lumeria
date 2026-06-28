import { makeClosingPreviewSwapPlan } from "./folderPreviewSwapMotion.js";

export function runFolderPreviewSwapMotionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder preview swap motion test failed] ${message}`);
  };
  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

  const plan = makeClosingPreviewSwapPlan([
    {
      item: { id: "app-a" },
      previewSlotIndex: 0,
      targetStageLayoutRect: { height: 24, left: 10, top: 20, width: 20 },
    },
    {
      item: { id: "app-b" },
      previewSlotIndex: 4,
      targetStageLayoutRect: { height: 18, left: 50, top: 60, width: 18 },
    },
  ], {
    stageHeight: 400,
    stageRect: { left: 100, top: 200, width: 500, height: 400 },
    stageWidth: 500,
  });

  assert(plan.maskRect.left === 8 && plan.maskRect.top === 18, "swap mask should include local target bounds plus padding");
  assert(plan.maskRect.width === 62 && plan.maskRect.height === 62, "swap mask should cover all local targets");
  assert(plan.centerX === 39 && plan.centerY === 49, "swap plan should expose the mask center");
  assert(plan.wrapStartScale === 1.02, "swap plan should keep the existing wrap start scale");
  assert(plan.iconMotions.length === 2, "swap plan should emit one motion per usable target");

  const first = plan.iconMotions[0];
  assert(first.item.id === "app-a" && first.size === 20, "first motion should keep item and icon size");
  assert(first.toX === 20 && first.toY === 32, "first motion should target the local rect center");
  assert(first.fromX < plan.maskRect.left && first.fromY < plan.maskRect.top, "first motion should start outside the mask");
  assert(nearlyEqual(first.fromScale, 1.104), "first motion should keep the slot-based start scale");
  assert(first.delay === 0, "first slot should have no stagger delay");

  const second = plan.iconMotions[1];
  assert(second.item.id === "app-b" && second.size === 18, "second motion should keep item and icon size");
  assert(second.toX === 59 && second.toY === 69, "second motion should target the local rect center");
  assert(nearlyEqual(second.delay, 0.018), "second motion should keep row and column stagger");
  assert(nearlyEqual(second.fromScale, 1.092), "second motion should keep slot-based start scale");

  const layoutPlan = makeClosingPreviewSwapPlan([{
    item: { id: "app-c" },
    previewSlotIndex: 0,
    targetStageLayoutRect: { height: 10, left: 20, top: 10, width: 10 },
  }], {
    stageHeight: 50,
    stageRect: { left: 10, top: 20, width: 200, height: 100 },
    stageWidth: 100,
  });
  assert(layoutPlan.iconMotions[0].toX === 50, "swap plan should prefer stage layout target rects");

  const clientPlan = makeClosingPreviewSwapPlan([{
    item: { id: "app-d" },
    previewSlotIndex: 0,
    targetClientRect: { height: 20, left: 130, top: 250, width: 20 },
  }], {
    stageRect: { left: 100, top: 200, width: 500, height: 400 },
  });
  assert(clientPlan.iconMotions[0].toX === 40 && clientPlan.iconMotions[0].toY === 60, "swap plan should map client visual target rects into local stage coordinates");

  assert(makeClosingPreviewSwapPlan([], { stageRect: { left: 0, top: 0 } }) === null, "empty targets should not create a swap plan");
  assert(
    makeClosingPreviewSwapPlan([{ targetStageLayoutRect: { left: 1, top: 1, width: 0, height: 10 } }], {
      stageHeight: 100,
      stageRect: { left: 0, top: 0 },
      stageWidth: 100,
    }) === null,
    "invalid targets should not create a swap plan"
  );
}
