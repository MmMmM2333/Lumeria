import { Graphics } from "pixi.js";
import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { folderOpenGhostDuration, folderOpenGhostEase } from "../animation/eases.js";
import { killMotionOf, parallel, transition } from "../animation/motionTween.js";
import { panelSpring } from "../animation/springMotion.js";
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

function cancelFrameGhostMotion(layer) {
  const control = layer.frameGhostMotionControl;
  layer.frameGhostMotionControl = null;
  control?.cancel?.();
}

function releaseFrameGhostMotion(layer) {
  const control = layer.frameGhostMotionControl;
  layer.frameGhostMotionControl = null;
  if (typeof control?.release === "function") {
    control.release();
    return;
  }
  control?.cancel?.();
}

function frameSpring(frame, prop, to, springConfig, options = {}) {
  return transition(frame)
    .layout()
    .spring(springConfig)
    .interrupt("retarget")
    .to({
      [prop]: to,
      milestones: options.milestones,
      onArrive: options.onArrive,
      onUpdate: options.onUpdate,
      snap: options.snap === true,
    });
}

export function clearFrameGhost(layer, options = {}) {
  cancelFrameGhostMotion(layer);
  layer.frameGhostState = null;
  killMotionOf(layer.frameGhost);
  killMotionOf(layer.panelMaterial);
  layer.frameGhost.clear();
  layer.frameGhost.visible = false;
  layer.frameGhost.alpha = 0;
  clearClosingFrameMask(layer);
  layer.panelMaterial.visible = true;
  layer.panelMaterial.alpha = options.panelMaterialAlpha ?? 1;
}

export function startFrameGhost(layer, fromRect, toRect, options = {}) {
  if (!fromRect || !toRect) return;
  releaseFrameGhostMotion(layer);
  killMotionOf(layer.frameGhost);
  killMotionOf(layer.panelMaterial);
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
  const frame = layer.frameGhostState || {
    fillAlpha: options.fromFillAlpha ?? 0.22,
    fillColor: fromFillColor,
    height: fromRect.height,
    left: fromRect.left,
    radius: options.fromRadius ?? getFrameRadius(fromRect),
    strokeAlpha: options.fromStrokeAlpha ?? 0.26,
    strokeColor: fromStrokeColor,
    strokeWidth: options.fromStrokeWidth ?? 1,
    top: fromRect.top,
    width: fromRect.width,
  };
  const currentFillColor = frame.fillColor ?? fromFillColor;
  const currentStrokeColor = frame.strokeColor ?? fromStrokeColor;
  frame.fillAlpha = frame.fillAlpha ?? options.fromFillAlpha ?? 0.22;
  frame.fillColor = currentFillColor;
  frame.progress = 0;
  frame.radius = frame.radius ?? options.fromRadius ?? getFrameRadius(fromRect);
  frame.strokeAlpha = frame.strokeAlpha ?? options.fromStrokeAlpha ?? 0.26;
  frame.strokeColor = currentStrokeColor;
  frame.strokeWidth = frame.strokeWidth ?? options.fromStrokeWidth ?? 1;
  layer.frameGhostState = frame;
  drawFrameGhost(layer, frame, options);
  const panelFadeControl = transition(layer.panelMaterial)
    .duration(fadeDuration)
    .ease(ease)
    .delay(duration * fadeStart)
    .overlay()
    .interrupt("retarget")
    .to({ alpha: options.panelMaterialToAlpha ?? 1 })
    .start();
  const frameFadeControl = transition(layer.frameGhost)
    .duration(fadeDuration)
    .ease(ease)
    .delay(duration * fadeStart)
    .overlay()
    .interrupt("retarget")
    .to({ alpha: options.frameGhostToAlpha ?? 0 })
    .start();
  const updateFrame = () => {
    frame.fillColor = lerpColor(currentFillColor, toFillColor, frame.progress);
    frame.strokeColor = lerpColor(currentStrokeColor, toStrokeColor, frame.progress);
    drawFrameGhost(layer, frame, options);
    options.onUpdate?.(frame);
  };
  let geometryArrived = false;
  let geometryArriveRemaining = 4;
  const arriveGeometryTrack = () => {
    geometryArriveRemaining -= 1;
    if (geometryArriveRemaining > 0 || geometryArrived) return;
    geometryArrived = true;
    options.onArrive?.(frame);
  };
  let frameMotionControl = null;
  const springConfig = options.springConfig || panelSpring;
  const frameMotionControlBase = parallel([
    frameSpring(frame, "fillAlpha", options.toFillAlpha ?? 0.26, springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "height", toRect.height, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "left", toRect.left, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "progress", 1, springConfig, { milestones: options.progressMilestones, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "radius", options.toRadius ?? getFrameRadius(toRect, 48), springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "strokeAlpha", options.toStrokeAlpha ?? 0.24, springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "strokeWidth", options.toStrokeWidth ?? frame.strokeWidth, springConfig, { onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "top", toRect.top, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
    frameSpring(frame, "width", toRect.width, springConfig, { onArrive: arriveGeometryTrack, onUpdate: updateFrame, snap: options.snap }),
  ], {
    onComplete: () => {
      if (layer.frameGhostMotionControl === frameMotionControl) layer.frameGhostMotionControl = null;
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
  if (!frameMotionControlBase.completed) {
    frameMotionControl = {
      cancel() {
        panelFadeControl.cancel();
        frameFadeControl.cancel();
        frameMotionControlBase.cancel();
      },
      get completed() {
        return frameMotionControlBase.completed;
      },
      release() {
        panelFadeControl.cancel();
        frameFadeControl.cancel();
        frameMotionControlBase.cancel();
      },
    };
    layer.frameGhostMotionControl = frameMotionControl;
  }
}

reloadOnPixiHotUpdate(import.meta.hot);
