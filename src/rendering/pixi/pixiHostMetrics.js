import { reloadOnPixiHotUpdate } from "./devHmr.js";

export function getPixiHostRect(host, fallback = {}) {
  return host?.getBoundingClientRect?.() || {
    height: fallback.height || 1,
    left: 0,
    top: 0,
    width: fallback.width || 1,
  };
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getPixiHostLayoutRect(host, fallback = {}) {
  const rect = getPixiHostRect(host, fallback);
  const width = host?.offsetWidth || host?.clientWidth || rect.width || fallback.width || 1;
  const height = host?.offsetHeight || host?.clientHeight || rect.height || fallback.height || 1;
  let left = 0;
  let top = 0;
  let node = host;
  let hasLayoutPosition = false;

  while (node) {
    if (node.offsetLeft != null || node.offsetTop != null) hasLayoutPosition = true;
    left += safeNumber(node.offsetLeft);
    top += safeNumber(node.offsetTop);
    node = node.offsetParent || null;
  }

  if (!hasLayoutPosition) {
    left = safeNumber(rect.left);
    top = safeNumber(rect.top);
  } else {
    left -= safeNumber(globalThis.scrollX ?? globalThis.pageXOffset);
    top -= safeNumber(globalThis.scrollY ?? globalThis.pageYOffset);
  }

  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}

export function getPixiHostMetrics(host, fallback = {}) {
  const rect = getPixiHostRect(host, fallback);
  const width = host?.offsetWidth || host?.clientWidth || rect.width || fallback.width || 1;
  const height = host?.offsetHeight || host?.clientHeight || rect.height || fallback.height || 1;
  return {
    layoutRect: getPixiHostLayoutRect(host, fallback),
    rect,
    height,
    width,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
