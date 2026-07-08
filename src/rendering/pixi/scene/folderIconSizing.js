import { reloadOnPixiHotUpdate } from "../devHmr.js";

function positiveNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function applyPositiveLimit(size, limit) {
  const safeLimit = positiveNumber(limit);
  return safeLimit ? Math.min(size, safeLimit) : size;
}

export function resolveFolderIconRenderSize(options = {}) {
  const requestedSize = positiveNumber(options.requestedSize);
  const fallbackSize = positiveNumber(options.fallbackSize, 64);
  const baseSize = requestedSize || fallbackSize;
  return Math.max(
    1,
    applyPositiveLimit(
      applyPositiveLimit(baseSize, options.cellWidth),
      options.cellHeight
    )
  );
}

reloadOnPixiHotUpdate(import.meta.hot);
