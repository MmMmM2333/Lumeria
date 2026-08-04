import { clamp } from "./launchpadLayout.js";
import {
  APPEARANCE_DARK,
  APPEARANCE_LIGHT,
  APPEARANCE_SYSTEM,
  normalizeAppearancePreference,
} from "./appearancePreference.js";

export const BACKGROUND_SOURCE_SYSTEM_MATERIAL = "systemMaterial";
export const BACKGROUND_SOURCE_CUSTOM_IMAGE = "customImage";
export const BACKGROUND_SOURCE_WINDOWS_WALLPAPER = "windowsWallpaper";
export const BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP = "windowsLiveDesktop";
export const BACKGROUND_EFFECT_NONE = "none";
export const BACKGROUND_EFFECT_DIMMED = "dimmed";
export const BACKGROUND_EFFECT_BLUR = "blur";
export const BACKGROUND_EFFECT_ACRYLIC_WEBGL = "acrylicWebgl";
export const BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM = APPEARANCE_SYSTEM;
export const BACKGROUND_ACRYLIC_APPEARANCE_DARK = APPEARANCE_DARK;
export const BACKGROUND_ACRYLIC_APPEARANCE_LIGHT = APPEARANCE_LIGHT;
export const DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE = BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM;
export const BACKGROUND_IMAGE_OPACITY_MIN = 0;
export const BACKGROUND_IMAGE_OPACITY_MAX = 100;
export const BACKGROUND_IMAGE_OPACITY_STEP = 1;
export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 46;
export const BACKGROUND_LIVE_DESKTOP_OPACITY_MIN = 0;
export const BACKGROUND_LIVE_DESKTOP_OPACITY_MAX = 100;
export const BACKGROUND_LIVE_DESKTOP_OPACITY_STEP = 1;
export const DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY = 100;
export const BACKGROUND_BLUR_STRENGTH_MIN = 1;
export const BACKGROUND_BLUR_STRENGTH_MAX = 100;
export const BACKGROUND_BLUR_STRENGTH_STEP = 1;
export const DEFAULT_BACKGROUND_BLUR_STRENGTH = 50;
export const DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH = DEFAULT_BACKGROUND_BLUR_STRENGTH;
export const BACKGROUND_DARKEN_STRENGTH_MIN = 0;
export const BACKGROUND_DARKEN_STRENGTH_MAX = 100;
export const BACKGROUND_DARKEN_STRENGTH_STEP = 1;
export const DEFAULT_BACKGROUND_DARKEN_STRENGTH = 28;
export const DEFAULT_BACKGROUND_DARKEN_COLOR = "#1c1c1c";
export const BACKGROUND_BASE_OPACITY_MIN = 0;
export const BACKGROUND_BASE_OPACITY_MAX = 100;
export const BACKGROUND_BASE_OPACITY_STEP = 1;
export const DEFAULT_BACKGROUND_BASE_COLOR = "#10141f";
export const DEFAULT_BACKGROUND_BASE_OPACITY = 28;

export function normalizeBackgroundSource(value) {
  if (value === BACKGROUND_SOURCE_CUSTOM_IMAGE) return BACKGROUND_SOURCE_CUSTOM_IMAGE;
  if (value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return BACKGROUND_SOURCE_WINDOWS_WALLPAPER;
  if (value === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP) return BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP;
  return BACKGROUND_SOURCE_SYSTEM_MATERIAL;
}

export function normalizeBackgroundEffect(value) {
  if (value === BACKGROUND_EFFECT_BLUR) return BACKGROUND_EFFECT_BLUR;
  if (value === BACKGROUND_EFFECT_ACRYLIC_WEBGL) return BACKGROUND_EFFECT_ACRYLIC_WEBGL;
  return value === BACKGROUND_EFFECT_NONE ? BACKGROUND_EFFECT_NONE : BACKGROUND_EFFECT_DIMMED;
}

export function backgroundEffectUsesPixi(effect) {
  const normalizedEffect = normalizeBackgroundEffect(effect);
  return normalizedEffect === BACKGROUND_EFFECT_BLUR || normalizedEffect === BACKGROUND_EFFECT_ACRYLIC_WEBGL;
}

export function backgroundSourceUsesImage(source) {
  const normalizedSource = normalizeBackgroundSource(source);
  return normalizedSource === BACKGROUND_SOURCE_CUSTOM_IMAGE || normalizedSource === BACKGROUND_SOURCE_WINDOWS_WALLPAPER;
}

export function backgroundSourceUsesLiveDesktop(source) {
  return normalizeBackgroundSource(source) === BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP;
}

export function normalizeBackgroundAcrylicAppearance(value) {
  return normalizeAppearancePreference(value, BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM);
}

export function clampBackgroundImageOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  return clamp(Math.round(opacity), BACKGROUND_IMAGE_OPACITY_MIN, BACKGROUND_IMAGE_OPACITY_MAX);
}

export function clampBackgroundLiveDesktopOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY;
  return clamp(Math.round(opacity), BACKGROUND_LIVE_DESKTOP_OPACITY_MIN, BACKGROUND_LIVE_DESKTOP_OPACITY_MAX);
}

export function clampBackgroundBlurStrength(value) {
  const strength = Number(value);
  if (!Number.isFinite(strength)) return DEFAULT_BACKGROUND_BLUR_STRENGTH;
  return clamp(Math.round(strength), BACKGROUND_BLUR_STRENGTH_MIN, BACKGROUND_BLUR_STRENGTH_MAX);
}

export function clampBackgroundAcrylicBlurStrength(value) {
  const strength = Number(value);
  if (!Number.isFinite(strength)) return DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH;
  return clamp(Math.round(strength), BACKGROUND_BLUR_STRENGTH_MIN, BACKGROUND_BLUR_STRENGTH_MAX);
}

export function clampBackgroundDarkenStrength(value) {
  const strength = Number(value);
  if (!Number.isFinite(strength)) return DEFAULT_BACKGROUND_DARKEN_STRENGTH;
  return clamp(Math.round(strength), BACKGROUND_DARKEN_STRENGTH_MIN, BACKGROUND_DARKEN_STRENGTH_MAX);
}

export function normalizeBackgroundDarkenColor(value) {
  const color = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }
  return DEFAULT_BACKGROUND_DARKEN_COLOR;
}

export function clampBackgroundBaseOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return DEFAULT_BACKGROUND_BASE_OPACITY;
  return clamp(Math.round(opacity), BACKGROUND_BASE_OPACITY_MIN, BACKGROUND_BASE_OPACITY_MAX);
}

export function normalizeBackgroundBaseColor(value) {
  const color = typeof value === "string" ? value.trim() : "";
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(color)) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }
  return DEFAULT_BACKGROUND_BASE_COLOR;
}
