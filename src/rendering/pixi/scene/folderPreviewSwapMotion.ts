import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { clientRectToStageVisualRect, stageLayoutRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import type { StageOrigin, StageRect } from "../geometry/stageCoordinates.js";
import type { ClosingPreviewSwapTarget } from "./folderOverlayTargets.js";

const CLOSING_PREVIEW_SWAP_START_SCALE: number = 1.02;
const CLOSING_PREVIEW_ICON_ROW_STAGGER = 0.01;
const CLOSING_PREVIEW_ICON_COLUMN_STAGGER = 0.008;
const CLOSING_PREVIEW_ICON_START_SCALE = 1.08;
const CLOSING_PREVIEW_ICON_OUTSIDE_MARGIN = 0.35;
const CLOSING_PREVIEW_ICON_OUTSIDE_SPREAD = 0.12;

type PreviewSwapBounds = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

type ClosingPreviewSwapLocalTarget = ClosingPreviewSwapTarget & Readonly<{ rect: StageRect }>;

export type ClosingPreviewSwapIconMotion = Readonly<{
  delay: number;
  fromScale: number;
  fromX: number;
  fromY: number;
  item: ClosingPreviewSwapTarget["item"];
  previewSlotIndex: number;
  rect: StageRect;
  size: number;
  toX: number;
  toY: number;
}>;

export type ClosingPreviewSwapPlan = Readonly<{
  centerX: number;
  centerY: number;
  iconMotions: readonly ClosingPreviewSwapIconMotion[];
  maskRect: StageRect;
  wrapStartScale: number;
}>;

export type ClosingPreviewSwapPlanOptions = Readonly<{
  maskPadding?: number;
  stageHeight?: number;
  stageRect?: StageOrigin | null;
  stageWidth?: number;
}>;

function expandBounds(
  bounds: PreviewSwapBounds | null,
  rect: StageRect | null,
): PreviewSwapBounds | null {
  if (!rect) return bounds;
  const left = Math.min(bounds?.left ?? Infinity, rect.left);
  const top = Math.min(bounds?.top ?? Infinity, rect.top);
  const right = Math.max(bounds?.right ?? -Infinity, rect.left + rect.width);
  const bottom = Math.max(bounds?.bottom ?? -Infinity, rect.top + rect.height);
  return { bottom, left, right, top };
}

function makeBoundsRect(bounds: PreviewSwapBounds | null, padding = 0): StageRect | null {
  if (!bounds || !Number.isFinite(bounds.left) || !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.right) || !Number.isFinite(bounds.bottom)) return null;
  return {
    height: bounds.bottom - bounds.top + padding * 2,
    left: bounds.left - padding,
    top: bounds.top - padding,
    width: bounds.right - bounds.left + padding * 2,
  };
}

function makeIconMotion(
  target: ClosingPreviewSwapLocalTarget,
  maskRect: StageRect,
): ClosingPreviewSwapIconMotion {
  const size = Math.max(3, Math.min(target.rect.width, target.rect.height));
  const slotIndex = Math.max(0, Number(target.previewSlotIndex) || 0);
  const col = slotIndex % 3;
  const row = Math.floor(slotIndex / 3);
  const jitterX = (((slotIndex * 17) % 5) - 2) * size * 0.018;
  const jitterY = (((slotIndex * 13) % 5) - 2) * size * 0.018;
  const outsideOffset = size * (0.5 + CLOSING_PREVIEW_ICON_OUTSIDE_MARGIN);
  return {
    delay: row * CLOSING_PREVIEW_ICON_ROW_STAGGER + col * CLOSING_PREVIEW_ICON_COLUMN_STAGGER,
    fromScale: CLOSING_PREVIEW_ICON_START_SCALE + (4 - row - col) * 0.006,
    fromX: maskRect.left - outsideOffset - col * size * CLOSING_PREVIEW_ICON_OUTSIDE_SPREAD + jitterX,
    fromY: maskRect.top - outsideOffset - row * size * CLOSING_PREVIEW_ICON_OUTSIDE_SPREAD + jitterY,
    item: target.item,
    previewSlotIndex: target.previewSlotIndex,
    rect: target.rect,
    size,
    toX: target.rect.left + target.rect.width / 2,
    toY: target.rect.top + target.rect.height / 2,
  };
}

export function makeClosingPreviewSwapPlan(
  targets: readonly ClosingPreviewSwapTarget[],
  options: ClosingPreviewSwapPlanOptions = {},
): ClosingPreviewSwapPlan | null {
  const { maskPadding = 2, stageHeight, stageRect = null, stageWidth } = options;
  const localTargets: ClosingPreviewSwapLocalTarget[] = [];
  let bounds: PreviewSwapBounds | null = null;
  for (const target of targets || []) {
    const rect = target?.targetClientRect
      ? clientRectToStageVisualRect(target.targetClientRect, stageRect)
      : stageLayoutRectToStageVisualRect(
        stageRect as StageRect | null,
        stageWidth as number,
        stageHeight as number,
        target?.targetStageLayoutRect,
      );
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    localTargets.push({ ...target, rect });
    bounds = expandBounds(bounds, rect);
  }
  const maskRect = makeBoundsRect(bounds, maskPadding);
  if (!localTargets.length || !maskRect) return null;
  return {
    centerX: maskRect.left + maskRect.width / 2,
    centerY: maskRect.top + maskRect.height / 2,
    iconMotions: localTargets.map((target) => makeIconMotion(target, maskRect)),
    maskRect,
    wrapStartScale: CLOSING_PREVIEW_SWAP_START_SCALE,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
