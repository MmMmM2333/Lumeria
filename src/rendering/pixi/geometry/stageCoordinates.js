import { reloadOnPixiHotUpdate } from "../devHmr.js";

export const MAX_RENDER_RESOLUTION = 2;
export const STAGE_COORDINATE_SPACES = Object.freeze({
  CLIENT_LAYOUT: "client-layout",
  CLIENT_VISUAL: "client-visual",
  STAGE_LAYOUT: "stage-layout",
  STAGE_VISUAL: "stage-visual",
});

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getEffectiveDevicePixelRatio(devicePixelRatio = globalThis.devicePixelRatio || 1) {
  return Math.min(MAX_RENDER_RESOLUTION, Math.max(1, safeNumber(devicePixelRatio, 1)));
}

export function getStageScale(stageRect, stageWidth, stageHeight) {
  const layoutWidth = Math.max(1, safeNumber(stageWidth, 1));
  const layoutHeight = Math.max(1, safeNumber(stageHeight, 1));
  const rectWidth = safeNumber(stageRect?.width, layoutWidth);
  const rectHeight = safeNumber(stageRect?.height, layoutHeight);
  return {
    scaleX: rectWidth > 0 ? rectWidth / layoutWidth : 1,
    scaleY: rectHeight > 0 ? rectHeight / layoutHeight : 1,
  };
}

export function stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, rect) {
  const source = rect || {};
  const { scaleX, scaleY } = getStageScale(stageRect, stageWidth, stageHeight);
  const left = safeNumber(stageRect?.left) + safeNumber(source.left) * scaleX;
  const top = safeNumber(stageRect?.top) + safeNumber(source.top) * scaleY;
  const width = Math.max(0, safeNumber(source.width) * scaleX);
  const height = Math.max(0, safeNumber(source.height) * scaleY);
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

export function clientRectToStageVisualRect(rect, stageRect) {
  if (!rect) return null;
  return {
    height: rect.height,
    left: safeNumber(rect.left) - safeNumber(stageRect?.left),
    top: safeNumber(rect.top) - safeNumber(stageRect?.top),
    width: rect.width,
  };
}

export function clientPointToStageVisualPoint(point, stageRect) {
  if (!point) return null;
  return {
    x: safeNumber(point.x) - safeNumber(stageRect?.left),
    y: safeNumber(point.y) - safeNumber(stageRect?.top),
  };
}

export function getStageVisualOffset(stageRect, stableStageRect = stageRect) {
  // Non-zero only when a non-unified stage has separate visual and stable client origins.
  const stable = stableStageRect || stageRect;
  return {
    x: safeNumber(stageRect?.left) - safeNumber(stable?.left),
    y: safeNumber(stageRect?.top) - safeNumber(stable?.top),
  };
}

export function snapValueToDevicePixels(value, devicePixelRatio = globalThis.devicePixelRatio || 1) {
  const scale = getEffectiveDevicePixelRatio(devicePixelRatio);
  return Math.round(safeNumber(value) * scale) / scale;
}

export function snapRectToDevicePixels(rect, devicePixelRatio = globalThis.devicePixelRatio || 1) {
  if (!rect) return null;
  const left = snapValueToDevicePixels(rect.left, devicePixelRatio);
  const top = snapValueToDevicePixels(rect.top, devicePixelRatio);
  return {
    ...rect,
    left,
    top,
    right: left + rect.width,
    bottom: top + rect.height,
  };
}

export function makeStageVirtualElement(stageRect, stageWidth, stageHeight, localRect) {
  const visualRect = stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, localRect);
  const layoutWidth = Math.max(0, safeNumber(localRect?.width, visualRect.width));
  const layoutHeight = Math.max(0, safeNumber(localRect?.height, visualRect.height));
  return {
    clientHeight: layoutHeight,
    clientWidth: layoutWidth,
    offsetHeight: layoutHeight,
    offsetWidth: layoutWidth,
    getBoundingClientRect: () => visualRect,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
