import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { stageLayoutRectToClientRect } from "./stageCoordinates.js";

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRect(rect) {
  return {
    height: Math.max(0, safeNumber(rect?.height)),
    left: safeNumber(rect?.left),
    top: safeNumber(rect?.top),
    width: Math.max(0, safeNumber(rect?.width)),
  };
}

export function getCenteredLocalRect(size) {
  const safeSize = Math.max(0, safeNumber(size));
  return {
    height: safeSize,
    left: -safeSize / 2,
    top: -safeSize / 2,
    width: safeSize,
  };
}

export function getTransformedLocalRectBounds(matrix, rect) {
  if (!matrix?.apply) return null;
  const source = normalizeRect(rect);
  const points = [
    matrix.apply({ x: source.left, y: source.top }),
    matrix.apply({ x: source.left + source.width, y: source.top }),
    matrix.apply({ x: source.left, y: source.top + source.height }),
    matrix.apply({ x: source.left + source.width, y: source.top + source.height }),
  ];
  const left = Math.min(...points.map((point) => safeNumber(point?.x)));
  const top = Math.min(...points.map((point) => safeNumber(point?.y)));
  const right = Math.max(...points.map((point) => safeNumber(point?.x)));
  const bottom = Math.max(...points.map((point) => safeNumber(point?.y)));
  return {
    height: bottom - top,
    left,
    top,
    width: right - left,
  };
}

export function mapDisplayObjectLocalRectToStageRect(options = {}) {
  const {
    allowGlobalFallback = false,
    node = null,
    rect = null,
    stageHeight = 1,
    stageRect = null,
    stageWidth = 1,
  } = options;
  const source = normalizeRect(rect);
  const matrix = node?.getGlobalTransform?.();
  const transformed = getTransformedLocalRectBounds(matrix, source);
  if (transformed) return stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, transformed);
  if (!allowGlobalFallback) return null;

  const global = node?.getGlobalPosition?.();
  if (!global) return null;
  return stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, {
    height: source.height,
    left: safeNumber(global.x) + source.left,
    top: safeNumber(global.y) + source.top,
    width: source.width,
  });
}

reloadOnPixiHotUpdate(import.meta.hot);
