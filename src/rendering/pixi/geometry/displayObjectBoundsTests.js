import {
  getCenteredLocalRect,
  getTransformedLocalRectBounds,
  mapDisplayObjectLocalRectToStageRect,
} from "./displayObjectBounds.js";

function makeMatrix(transform) {
  return {
    apply(point) {
      return transform(point);
    },
  };
}

export function runDisplayObjectBoundsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi display object bounds test failed] ${message}`);
  };

  const centered = getCenteredLocalRect(64);
  assert(centered.left === -32 && centered.top === -32, "centered rect should be anchored around local origin");
  assert(centered.width === 64 && centered.height === 64, "centered rect should keep the requested size");

  const transformed = getTransformedLocalRectBounds(
    makeMatrix(({ x, y }) => ({ x: x * 2 + 10, y: y * 3 + 20 })),
    { left: -5, top: -4, width: 10, height: 8 }
  );
  assert(transformed.left === 0 && transformed.top === 8, "transformed bounds should use the minimum transformed corner");
  assert(transformed.width === 20 && transformed.height === 24, "transformed bounds should include all transformed corners");

  const mapped = mapDisplayObjectLocalRectToStageRect({
    node: {
      getGlobalTransform: () => makeMatrix(({ x, y }) => ({ x: x + 10, y: y + 20 })),
    },
    rect: { left: 5, top: 6, width: 10, height: 20 },
    stageHeight: 150,
    stageRect: { left: 100, top: 200, width: 200, height: 300 },
    stageWidth: 100,
  });
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
  assert(fallback.left === 25 && fallback.top === 30, "fallback bounds should offset the local rect from global position");
  assert(fallback.width === 10 && fallback.height === 20, "fallback bounds should preserve source dimensions");

  const missingTransform = mapDisplayObjectLocalRectToStageRect({
    node: { getGlobalTransform: () => null },
    rect: { left: 0, top: 0, width: 10, height: 10 },
  });
  assert(missingTransform === null, "bounds without transform should be nullable when fallback is disabled");
}
