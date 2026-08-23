import { reactive } from "vue";

export interface DesktopLayoutDebugParams {
  dragHitZonesEnabled: boolean;
  enabled: boolean;
  gridPaddingTopPx: number;
  hostHeightOffsetPx: number;
  hostMaxHeightPx: number;
  mainPaddingYPx: number;
}

export type DesktopLayoutDebugParamsInput = Partial<Record<keyof DesktopLayoutDebugParams, unknown>>;

interface NumericLimits {
  max: number;
  min: number;
}

export const DESKTOP_LAYOUT_DEBUG_STORAGE_KEY = "lumeriaDesktopLayoutDebugParams";

export const DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS = Object.freeze({
  dragHitZonesEnabled: false,
  enabled: false,
  gridPaddingTopPx: 34,
  hostHeightOffsetPx: 0,
  hostMaxHeightPx: 960,
  mainPaddingYPx: 16,
});

export const DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS = Object.freeze({
  gridPaddingTopPx: Object.freeze({ min: 0, max: 80 }),
  hostHeightOffsetPx: Object.freeze({ min: -160, max: 240 }),
  hostMaxHeightPx: Object.freeze({ min: 600, max: 2200 }),
  mainPaddingYPx: Object.freeze({ min: 0, max: 40 }),
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeNumber(value: unknown, fallback: number, limits: NumericLimits): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return clamp(numericValue, limits.min, limits.max);
}

export function normalizeDesktopLayoutDebugParams(params: DesktopLayoutDebugParamsInput = {}): DesktopLayoutDebugParams {
  return {
    dragHitZonesEnabled: params.dragHitZonesEnabled === true,
    enabled: params.enabled === true,
    gridPaddingTopPx: normalizeNumber(
      params.gridPaddingTopPx,
      DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS.gridPaddingTopPx,
      DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.gridPaddingTopPx
    ),
    hostHeightOffsetPx: normalizeNumber(
      params.hostHeightOffsetPx,
      DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS.hostHeightOffsetPx,
      DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostHeightOffsetPx
    ),
    hostMaxHeightPx: normalizeNumber(
      params.hostMaxHeightPx,
      DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS.hostMaxHeightPx,
      DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.hostMaxHeightPx
    ),
    mainPaddingYPx: normalizeNumber(
      params.mainPaddingYPx,
      DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS.mainPaddingYPx,
      DESKTOP_LAYOUT_DEBUG_PARAM_LIMITS.mainPaddingYPx
    ),
  };
}

function readDesktopLayoutDebugParams(): DesktopLayoutDebugParams {
  if (typeof window === "undefined") return { ...DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS };
  try {
    const rawValue = window.localStorage?.getItem(DESKTOP_LAYOUT_DEBUG_STORAGE_KEY);
    if (!rawValue) return { ...DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS };
    return normalizeDesktopLayoutDebugParams(JSON.parse(rawValue));
  } catch (error) {
    console.warn("Failed to read desktop layout debug params", error);
    return { ...DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS };
  }
}

function persistDesktopLayoutDebugParams(params: DesktopLayoutDebugParams): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(DESKTOP_LAYOUT_DEBUG_STORAGE_KEY, JSON.stringify(params));
  } catch (error) {
    console.warn("Failed to persist desktop layout debug params", error);
  }
}

function clearDesktopLayoutDebugParams(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.removeItem(DESKTOP_LAYOUT_DEBUG_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to reset desktop layout debug params", error);
  }
}

const desktopLayoutDebugParams = reactive(readDesktopLayoutDebugParams());

export function useDesktopLayoutDebugParams(): DesktopLayoutDebugParams {
  return desktopLayoutDebugParams;
}

export function updateDesktopLayoutDebugParams(patch: DesktopLayoutDebugParamsInput): void {
  const nextParams = normalizeDesktopLayoutDebugParams({
    ...desktopLayoutDebugParams,
    ...patch,
  });
  Object.assign(desktopLayoutDebugParams, nextParams);
  persistDesktopLayoutDebugParams(nextParams);
}

export function resetDesktopLayoutDebugParams(): void {
  Object.assign(desktopLayoutDebugParams, DEFAULT_DESKTOP_LAYOUT_DEBUG_PARAMS);
  clearDesktopLayoutDebugParams();
}

export function resolveDesktopLayoutDebugStyle(params: DesktopLayoutDebugParamsInput = desktopLayoutDebugParams): Record<`--${string}`, string> {
  const normalizedParams = normalizeDesktopLayoutDebugParams(params);
  if (!normalizedParams.enabled) return {};
  return {
    "--debug-desktop-host-height-offset": `${normalizedParams.hostHeightOffsetPx}px`,
    "--debug-desktop-host-max-height": `${normalizedParams.hostMaxHeightPx}px`,
    "--debug-desktop-main-padding-y": `${normalizedParams.mainPaddingYPx}px`,
  };
}

export function resolveDesktopGridDebugOptions(params: DesktopLayoutDebugParamsInput = desktopLayoutDebugParams): { paddingTop: number } | null {
  const normalizedParams = normalizeDesktopLayoutDebugParams(params);
  if (!normalizedParams.enabled) return null;
  return {
    paddingTop: normalizedParams.gridPaddingTopPx,
  };
}

export function resolveDesktopDragHitDebugOptions(params: DesktopLayoutDebugParamsInput = desktopLayoutDebugParams): { enabled: true } | null {
  const normalizedParams = normalizeDesktopLayoutDebugParams(params);
  if (!normalizedParams.dragHitZonesEnabled) return null;
  return {
    enabled: true,
  };
}
