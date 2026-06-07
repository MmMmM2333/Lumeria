import { reloadOnPixiHotUpdate } from "./devHmr.js";

export function getViewportFallbackSize() {
  return {
    height: globalThis.innerHeight || 1,
    width: globalThis.innerWidth || 1,
  };
}

export function getPixiHostRect(host, fallback = {}) {
  return host?.getBoundingClientRect?.() || {
    height: fallback.height || 1,
    left: 0,
    top: 0,
    width: fallback.width || 1,
  };
}

export function getPixiHostMetrics(host, fallback = {}) {
  const rect = getPixiHostRect(host, fallback);
  return {
    rect,
    height: host?.offsetHeight || host?.clientHeight || rect.height || fallback.height || 1,
    width: host?.offsetWidth || host?.clientWidth || rect.width || fallback.width || 1,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
