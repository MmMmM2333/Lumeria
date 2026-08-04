import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  DEFAULT_FULLSCREEN_OVERSCAN_ENABLED,
  DEFAULT_SHOW_CUSTOM_TITLEBAR,
  DEFAULT_WINDOW_MODE,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_APPEARANCE_SYSTEM,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  WINDOW_EFFECT_MATERIAL_NONE,
  WINDOW_MODE_WINDOWED,
  createDefaultBackgroundAcrylicParams,
  isWindowEffectMaterialAvailable,
  normalizeBackgroundAcrylicParams,
  normalizeBackgroundAcrylicProfileKey,
  normalizeBackgroundImagePath,
  normalizeFullscreenOverscanEnabled,
  normalizeLiveDesktopBackgroundSupport,
  normalizeShowCustomTitlebar,
  normalizeWindowEffectAppearance,
  normalizeWindowEffectMaterial,
  normalizeWindowEffectsSupport,
  normalizeWindowMode,
  resolveWindowEffectMaterialForSupport,
} from "./useLaunchpadSettingsConfig.js";

export function runLaunchpadSettingsConfigTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad settings primitives test failed] ${message}`);
  };

  assert(normalizeBackgroundImagePath("  C:/Images/a.png  ") === "C:/Images/a.png", "image paths should be trimmed");
  assert(normalizeBackgroundImagePath("  ") === null, "blank image paths should normalize to null");
  assert(normalizeBackgroundAcrylicProfileKey("unknown") === BACKGROUND_ACRYLIC_APPEARANCE_DARK, "unknown acrylic profiles should use dark");
  assert(normalizeBackgroundAcrylicProfileKey(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT) === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT, "light acrylic profiles should be preserved");

  const darkDefaults = createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_DARK);
  const normalizedAcrylic = normalizeBackgroundAcrylicParams({ ...darkDefaults, tintColor: [0.1, 0.2, 0.3] });
  assert(normalizedAcrylic.tintColor.join(",") === "0.1,0.2,0.3", "acrylic params should preserve valid tint colors");
  assert(normalizedAcrylic.tintColor !== darkDefaults.tintColor, "normalized acrylic params should own their tint array");

  assert(normalizeWindowEffectMaterial("mica-alt") === WINDOW_EFFECT_MATERIAL_MICA_ALT, "legacy mica-alt should normalize");
  assert(normalizeWindowEffectMaterial("unknown") === WINDOW_EFFECT_MATERIAL_ACRYLIC, "unknown materials should use acrylic");
  assert(normalizeWindowEffectAppearance("unknown") === WINDOW_EFFECT_APPEARANCE_DARK, "unknown appearances should use dark");
  assert(normalizeWindowEffectAppearance(WINDOW_EFFECT_APPEARANCE_SYSTEM) === WINDOW_EFFECT_APPEARANCE_SYSTEM, "system appearance should be preserved");
  assert(normalizeWindowEffectAppearance(WINDOW_EFFECT_APPEARANCE_LIGHT) === WINDOW_EFFECT_APPEARANCE_LIGHT, "light appearance should be preserved");
  assert(normalizeWindowMode(WINDOW_MODE_WINDOWED) === WINDOW_MODE_WINDOWED, "windowed mode should be preserved");
  assert(normalizeWindowMode("unknown") === DEFAULT_WINDOW_MODE, "unknown window modes should use the default");
  assert(normalizeFullscreenOverscanEnabled(undefined) === DEFAULT_FULLSCREEN_OVERSCAN_ENABLED, "overscan should use its default for missing values");
  assert(normalizeShowCustomTitlebar(undefined) === DEFAULT_SHOW_CUSTOM_TITLEBAR, "titlebar visibility should use its default for missing values");

  const micaOnly = normalizeWindowEffectsSupport({ platform: "windows", build: 22000, supportsMica: true });
  assert(micaOnly.build === 22000 && micaOnly.supportsMica, "window effect support should normalize native capabilities");
  assert(isWindowEffectMaterialAvailable(WINDOW_EFFECT_MATERIAL_NONE, {}) === true, "no material should always be available");
  assert(isWindowEffectMaterialAvailable(WINDOW_EFFECT_MATERIAL_MICA, micaOnly) === true, "reported mica support should be available");
  assert(resolveWindowEffectMaterialForSupport(WINDOW_EFFECT_MATERIAL_MICA_ALT, micaOnly) === WINDOW_EFFECT_MATERIAL_MICA, "mica alt should fall back to mica when available");
  assert(resolveWindowEffectMaterialForSupport(WINDOW_EFFECT_MATERIAL_MICA_ALT, {}) === WINDOW_EFFECT_MATERIAL_ACRYLIC, "unsupported native materials should use the stable acrylic fallback");

  const liveSupport = normalizeLiveDesktopBackgroundSupport({
    platform: "windows",
    supportsLiveDesktopBackground: true,
    supportsLiveDesktopBackgroundEffects: false,
    reason: "effectsUnavailable",
  });
  assert(liveSupport.supportsLiveDesktopBackground && !liveSupport.supportsLiveDesktopBackgroundEffects, "live desktop support should preserve independent capabilities");
  assert(liveSupport.reason === "effectsUnavailable", "live desktop support should preserve its reason");
}
