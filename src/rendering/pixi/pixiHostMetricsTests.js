import { getPixiHostMetrics, getPixiHostRect } from "./pixiHostMetrics.js";

export function runPixiHostMetricsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi host metrics test failed] ${message}`);
  };

  const fallbackRect = getPixiHostRect(null, { height: 600, width: 800 });
  assert(fallbackRect.width === 800 && fallbackRect.height === 600, "host rect should use fallback dimensions without a host");

  const offsetHost = {
    clientHeight: 120,
    clientWidth: 160,
    offsetHeight: 240,
    offsetWidth: 320,
    getBoundingClientRect: () => ({ height: 60, left: 10, top: 20, width: 80 }),
  };
  const offsetMetrics = getPixiHostMetrics(offsetHost);
  assert(offsetMetrics.width === 320 && offsetMetrics.height === 240, "host metrics should prefer offset dimensions");
  assert(offsetMetrics.rect.left === 10 && offsetMetrics.rect.top === 20, "host metrics should preserve the bounding rect");

  const clientHost = {
    clientHeight: 180,
    clientWidth: 220,
    offsetHeight: 0,
    offsetWidth: 0,
    getBoundingClientRect: () => ({ height: 60, left: 0, top: 0, width: 80 }),
  };
  const clientMetrics = getPixiHostMetrics(clientHost);
  assert(clientMetrics.width === 220 && clientMetrics.height === 180, "host metrics should fall back to client dimensions");

  const rectHost = {
    clientHeight: 0,
    clientWidth: 0,
    offsetHeight: 0,
    offsetWidth: 0,
    getBoundingClientRect: () => ({ height: 90, left: 0, top: 0, width: 140 }),
  };
  const rectMetrics = getPixiHostMetrics(rectHost);
  assert(rectMetrics.width === 140 && rectMetrics.height === 90, "host metrics should fall back to rect dimensions");
}
