export const DEFAULT_ACRYLIC_COMPOSITE_PARAMS = {
  brightness: 0.8,
  contrast: 0.85,
  noise: 0.005,
  saturation: 1.5,
  seed: 0,
  tintColor: [0.23529411764705882, 0.23529411764705882, 0.23529411764705882],
  tintStrength: 0.2,
};

export const ACRYLIC_COMPOSITE_PRESETS = {
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

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeTintColor(value, fallback) {
  if (typeof value === "string") return hexToRgbArray(value, fallback);
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    clampNumber(value[0], 0, 1, fallback[0]),
    clampNumber(value[1], 0, 1, fallback[1]),
    clampNumber(value[2], 0, 1, fallback[2]),
  ];
}

export function copyAcrylicCompositeParams(params = DEFAULT_ACRYLIC_COMPOSITE_PARAMS) {
  const normalized = normalizeAcrylicCompositeParams(params);
  return {
    ...normalized,
    tintColor: [...normalized.tintColor],
  };
}

export function normalizeAcrylicCompositeParams(params = {}, fallback = DEFAULT_ACRYLIC_COMPOSITE_PARAMS) {
  const source = params && typeof params === "object" ? params : {};
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

export function rgbArrayToHex(color) {
  const normalized = normalizeAcrylicCompositeParams({ tintColor: color }).tintColor;
  return `#${normalized.map((value) => Math.round(value * 255).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgbArray(hex, fallback = DEFAULT_ACRYLIC_COMPOSITE_PARAMS.tintColor) {
  const value = String(hex || "").trim();
  const match = value.match(/^#?([0-9a-f]{6})$/i);
  if (!match) return [...fallback];
  const number = Number.parseInt(match[1], 16);
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
  ];
}
