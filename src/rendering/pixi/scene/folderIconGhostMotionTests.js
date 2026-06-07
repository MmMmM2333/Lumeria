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
    targetRect: { height: 56, left: 100, top: 200, width: 56 },
  }, {
    isTextlessMode: false,
    openDuration: 0.5,
    stageRect,
  });
  assert(opening.alpha === 0, "non-thumbnail opening ghosts should fade in from transparent");
  assert(opening.fromX === 34 && opening.fromY === 51, "opening motion should map source bounds into local stage coordinates");
  assert(opening.toX === 128 && opening.toY === 242, "opening motion should target the folder grid icon center");
  assert(nearlyEqual(opening.labelDelay, opening.delay + 0.29), "opening label delay should follow the open duration");

  const closingTarget = {
    iconSize: 56,
    sourceAlpha: 0.6,
    sourceRect: { height: 56, left: 30, top: 50, width: 56 },
    sourceScale: 0.8,
    targetRect: { height: 14, left: 15, top: 25, width: 14 },
  };
  const closing = makeClosingGhostMotion(closingTarget, {
    alphaHold: 0.25,
    closeDuration: 0.4,
    isTextlessMode: false,
    stageRect,
  });
  assert(closing.sourceAlpha === 0.6 && closing.sourceScale === 0.8, "closing motion should preserve interrupted source values");
  assert(nearlyEqual(closing.fromX, 48) && nearlyEqual(closing.fromY, 69.2), "closing motion should start from the visible source center");
  assert(nearlyEqual(closing.toX, 12) && nearlyEqual(closing.toY, 15.5), "closing motion should target the thumbnail child center");
  assert(nearlyEqual(closing.alphaDelay, 0.1), "closing alpha delay should follow the close duration and hold ratio");

  const completed = makeCompletedClosingPreviewMotion(closingTarget, { isTextlessMode: false, stageRect });
  assert(nearlyEqual(completed.scale, 0.25), "completed preview motion should scale to the thumbnail child size");
  assert(nearlyEqual(completed.x, closing.toX) && nearlyEqual(completed.y, closing.toY), "completed preview motion should match the closing target");
}
