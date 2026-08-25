import {
  getCenteredLocalRect,
  getTransformedLocalRectBounds,
  mapClientRectToDisplayObjectLocalRect,
  mapDisplayObjectLocalRectToStageRect,
} from "./displayObjectBounds.js";
import type { StagePoint } from "./stageCoordinates.js";

function makeMatrix(transform: (point: StagePoint) => StagePoint) {
  return {
    apply(point: StagePoint): StagePoint {
      return transform(point);
    },
  };
}

export function runDisplayObjectBoundsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Pixi display object bounds test failed] ${message}`);
  };

  const centered = getCenteredLocalRect(64);
  assert(centered.left === -32 && centered.top === -32, "centered rect should be anchored around local origin");
  assert(centered.width === 64 && centered.height === 64, "centered rect should keep the requested size");

  const transformed = getTransformedLocalRectBounds(
    makeMatrix(({ x, y }) => ({ x: x * 2 + 10, y: y * 3 + 20 })),
    { left: -5, top: -4, width: 10, height: 8 }
  );
  assert(transformed, "a valid transform should produce bounds");
  assert(transformed.left === 0 && transformed.top === 8, "transformed bounds should use the minimum transformed corner");
  assert(transformed.width === 20 && transformed.height === 24, "transformed bounds should include all transformed corners");

  const openingSource = mapClientRectToDisplayObjectLocalRect({
    node: {
      toLocal: ({ x, y }) => ({
        x: (x - 768) / 1.08 + 768,
        y: (y - 432) / 1.08 + 432,
      }),
    },
    rect: { height: 17.874, left: 738.29568, top: 116.31168, width: 17.874 },
    stageHeight: 864,
    stageRect: { height: 864, left: 0, top: 0, width: 1536 },
    stageWidth: 1536,
  });
  assert(openingSource, "a client rect should map through the inverse display-object transform");
  assert(
    Math.abs(openingSource.left - 740.496) < 0.0001 && Math.abs(openingSource.top - 139.696) < 0.0001,
    "inverse mapping should remove the parent translation and pivoted scale",
  );
  assert(
    Math.abs(openingSource.width - 16.55) < 0.0001 && Math.abs(openingSource.height - 16.55) < 0.0001,
    "inverse mapping should remove the parent world scale from client dimensions",
  );

  const scaledClientSource = mapClientRectToDisplayObjectLocalRect({
    node: { toLocal: ({ x, y }) => ({ x, y }) },
    rect: { height: 60, left: 210, top: 220, width: 40 },
    stageHeight: 800,
    stageRect: { height: 1600, left: 10, top: 20, width: 2400 },
    stageWidth: 1200,
  });
  assert(scaledClientSource, "client mapping should support a CSS-scaled stage");
  assert(
    scaledClientSource.left === 100 && scaledClientSource.top === 100 &&
      scaledClientSource.width === 20 && scaledClientSource.height === 30,
    "client mapping should invert the stage projection before the display-object transform",
  );

  const mapped = mapDisplayObjectLocalRectToStageRect({
    node: {
      getGlobalTransform: () => makeMatrix(({ x, y }) => ({ x: x + 10, y: y + 20 })),
    },
    rect: { left: 5, top: 6, width: 10, height: 20 },
    stageHeight: 150,
    stageRect: { left: 100, top: 200, width: 200, height: 300 },
    stageWidth: 100,
  });
  assert(mapped, "a transformed node should map into stage bounds");
  assert(mapped.left === 130 && mapped.top === 252, "mapped bounds should include transform and stage scale");
  assert(mapped.width === 20 && mapped.height === 40, "mapped bounds should scale dimensions into the visual stage");

  const fallback = mapDisplayObjectLocalRectToStageRect({
    allowGlobalFallback: true,
    node: {
      getGlobalPosition: () => ({ x: 30, y: 40 }),
      getGlobalTransform: () => null,
    },
    rect: { left: -5, top: -10, width: 10, height: 20 },
    stageHeight: 100,
    stageRect: { left: 0, top: 0, width: 100, height: 100 },
    stageWidth: 100,
  });
  assert(fallback, "an enabled global-position fallback should map into stage bounds");
  assert(fallback.left === 25 && fallback.top === 30, "fallback bounds should offset the local rect from global position");
  assert(fallback.width === 10 && fallback.height === 20, "fallback bounds should preserve source dimensions");

  const scaledStage = mapDisplayObjectLocalRectToStageRect({
    node: {
      getGlobalTransform: () => makeMatrix(({ x, y }) => ({ x, y })),
    },
    rect: getCenteredLocalRect(96),
    stageHeight: 2160,
    stageRect: { left: 0, top: 0, width: 1920, height: 1080 },
    stageWidth: 3840,
  });
  assert(scaledStage, "a scaled stage transform should produce bounds");
  assert(scaledStage.left === -24 && scaledStage.top === -24, "2x backing stage should scale transformed bounds into css pixels");
  assert(scaledStage.width === 48 && scaledStage.height === 48, "2x backing stage should scale display object dimensions");

  const missingTransform = mapDisplayObjectLocalRectToStageRect({
    node: { getGlobalTransform: () => null },
    rect: { left: 0, top: 0, width: 10, height: 10 },
  });
  assert(missingTransform === null, "bounds without transform should be nullable when fallback is disabled");
}
