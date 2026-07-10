import {
  DEFAULT_COLS,
  DEFAULT_FOLDER_COLS,
  DEFAULT_FOLDER_ROWS,
  DEFAULT_ICON_SIZE,
  DEFAULT_ROWS,
  ICON_SIZE_MAX,
  ICON_SIZE_MIN,
  ICON_SIZE_STEP,
} from "./launchpadConstants.js";
import {
  convertFilePathToAssetUrl,
  getDesktopWallpaperBackground,
  pickBackgroundImage,
} from "../api/launchpadApi.js";
import { clamp, makePageSize } from "../domain/launchpadLayout.js";
import {
  ACRYLIC_COMPOSITE_PRESETS,
  normalizeAcrylicCompositeParams,
} from "../rendering/pixi/background/acrylicParams.js";
import {
  normalizeBackgroundImageLayout,
} from "../domain/backgroundImageLayout.js";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  normalizeMainWindowShortcut,
} from "../domain/mainWindowShortcut.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_BASE_OPACITY_MAX,
  BACKGROUND_BASE_OPACITY_MIN,
  BACKGROUND_BASE_OPACITY_STEP,
  BACKGROUND_BLUR_STRENGTH_MAX,
  BACKGROUND_BLUR_STRENGTH_MIN,
  BACKGROUND_DARKEN_STRENGTH_MAX,
  BACKGROUND_DARKEN_STRENGTH_MIN,
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

export const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
export const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";
export const WINDOW_EFFECT_MATERIAL_NONE = "none";
export const WINDOW_EFFECT_MATERIAL_ACRYLIC = "acrylic";
export const WINDOW_EFFECT_MATERIAL_MICA = "mica";
export const WINDOW_EFFECT_MATERIAL_MICA_ALT = "micaAlt";
export const WINDOW_EFFECT_APPEARANCE_DARK = "dark";
export const WINDOW_EFFECT_APPEARANCE_LIGHT = "light";
export const WINDOW_MODE_FULLSCREEN = "fullscreen";
export const WINDOW_MODE_WINDOWED = "windowed";
export const DEFAULT_WINDOW_MODE = WINDOW_MODE_FULLSCREEN;
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

export function clampLaunchpadIconSize(value) {
  return clamp(Number(value) || DEFAULT_ICON_SIZE, ICON_SIZE_MIN, ICON_SIZE_MAX);
}

export function normalizeFolderIconSizeMode(value) {
  return value === FOLDER_ICON_SIZE_MODE_CUSTOM ? FOLDER_ICON_SIZE_MODE_CUSTOM : FOLDER_ICON_SIZE_MODE_GLOBAL;
}

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
  return value === WINDOW_EFFECT_APPEARANCE_LIGHT ? WINDOW_EFFECT_APPEARANCE_LIGHT : WINDOW_EFFECT_APPEARANCE_DARK;
}

