import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconCellContentMaxWidth } from "../nodes/iconInteractionGeometry.js";

export interface FolderIconRenderSizeOptions {
  cellHeight?: number | null;
  cellWidth?: number | null;
  fallbackSize?: number | null;
  requestedSize?: number | null;
}

function positiveNumber(value: unknown, fallback: number | null = null): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function applyPositiveLimit(size: number, limit: unknown): number {
  const safeLimit = positiveNumber(limit);
  return safeLimit ? Math.min(size, safeLimit) : size;
}

export function resolveFolderIconRenderSize(options: FolderIconRenderSizeOptions = {}): number {
  const requestedSize = positiveNumber(options.requestedSize);
  const fallbackSize = positiveNumber(options.fallbackSize, 64) as number;
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
