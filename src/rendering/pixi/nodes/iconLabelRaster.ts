import { CanvasTextMetrics, type Text } from "pixi.js";
import type { VisibleIconLabelRenderState } from "./iconLabelLayout.js";

/** Keep an existing raster key only when both widths produce the same explicit lines. */
export function resolveLabelRasterWidth(label: Text, next: VisibleIconLabelRenderState): number {
  const style = label.style;
  const previousWidth = style.wordWrapWidth;
  if (style.tagStyles && Object.keys(style.tagStyles).length > 0) return next.wordWrapWidth;
  if (!label.visible || label.text !== next.text || style.fontSize !== next.fontSize ||
    style.lineHeight !== next.lineHeight || style.wordWrap !== next.wordWrap ||
    !Number.isFinite(previousWidth) || previousWidth <= 0) return next.wordWrapWidth;
  if (previousWidth === next.wordWrapWidth) return previousWidth;

  // The application already fits/truncates explicit lines. Preserve Pixi's secondary
  // wrapping whenever a line might not fit; do not infer fit from character counts.
  const metrics = CanvasTextMetrics.measureText(next.text, style, undefined, false);
  const requiredWidth = Math.max(metrics.width, metrics.maxLineWidth) + 1;
  return requiredWidth <= Math.min(previousWidth, next.wordWrapWidth)
    ? previousWidth
    : next.wordWrapWidth;
}
