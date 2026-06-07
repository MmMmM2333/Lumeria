import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { estimateLabelWidth } from "./iconLabelLayout.js";

const SELECTION_FRAME_MIN_PADDING_X = 12;
const SELECTION_FRAME_PADDING_TOP = 10;
const SELECTION_FRAME_PADDING_BOTTOM = 8;

export function getSelectionFrameRadius(iconSize) {
  return Math.min(28, Math.max(18, iconSize * 0.32));
}

export function getSelectionFrameRect(options = {}) {
  const {
    iconSize = 64,
    labelText = null,
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

  const minWidth = iconSize + SELECTION_FRAME_MIN_PADDING_X * 2;
  const contentWidth = right - left;
  const height = bottom - top + SELECTION_FRAME_PADDING_TOP + SELECTION_FRAME_PADDING_BOTTOM;
  const width = Math.max(height, minWidth, contentWidth + SELECTION_FRAME_MIN_PADDING_X * 2);
  return {
    height,
    left: -width / 2,
    top: top - SELECTION_FRAME_PADDING_TOP,
    width,
  };
}

export function shouldDrawSelectionFrame(options = {}) {
  const {
    dropTarget = false,
    isAppFolderCreateHover = false,
    isFolderDropHover = false,
    selected = false,
  } = options;
  return Boolean(selected || (dropTarget && !isAppFolderCreateHover && !isFolderDropHover));
}

export function drawSelectionFrame(graphics, rect, iconSize, options = {}) {
  graphics.clear();
  if (!shouldDrawSelectionFrame(options)) return;
  const isDropTarget = Boolean(options.dropTarget && !options.isAppFolderCreateHover && !options.isFolderDropHover);
  graphics
    .roundRect(rect.left, rect.top, rect.width, rect.height, getSelectionFrameRadius(iconSize))
    .fill({ color: isDropTarget ? 0xffffff : 0x000000, alpha: isDropTarget ? 0.18 : 0.3 })
    .stroke({ color: 0xffffff, alpha: isDropTarget ? 0.9 : 0.12, width: isDropTarget ? 2 : 1 });
}

reloadOnPixiHotUpdate(import.meta.hot);
