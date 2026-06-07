import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getFolderThumbMetrics } from "./folderThumbMetrics.js";

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getPadding(frame) {
  return Math.max(0, Number(frame?.padding) || 0);
}

function getFolderFrameRadius(thumb, padding) {
  return thumb.radius + padding * 0.72;
}

export function getFolderPreviewMaskRect(iconSize, thumb) {
  const maskPadding = Math.max(0.5, iconSize * 0.01);
  const left = thumb.start - thumb.childSize / 2 - maskPadding;
  const top = thumb.start - thumb.childSize / 2 - maskPadding;
  const width = thumb.childSize * 3 + thumb.gap * 2 + maskPadding * 2;
  return { height: width, left, top, width };
}

export function drawFolderThumbFrame(graphics, size, thumb, padding = 0) {
  const frameSize = size + padding * 2;
  const radius = getFolderFrameRadius(thumb, padding);
  graphics.clear()
    .roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, radius)
    .fill({ color: thumb.fillColor, alpha: thumb.fillAlpha })
    .stroke({ color: thumb.strokeColor, alpha: thumb.strokeAlpha, width: thumb.strokeWidth });
}

export function drawFolderPreviewMask(graphics, iconSize, thumb) {
  const rect = getFolderPreviewMaskRect(iconSize, thumb);
  graphics.clear()
    .rect(rect.left, rect.top, rect.width, rect.height)
    .fill({ color: 0xffffff, alpha: 1 });
}

export function drawFolderFlashOverlay(graphics, size, thumb, padding = 0) {
  const frameSize = size + padding * 2;
  const radius = getFolderFrameRadius(thumb, padding);
  graphics.clear()
    .roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, radius)
    .fill({ color: 0xffffff, alpha: 1 });
}

export function drawAppFolderCreateBackdrop(graphics, iconSize, frame) {
  const alpha = clamp01(frame?.alpha);
  const padding = getPadding(frame);
  graphics.clear();
  if (alpha <= 0.001) {
    graphics.visible = false;
    return;
  }
  const thumb = getFolderThumbMetrics(iconSize);
  const size = iconSize + padding * 2;
  const radius = getFolderFrameRadius(thumb, padding);
  graphics.visible = true;
  graphics
    .roundRect(-size / 2, -size / 2, size, size, radius)
    .fill({ color: thumb.fillColor, alpha: 0.3 * alpha })
    .stroke({ color: thumb.strokeColor, alpha: 0.36 * alpha, width: thumb.strokeWidth });
}

export function drawAppFolderCreateFlashOverlay(graphics, iconSize, frame) {
  const padding = getPadding(frame);
  const thumb = getFolderThumbMetrics(iconSize);
  const size = iconSize + padding * 2;
  const radius = getFolderFrameRadius(thumb, padding);
  graphics.clear()
    .roundRect(-size / 2, -size / 2, size, size, radius)
    .fill({ color: 0xffffff, alpha: 1 });
}

reloadOnPixiHotUpdate(import.meta.hot);
