import type { AcrylicParameters } from "./layoutDocument.js";

// UI ranges are shared by Web and Native; document normalization remains wider.
export const ACRYLIC_PARAM_STEP = 0.01;
export const ACRYLIC_TINT_STRENGTH_MIN = 0;
export const ACRYLIC_TINT_STRENGTH_MAX = 0.6;
export const ACRYLIC_BRIGHTNESS_MIN = 0.5;
export const ACRYLIC_BRIGHTNESS_MAX = 1.2;
export const ACRYLIC_CONTRAST_MIN = 0.75;
export const ACRYLIC_CONTRAST_MAX = 1.25;
export const ACRYLIC_SATURATION_MIN = 0.8;
export const ACRYLIC_SATURATION_MAX = 1.8;

export const DEFAULT_ACRYLIC_COMPOSITE_PARAMS: AcrylicParameters = {
  brightness: 0.8,
  contrast: 0.85,
  noise: 0.005,
  saturation: 1.5,
  seed: 0,
  tintColor: [0.23529411764705882, 0.23529411764705882, 0.23529411764705882],
  tintStrength: 0.2,
};

export const ACRYLIC_COMPOSITE_PRESETS: Readonly<Record<"dark" | "light", AcrylicParameters>> = {
  dark: DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
  light: {
    brightness: 1,
    contrast: 0.85,
    noise: 0.005,
    saturation: 1.5,
    seed: 0,
    tintColor: [0.4588235294117647, 0.4588235294117647, 0.4588235294117647],
    tintStrength: 0.2,
  },
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeTintColor(
  value: unknown,
  fallback: readonly [number, number, number],
): [number, number, number] {
  if (typeof value === "string") return hexToRgbArray(value, fallback);
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    clampNumber(value[0], 0, 1, fallback[0]),
    clampNumber(value[1], 0, 1, fallback[1]),
    clampNumber(value[2], 0, 1, fallback[2]),
  ];
}

export function copyAcrylicCompositeParams(
  params: unknown = DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
): AcrylicParameters {
  const normalized = normalizeAcrylicCompositeParams(params);
  return {
    ...normalized,
    tintColor: [...normalized.tintColor],
  };
}

export function normalizeAcrylicCompositeParams(
  params: unknown = {},
  fallback: AcrylicParameters = DEFAULT_ACRYLIC_COMPOSITE_PARAMS,
): AcrylicParameters {
  const source = params && typeof params === "object"
    ? params as Record<string, unknown>
    : {};
  return {
    brightness: clampNumber(source.brightness, 0.4, 1.4, fallback.brightness),
    contrast: clampNumber(source.contrast, 0.6, 1.4, fallback.contrast),
    noise: clampNumber(source.noise, 0, 0.08, fallback.noise),
    saturation: clampNumber(source.saturation, 0.4, 1.8, fallback.saturation),
    seed: clampNumber(source.seed, 0, 1000, fallback.seed),
    tintColor: normalizeTintColor(source.tintColor, fallback.tintColor),
    tintStrength: clampNumber(source.tintStrength, 0, 0.8, fallback.tintStrength),
  };
}

export function rgbArrayToHex(color: unknown): string {
  const normalized = normalizeAcrylicCompositeParams({ tintColor: color }).tintColor;
  return `#${normalized.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgbArray(
  hex: unknown,
  fallback: readonly [number, number, number] = DEFAULT_ACRYLIC_COMPOSITE_PARAMS.tintColor,
): [number, number, number] {
  const value = String(hex || "").trim();
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return [...fallback];
  const number = Number.parseInt(match[1] ?? "", 16);
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
  ];
}
