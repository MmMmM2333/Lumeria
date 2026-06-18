import {
  makeDesktopFrameFromStageRects,
  makeRootStageRect,
  mapClientRectToRootStageLocal,
  mapDesktopLocalRectToRootStageLocal,
  mapRootStageLocalRectToDesktopLocal,
} from "./rootStageCoordinates.js";

export function runRootStageCoordinatesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi root stage coordinates test failed] ${message}`);
  };

  const rootStageRect = makeRootStageRect({ height: 798, left: 0, top: 0, width: 1656 });
  const desktopStageRect = { height: 631, left: 0, top: 93, width: 1656 };
  const desktopFrame = makeDesktopFrameFromStageRects(rootStageRect, desktopStageRect);

  assert(desktopFrame.top === 93, "desktop frame should preserve the desktop offset inside root stage");
  assert(desktopFrame.height === 631, "desktop frame should preserve the desktop stage height");

  const desktopLocalRect = { height: 40, left: 120, top: 200, width: 40 };
  const rootLocalRect = mapDesktopLocalRectToRootStageLocal(desktopLocalRect, desktopFrame);
  assert(rootLocalRect.left === 120, "desktop local x should map into root stage local x");
  assert(rootLocalRect.top === 293, "desktop local y should include the desktop frame offset");

  const roundTripRect = mapRootStageLocalRectToDesktopLocal(rootLocalRect, desktopFrame);
  assert(roundTripRect.top === desktopLocalRect.top, "root local rect should map back to desktop local y");
  assert(roundTripRect.left === desktopLocalRect.left, "root local rect should map back to desktop local x");

  const clientLocalRect = mapClientRectToRootStageLocal({ height: 10, left: 12, top: 34, width: 10 }, {
    height: 600,
    left: 2,
    top: 4,
    width: 800,
  });
  assert(clientLocalRect.left === 10 && clientLocalRect.top === 30, "client rect should subtract the root stage origin");
}
