import { getPixiHostLayoutRect, getPixiHostMetrics, getPixiHostRect } from "./pixiHostMetrics.js";

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
  assert(offsetMetrics.layoutRect.width === 320 && offsetMetrics.layoutRect.height === 240, "layout rect should use untransformed offset dimensions");

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

  const parentHost = {
    offsetLeft: 20,
    offsetTop: 40,
    offsetParent: null,
  };
  const transformedHost = {
    clientHeight: 120,
    clientWidth: 160,
    offsetHeight: 240,
    offsetLeft: -20,
    offsetParent: parentHost,
    offsetTop: 90,
    offsetWidth: 320,
    getBoundingClientRect: () => ({ height: 120, left: 12, top: 16, width: 160 }),
  };
  const layoutRect = getPixiHostLayoutRect(transformedHost);
  assert(layoutRect.left === 0 && layoutRect.top === 130, "layout rect should accumulate offset positions without transform");
  assert(layoutRect.right === 320 && layoutRect.bottom === 370, "layout rect should expose viewport-style edges");
}
