import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getIconLabelTopFromVisualRect } from "../geometry/iconMetrics.js";
import { clientRectToStageVisualRect } from "../geometry/stageCoordinates.js";
import { getFrameRadius } from "./folderFrameGhostMath.js";

const OPENING_INTERRUPTION_FRAME_PADDING = 48;

function expandBounds(bounds, rect) {
  if (!rect) return bounds;
  const left = Math.min(bounds?.left ?? Infinity, rect.left);
  const top = Math.min(bounds?.top ?? Infinity, rect.top);
  const right = Math.max(bounds?.right ?? -Infinity, rect.left + rect.width);
  const bottom = Math.max(bounds?.bottom ?? -Infinity, rect.top + rect.height);
  return { bottom, left, right, top };
}

function makeFrameSnapshotFromBounds(bounds, padding, styleFrame) {
  if (!bounds) return null;
  const rect = {
    height: bounds.bottom - bounds.top + padding * 2,
    left: bounds.left - padding,
    top: bounds.top - padding,
    width: bounds.right - bounds.left + padding * 2,
  };
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    ...rect,
    fillAlpha: styleFrame?.fillAlpha,
    fillColor: styleFrame?.fillColor,
    radius: getFrameRadius(rect, styleFrame?.radius ?? 48),
    strokeAlpha: styleFrame?.strokeAlpha,
    strokeColor: styleFrame?.strokeColor,
    strokeWidth: styleFrame?.strokeWidth,
  };
}

export function cloneFrameSnapshot(frame) {
  if (!frame) return null;
  return {
    fillAlpha: frame.fillAlpha,
    fillColor: frame.fillColor,
    height: frame.height,
    left: frame.left,
    radius: frame.radius,
    strokeAlpha: frame.strokeAlpha,
    strokeColor: frame.strokeColor,
    strokeWidth: frame.strokeWidth,
    top: frame.top,
    width: frame.width,
  };
}

export function makeOpeningInterruptionFrame(targets, stageRect, styleFrame, options = {}) {
  const padding = options.padding ?? OPENING_INTERRUPTION_FRAME_PADDING;
  let bounds = null;
  for (const target of targets || []) {
    const iconRect = clientRectToStageVisualRect(target.sourceRect, stageRect);
    if (!iconRect) continue;
    bounds = expandBounds(bounds, iconRect);
    if (target.sourceLabelAlpha == null || target.sourceLabelAlpha <= 0) continue;
    const scale = target.sourceScale ?? 1;
    const labelWidth = Math.max(72, Math.min(160, target.cellWidth || 120)) * scale;
    const labelTop = getIconLabelTopFromVisualRect(iconRect, scale);
    bounds = expandBounds(bounds, {
      height: 24 * scale,
      left: iconRect.left + iconRect.width / 2 - labelWidth / 2,
      top: labelTop,
      width: labelWidth,
    });
  }
  return makeFrameSnapshotFromBounds(bounds, padding, styleFrame);
}

reloadOnPixiHotUpdate(import.meta.hot);
