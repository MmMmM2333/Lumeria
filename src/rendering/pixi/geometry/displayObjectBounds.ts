import { reloadOnPixiHotUpdate } from "../devHmr.js";
import { getStageScale, stageLayoutRectToClientRect } from "./stageCoordinates.js";
import type { StageOrigin, StagePoint, StageRect, StageVisualRect } from "./stageCoordinates.js";

interface TransformMatrixLike {
  apply(point: StagePoint): StagePoint;
}

interface DisplayObjectTransformSource {
  getGlobalPosition?: () => StagePoint;
  getGlobalTransform?: () => TransformMatrixLike | null;
}

interface DisplayObjectLocalTarget {
  toLocal(point: StagePoint): StagePoint;
}

export interface MapDisplayObjectLocalRectOptions {
  allowGlobalFallback?: boolean;
  node?: DisplayObjectTransformSource | null;
  rect?: StageRect | null;
  stageHeight?: number;
  stageRect?: StageRect | null;
  stageWidth?: number;
}

export interface MapClientRectToDisplayObjectLocalRectOptions {
  node?: DisplayObjectLocalTarget | null;
  rect?: StageRect | null;
  stageHeight?: number;
  stageRect?: StageOrigin | null;
  stageWidth?: number;
}

function safeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRect(rect: StageRect | null | undefined): StageRect {
  return {
    height: Math.max(0, safeNumber(rect?.height)),
    left: safeNumber(rect?.left),
    top: safeNumber(rect?.top),
    width: Math.max(0, safeNumber(rect?.width)),
  };
}

export function getCenteredLocalRect(size: number): StageRect {
  const safeSize = Math.max(0, safeNumber(size));
  return {
    height: safeSize,
    left: -safeSize / 2,
    top: -safeSize / 2,
    width: safeSize,
  };
}

export function getTransformedLocalRectBounds(
  matrix: TransformMatrixLike | null | undefined,
  rect: StageRect | null | undefined
): StageRect | null {
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

export function mapClientRectToDisplayObjectLocalRect(
  options: MapClientRectToDisplayObjectLocalRectOptions = {},
): StageRect | null {
  const {
    node = null,
    rect = null,
    stageHeight = 1,
    stageRect = null,
    stageWidth = 1,
  } = options;
  if (!node?.toLocal || !rect) return null;
  const source = normalizeRect(rect);
  const { scaleX, scaleY } = getStageScale(stageRect, stageWidth, stageHeight);
  const inverseScaleX = 1 / Math.max(0.000001, scaleX);
  const inverseScaleY = 1 / Math.max(0.000001, scaleY);
  const stageLeft = safeNumber(stageRect?.left);
  const stageTop = safeNumber(stageRect?.top);
  const toStagePoint = (x: number, y: number): StagePoint => ({
    x: (x - stageLeft) * inverseScaleX,
    y: (y - stageTop) * inverseScaleY,
  });
  const points = [
    node.toLocal(toStagePoint(source.left, source.top)),
    node.toLocal(toStagePoint(source.left + source.width, source.top)),
    node.toLocal(toStagePoint(source.left, source.top + source.height)),
    node.toLocal(toStagePoint(source.left + source.width, source.top + source.height)),
  ];
  if (!points.every((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))) return null;
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return {
    height: bottom - top,
    left,
    top,
    width: right - left,
  };
}

export function mapDisplayObjectLocalRectToStageRect(
  options: MapDisplayObjectLocalRectOptions = {}
): StageVisualRect | null {
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
