import {
  ACRYLIC_COMPOSITE_PRESETS,
  normalizeAcrylicCompositeParams,
} from "../rendering/pixi/background/acrylicParams.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
} from "../domain/backgroundSettings.js";
import { normalizeAppearancePreference } from "../domain/appearancePreference.js";

export {
  FOLDER_ICON_SIZE_MODE_CUSTOM,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  clampLaunchpadIconSize,
  normalizeFolderIconSizeMode,
} from "../domain/layoutConfiguration.js";
export {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_BASE_OPACITY_MAX,
  BACKGROUND_BASE_OPACITY_MIN,
  BACKGROUND_BASE_OPACITY_STEP,
  BACKGROUND_BLUR_STRENGTH_MAX,
  BACKGROUND_BLUR_STRENGTH_MIN,
  BACKGROUND_BLUR_STRENGTH_STEP,
  BACKGROUND_DARKEN_STRENGTH_MAX,
  BACKGROUND_DARKEN_STRENGTH_MIN,
  BACKGROUND_DARKEN_STRENGTH_STEP,
  BACKGROUND_EFFECT_ACRYLIC_WEBGL,
  BACKGROUND_EFFECT_BLUR,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_EFFECT_NONE,
  BACKGROUND_IMAGE_OPACITY_MAX,
  BACKGROUND_IMAGE_OPACITY_MIN,
  BACKGROUND_IMAGE_OPACITY_STEP,
  BACKGROUND_LIVE_DESKTOP_OPACITY_MAX,
  BACKGROUND_LIVE_DESKTOP_OPACITY_MIN,
  BACKGROUND_LIVE_DESKTOP_OPACITY_STEP,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  BACKGROUND_SOURCE_WINDOWS_LIVE_DESKTOP,
  BACKGROUND_SOURCE_WINDOWS_WALLPAPER,
  DEFAULT_BACKGROUND_ACRYLIC_APPEARANCE,
  DEFAULT_BACKGROUND_ACRYLIC_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_BASE_COLOR,
  DEFAULT_BACKGROUND_BASE_OPACITY,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_DARKEN_COLOR,
  DEFAULT_BACKGROUND_DARKEN_STRENGTH,
  DEFAULT_BACKGROUND_IMAGE_OPACITY,
  DEFAULT_BACKGROUND_LIVE_DESKTOP_OPACITY,
  backgroundEffectUsesPixi,
  backgroundSourceUsesImage,
  backgroundSourceUsesLiveDesktop,
  clampBackgroundAcrylicBlurStrength,
  clampBackgroundBaseOpacity,
  clampBackgroundBlurStrength,
  clampBackgroundDarkenStrength,
  clampBackgroundImageOpacity,
  clampBackgroundLiveDesktopOpacity,
  normalizeBackgroundAcrylicAppearance,
  normalizeBackgroundBaseColor,
  normalizeBackgroundDarkenColor,
  normalizeBackgroundEffect,
  normalizeBackgroundSource,
} from "../domain/backgroundSettings.js";
export {
  BACKGROUND_IMAGE_LAYOUT_CENTER,
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_IMAGE_LAYOUT_FIT,
  BACKGROUND_IMAGE_LAYOUT_STRETCH,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  DEFAULT_BACKGROUND_IMAGE_LAYOUT,
  normalizeBackgroundImageLayout,
  resolveCssBackgroundImageLayout,
} from "../domain/backgroundImageLayout.js";

export const WINDOW_EFFECT_MATERIAL_NONE = "none";
export const WINDOW_EFFECT_MATERIAL_ACRYLIC = "acrylic";
export const WINDOW_EFFECT_MATERIAL_MICA = "mica";
export const WINDOW_EFFECT_MATERIAL_MICA_ALT = "micaAlt";
export const WINDOW_EFFECT_APPEARANCE_DARK = "dark";
export const WINDOW_EFFECT_APPEARANCE_LIGHT = "light";
export const WINDOW_EFFECT_APPEARANCE_SYSTEM = "system";
export const WINDOW_MODE_FULLSCREEN = "fullscreen";
export const WINDOW_MODE_WINDOWED = "windowed";
export const DEFAULT_WINDOW_MODE = WINDOW_MODE_FULLSCREEN;
export const DEFAULT_FULLSCREEN_OVERSCAN_ENABLED = true;
export const DEFAULT_SHOW_CUSTOM_TITLEBAR = true;
export const DEFAULT_WINDOW_EFFECTS_SUPPORT = Object.freeze({
  platform: "unknown",
  build: null,
  supportsAcrylic: false,
  supportsMica: false,
  supportsMicaAlt: false,
});
export const DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT = Object.freeze({
  platform: "unknown",
  supportsLiveDesktopBackground: false,
  supportsLiveDesktopBackgroundEffects: false,
  reason: "nativeBridgeUnavailable",
  detail: "",
});

