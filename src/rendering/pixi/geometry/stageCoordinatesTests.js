import { makeStageVirtualElement, mapLocalRectToStageRect } from "./stageCoordinates.js";

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
