import {
  createFolderTransitionTrajectory,
  makeFolderTransitionPlacement,
} from "./folderTransitionTrajectory.js";

export function runFolderTransitionTrajectoryTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi folder transition trajectory test failed] ${message}`);
  };
  const nearlyEqual = (a: number, b: number, epsilon = 0.0001) => Math.abs(a - b) <= epsilon;
  const center = (rect: Readonly<{ height: number; left: number; top: number; width: number }>) => ({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  });

  const panelRect = { height: 360, left: 300, top: 220, width: 600 };
  const desktopRect = { height: 80, left: 560, top: 80, width: 80 };
  const trajectory = createFolderTransitionTrajectory({
    desktopRect,
    panelRect,
    placement: makeFolderTransitionPlacement(3, { cols: 7, rows: 3 }),
  });
  const desktopSample = trajectory.sample(0);
  const panelSample = trajectory.sample(1);
  assert(nearlyEqual(desktopSample.left, desktopRect.left) && nearlyEqual(desktopSample.top, desktopRect.top), "progress zero should be the exact desktop endpoint");
  assert(nearlyEqual(desktopSample.width, desktopRect.width) && nearlyEqual(desktopSample.height, desktopRect.height), "desktop endpoint size should remain exact");
  assert(nearlyEqual(panelSample.left, panelRect.left) && nearlyEqual(panelSample.top, panelRect.top), "progress one should be the exact panel endpoint");
  assert(nearlyEqual(panelSample.width, panelRect.width) && nearlyEqual(panelSample.height, panelRect.height), "panel endpoint size should remain exact");
  assert(trajectory.desktopClosingDirection.y < -0.99, "the top-center slot should close upward");

  const directions = [
    { index: 0, signX: -1, signY: -1 },
    { index: 6, signX: 1, signY: -1 },
    { index: 14, signX: -1, signY: 1 },
    { index: 20, signX: 1, signY: 1 },
  ].map(({ index, signX, signY }) => {
    const row = Math.floor(index / 7);
    const col = index % 7;
    const targetCenterX = 180 + col * 140;
    const targetCenterY = 100 + row * 300;
    const current = createFolderTransitionTrajectory({
      desktopRect: { height: 80, left: targetCenterX - 40, top: targetCenterY - 40, width: 80 },
      panelRect,
      placement: makeFolderTransitionPlacement(index, { cols: 7, rows: 3 }),
    });
    assert(Math.sign(current.desktopClosingDirection.x) === signX, `slot ${index} should keep its horizontal closing hemisphere`);
    assert(Math.sign(current.desktopClosingDirection.y) === signY, `slot ${index} should keep its vertical closing hemisphere`);
    return current.desktopClosingDirection;
  });
  assert(directions.length === 4, "corner direction fixtures should all be evaluated");

  for (const { index, signX } of [
    { index: 7, signX: -1 },
    { index: 13, signX: 1 },
  ]) {
    const col = index % 7;
    const targetCenterX = 180 + col * 140;
    const middleRowTrajectory = createFolderTransitionTrajectory({
      desktopRect: { height: 80, left: targetCenterX - 40, top: 360, width: 80 },
      panelRect,
      placement: makeFolderTransitionPlacement(index, { cols: 7, rows: 3 }),
    });
    assert(Math.sign(middleRowTrajectory.desktopClosingDirection.x) === signX, `middle-row slot ${index} should close toward its horizontal side`);
    assert(Math.abs(middleRowTrajectory.desktopClosingDirection.y) < 0.01, `middle-row slot ${index} should not acquire a vertical terminal bias`);
  }
  const centerTrajectory = createFolderTransitionTrajectory({
    desktopRect: { height: 80, left: 560, top: 360, width: 80 },
    panelRect,
    placement: makeFolderTransitionPlacement(10, { cols: 7, rows: 3 }),
  });
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const sampleCenter = center(centerTrajectory.sample(progress));
    assert(nearlyEqual(sampleCenter.x, 600) && nearlyEqual(sampleCenter.y, 400), "the physical center slot should keep a centered morph without an invented direction");
  }

  const topPlacement = makeFolderTransitionPlacement(3, { cols: 7, rows: 3 });
  const bottomPlacement = makeFolderTransitionPlacement(17, { cols: 7, rows: 3 });
  const topTrajectory = createFolderTransitionTrajectory({
    desktopRect: { height: 80, left: 560, top: 60, width: 80 },
    panelRect: { height: 300, left: 350, top: 250, width: 500 },
    placement: topPlacement,
  });
  const bottomTrajectory = createFolderTransitionTrajectory({
    desktopRect: { height: 80, left: 560, top: 660, width: 80 },
    panelRect: { height: 300, left: 350, top: 250, width: 500 },
    placement: bottomPlacement,
  });
  for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
    const topCenter = center(topTrajectory.sample(progress));
    const bottomCenter = center(bottomTrajectory.sample(progress));
    assert(nearlyEqual(topCenter.x, bottomCenter.x), "first and third row center paths should stay horizontally aligned");
    assert(nearlyEqual(topCenter.y + bottomCenter.y, 800, 0.01), "first and third row center paths should be vertically mirrored around the panel center");
  }

  const evenLeft = makeFolderTransitionPlacement(14, { cols: 6, rows: 4 });
  const evenRight = makeFolderTransitionPlacement(15, { cols: 6, rows: 4 });
  assert(evenLeft.col === 2 && evenRight.col === 3, "even layouts should preserve the two physical center columns");
  const searchPlacement = makeFolderTransitionPlacement(2, {
    cols: 10,
    isSearchMode: true,
    rows: 2,
    visibleCount: 3,
  });
  assert(searchPlacement.cols === 3 && searchPlacement.col === 2, "search direction should use the effective centered result columns");
  const oneCell = makeFolderTransitionPlacement(0, { cols: 1, rows: 1 });
  const oneCellTrajectory = createFolderTransitionTrajectory({ desktopRect, panelRect, placement: oneCell });
  assert(Number.isFinite(oneCellTrajectory.desktopClosingDirection.x) && Number.isFinite(oneCellTrajectory.desktopClosingDirection.y), "single-cell layouts should fall back to the natural path without NaN");

  const overshoot = trajectory.sample(-0.02);
  assert(nearlyEqual(overshoot.width, desktopRect.width) && nearlyEqual(overshoot.height, desktopRect.height), "terminal overshoot should move the shell without distorting its desktop size");
  assert(center(overshoot).y < center(desktopRect).y, "top-row overshoot should continue past the desktop endpoint in the closing direction");
}
