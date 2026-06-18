import {
  makeDesktopRenderGeometry,
  makeDesktopFrameFromStageRects,
  makeRootStageRect,
  makeRootStageDesktopContentRect,
  makeRootStageHostStyle,
  mapClientRectToRootStageLocal,
  mapDesktopLocalRectToRootStageLocal,
  mapRootStageLocalRectToDesktopLocal,
  resolveSingleStageCandidateRect,
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

  const hostStyle = makeRootStageHostStyle({ height: 798, left: 12, top: 8, width: 1656 });
  assert(hostStyle["--pixi-root-stage-left"] === "12px", "root stage host style should expose the root left");
  assert(hostStyle["--pixi-root-stage-height"] === "798px", "root stage host style should expose the root height");

  const metrics = {
    height: 620,
    layoutRect: { height: 620, left: 20, top: 80, width: 1000 },
    rect: { height: 558, left: 20, top: 92, width: 920 },
    width: 1000,
  };
  const rootRect = { height: 760, left: 10, top: 16, width: 1200 };
  const shellRect = { height: 700, left: 30, top: 40, width: 1100 };
  assert(resolveSingleStageCandidateRect(metrics, { rootRect }).left === 10, "single-stage candidate should prefer the root rect");
  assert(resolveSingleStageCandidateRect(metrics, { shellRect }).top === 40, "single-stage candidate should fall back to the shell rect");
  assert(resolveSingleStageCandidateRect(metrics).top === metrics.layoutRect.top, "single-stage candidate should fall back to the layout rect");

  const desktopContent = makeRootStageDesktopContentRect(
    metrics,
    rootRect,
    { height: 640, left: 40, top: 100, width: 1040 },
    { bottom: 20, top: 14 }
  );
  assert(desktopContent.left === rootRect.left, "desktop content should align to the root stage x origin");
  assert(desktopContent.top === 114, "desktop content should include the main top padding");
  assert(desktopContent.height === 606, "desktop content should subtract vertical padding");
  assert(desktopContent.width === rootRect.width, "desktop content should span the root stage width");

  const defaultGeometry = makeDesktopRenderGeometry(metrics, { rootStage: false });
  assert(defaultGeometry.stageRect === metrics.rect, "default geometry should preserve the host visual rect");
  assert(defaultGeometry.stableStageRect === metrics.layoutRect, "default geometry should preserve the layout rect");
  assert(defaultGeometry.desktopFrame.top === 0, "default geometry should use a zero desktop frame origin");

  const rootGeometry = makeDesktopRenderGeometry(metrics, {
    mainPaddingBottom: 20,
    mainPaddingTop: 14,
    mainRect: { height: 640, left: 40, top: 100, width: 1040 },
    rootRect,
    rootStage: true,
  });
  assert(rootGeometry.stageRect.left === rootRect.left, "root-stage geometry should use the root rect as the stage");
  assert(rootGeometry.stableStageRect === rootGeometry.stageRect, "root-stage geometry should use a single stable stage rect");
  assert(rootGeometry.desktopStageRect.top === 114, "root-stage geometry should compute the desktop content rect");
  assert(rootGeometry.desktopFrame.top === 98, "root-stage desktop frame should be relative to the root stage");
}
