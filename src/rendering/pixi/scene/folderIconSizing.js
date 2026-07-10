import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconCellContentMaxWidth } from "../nodes/iconInteractionGeometry.js";

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
  const maxContentWidth = getIconCellContentMaxWidth(options.cellWidth);
  return Math.max(
    1,
    applyPositiveLimit(
      applyPositiveLimit(baseSize, maxContentWidth),
      options.cellHeight
    )
  );
}

reloadOnPixiHotUpdate(import.meta.hot);
