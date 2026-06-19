import { reloadOnPixiHotUpdate } from "../devHmr.js";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function makeRootStageRect(rect, fallback = {}) {
  const width = Math.max(1, safeNumber(rect?.width, fallback.width || 1));
  const height = Math.max(1, safeNumber(rect?.height, fallback.height || 1));
  const left = safeNumber(rect?.left, fallback.left || 0);
  const top = safeNumber(rect?.top, fallback.top || 0);
  return {
    height,
    left,
    top,
    width,
  };
}

export function makeDesktopFrameFromStageRects(rootStageRect, desktopStageRect) {
  const root = makeRootStageRect(rootStageRect);
  const desktop = makeRootStageRect(desktopStageRect, root);
  return {
    height: desktop.height,
    left: desktop.left - root.left,
    top: desktop.top - root.top,
    width: desktop.width,
  };
}

export function makeRootStageHostStyle(rect) {
  const root = makeRootStageRect(rect);
  return {
    "--pixi-root-stage-height": `${root.height}px`,
    "--pixi-root-stage-left": `${root.left}px`,
    "--pixi-root-stage-top": `${root.top}px`,
    "--pixi-root-stage-width": `${root.width}px`,
  };
}

export function resolveSingleStageCandidateRect(metrics, candidates = {}) {
  return makeRootStageRect(
    candidates.rootRect ||
      candidates.shellRect ||
      metrics?.layoutRect ||
      metrics?.rect,
    metrics?.rect || metrics?.layoutRect
  );
}

export function makeRootStageDesktopContentRect(metrics, stageRect, mainRect, padding = {}) {
  if (!mainRect) return metrics?.layoutRect || makeRootStageRect(stageRect);
  const paddingTop = safeNumber(padding.top);
  const paddingBottom = safeNumber(padding.bottom);
  return {
    height: Math.max(1, safeNumber(mainRect.height, 1) - paddingTop - paddingBottom),
    left: safeNumber(stageRect?.left),
    top: safeNumber(mainRect.top) + paddingTop,
    width: Math.max(1, safeNumber(stageRect?.width, mainRect.width || 1)),
  };
}

export function makeDesktopRenderGeometry(metrics, options = {}) {
  const stageRect = resolveSingleStageCandidateRect(metrics, options);
  const desktopStageRect = makeRootStageDesktopContentRect(
    metrics,
    stageRect,
    options.mainRect,
    {
      bottom: options.mainPaddingBottom,
      top: options.mainPaddingTop,
    }
  );
  return {
    desktopFrame: makeDesktopFrameFromStageRects(stageRect, desktopStageRect),
    desktopStageRect,
    height: Math.max(1, stageRect.height),
    stageRect,
    width: Math.max(1, stageRect.width),
  };
}

export function mapDesktopLocalRectToRootStageLocal(rect, desktopFrame) {
  if (!rect) return null;
  const frame = desktopFrame || {};
  return {
    height: rect.height,
    left: safeNumber(frame.left) + safeNumber(rect.left),
    top: safeNumber(frame.top) + safeNumber(rect.top),
    width: rect.width,
  };
}

export function mapRootStageLocalRectToDesktopLocal(rect, desktopFrame) {
  if (!rect) return null;
  const frame = desktopFrame || {};
  return {
    height: rect.height,
    left: safeNumber(rect.left) - safeNumber(frame.left),
    top: safeNumber(rect.top) - safeNumber(frame.top),
    width: rect.width,
  };
}

export function mapClientRectToRootStageLocal(rect, rootStageRect) {
  if (!rect) return null;
  const root = makeRootStageRect(rootStageRect);
  return {
    height: rect.height,
    left: safeNumber(rect.left) - root.left,
    top: safeNumber(rect.top) - root.top,
    width: rect.width,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
