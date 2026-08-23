import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getFolderThumbMetrics } from "./folderThumbMetrics.js";
import type { Graphics } from "pixi.js";
import type { FolderThumbMetrics } from "./folderThumbMetrics.js";

export interface FolderPreviewMaskRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface AppFolderCreateFrame {
  alpha?: number | null;
  padding?: number | null;
}

function clamp01(value: unknown): number {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function getPadding(frame: AppFolderCreateFrame | null | undefined): number {
  return Math.max(0, Number(frame?.padding) || 0);
}

export function getFolderFrameRadius(thumb: FolderThumbMetrics, padding: number): number {
  return thumb.radius + padding * 0.72;
}

export function getPaddedFrameScale(iconSize: number, padding = 0, targetPadding = padding): number {
  const baseSize = Math.max(1, Number(iconSize) || 1);
  const currentSize = baseSize + Math.max(0, Number(padding) || 0) * 2;
  const targetSize = baseSize + Math.max(0, Number(targetPadding) || 0) * 2;
  return Math.max(0.01, currentSize / Math.max(1, targetSize));
}

export function getFolderPreviewMaskRect(
  iconSize: number,
  thumb: FolderThumbMetrics,
): FolderPreviewMaskRect {
  const maskPadding = Math.max(0.5, iconSize * 0.01);
  const left = thumb.start - thumb.childSize / 2 - maskPadding;
  const top = thumb.start - thumb.childSize / 2 - maskPadding;
  const width = thumb.childSize * 3 + thumb.gap * 2 + maskPadding * 2;
  return { height: width, left, top, width };
}

export function drawFolderThumbFrame(
  graphics: Graphics,
  size: number,
  thumb: FolderThumbMetrics,
  padding = 0,
): void {
  const frameSize = size + padding * 2;
  const radius = getFolderFrameRadius(thumb, padding);
  graphics.clear()
    .roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, radius)
    .fill({ color: thumb.fillColor, alpha: thumb.fillAlpha })
    .stroke({ color: thumb.strokeColor, alpha: thumb.strokeAlpha, width: thumb.strokeWidth });
}

export function drawFolderPreviewMask(
  graphics: Graphics,
  iconSize: number,
  thumb: FolderThumbMetrics,
): void {
  const rect = getFolderPreviewMaskRect(iconSize, thumb);
  graphics.clear()
    .rect(rect.left, rect.top, rect.width, rect.height)
    .fill({ color: 0xffffff, alpha: 1 });
}

export function drawFolderFlashOverlay(
  graphics: Graphics,
  size: number,
  thumb: FolderThumbMetrics,
  padding = 0,
): void {
  const frameSize = size + padding * 2;
  const radius = getFolderFrameRadius(thumb, padding);
  graphics.clear()
    .roundRect(-frameSize / 2, -frameSize / 2, frameSize, frameSize, radius)
    .fill({ color: 0xffffff, alpha: 1 });
}

export function drawAppFolderCreateBackdrop(
  graphics: Graphics,
  iconSize: number,
  frame: AppFolderCreateFrame | null | undefined,
): void {
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

export function drawAppFolderCreateFlashOverlay(
  graphics: Graphics,
  iconSize: number,
  frame: AppFolderCreateFrame | null | undefined,
): void {
  const padding = getPadding(frame);
  const thumb = getFolderThumbMetrics(iconSize);
  const size = iconSize + padding * 2;
  const radius = getFolderFrameRadius(thumb, padding);
  graphics.clear()
    .roundRect(-size / 2, -size / 2, size, size, radius)
    .fill({ color: 0xffffff, alpha: 1 });
}

reloadOnPixiHotUpdate(import.meta.hot);