export function normalizeLiveDesktopBackgroundSupport(support) {
  return {
    platform: String(support?.platform || DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT.platform),
    supportsLiveDesktopBackground: Boolean(support?.supportsLiveDesktopBackground),
    supportsLiveDesktopBackgroundEffects: Boolean(support?.supportsLiveDesktopBackgroundEffects),
    reason: typeof support?.reason === "string"
      ? support.reason
      : DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT.reason,
    detail: typeof support?.detail === "string" ? support.detail : "",
  };
}

export function normalizeBackgroundAcrylicProfileKey(value) {
  return value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    ? BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
    : BACKGROUND_ACRYLIC_APPEARANCE_DARK;
}

export function normalizeBackgroundAcrylicParams(params, profile = BACKGROUND_ACRYLIC_APPEARANCE_DARK) {
  const key = normalizeBackgroundAcrylicProfileKey(profile);
  const fallback = ACRYLIC_COMPOSITE_PRESETS[key] || ACRYLIC_COMPOSITE_PRESETS.dark;
  const normalized = normalizeAcrylicCompositeParams(params, fallback);
  return {
    ...normalized,
    tintColor: [...normalized.tintColor],
  };
}

export function createDefaultBackgroundAcrylicParams(profile = BACKGROUND_ACRYLIC_APPEARANCE_DARK) {
  const key = normalizeBackgroundAcrylicProfileKey(profile);
  return normalizeBackgroundAcrylicParams(ACRYLIC_COMPOSITE_PRESETS[key], key);
}

export function normalizeBackgroundImagePath(value) {
  const path = typeof value === "string" ? value.trim() : "";
  return path || null;
}

export function normalizeWindowEffectMaterial(value) {
  if (value === WINDOW_EFFECT_MATERIAL_NONE) return WINDOW_EFFECT_MATERIAL_NONE;
  if (value === WINDOW_EFFECT_MATERIAL_MICA) return WINDOW_EFFECT_MATERIAL_MICA;
  if (value === WINDOW_EFFECT_MATERIAL_MICA_ALT || value === "mica-alt") return WINDOW_EFFECT_MATERIAL_MICA_ALT;
  return WINDOW_EFFECT_MATERIAL_ACRYLIC;
}

export function normalizeWindowEffectAppearance(value) {
  return normalizeAppearancePreference(value, WINDOW_EFFECT_APPEARANCE_DARK);
}

export function normalizeWindowMode(value) {
  return value === WINDOW_MODE_WINDOWED ? WINDOW_MODE_WINDOWED : WINDOW_MODE_FULLSCREEN;
}

export function normalizeFullscreenOverscanEnabled(value) {
  return typeof value === "boolean" ? value : DEFAULT_FULLSCREEN_OVERSCAN_ENABLED;
}

export function normalizeShowCustomTitlebar(value) {
  return typeof value === "boolean" ? value : DEFAULT_SHOW_CUSTOM_TITLEBAR;
}

export function normalizeWindowEffectsSupport(support) {
  const build = Number(support?.build);
  return {
    platform: String(support?.platform || DEFAULT_WINDOW_EFFECTS_SUPPORT.platform),
    build: Number.isFinite(build) && build > 0 ? Math.floor(build) : null,
    supportsAcrylic: Boolean(support?.supportsAcrylic),
    supportsMica: Boolean(support?.supportsMica),
    supportsMicaAlt: Boolean(support?.supportsMicaAlt),
  };
}

export function isWindowEffectMaterialAvailable(material, support) {
  const normalizedMaterial = normalizeWindowEffectMaterial(material);
  if (normalizedMaterial === WINDOW_EFFECT_MATERIAL_NONE) return true;
  const normalizedSupport = normalizeWindowEffectsSupport(support);
  if (normalizedMaterial === WINDOW_EFFECT_MATERIAL_MICA) return normalizedSupport.supportsMica;
  if (normalizedMaterial === WINDOW_EFFECT_MATERIAL_MICA_ALT) return normalizedSupport.supportsMicaAlt;
  return normalizedSupport.supportsAcrylic;
}

export function resolveWindowEffectMaterialForSupport(material, support) {
  const normalizedMaterial = normalizeWindowEffectMaterial(material);
  if (normalizedMaterial === WINDOW_EFFECT_MATERIAL_NONE) return WINDOW_EFFECT_MATERIAL_NONE;
  const normalizedSupport = normalizeWindowEffectsSupport(support);
  if (isWindowEffectMaterialAvailable(normalizedMaterial, normalizedSupport)) return normalizedMaterial;
  if (normalizedMaterial === WINDOW_EFFECT_MATERIAL_MICA_ALT && normalizedSupport.supportsMica) return WINDOW_EFFECT_MATERIAL_MICA;
  if (normalizedSupport.supportsAcrylic) return WINDOW_EFFECT_MATERIAL_ACRYLIC;
  if (normalizedSupport.supportsMica) return WINDOW_EFFECT_MATERIAL_MICA;
  if (normalizedSupport.supportsMicaAlt) return WINDOW_EFFECT_MATERIAL_MICA_ALT;
  return WINDOW_EFFECT_MATERIAL_ACRYLIC;
}
