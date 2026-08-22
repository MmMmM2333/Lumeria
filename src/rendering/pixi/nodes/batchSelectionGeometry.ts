import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getFocusFrameRect } from "./iconFocusFrame.js";
import type { FocusFrameRect, FocusFrameRectOptions } from "./iconFocusFrame.js";

interface BatchSelectionAreaOptions {
  area?: string | null;
  source?: Readonly<{ type?: string | null }> | null;
  sourceType?: string | null;
}

export interface BatchSelectionFrameOptions extends FocusFrameRectOptions, BatchSelectionAreaOptions {
  cellWidth?: number | null;
}

export interface BatchSelectionBadgeOptions {
  frameRect?: Partial<FocusFrameRect> | null;
  iconSize?: number;
  inset?: number | null;
  isCheck?: boolean;
  label?: unknown;
}

export interface BatchSelectionBadgeMetrics {
  fontSize: number;
  isCheck: boolean;
  label: string;
  size: number;
  strokeWidth: number;
  textOffsetX: number;
  textOffsetY: number;
}

export interface BatchSelectionBadgeLayout extends BatchSelectionBadgeMetrics {
  inset: number;
  outerRadius: number;
  x: number;
  y: number;
}

// These values describe only the batch-selection visuals. They do not alter
// the underlying grid or pointer hit area.
export const BATCH_SELECTION_FRAME_GAP_X = 8;
export const BATCH_SELECTION_BADGE_INSET = 4;
export const BATCH_SELECTION_BADGE_MIN_SIZE = 18;
export const BATCH_SELECTION_BADGE_MAX_SIZE = 25;
export const BATCH_SELECTION_BADGE_TEXT_OPTICAL_OFFSET_X_RATIO = 0.04;

function positiveNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function isFolderBatchSelectionArea(options: BatchSelectionAreaOptions = {}): boolean {
  return options.area === "folder" ||
    options.sourceType === "folder" ||
    options.source?.type === "folder";
}

export function getBatchSelectionFrameRect(options: BatchSelectionFrameOptions = {}): FocusFrameRect {
  const iconSize = positiveNumber(options.iconSize, 64);
  const cellWidth = Number(options.cellWidth);
  const hasCellWidth = Number.isFinite(cellWidth) && cellWidth > 0;
  const maxWidth = isFolderBatchSelectionArea(options) && hasCellWidth
    ? Math.max(iconSize, cellWidth - BATCH_SELECTION_FRAME_GAP_X * 2)
    : options.maxWidth;

  return getFocusFrameRect({
    ...options,
    iconSize,
    maxWidth,
  });
}

export function getBatchSelectionBadgeMetrics(options: BatchSelectionBadgeOptions = {}): BatchSelectionBadgeMetrics {
  const iconSize = positiveNumber(options.iconSize, 64);
  const label = String(options.label || "");
  const isCheck = Boolean(options.isCheck);
  const size = Math.max(
    BATCH_SELECTION_BADGE_MIN_SIZE,
    Math.min(BATCH_SELECTION_BADGE_MAX_SIZE, iconSize * 0.31),
  );
  const strokeWidth = Math.max(1.5, size * 0.08);
  const fontSize = isCheck
    ? 0
    : label.length > 2
      ? size * 0.35
      : size * 0.5;
  const textOffsetX = isCheck
    ? 0
    : fontSize * BATCH_SELECTION_BADGE_TEXT_OPTICAL_OFFSET_X_RATIO;

  return {
    fontSize,
    isCheck,
    label,
    size,
    strokeWidth,
    textOffsetX,
    textOffsetY: 0,
  };
}

export function getBatchSelectionBadgeLayout(options: BatchSelectionBadgeOptions = {}): BatchSelectionBadgeLayout {
  const frameRect = options.frameRect || {};
  const metrics = getBatchSelectionBadgeMetrics(options);
  const inset = Math.max(0, Number(options.inset ?? BATCH_SELECTION_BADGE_INSET) || 0);
  const outerRadius = metrics.size / 2 + metrics.strokeWidth / 2;
  const right = Number(frameRect.left) + Number(frameRect.width);
  const top = Number(frameRect.top);

  return {
    ...metrics,
    inset,
    outerRadius,
    x: right - inset - outerRadius,
    y: top + inset + outerRadius,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
