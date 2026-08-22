import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { estimateLabelWidth } from "./iconLabelLayout.js";
import { ICON_INTERACTION_PADDING } from "./iconInteractionGeometry.js";
import type { Graphics } from "pixi.js";

export interface FocusFrameRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface FocusFrameLabelText {
  height?: unknown;
  style?: Readonly<{
    fontSize?: unknown;
    lineHeight?: unknown;
    wordWrapWidth?: unknown;
  }>;
  text?: unknown;
  visible: boolean;
  width?: unknown;
  y: number;
}

export interface FocusFrameRectOptions {
  iconSize?: number;
  labelText?: FocusFrameLabelText | null;
  maxWidth?: number | null | undefined;
  visualOffsetY?: number;
}

export interface FocusFrameDrawOptions {
  batchSelected?: boolean;
  dropTarget?: boolean;
  focused?: boolean;
  isAppFolderCreateHover?: boolean;
  isFolderDropHover?: boolean;
}

const FOCUS_FRAME_PADDING_TOP = 10;
const FOCUS_FRAME_PADDING_BOTTOM = 8;

export function getFocusFrameRadius(iconSize: number): number {
  return Math.min(28, Math.max(18, iconSize * 0.32));
}

export function getFocusFrameRect(options: FocusFrameRectOptions = {}): FocusFrameRect {
  const {
    iconSize = 64,
    labelText = null,
    maxWidth = null,
    visualOffsetY = 0,
  } = options;
  let left = -iconSize / 2;
  let right = iconSize / 2;
  let top = visualOffsetY - iconSize / 2;
  let bottom = visualOffsetY + iconSize / 2;

  if (labelText?.visible) {
    const fallbackWidth = Number(labelText.style?.wordWrapWidth) || 160;
    const lineHeight = Number(labelText.style?.lineHeight) || 16;
    const fontSize = Number(labelText.style?.fontSize) || 13;
    const textLines = String(labelText.text || "").split("\n");
    const rawEstimatedWidth = Math.max(...textLines.map((line) => estimateLabelWidth(line, fontSize)));
    const estimatedWidth = Math.min(fallbackWidth, rawEstimatedWidth);
    const estimatedLines = Math.max(1, textLines.length);
    const labelWidth = Math.max(0, Math.min(fallbackWidth, Number(labelText.width) || estimatedWidth));
    const labelHeight = Math.max(0, Number(labelText.height) || estimatedLines * lineHeight);
    left = Math.min(left, -labelWidth / 2);
    right = Math.max(right, labelWidth / 2);
    top = Math.min(top, labelText.y);
    bottom = Math.max(bottom, labelText.y + labelHeight);
  }

  const minWidth = iconSize + ICON_INTERACTION_PADDING * 2;
  const contentWidth = right - left;
  const height = bottom - top + FOCUS_FRAME_PADDING_TOP + FOCUS_FRAME_PADDING_BOTTOM;
  const naturalWidth = Math.max(minWidth, contentWidth + ICON_INTERACTION_PADDING * 2);
  const preferredWidth = Math.max(naturalWidth, height);
  const numericMaxWidth = Number(maxWidth);
  // Height is a soft visual target so spacious frames stay balanced; cell width
  // remains the hard limit that prevents tall labels crossing adjacent slots.
  const width = Number.isFinite(numericMaxWidth) && numericMaxWidth > 0
    ? Math.min(preferredWidth, Math.max(iconSize, numericMaxWidth))
    : preferredWidth;
  return {
    height,
    left: -width / 2,
    top: top - FOCUS_FRAME_PADDING_TOP,
    width,
  };
}

export function shouldDrawFocusFrame(options: FocusFrameDrawOptions = {}): boolean {
  const {
    batchSelected = false,
    dropTarget = false,
    isAppFolderCreateHover = false,
    isFolderDropHover = false,
    focused = false,
  } = options;
  return Boolean(batchSelected || focused || (dropTarget && !isAppFolderCreateHover && !isFolderDropHover));
}

export function drawFocusFrame(
  graphics: Graphics,
  rect: FocusFrameRect,
  iconSize: number,
  options: FocusFrameDrawOptions = {},
): void {
  graphics.clear();
  if (!shouldDrawFocusFrame(options)) return;
  const isDropTarget = Boolean(options.dropTarget && !options.isAppFolderCreateHover && !options.isFolderDropHover);
  const isBatchSelected = Boolean(options.batchSelected);
  graphics
    .roundRect(rect.left, rect.top, rect.width, rect.height, getFocusFrameRadius(iconSize))
    .fill({
      color: isBatchSelected ? 0x1687ff : isDropTarget ? 0xffffff : 0x000000,
      alpha: isBatchSelected ? 0.16 : isDropTarget ? 0.18 : 0.3,
    })
    .stroke({
      color: isBatchSelected ? 0x68b5ff : 0xffffff,
      alpha: isBatchSelected ? 0.9 : isDropTarget ? 0.9 : 0.12,
      width: isBatchSelected || isDropTarget ? 2 : 1,
    });
}

reloadOnPixiHotUpdate(import.meta.hot);
