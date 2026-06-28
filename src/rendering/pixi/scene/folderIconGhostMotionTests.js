import {
  getFolderGhostGridDelay,
  getMaxFolderGhostGridDelay,
  makeClosingGhostMotion,
  makeCompletedClosingPreviewMotion,
  makeOpeningGhostMotion,
} from "./folderIconGhostMotion.js";

export function runFolderIconGhostMotionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder icon ghost motion test failed] ${message}`);
  };
  const nearlyEqual = (a, b) => Math.abs(a - b) < 0.0001;

  assert(nearlyEqual(getFolderGhostGridDelay(7, 5, 0.18), 0.042), "grid delay should combine row and column offsets");
  assert(getFolderGhostGridDelay(30, 5, 0.06) === 0.06, "grid delay should respect the max delay");
  assert(
    getMaxFolderGhostGridDelay([{ index: 0, columnCount: 5 }, { index: 7, columnCount: 5 }], 0.18) === getFolderGhostGridDelay(7, 5, 0.18),
    "max grid delay should scan all targets"
  );

  const stageRect = { left: 10, top: 20 };
  const opening = makeOpeningGhostMotion({
    columnCount: 5,
    iconSize: 56,
    index: 7,
    isThumbnailChild: false,
    sourceRect: { height: 28, left: 30, top: 50, width: 28 },
    targetStageLayoutRect: { height: 56, left: 100, top: 200, width: 56 },
  }, {
    isTextlessMode: false,
    openDuration: 0.5,
    stageHeight: 800,
    stageRect,
    stageWidth: 1200,
  });
  assert(opening.alpha === 0, "non-thumbnail opening ghosts should fade in from transparent");
  assert(opening.fromX === 34 && opening.fromY === 51, "opening motion should map source bounds into local stage coordinates");
  assert(opening.toX === 128 && opening.toY === 242, "opening motion should target the folder grid icon center");
  assert(nearlyEqual(opening.labelDelay, opening.delay + 0.29), "opening label delay should follow the open duration");

  const layoutOpening = makeOpeningGhostMotion({
    columnCount: 5,
    iconSize: 56,
    index: 0,
    isThumbnailChild: false,
    sourceRect: { height: 28, left: 30, top: 50, width: 28 },
    targetStageLayoutRect: { height: 20, left: 20, top: 10, width: 10 },
  }, {
    isTextlessMode: false,
    openDuration: 0.5,
    stageHeight: 50,
    stageRect: { left: 10, top: 20, width: 200, height: 100 },
    stageWidth: 100,
  });
  assert(layoutOpening.targetRect.left === 40 && layoutOpening.targetRect.width === 20, "opening motion should prefer stage layout target rects");
  assert(layoutOpening.toX === 50, "opening motion should target the projected stage layout center");

  const closingTarget = {
    iconSize: 56,
    sourceAlpha: 0.6,
    sourceRect: { height: 56, left: 30, top: 50, width: 56 },
    sourceScale: 0.8,
    targetStageLayoutRect: { height: 14, left: 15, top: 25, width: 14 },
  };
  const closing = makeClosingGhostMotion(closingTarget, {
    alphaHold: 0.25,
    closeDuration: 0.4,
    isTextlessMode: false,
    stageRect,
  });
  assert(closing.sourceAlpha === 0.6 && closing.sourceScale === 0.8, "closing motion should preserve released source values");
  assert(nearlyEqual(closing.fromX, 48) && nearlyEqual(closing.fromY, 69.2), "closing motion should start from the visible source center");
  assert(nearlyEqual(closing.toX, 22) && nearlyEqual(closing.toY, 35.5), "closing motion should target the stage layout thumbnail child center");
  assert(nearlyEqual(closing.alphaDelay, 0.1), "closing alpha delay should follow the close duration and hold ratio");

  const completed = makeCompletedClosingPreviewMotion(closingTarget, { isTextlessMode: false, stageRect });
  assert(nearlyEqual(completed.scale, 0.25), "completed preview motion should scale to the thumbnail child size");
  assert(nearlyEqual(completed.x, closing.toX) && nearlyEqual(completed.y, closing.toY), "completed preview motion should match the closing target");

  const clientClosingTarget = {
    ...closingTarget,
    targetClientRect: { height: 14, left: 110, top: 220, width: 14 },
    targetStageLayoutRect: null,
  };
  const clientClosing = makeClosingGhostMotion(clientClosingTarget, {
    alphaHold: 0.25,
    closeDuration: 0.4,
    isTextlessMode: false,
    stageRect,
  });
  assert(nearlyEqual(clientClosing.targetRect.left, 100), "closing motion should map client targets into stage visual coordinates");
  assert(nearlyEqual(clientClosing.toX, 107) && nearlyEqual(clientClosing.toY, 210.5), "closing motion should target the client visual rect center");
  const clientCompleted = makeCompletedClosingPreviewMotion(clientClosingTarget, { isTextlessMode: false, stageRect });
  assert(nearlyEqual(clientCompleted.x, clientClosing.toX) && nearlyEqual(clientCompleted.y, clientClosing.toY), "completed preview motion should match client visual closing targets");

  const layoutClosingTarget = {
    ...closingTarget,
    targetStageLayoutRect: { height: 10, left: 20, top: 10, width: 10 },
  };
  const layoutClosing = makeClosingGhostMotion(layoutClosingTarget, {
    isTextlessMode: false,
    stageHeight: 50,
    stageRect: { left: 10, top: 20, width: 200, height: 100 },
    stageWidth: 100,
  });
  assert(layoutClosing.targetRect.left === 40 && layoutClosing.targetRect.width === 20, "closing motion should prefer stage layout target rects");
  assert(layoutClosing.toX === 50, "closing motion should target the projected stage layout center");
  const layoutCompleted = makeCompletedClosingPreviewMotion(layoutClosingTarget, {
    isTextlessMode: false,
    stageHeight: 50,
    stageRect: { left: 10, top: 20, width: 200, height: 100 },
    stageWidth: 100,
  });
  assert(layoutCompleted.targetRect.left === 40 && layoutCompleted.x === layoutClosing.toX, "completed preview motion should use the same stage layout target");
}
