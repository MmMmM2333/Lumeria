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
