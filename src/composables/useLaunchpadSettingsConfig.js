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
import { clamp, makePageSize } from "../domain/launchpadLayout.js";

export const FOLDER_ICON_SIZE_MODE_CUSTOM = "custom";
export const FOLDER_ICON_SIZE_MODE_GLOBAL = "global";
export const BACKGROUND_RENDER_MODE_MATERIAL = "material";
export const BACKGROUND_RENDER_MODE_IMAGE = "image";
export const BACKGROUND_IMAGE_OPACITY_MIN = 0;
export const BACKGROUND_IMAGE_OPACITY_MAX = 100;
export const BACKGROUND_IMAGE_OPACITY_STEP = 1;
export const DEFAULT_BACKGROUND_IMAGE_OPACITY = 46;
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

export function normalizeBackgroundRenderMode(value) {
  return value === BACKGROUND_RENDER_MODE_IMAGE ? BACKGROUND_RENDER_MODE_IMAGE : BACKGROUND_RENDER_MODE_MATERIAL;
}

export function clampBackgroundImageOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  return clamp(Math.round(opacity), BACKGROUND_IMAGE_OPACITY_MIN, BACKGROUND_IMAGE_OPACITY_MAX);
}

export function normalizeWindowEffectMaterial(value) {
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
  const normalizedSupport = normalizeWindowEffectsSupport(support);
  if (normalizedMaterial === WINDOW_EFFECT_MATERIAL_MICA) return normalizedSupport.supportsMica;
  if (normalizedMaterial === WINDOW_EFFECT_MATERIAL_MICA_ALT) return normalizedSupport.supportsMicaAlt;
  return normalizedSupport.supportsAcrylic;
}

export function resolveWindowEffectMaterialForSupport(material, support) {
  const normalizedMaterial = normalizeWindowEffectMaterial(material);
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
  options.draftBackgroundRenderMode.value = options.backgroundRenderMode.value;
  options.draftBackgroundImageOpacity.value = options.backgroundImageOpacity.value;
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

  function setDraftBackgroundRenderMode(mode) {
    options.draftBackgroundRenderMode.value = normalizeBackgroundRenderMode(mode);
  }

  function setDraftBackgroundImageOpacity(value) {
    options.draftBackgroundImageOpacity.value = clampBackgroundImageOpacity(value);
  }

  function changeDraftBackgroundImageOpacity(direction) {
    setDraftBackgroundImageOpacity(
      Number(options.draftBackgroundImageOpacity.value) + direction * BACKGROUND_IMAGE_OPACITY_STEP
    );
  }

  function canUseWindowEffectMaterial(material) {
    return isWindowEffectMaterialAvailable(material, options.windowEffectsSupport.value);
  }

  function setDraftWindowEffectMaterial(material) {
    const nextMaterial = normalizeWindowEffectMaterial(material);
    if (!canUseWindowEffectMaterial(nextMaterial)) return;
    options.draftWindowEffectMaterial.value = nextMaterial;
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
    options.backgroundRenderMode.value = normalizeBackgroundRenderMode(options.draftBackgroundRenderMode.value);
    options.backgroundImageOpacity.value = clampBackgroundImageOpacity(options.draftBackgroundImageOpacity.value);
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
    changeDraftCols,
    changeDraftFolderCols,
    changeDraftFolderIconSize,
    changeDraftFolderRows,
    changeDraftIconSize,
    changeDraftRows,
    clampIconSize,
    canUseWindowEffectMaterial,
    setDraftBackgroundImageOpacity,
    setDraftBackgroundRenderMode,
    setDraftFolderIconSizeMode,
    setDraftWindowEffectAppearance,
    setDraftWindowEffectMaterial,
  };
}
