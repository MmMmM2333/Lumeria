import { reloadOnPixiHotUpdate } from "../devHmr.js";

export const ICON_LABEL_GAP = 14;
export const ICON_VISUAL_OFFSET_Y = -14;

export function getIconVisualOffsetY(textless: boolean): number {
  return textless ? 0 : ICON_VISUAL_OFFSET_Y;
}

export function getIconNodeOffsetFromVisualCenter(textless: boolean): number {
  return -getIconVisualOffsetY(textless);
}

export function getIconLabelLocalY(iconSize: number, textless: boolean): number {
  return iconSize / 2 + ICON_LABEL_GAP + getIconVisualOffsetY(textless);
}

export function getIconLabelTopFromVisualRect(
  iconRect: { height: number; top: number } | null | undefined,
  scale = 1
): number {
  if (!iconRect) return 0;
  return iconRect.top + iconRect.height + ICON_LABEL_GAP * scale;
}

reloadOnPixiHotUpdate(import.meta.hot);
