import { reloadOnPixiHotUpdate } from "../devHmr.js";

export interface StagePoint {
  x: number;
  y: number;
}

export interface StageRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface StageVisualRect extends StageRect {
  bottom: number;
  right: number;
}

export interface StageOrigin {
  height?: number;
  left: number;
  top: number;
  width?: number;
}

export interface StageProjectionMeta {
  stageHeight?: number;
  stageRect?: StageRect;
  stageWidth?: number;
}

export interface StageLayoutRecord extends StageRect {
  meta?: StageProjectionMeta;
}

export interface StageVirtualElement<TMeta extends object = Record<string, never>> {
  __launchpadVirtualElementMeta: TMeta;
  clientHeight: number;
  clientWidth: number;
  offsetHeight: number;
  offsetWidth: number;
  getBoundingClientRect: () => StageVisualRect;
}

export const MAX_RENDER_RESOLUTION = 2;
export const MIN_TEXT_RENDER_RESOLUTION = 2;
export const STAGE_COORDINATE_SPACES = Object.freeze({
  CLIENT_VISUAL: "client-visual",
  STAGE_LAYOUT: "stage-layout",
  STAGE_VISUAL: "stage-visual",
});

function safeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getEffectiveDevicePixelRatio(devicePixelRatio = globalThis.devicePixelRatio || 1): number {
  return Math.min(MAX_RENDER_RESOLUTION, Math.max(1, safeNumber(devicePixelRatio, 1)));
}

/**
 * Pixi Text is rasterized into a texture before it is drawn. Keep labels at
 * least two device pixels per logical pixel, while allowing displays above
 * 2x to use their native DPR. This is intentionally separate from the
 * renderer cap: increasing text quality must not force the whole canvas to
 * render at a higher resolution.
 */
export function getTextRenderResolution(devicePixelRatio = globalThis.devicePixelRatio || 1): number {
  return Math.max(MIN_TEXT_RENDER_RESOLUTION, Math.max(1, safeNumber(devicePixelRatio, 1)));
}

export function getStageScale(stageRect: StageOrigin | null | undefined, stageWidth: number, stageHeight: number) {
  const layoutWidth = Math.max(1, safeNumber(stageWidth, 1));
  const layoutHeight = Math.max(1, safeNumber(stageHeight, 1));
  const rectWidth = safeNumber(stageRect?.width, layoutWidth);
  const rectHeight = safeNumber(stageRect?.height, layoutHeight);
  return {
    scaleX: rectWidth > 0 ? rectWidth / layoutWidth : 1,
    scaleY: rectHeight > 0 ? rectHeight / layoutHeight : 1,
  };
}

export function stageLayoutRectToClientRect(
  stageRect: StageRect | null | undefined,
  stageWidth: number,
  stageHeight: number,
  rect: StageRect | null | undefined
): StageVisualRect {
  const source: Partial<StageRect> = rect || {};
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

export function stageLayoutRectToStageVisualRect(
  stageRect: StageRect | null | undefined,
  stageWidth: number,
  stageHeight: number,
  rect: StageRect | null | undefined
): StageRect {
  const clientRect = stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, rect);
  return clientRectToStageVisualRect(clientRect, stageRect);
}

export function stageLayoutRecordToClientRect(record: StageLayoutRecord | null | undefined): StageVisualRect | null {
  if (!record) return null;
  const stageRect = record.meta?.stageRect;
  const stageWidth = record.meta?.stageWidth;
  const stageHeight = record.meta?.stageHeight;
  if (!stageRect || !stageWidth || !stageHeight) return null;
  return stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, record);
}

export function clientRectToStageVisualRect(rect: StageRect, stageRect: StageOrigin | null | undefined): StageRect;
export function clientRectToStageVisualRect(
  rect: StageRect | null | undefined,
  stageRect: StageOrigin | null | undefined
): StageRect | null;
export function clientRectToStageVisualRect(
  rect: StageRect | null | undefined,
  stageRect: StageOrigin | null | undefined
): StageRect | null {
  if (!rect) return null;
  return {
    height: rect.height,
    left: safeNumber(rect.left) - safeNumber(stageRect?.left),
    top: safeNumber(rect.top) - safeNumber(stageRect?.top),
    width: rect.width,
  };
}

export function clientPointToStageVisualPoint(point: StagePoint, stageRect: StageOrigin | null | undefined): StagePoint;
export function clientPointToStageVisualPoint(
  point: StagePoint | null | undefined,
  stageRect: StageOrigin | null | undefined
): StagePoint | null;
export function clientPointToStageVisualPoint(
  point: StagePoint | null | undefined,
  stageRect: StageOrigin | null | undefined
): StagePoint | null {
  if (!point) return null;
  return {
    x: safeNumber(point.x) - safeNumber(stageRect?.left),
    y: safeNumber(point.y) - safeNumber(stageRect?.top),
  };
}

export function snapValueToDevicePixels(value: number, devicePixelRatio = globalThis.devicePixelRatio || 1): number {
  const scale = getEffectiveDevicePixelRatio(devicePixelRatio);
  return Math.round(safeNumber(value) * scale) / scale;
}

export function snapRectToDevicePixels<T extends StageRect>(
  rect: T,
  devicePixelRatio?: number
): T & Pick<StageVisualRect, "bottom" | "right">;
export function snapRectToDevicePixels<T extends StageRect>(
  rect: T | null | undefined,
  devicePixelRatio?: number
): (T & Pick<StageVisualRect, "bottom" | "right">) | null;
export function snapRectToDevicePixels<T extends StageRect>(
  rect: T | null | undefined,
  devicePixelRatio = globalThis.devicePixelRatio || 1
): (T & Pick<StageVisualRect, "bottom" | "right">) | null {
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

export function makeStageVirtualElement<TMeta extends object = Record<string, never>>(
  stageRect: StageRect | null | undefined,
  stageWidth: number,
  stageHeight: number,
  localRect: StageRect | null | undefined,
  meta = {} as TMeta
): StageVirtualElement<TMeta> {
  const visualRect = stageLayoutRectToClientRect(stageRect, stageWidth, stageHeight, localRect);
  const layoutWidth = Math.max(0, safeNumber(localRect?.width, visualRect.width));
  const layoutHeight = Math.max(0, safeNumber(localRect?.height, visualRect.height));
  return {
    __launchpadVirtualElementMeta: { ...meta },
    clientHeight: layoutHeight,
    clientWidth: layoutWidth,
    offsetHeight: layoutHeight,
    offsetWidth: layoutWidth,
    getBoundingClientRect: () => visualRect,
  };
}

reloadOnPixiHotUpdate(import.meta.hot);
