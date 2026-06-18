import {
  getEffectiveDevicePixelRatio,
  getStageVisualOffset,
  makeStageLocalPoint,
  makeStageLocalRect,
  makeStageVirtualElement,
  mapLocalRectToStageRect,
  snapRectToDevicePixels,
} from "./stageCoordinates.js";

export function runStageCoordinatesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Stage coordinates test failed] ${message}`);
  };

  const mapped = mapLocalRectToStageRect(
    { left: 10, top: 20, width: 200, height: 300 },
    100,
    150,
    { left: 25, top: 30, width: 10, height: 20 }
  );
  assert(mapped.left === 60, "local x should be scaled into the transformed stage");
  assert(mapped.top === 80, "local y should be scaled into the transformed stage");
  assert(mapped.width === 20, "local width should be scaled into the transformed stage");
  assert(mapped.height === 40, "local height should be scaled into the transformed stage");

  const element = makeStageVirtualElement(
    { left: 0, top: 0, width: 50, height: 80 },
    100,
    160,
    { left: 20, top: 40, width: 20, height: 30 }
  );
  const rect = element.getBoundingClientRect();
  assert(element.offsetWidth === 20 && element.offsetHeight === 30, "virtual element should expose layout size");
  assert(rect.left === 10 && rect.top === 20, "virtual element rect should expose visual position");
  assert(rect.width === 10 && rect.height === 15, "virtual element rect should expose visual size");

  const local = makeStageLocalRect(
    { left: 130, top: 260, width: 48, height: 56 },
    { left: 100, top: 200, width: 800, height: 600 }
  );
  assert(local.left === 30 && local.top === 60, "stage local rect should subtract the stage origin");
  assert(local.width === 48 && local.height === 56, "stage local rect should preserve dimensions");
  assert(makeStageLocalRect(null, { left: 0, top: 0 }) === null, "stage local rect should stay nullable");
  const localPoint = makeStageLocalPoint({ x: 130, y: 260 }, { left: 100, top: 200 });
  assert(localPoint.x === 30 && localPoint.y === 60, "stage local point should subtract the stage origin");
  assert(makeStageLocalPoint(null, { left: 0, top: 0 }) === null, "stage local point should stay nullable");
  const visualOffset = getStageVisualOffset({ left: 96, top: 216 }, { left: 100, top: 200 });
  assert(visualOffset.x === -4 && visualOffset.y === 16, "stage visual offset should compare visual and stable origins");
  const defaultVisualOffset = getStageVisualOffset({ left: 8, top: 12 });
  assert(defaultVisualOffset.x === 0 && defaultVisualOffset.y === 0, "stage visual offset should default to zero");

  const snappedRect = snapRectToDevicePixels({ left: 10.26, top: 20.74, width: 40, height: 50 }, 2);
  assert(snappedRect.left === 10.5 && snappedRect.top === 20.5, "rect snapping should align positions to the device pixel grid");
  assert(snappedRect.width === 40 && snappedRect.height === 50, "rect snapping should preserve size");
  assert(getEffectiveDevicePixelRatio(3) === 2, "effective DPR should match the renderer resolution cap");
  const cappedSnap = snapRectToDevicePixels({ left: 10.26, top: 20.74, width: 40, height: 50 }, 3);
  assert(cappedSnap.left === 10.5 && cappedSnap.top === 20.5, "rect snapping should use the capped renderer resolution");

  const stageScales = [
    { label: "1080p css stage", rect: { left: 0, top: 0, width: 1920, height: 1080 }, stageWidth: 1920, stageHeight: 1080 },
    { label: "2x backing stage", rect: { left: 0, top: 0, width: 1920, height: 1080 }, stageWidth: 3840, stageHeight: 2160 },
    { label: "4k css stage", rect: { left: 24, top: 18, width: 3840, height: 2160 }, stageWidth: 3840, stageHeight: 2160 },
  ];
  for (const config of stageScales) {
    const localRect = { left: config.stageWidth * 0.25, top: config.stageHeight * 0.2, width: config.stageWidth * 0.1, height: config.stageHeight * 0.12 };
    const scaled = mapLocalRectToStageRect(config.rect, config.stageWidth, config.stageHeight, localRect);
    const scaleX = config.rect.width / config.stageWidth;
    const scaleY = config.rect.height / config.stageHeight;
    assert(scaled.left === config.rect.left + localRect.left * scaleX, `${config.label} should scale local x into css pixels`);
    assert(scaled.top === config.rect.top + localRect.top * scaleY, `${config.label} should scale local y into css pixels`);
    assert(scaled.width === localRect.width * scaleX, `${config.label} should scale width into css pixels`);
    assert(scaled.height === localRect.height * scaleY, `${config.label} should scale height into css pixels`);
    assert(scaled.right <= config.rect.left + config.rect.width, `${config.label} should keep right edge inside stage`);
    assert(scaled.bottom <= config.rect.top + config.rect.height, `${config.label} should keep bottom edge inside stage`);
  }
}