export function normalizeWindowMode(value) {
  return value === WINDOW_MODE_WINDOWED ? WINDOW_MODE_WINDOWED : WINDOW_MODE_FULLSCREEN;
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

export function syncLaunchpadSettingsDraftsFromState(options) {
  options.draftRows.value = options.gridRows.value;
  options.draftCols.value = options.gridCols.value;
  options.draftFolderRows.value = options.folderRows.value;
  options.draftFolderCols.value = options.folderCols.value;
  options.draftIconSize.value = options.iconSize.value;
  options.draftFolderIconSizeMode.value = options.folderIconSizeMode.value;
  options.draftFolderIconSize.value = options.folderIconSize.value;
  options.draftIsTextlessMode.value = options.isTextlessMode.value;
  options.draftBackgroundBaseColor.value = normalizeBackgroundBaseColor(options.backgroundBaseColor.value);
  options.draftBackgroundBaseOpacity.value = clampBackgroundBaseOpacity(options.backgroundBaseOpacity.value);
  options.draftBackgroundSource.value = options.backgroundSource.value;
  options.draftBackgroundEffect.value = options.backgroundEffect.value;
  options.draftBackgroundImageOpacity.value = options.backgroundImageOpacity.value;
  options.draftBackgroundLiveDesktopOpacity.value = clampBackgroundLiveDesktopOpacity(options.backgroundLiveDesktopOpacity.value);
  options.draftBackgroundImageLayout.value = normalizeBackgroundImageLayout(options.backgroundImageLayout.value);
  options.draftBackgroundBlurStrength.value = clampBackgroundBlurStrength(options.backgroundBlurStrength.value);
  options.draftBackgroundAcrylicBlurStrength.value = clampBackgroundAcrylicBlurStrength(options.backgroundAcrylicBlurStrength.value);
  options.draftBackgroundDarkenStrength.value = clampBackgroundDarkenStrength(options.backgroundDarkenStrength.value);
  options.draftBackgroundDarkenColor.value = normalizeBackgroundDarkenColor(options.backgroundDarkenColor.value);
  options.draftBackgroundAcrylicAppearance.value = normalizeBackgroundAcrylicAppearance(options.backgroundAcrylicAppearance.value);
  options.draftBackgroundAcrylicDarkParams.value = normalizeBackgroundAcrylicParams(options.backgroundAcrylicDarkParams.value, BACKGROUND_ACRYLIC_APPEARANCE_DARK);
  options.draftBackgroundAcrylicLightParams.value = normalizeBackgroundAcrylicParams(options.backgroundAcrylicLightParams.value, BACKGROUND_ACRYLIC_APPEARANCE_LIGHT);
  options.draftBackgroundImagePath.value = normalizeBackgroundImagePath(options.backgroundImagePath.value);
  options.draftBackgroundImageUrl.value = options.draftBackgroundImagePath.value
    ? options.backgroundImageUrl.value || convertFilePathToAssetUrl(options.draftBackgroundImagePath.value)
    : null;
  options.draftWindowEffectMaterial.value = options.windowEffectMaterial.value;
  options.draftWindowEffectAppearance.value = options.windowEffectAppearance.value;
  options.draftWindowMode.value = normalizeWindowMode(options.windowMode.value);
  options.draftShowCustomTitlebar.value = normalizeShowCustomTitlebar(options.showCustomTitlebar.value);
  if (options.draftMainWindowShortcut && options.mainWindowShortcut) {
    options.draftMainWindowShortcut.value = normalizeMainWindowShortcut(options.mainWindowShortcut.value);
  }
}

export function useLaunchpadSettingsConfig(options) {
  function clampIconSize(value) {
    return clampLaunchpadIconSize(value);
  }

  function changeDraftRows(delta) {
    options.draftRows.value = clamp(Number(options.draftRows.value) + delta || DEFAULT_ROWS, 2, 8);
  }

  function changeDraftCols(delta) {
    options.draftCols.value = clamp(Number(options.draftCols.value) + delta || DEFAULT_COLS, 3, 10);
  }

  function changeDraftFolderRows(delta) {
    options.draftFolderRows.value = clamp(Number(options.draftFolderRows.value) + delta || DEFAULT_FOLDER_ROWS, 2, 6);
  }

  function changeDraftFolderCols(delta) {
    options.draftFolderCols.value = clamp(Number(options.draftFolderCols.value) + delta || DEFAULT_FOLDER_COLS, 2, 8);
  }

  function changeDraftIconSize(direction) {
    options.draftIconSize.value = clampIconSize(options.draftIconSize.value + direction * ICON_SIZE_STEP);
  }

  function changeDraftFolderIconSize(direction) {
    options.draftFolderIconSize.value = clampIconSize(options.draftFolderIconSize.value + direction * ICON_SIZE_STEP);
  }

  function setDraftFolderIconSizeMode(mode) {
    const nextMode = normalizeFolderIconSizeMode(mode);
    if (
      nextMode === FOLDER_ICON_SIZE_MODE_CUSTOM
      && options.draftFolderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
      && options.folderIconSizeMode.value !== FOLDER_ICON_SIZE_MODE_CUSTOM
    ) {
      options.draftFolderIconSize.value = clampIconSize(options.draftIconSize.value);
    }
    options.draftFolderIconSizeMode.value = nextMode;
    options.draftFolderIconSize.value = clampIconSize(options.draftFolderIconSize.value);
  }

  function setDraftBackgroundSource(source) {
    const nextSource = normalizeBackgroundSource(source);
    if (backgroundSourceUsesLiveDesktop(nextSource) && !canUseLiveDesktopBackground()) return;
    options.draftBackgroundSource.value = nextSource;
    if (!backgroundSourceUsesImage(nextSource)) {
      options.draftBackgroundImagePath.value = null;
      options.draftBackgroundImageUrl.value = null;
      if (!backgroundSourceUsesLiveDesktop(nextSource) || !canUseLiveDesktopBackgroundEffect(options.draftBackgroundEffect.value)) {
        options.draftBackgroundEffect.value = BACKGROUND_EFFECT_DIMMED;
      }
    }
  }

  function setDraftBackgroundEffect(effect) {
    const nextEffect = normalizeBackgroundEffect(effect);
    options.draftBackgroundEffect.value = canUseDraftBackgroundEffect(nextEffect)
      ? nextEffect
      : BACKGROUND_EFFECT_DIMMED;
  }

  function setDraftBackgroundImageOpacity(value) {
    options.draftBackgroundImageOpacity.value = clampBackgroundImageOpacity(value);
  }

  function setDraftBackgroundLiveDesktopOpacity(value) {
    options.draftBackgroundLiveDesktopOpacity.value = clampBackgroundLiveDesktopOpacity(value);
  }

  function setDraftBackgroundImageLayout(layout) {
    options.draftBackgroundImageLayout.value = normalizeBackgroundImageLayout(layout);
  }

  function setDraftBackgroundBlurStrength(value) {
    options.draftBackgroundBlurStrength.value = clampBackgroundBlurStrength(value);
  }

  function setDraftBackgroundAcrylicBlurStrength(value) {
    options.draftBackgroundAcrylicBlurStrength.value = clampBackgroundAcrylicBlurStrength(value);
  }

  function setDraftBackgroundDarkenStrength(value) {
    options.draftBackgroundDarkenStrength.value = clampBackgroundDarkenStrength(value);
  }

  function setDraftBackgroundDarkenColor(color) {
    options.draftBackgroundDarkenColor.value = normalizeBackgroundDarkenColor(color);
  }

  function getDraftBackgroundAcrylicParamsRef(profile) {
    return normalizeBackgroundAcrylicProfileKey(profile) === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT
      ? options.draftBackgroundAcrylicLightParams
      : options.draftBackgroundAcrylicDarkParams;
  }

  function setDraftBackgroundAcrylicAppearance(appearance) {
    options.draftBackgroundAcrylicAppearance.value = normalizeBackgroundAcrylicAppearance(appearance);
  }

  function setDraftBackgroundAcrylicParam(profile, key, value) {
    const targetRef = getDraftBackgroundAcrylicParamsRef(profile);
    const profileKey = normalizeBackgroundAcrylicProfileKey(profile);
    const current = normalizeBackgroundAcrylicParams(targetRef.value, profileKey);
    if (!Object.prototype.hasOwnProperty.call(current, key)) return;
    targetRef.value = normalizeBackgroundAcrylicParams({
      ...current,
      [key]: key === "tintColor" ? value : Number(value),
    }, profileKey);
  }

  function resetDraftBackgroundAcrylicParams(profile) {
    const targetRef = getDraftBackgroundAcrylicParamsRef(profile);
    const profileKey = normalizeBackgroundAcrylicProfileKey(profile);
    targetRef.value = createDefaultBackgroundAcrylicParams(profileKey);
  }

  function changeDraftBackgroundImageOpacity(direction) {
    setDraftBackgroundImageOpacity(
      Number(options.draftBackgroundImageOpacity.value) + direction * BACKGROUND_IMAGE_OPACITY_STEP
    );
  }

  function changeDraftBackgroundLiveDesktopOpacity(direction) {
    setDraftBackgroundLiveDesktopOpacity(
      Number(options.draftBackgroundLiveDesktopOpacity.value) + direction * BACKGROUND_LIVE_DESKTOP_OPACITY_STEP
    );
  }

  function setDraftBackgroundBaseColor(color) {
    options.draftBackgroundBaseColor.value = normalizeBackgroundBaseColor(color);
  }

  function setDraftBackgroundBaseOpacity(value) {
    options.draftBackgroundBaseOpacity.value = clampBackgroundBaseOpacity(value);
  }

  function changeDraftBackgroundBaseOpacity(direction) {
    setDraftBackgroundBaseOpacity(
      Number(options.draftBackgroundBaseOpacity.value) + direction * BACKGROUND_BASE_OPACITY_STEP
    );
  }

  async function chooseDraftBackgroundImage() {
    if (options.isChoosingBackgroundImage.value) return;
    options.isChoosingBackgroundImage.value = true;
    try {
      const selected = await pickBackgroundImage();
      const imagePath = normalizeBackgroundImagePath(selected?.imagePath);
      if (!imagePath) return;
      options.draftBackgroundImagePath.value = imagePath;
      options.draftBackgroundImageUrl.value = convertFilePathToAssetUrl(imagePath);
      options.draftBackgroundSource.value = BACKGROUND_SOURCE_CUSTOM_IMAGE;
      options.draftBackgroundEffect.value = BACKGROUND_EFFECT_DIMMED;
    } catch (error) {
      console.error("Failed to choose LaunchPad background image", error);
    } finally {
      options.isChoosingBackgroundImage.value = false;
    }
  }

  async function useDraftDesktopWallpaper() {
    if (options.isChoosingBackgroundImage.value) return;
    options.isChoosingBackgroundImage.value = true;
    try {
      const selected = await getDesktopWallpaperBackground();
      const imagePath = normalizeBackgroundImagePath(selected?.imagePath);
      if (!imagePath) return;
      options.draftBackgroundImagePath.value = imagePath;
      options.draftBackgroundImageUrl.value = convertFilePathToAssetUrl(imagePath);
      options.draftBackgroundSource.value = BACKGROUND_SOURCE_WINDOWS_WALLPAPER;
      options.draftBackgroundEffect.value = BACKGROUND_EFFECT_DIMMED;
    } catch (error) {
      console.error("Failed to use Windows desktop wallpaper", error);
    } finally {
      options.isChoosingBackgroundImage.value = false;
    }
  }

  function clearDraftBackgroundImage() {
    options.draftBackgroundImagePath.value = null;
    options.draftBackgroundImageUrl.value = null;
    options.draftBackgroundSource.value = BACKGROUND_SOURCE_SYSTEM_MATERIAL;
  }

  function canUseWindowEffectMaterial(material) {
    return isWindowEffectMaterialAvailable(material, options.windowEffectsSupport.value);
  }

  function canUseLiveDesktopBackground() {
    return Boolean(
      isLiveDesktopExperimentEnabled()
      && normalizeLiveDesktopBackgroundSupport(options.liveDesktopBackgroundSupport?.value).supportsLiveDesktopBackground
    );
  }

  function canUseLiveDesktopBackgroundEffect(effect) {
    if (!canUseLiveDesktopBackground()) return false;
    return Boolean(normalizeBackgroundEffect(effect));
  }

  function canUseDraftBackgroundEffect(effect) {
    if (backgroundSourceUsesImage(options.draftBackgroundSource.value)) return true;
    if (backgroundSourceUsesLiveDesktop(options.draftBackgroundSource.value)) {
      return canUseLiveDesktopBackgroundEffect(effect);
    }
    return false;
  }

  function setDraftWindowEffectMaterial(material) {
    const nextMaterial = normalizeWindowEffectMaterial(material);
    if (!canUseWindowEffectMaterial(nextMaterial)) return;
    options.draftWindowEffectMaterial.value = nextMaterial;
    if (
      nextMaterial === WINDOW_EFFECT_MATERIAL_NONE
      && options.draftBackgroundBaseOpacity
      && clampBackgroundBaseOpacity(options.draftBackgroundBaseOpacity.value) === 0
    ) {
      options.draftBackgroundBaseOpacity.value = BACKGROUND_BASE_OPACITY_MAX;
    }
  }

  function setDraftWindowEffectAppearance(appearance) {
    options.draftWindowEffectAppearance.value = normalizeWindowEffectAppearance(appearance);
  }

  function setDraftWindowMode(mode) {
    options.draftWindowMode.value = normalizeWindowMode(mode);
  }

  function setDraftShowCustomTitlebar(visible) {
    options.draftShowCustomTitlebar.value = normalizeShowCustomTitlebar(visible);
  }

  function setDraftMainWindowShortcut(shortcut) {
    if (!options.draftMainWindowShortcut) return;
    options.draftMainWindowShortcut.value = normalizeMainWindowShortcut(shortcut);
    if (options.mainWindowShortcutError) options.mainWindowShortcutError.value = "";
  }

  function repackPagesForGrid(nextRows, nextCols, nextFolderRows, nextFolderCols) {
    if (options.isDragActive()) return;
    const rows = clamp(Number(nextRows) || DEFAULT_ROWS, 2, 8);
    const cols = clamp(Number(nextCols) || DEFAULT_COLS, 3, 10);
    const nextFolderRowCount = clamp(Number(nextFolderRows) || DEFAULT_FOLDER_ROWS, 2, 6);
    const nextFolderColumnCount = clamp(Number(nextFolderCols) || DEFAULT_FOLDER_COLS, 2, 8);
    const newPageSize = makePageSize(rows, cols);
    const oldPageSize = options.pageSize.value;
    const oldFolderPageSize = options.folderPageSize.value;
    const newFolderPageSize = makePageSize(nextFolderRowCount, nextFolderColumnCount);

    let next = options.clonePages(options.pages.value);

    if (newPageSize < oldPageSize) {
      for (let i = 0; i < next.length; i++) {
        while (next[i].length > newPageSize) {
          const overflow = next[i].pop();
          options.ensurePage(next, i + 1);
          next[i + 1].unshift(overflow);
        }
      }
    }

    next = options.repackFoldersForPageSize(next, oldFolderPageSize, newFolderPageSize);
    const compacted = options.compactPages(next, { folderPageSize: newFolderPageSize });

    options.gridRows.value = rows;
    options.gridCols.value = cols;
    options.folderRows.value = nextFolderRowCount;
    options.folderCols.value = nextFolderColumnCount;
    options.iconSize.value = clampIconSize(options.draftIconSize.value);
    options.folderIconSizeMode.value = normalizeFolderIconSizeMode(options.draftFolderIconSizeMode.value);
    options.folderIconSize.value = clampIconSize(options.draftFolderIconSize.value);
    options.draftRows.value = rows;
    options.draftCols.value = cols;
    options.draftFolderRows.value = nextFolderRowCount;
    options.draftFolderCols.value = nextFolderColumnCount;
    options.draftIconSize.value = options.iconSize.value;
    options.draftFolderIconSizeMode.value = options.folderIconSizeMode.value;
    options.draftFolderIconSize.value = options.folderIconSize.value;
    options.commitPages(compacted);
    options.commitPageIndex(options.pageIndex.value);
    options.commitSearchPageIndex(options.searchPageIndex.value);
    options.commitFolderPageIndex(options.folderPageIndex.value);
  }

  function applyGridConfig() {
    repackPagesForGrid(
      options.draftRows.value,
      options.draftCols.value,
      options.draftFolderRows.value,
      options.draftFolderCols.value,
    );
    options.schedulePageGridMetrics();
  }

  function commitSettingsConfig(nextMainWindowShortcut) {
    applyGridConfig();
    if (!options.isDragActive()) options.isTextlessMode.value = Boolean(options.draftIsTextlessMode.value);
    const nextBackgroundSource = normalizeBackgroundSource(options.draftBackgroundSource.value);
    const nextBackgroundUsesImage = backgroundSourceUsesImage(nextBackgroundSource);
    const nextBackgroundUsesLiveDesktop = backgroundSourceUsesLiveDesktop(nextBackgroundSource) && canUseLiveDesktopBackground();
    const nextBackgroundImagePath = nextBackgroundUsesImage
      ? normalizeBackgroundImagePath(options.draftBackgroundImagePath.value)
      : null;
    const normalizedBackgroundEffect = normalizeBackgroundEffect(options.draftBackgroundEffect.value);
    let nextBackgroundEffect = normalizedBackgroundEffect;
    if (!nextBackgroundUsesLiveDesktop && backgroundEffectUsesPixi(normalizedBackgroundEffect) && !nextBackgroundImagePath) {
      nextBackgroundEffect = BACKGROUND_EFFECT_DIMMED;
    }
    const shouldUseSelectedBackgroundSource = nextBackgroundUsesLiveDesktop || Boolean(nextBackgroundImagePath);
    options.backgroundSource.value = shouldUseSelectedBackgroundSource
      ? nextBackgroundSource
      : BACKGROUND_SOURCE_SYSTEM_MATERIAL;
    options.backgroundEffect.value = nextBackgroundEffect;
    options.backgroundBaseColor.value = normalizeBackgroundBaseColor(options.draftBackgroundBaseColor.value);
    options.backgroundBaseOpacity.value = clampBackgroundBaseOpacity(options.draftBackgroundBaseOpacity.value);
    options.backgroundImageOpacity.value = clampBackgroundImageOpacity(options.draftBackgroundImageOpacity.value);
    options.backgroundLiveDesktopOpacity.value = clampBackgroundLiveDesktopOpacity(options.draftBackgroundLiveDesktopOpacity.value);
    options.backgroundImageLayout.value = normalizeBackgroundImageLayout(options.draftBackgroundImageLayout.value);
    options.backgroundBlurStrength.value = clampBackgroundBlurStrength(options.draftBackgroundBlurStrength.value);
    options.backgroundAcrylicBlurStrength.value = clampBackgroundAcrylicBlurStrength(options.draftBackgroundAcrylicBlurStrength.value);
    options.backgroundDarkenStrength.value = clampBackgroundDarkenStrength(options.draftBackgroundDarkenStrength.value);
    options.backgroundDarkenColor.value = normalizeBackgroundDarkenColor(options.draftBackgroundDarkenColor.value);
    options.backgroundAcrylicAppearance.value = normalizeBackgroundAcrylicAppearance(options.draftBackgroundAcrylicAppearance.value);
    options.backgroundAcrylicDarkParams.value = normalizeBackgroundAcrylicParams(options.draftBackgroundAcrylicDarkParams.value, BACKGROUND_ACRYLIC_APPEARANCE_DARK);
    options.backgroundAcrylicLightParams.value = normalizeBackgroundAcrylicParams(options.draftBackgroundAcrylicLightParams.value, BACKGROUND_ACRYLIC_APPEARANCE_LIGHT);
    options.backgroundImagePath.value = nextBackgroundImagePath;
    options.backgroundImageUrl.value = options.backgroundImagePath.value
      ? options.draftBackgroundImageUrl.value || convertFilePathToAssetUrl(options.backgroundImagePath.value)
      : null;
    options.windowEffectMaterial.value = resolveWindowEffectMaterialForSupport(
      options.draftWindowEffectMaterial.value,
      options.windowEffectsSupport.value
    );
    options.windowEffectAppearance.value = normalizeWindowEffectAppearance(options.draftWindowEffectAppearance.value);
    options.windowMode.value = normalizeWindowMode(options.draftWindowMode.value);
    options.showCustomTitlebar.value = normalizeShowCustomTitlebar(options.draftShowCustomTitlebar.value);
    if (options.mainWindowShortcut && options.draftMainWindowShortcut) {
      options.mainWindowShortcut.value = nextMainWindowShortcut;
      options.draftMainWindowShortcut.value = nextMainWindowShortcut;
    }
    syncLaunchpadSettingsDraftsFromState(options);
    options.applyNativeWindowMode?.();
    options.applyNativeWindowEffects?.();
    options.syncLiveDesktopBackgroundRuntime?.();
    options.closeSettingsPanel();
    return true;
  }

  function applySettingsConfig() {
    const currentShortcut = normalizeMainWindowShortcut(
      options.mainWindowShortcut ? options.mainWindowShortcut.value : DEFAULT_MAIN_WINDOW_SHORTCUT
    );
    const nextShortcut = normalizeMainWindowShortcut(
      options.draftMainWindowShortcut ? options.draftMainWindowShortcut.value : currentShortcut
    );
    if (options.mainWindowShortcutError) options.mainWindowShortcutError.value = "";
    if (nextShortcut !== currentShortcut && typeof options.applyNativeMainWindowShortcut === "function") {
      if (options.isApplyingSettingsConfig) options.isApplyingSettingsConfig.value = true;
      return Promise.resolve(options.applyNativeMainWindowShortcut(nextShortcut))
        .then((applied) => {
          if (!applied) return false;
          return commitSettingsConfig(nextShortcut);
        })
        .catch((error) => {
          if (options.mainWindowShortcutError) {
            options.mainWindowShortcutError.value = error?.message || "快捷键已被占用或不可用";
          }
          return false;
        })
        .finally(() => {
          if (options.isApplyingSettingsConfig) options.isApplyingSettingsConfig.value = false;
        });
    }
    return commitSettingsConfig(nextShortcut);
  }

  return {
    applyGridConfig,
    applySettingsConfig,
    changeDraftBackgroundImageOpacity,
    changeDraftBackgroundLiveDesktopOpacity,
    changeDraftBackgroundBaseOpacity,
    changeDraftCols,
    changeDraftFolderCols,
    changeDraftFolderIconSize,
    changeDraftFolderRows,
    changeDraftIconSize,
    changeDraftRows,
    chooseDraftBackgroundImage,
    clampIconSize,
    clearDraftBackgroundImage,
    canUseWindowEffectMaterial,
    canUseLiveDesktopBackground,
    canUseLiveDesktopBackgroundEffect,
    canUseDraftBackgroundEffect,
    setDraftBackgroundBlurStrength,
    setDraftBackgroundAcrylicBlurStrength,
    setDraftBackgroundDarkenColor,
    setDraftBackgroundDarkenStrength,
    setDraftBackgroundImageOpacity,
    setDraftBackgroundLiveDesktopOpacity,
    setDraftBackgroundBaseColor,
    setDraftBackgroundBaseOpacity,
    setDraftBackgroundEffect,
    setDraftBackgroundImageLayout,
    setDraftBackgroundAcrylicAppearance,
    setDraftBackgroundAcrylicParam,
    setDraftBackgroundSource,
    resetDraftBackgroundAcrylicParams,
    setDraftFolderIconSizeMode,
    setDraftWindowEffectAppearance,
    setDraftWindowEffectMaterial,
    setDraftMainWindowShortcut,
    setDraftShowCustomTitlebar,
    setDraftWindowMode,
    useDraftDesktopWallpaper,
  };
}
