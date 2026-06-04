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
}
