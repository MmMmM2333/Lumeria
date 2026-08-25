import {
  getFolderGhostGridDelay,
  getMaxFolderGhostGridDelay,
  getSyntheticOpeningGhostRevealState,
  makeClosingGhostMotion,
  makeCompletedClosingPreviewMotion,
  makeOpeningGhostMotion,
} from "./folderIconGhostMotion.js";

export function runFolderIconGhostMotionTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder icon ghost motion test failed] ${message}`);
  };
  const nearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.0001;

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
  assert(opening.isThumbnailChild === false, "opening motion should preserve synthetic-child presentation semantics");
  assert(opening.fromX === 34 && opening.fromY === 51, "opening motion should map source bounds into local stage coordinates");
  assert(opening.toX === 128 && opening.toY === 242, "opening motion should target the folder grid icon center");
  assert(nearlyEqual(opening.labelDelay, opening.delay + 0.29), "opening label delay should follow the open duration");

  const smallThumbnailOpening = makeOpeningGhostMotion({
    columnCount: 5,
    iconSize: 128,
    index: 0,
    isThumbnailChild: true,
    sourceRect: { height: 16.55, left: 30, top: 50, width: 16.55 },
    targetStageLayoutRect: { height: 128, left: 100, top: 200, width: 128 },
  }, {
    isTextlessMode: false,
    stageHeight: 800,
    stageRect,
    stageWidth: 1200,
  });
  assert(
    nearlyEqual(smallThumbnailOpening.scale, 16.55 / 128),
    "small thumbnail opening ghosts should start at the exact rendered preview-child size",
  );
  const smallSyntheticOpening = makeOpeningGhostMotion({
    columnCount: 5,
    iconSize: 128,
    index: 9,
    isThumbnailChild: false,
    sourceRect: { height: 16.55, left: 30, top: 50, width: 16.55 },
    targetStageLayoutRect: { height: 128, left: 100, top: 200, width: 128 },
  }, {
    isTextlessMode: false,
    stageHeight: 800,
    stageRect,
    stageWidth: 1200,
  });
  assert(
    nearlyEqual(smallSyntheticOpening.scale, 0.16),
    "non-thumbnail synthetic opening ghosts should retain the minimum reveal scale",
  );

  const collapsedReveal = getSyntheticOpeningGhostRevealState(0.2, 0.16);
  assert(collapsedReveal.alpha === 0, "synthetic ghosts should remain invisible while still near thumbnail scale");
  assert(collapsedReveal.labelAlpha === 0 && collapsedReveal.labelScale === 0.94, "synthetic labels should remain hidden with collapsed icons");
  const partialReveal = getSyntheticOpeningGhostRevealState(0.52, 0.16);
  assert(partialReveal.alpha > 0 && partialReveal.alpha < 1, "synthetic ghosts should fade in after their geometry visibly expands");
  assert(partialReveal.labelAlpha === 0, "synthetic labels should wait until the icon has substantially expanded");
  const monotonicReveal = getSyntheticOpeningGhostRevealState(0.24, 0.16, partialReveal.progress);
  assert(nearlyEqual(monotonicReveal.alpha, partialReveal.alpha), "synthetic reveal progress should not move backward when a spring retargets");
  const expandedReveal = getSyntheticOpeningGhostRevealState(1, 0.16, monotonicReveal.progress);
  assert(expandedReveal.alpha === 1, "fully expanded synthetic ghosts should become opaque");
  assert(expandedReveal.labelAlpha === 1 && expandedReveal.labelScale === 1, "fully expanded synthetic labels should become opaque at full scale");

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
  const defaultProjection = makeCompletedClosingPreviewMotion(closingTarget, {});
  assert(defaultProjection.targetRect.left === 15, "empty projection options should use the stage-layout target directly");

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

  const capturedPoseClosing = makeClosingGhostMotion({
    ...closingTarget,
    sourcePose: { scaleX: 0.42, scaleY: 0.38, x: 72, y: 88 },
  }, {
    alphaHold: 0.25,
    closeDuration: 0.4,
    isTextlessMode: false,
    stageRect,
  });
  assert(capturedPoseClosing.fromX === 72 && capturedPoseClosing.fromY === 88, "closing motion should start from the captured handoff pose");
  assert(nearlyEqual(capturedPoseClosing.sourceScaleX, 0.42) && nearlyEqual(capturedPoseClosing.sourceScaleY, 0.38), "closing motion should preserve captured physical scale on both axes");

  const completed = makeCompletedClosingPreviewMotion(closingTarget, { isTextlessMode: false, stageRect });
  assert(nearlyEqual(completed.scale, 0.25), "completed preview motion should scale to the thumbnail child size");
  assert(nearlyEqual(completed.x, closing.toX) && nearlyEqual(completed.y, closing.toY), "completed preview motion should match the closing target");

  const smallThumbnailTarget = {
    ...closingTarget,
    iconSize: 128,
    isThumbnailChild: true,
    targetStageLayoutRect: { height: 16.55, left: 15, top: 25, width: 16.55 },
  };
  const smallThumbnailClosing = makeClosingGhostMotion(smallThumbnailTarget, {
    isTextlessMode: false,
    stageRect,
  });
  const smallThumbnailCompleted = makeCompletedClosingPreviewMotion(smallThumbnailTarget, {
    isTextlessMode: false,
    stageRect,
  });
  const exactSmallThumbnailScale = 16.55 / 128;
  assert(
    nearlyEqual(smallThumbnailClosing.scale, exactSmallThumbnailScale),
    "small thumbnail ghosts should end at the exact rendered preview-child size",
  );
  assert(
    nearlyEqual(smallThumbnailCompleted.scale, exactSmallThumbnailScale),
    "completed small thumbnail ghosts should preserve the exact preview-child size",
  );
  const smallSyntheticClosing = makeClosingGhostMotion({
    ...smallThumbnailTarget,
    isThumbnailChild: false,
  }, {
    isTextlessMode: false,
    stageRect,
  });
  assert(
    nearlyEqual(smallSyntheticClosing.scale, 0.14),
    "non-thumbnail synthetic ghosts should retain the minimum visible closing scale",
  );

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
