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

export const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
export const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";
export const BACKGROUND_SOURCE_SYSTEM_MATERIAL = "systemMaterial";
export const BACKGROUND_SOURCE_CUSTOM_IMAGE = "customImage";
export const BACKGROUND_SOURCE_WINDOWS_WALLPAPER = "windowsWallpaper";
export const BACKGROUND_EFFECT_NONE = "none";
export const BACKGROUND_EFFECT_DIMMED = "dimmed";
export const BACKGROUND_EFFECT_BLUR = "blur";
export const BACKGROUND_EFFECT_ACRYLIC_WEBGL = "acrylicWebgl";
export const BACKGROUND_IMAGE_OPACITY_MIN = 0;
export const BACKGROUND_IMAGE_OPACITY_MAX = 100;
export const BACKGROUND_IMAGE_OPACITY_STEP = 1;
export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 46;
export const BACKGROUND_BASE_OPACITY_MIN = 0;
export const BACKGROUND_BASE_OPACITY_MAX = 100;
export const BACKGROUND_BASE_OPACITY_STEP = 1;
export const DEFAULT_BACKGROUND_BASE_COLOR = "#10141f";
export const DEFAULT_BACKGROUND_BASE_OPACITY = 28;
export const WINDOW_EFFECT_MATERIAL_NONE = "none";
export const WINDOW_EFFECT_MATERIAL_ACRYLIC = "acrylic";
export const WINDOW_EFFECT_MATERIAL_MICA = "mica";
export const WINDOW_EFFECT_MATERIAL_MICA_ALT = "micaAlt";
export const WINDOW_EFFECT_APPEARANCE_DARK = "dark";
export const WINDOW_EFFECT_APPEARANCE_LIGHT = "light";
export const DEFAULT_WINDOW_EFFECTS_SUPPORT = Object.freeze({
  platform: "unknown",
  build: null,
  supportsAcrylic: false,
  supportsMica: false,
  supportsMicaAlt: false,
});

export function clampLaunchpadIconSize(value) {
  return clamp(Number(value) || DEFAULT_ICON_SIZE, ICON_SIZE_MIN, ICON_SIZE_MAX);
}

export function normalizeFolderIconSizeMode(value) {
  return value === FOLDER_ICON_SIZE_MODE_CUSTOM ? FOLDER_ICON_SIZE_MODE_CUSTOM : FOLDER_ICON_SIZE_MODE_GLOBAL;
}

export function normalizeBackgroundSource(value) {
  if (value === BACKGROUND_SOURCE_CUSTOM_IMAGE) return BACKGROUND_SOURCE_CUSTOM_IMAGE;
  if (value === BACKGROUND_SOURCE_WINDOWS_WALLPAPER) return BACKGROUND_SOURCE_WINDOWS_WALLPAPER;
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

export function clampBackgroundImageOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  return clamp(Math.round(opacity), BACKGROUND_IMAGE_OPACITY_MIN, BACKGROUND_IMAGE_OPACITY_MAX);
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
  options.draftBackgroundImagePath.value = normalizeBackgroundImagePath(options.backgroundImagePath.value);
  options.draftBackgroundImageUrl.value = options.draftBackgroundImagePath.value
    ? options.backgroundImageUrl.value || convertFilePathToAssetUrl(options.draftBackgroundImagePath.value)
    : null;
  options.draftWindowEffectMaterial.value = options.windowEffectMaterial.value;
  options.draftWindowEffectAppearance.value = options.windowEffectAppearance.value;
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
    options.draftBackgroundSource.value = nextSource;
    if (!backgroundSourceUsesImage(nextSource)) {
      options.draftBackgroundImagePath.value = null;
      options.draftBackgroundImageUrl.value = null;
      if (backgroundEffectUsesPixi(options.draftBackgroundEffect.value)) {
        options.draftBackgroundEffect.value = BACKGROUND_EFFECT_DIMMED;
      }
    }
  }

  function setDraftBackgroundEffect(effect) {
    options.draftBackgroundEffect.value = normalizeBackgroundEffect(effect);
  }

  function setDraftBackgroundImageOpacity(value) {
    options.draftBackgroundImageOpacity.value = clampBackgroundImageOpacity(value);
  }

  function changeDraftBackgroundImageOpacity(direction) {
    setDraftBackgroundImageOpacity(
      Number(options.draftBackgroundImageOpacity.value) + direction * BACKGROUND_IMAGE_OPACITY_STEP
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

  function applySettingsConfig() {
    applyGridConfig();
    if (!options.isDragActive()) options.isTextlessMode.value = Boolean(options.draftIsTextlessMode.value);
    const nextBackgroundSource = normalizeBackgroundSource(options.draftBackgroundSource.value);
    const nextBackgroundUsesImage = backgroundSourceUsesImage(nextBackgroundSource);
    const nextBackgroundImagePath = nextBackgroundUsesImage
      ? normalizeBackgroundImagePath(options.draftBackgroundImagePath.value)
      : null;
    const normalizedBackgroundEffect = normalizeBackgroundEffect(options.draftBackgroundEffect.value);
    const nextBackgroundEffect = backgroundEffectUsesPixi(normalizedBackgroundEffect) && !nextBackgroundImagePath
      ? BACKGROUND_EFFECT_DIMMED
      : normalizedBackgroundEffect;
    options.backgroundSource.value = nextBackgroundImagePath
      ? nextBackgroundSource
      : BACKGROUND_SOURCE_SYSTEM_MATERIAL;
    options.backgroundEffect.value = nextBackgroundEffect;
    options.backgroundBaseColor.value = normalizeBackgroundBaseColor(options.draftBackgroundBaseColor.value);
    options.backgroundBaseOpacity.value = clampBackgroundBaseOpacity(options.draftBackgroundBaseOpacity.value);
    options.backgroundImageOpacity.value = clampBackgroundImageOpacity(options.draftBackgroundImageOpacity.value);
    options.backgroundImagePath.value = nextBackgroundImagePath;
    options.backgroundImageUrl.value = options.backgroundImagePath.value
      ? options.draftBackgroundImageUrl.value || convertFilePathToAssetUrl(options.backgroundImagePath.value)
      : null;
    options.windowEffectMaterial.value = resolveWindowEffectMaterialForSupport(
      options.draftWindowEffectMaterial.value,
      options.windowEffectsSupport.value
    );
    options.windowEffectAppearance.value = normalizeWindowEffectAppearance(options.draftWindowEffectAppearance.value);
    syncLaunchpadSettingsDraftsFromState(options);
    options.applyNativeWindowEffects?.();
    options.closeSettingsPanel();
  }

  return {
    applyGridConfig,
    applySettingsConfig,
    changeDraftBackgroundImageOpacity,
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
    setDraftBackgroundImageOpacity,
    setDraftBackgroundBaseColor,
    setDraftBackgroundBaseOpacity,
    setDraftBackgroundEffect,
    setDraftBackgroundSource,
    setDraftFolderIconSizeMode,
    setDraftWindowEffectAppearance,
    setDraftWindowEffectMaterial,
    useDraftDesktopWallpaper,
  };
}
