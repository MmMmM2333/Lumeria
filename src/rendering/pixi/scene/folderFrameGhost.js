import { Graphics } from "pixi.js";
import { gsap } from "gsap";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { folderOpenGhostDuration, folderOpenGhostEase } from "../animation/eases.js";
import { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";

export { getFrameRadius, lerpColor } from "./folderFrameGhostMath.js";

export function ensureClosingFrameMaskState(layer) {
  if (layer.closingFrameMask && !layer.closingFrameMask.destroyed) return layer.closingFrameMask;
  layer.closingFrameMask = new Graphics();
  const frameIndex = layer.children?.indexOf?.(layer.frameGhost);
  if (frameIndex >= 0) layer.addChildAt(layer.closingFrameMask, frameIndex + 1);
  else layer.addChild(layer.closingFrameMask);
  return layer.closingFrameMask;
}

export function clearClosingFrameMask(layer) {
  const mask = layer.closingFrameMask;
  if (layer.closingGhostLayer?.mask === mask) layer.closingGhostLayer.mask = null;
  if (layer.closingPreviewSwapLayer?.mask === mask) layer.closingPreviewSwapLayer.mask = null;
  mask?.clear?.();
}

export function enableClosingFrameMask(layer) {
  const mask = ensureClosingFrameMaskState(layer);
  layer.closingGhostLayer.mask = mask;
  layer.closingPreviewSwapLayer.mask = mask;
}

export function drawClosingFrameMask(layer, rect) {
  const mask = ensureClosingFrameMaskState(layer);
  mask.clear()
    .roundRect(rect.left, rect.top, rect.width, rect.height, rect.radius)
    .fill({ color: 0xffffff, alpha: 1 });
}

export function drawFrameGhost(layer, rect, options = {}) {
  const drawRect = rect;
  layer.frameGhost.clear()
    .roundRect(drawRect.left, drawRect.top, drawRect.width, drawRect.height, drawRect.radius)
    .fill({ color: Math.round(drawRect.fillColor ?? 0xf7f8ff), alpha: drawRect.fillAlpha })
    .stroke({ color: Math.round(drawRect.strokeColor ?? 0xffffff), alpha: drawRect.strokeAlpha, width: drawRect.strokeWidth ?? 1 });
  if (options.updateClosingMask) drawClosingFrameMask(layer, drawRect);
  if (options.notifyTitleFrame !== false) layer.notifyTitleFrame(drawRect);
}

export function clearFrameGhost(layer, options = {}) {
  if (layer.frameGhostState) {
    gsap.killTweensOf(layer.frameGhostState);
    layer.frameGhostState = null;
  }
  gsap.killTweensOf(layer.frameGhost);
  gsap.killTweensOf(layer.panelMaterial);
  layer.frameGhost.clear();
  layer.frameGhost.visible = false;
  layer.frameGhost.alpha = 0;
  clearClosingFrameMask(layer);
  layer.panelMaterial.visible = true;
  layer.panelMaterial.alpha = options.panelMaterialAlpha ?? 1;
}

export function startFrameGhost(layer, fromRect, toRect, options = {}) {
  if (!fromRect || !toRect) return;
  if (layer.frameGhostState) gsap.killTweensOf(layer.frameGhostState);
  gsap.killTweensOf(layer.frameGhost);
  gsap.killTweensOf(layer.panelMaterial);
  const duration = options.duration ?? folderOpenGhostDuration;
  const ease = options.ease ?? folderOpenGhostEase;
  const fadeStart = Math.max(0, Math.min(0.95, options.fadeStart ?? 0.72));
  const fadeDuration = Math.max(0.01, duration * (1 - fadeStart));
  const fromFillColor = options.fromFillColor ?? 0xf7f8ff;
  const toFillColor = options.toFillColor ?? fromFillColor;
  const fromStrokeColor = options.fromStrokeColor ?? 0xffffff;
  const toStrokeColor = options.toStrokeColor ?? fromStrokeColor;
  layer.panelMaterial.visible = true;
  layer.panelMaterial.alpha = options.panelMaterialFromAlpha ?? 0;
  layer.frameGhost.visible = true;
  layer.frameGhost.alpha = options.frameGhostFromAlpha ?? 1;
  const frame = {
    fillAlpha: options.fromFillAlpha ?? 0.22,
    fillColor: fromFillColor,
    height: fromRect.height,
    left: fromRect.left,
    progress: 0,
    radius: options.fromRadius ?? getFrameRadius(fromRect),
    strokeAlpha: options.fromStrokeAlpha ?? 0.26,
    strokeColor: fromStrokeColor,
    strokeWidth: options.fromStrokeWidth ?? 1,
    top: fromRect.top,
    width: fromRect.width,
  };
  layer.frameGhostState = frame;
  drawFrameGhost(layer, frame, options);
  gsap.to(layer.panelMaterial, {
    alpha: options.panelMaterialToAlpha ?? 1,
    delay: duration * fadeStart,
    duration: fadeDuration,
    ease,
    overwrite: "auto",
  });
  gsap.to(layer.frameGhost, {
    alpha: options.frameGhostToAlpha ?? 0,
    delay: duration * fadeStart,
    duration: fadeDuration,
    ease,
    overwrite: "auto",
  });
  gsap.to(frame, {
    duration,
    ease,
    fillAlpha: options.toFillAlpha ?? 0.26,
    height: toRect.height,
    left: toRect.left,
    progress: 1,
    radius: options.toRadius ?? getFrameRadius(toRect, 48),
    strokeAlpha: options.toStrokeAlpha ?? 0.24,
    strokeWidth: options.toStrokeWidth ?? frame.strokeWidth,
    top: toRect.top,
    width: toRect.width,
    onUpdate: () => {
      frame.fillColor = lerpColor(fromFillColor, toFillColor, frame.progress);
      frame.strokeColor = lerpColor(fromStrokeColor, toStrokeColor, frame.progress);
      drawFrameGhost(layer, frame, options);
      options.onUpdate?.(frame);
    },
    onComplete: () => {
      frame.fillColor = toFillColor;
      frame.strokeColor = toStrokeColor;
      if (options.preserveOnComplete) {
        layer.frameGhostState = frame;
        drawFrameGhost(layer, frame, options);
        options.onComplete?.();
        return;
      }
      clearFrameGhost(layer, { panelMaterialAlpha: options.panelMaterialFinalAlpha ?? 1 });
      options.onComplete?.();
    },
  });
}

reloadOnPixiHotUpdate(import.meta.hot);
