import { createLaunchpadLayoutHelpers, makePageSize } from "../domain/launchpadLayout.js";
import {
  BACKGROUND_RENDER_MODE_IMAGE,
  BACKGROUND_RENDER_MODE_MATERIAL,
  FOLDER_ICON_SIZE_MODE_CUSTOM,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
  clampBackgroundImageOpacity,
  clampLaunchpadIconSize,
  normalizeBackgroundImagePath,
  normalizeBackgroundRenderMode,
  normalizeWindowEffectAppearance,
  normalizeWindowEffectMaterial,
  normalizeFolderIconSizeMode,
  resolveWindowEffectMaterialForSupport,
  syncLaunchpadSettingsDraftsFromState,
  useLaunchpadSettingsConfig,
} from "./useLaunchpadSettingsConfig.js";

function refValue(value) {
  return { value };
}

function makeItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `settings-test-${index}`,
    type: "app",
    name: `Settings Test ${index}`,
    emoji: "S",
  }));
}

function createSettingsConfig(overrides = {}) {
  const state = {
    gridRows: refValue(overrides.gridRows ?? 2),
    gridCols: refValue(overrides.gridCols ?? 3),
    folderRows: refValue(overrides.folderRows ?? 2),
    folderCols: refValue(overrides.folderCols ?? 3),
    draftRows: refValue(overrides.draftRows ?? 2),
    draftCols: refValue(overrides.draftCols ?? 2),
    draftFolderRows: refValue(overrides.draftFolderRows ?? 2),
    draftFolderCols: refValue(overrides.draftFolderCols ?? 2),
    iconSize: refValue(overrides.iconSize ?? 64),
    folderIconSizeMode: refValue(overrides.folderIconSizeMode ?? FOLDER_ICON_SIZE_MODE_GLOBAL),
    folderIconSize: refValue(overrides.folderIconSize ?? 64),
    draftIconSize: refValue(overrides.draftIconSize ?? 72),
    draftFolderIconSizeMode: refValue(overrides.draftFolderIconSizeMode ?? FOLDER_ICON_SIZE_MODE_CUSTOM),
    draftFolderIconSize: refValue(overrides.draftFolderIconSize ?? 80),
    draftIsTextlessMode: refValue(overrides.draftIsTextlessMode ?? false),
    draftBackgroundRenderMode: refValue(overrides.draftBackgroundRenderMode ?? BACKGROUND_RENDER_MODE_MATERIAL),
    draftBackgroundImageOpacity: refValue(overrides.draftBackgroundImageOpacity ?? 46),
    draftBackgroundImagePath: refValue(overrides.draftBackgroundImagePath ?? null),
    draftBackgroundImageUrl: refValue(overrides.draftBackgroundImageUrl ?? null),
    draftWindowEffectMaterial: refValue(overrides.draftWindowEffectMaterial ?? WINDOW_EFFECT_MATERIAL_ACRYLIC),
    draftWindowEffectAppearance: refValue(overrides.draftWindowEffectAppearance ?? WINDOW_EFFECT_APPEARANCE_DARK),
    isTextlessMode: refValue(overrides.isTextlessMode ?? false),
    backgroundRenderMode: refValue(overrides.backgroundRenderMode ?? BACKGROUND_RENDER_MODE_MATERIAL),
    backgroundImageOpacity: refValue(overrides.backgroundImageOpacity ?? 46),
    backgroundImagePath: refValue(overrides.backgroundImagePath ?? null),
    backgroundImageUrl: refValue(overrides.backgroundImageUrl ?? null),
    windowEffectMaterial: refValue(overrides.windowEffectMaterial ?? WINDOW_EFFECT_MATERIAL_ACRYLIC),
    windowEffectAppearance: refValue(overrides.windowEffectAppearance ?? WINDOW_EFFECT_APPEARANCE_DARK),
    windowEffectsSupport: refValue(overrides.windowEffectsSupport ?? {
      platform: "windows",
      build: 22621,
      supportsAcrylic: true,
      supportsMica: true,
      supportsMicaAlt: true,
    }),
    pages: refValue(overrides.pages ?? [makeItems(6)]),
    pageIndex: refValue(overrides.pageIndex ?? 2),
    searchPageIndex: refValue(overrides.searchPageIndex ?? 1),
    folderPageIndex: refValue(overrides.folderPageIndex ?? 1),
    isChoosingBackgroundImage: refValue(false),
  };
  const calls = {
    applyNativeWindowEffects: 0,
    closeSettingsPanel: 0,
    commitFolderPageIndex: [],
    commitPageIndex: [],
    commitPages: [],
    commitSearchPageIndex: [],
    schedulePageGridMetrics: 0,
  };
  const pageSize = {
    get value() {
      return makePageSize(state.gridRows.value, state.gridCols.value);
    },
  };
  const folderPageSize = {
    get value() {
      return makePageSize(state.folderRows.value, state.folderCols.value);
    },
  };
  const helpers = createLaunchpadLayoutHelpers({
    getPageSize: () => pageSize.value,
    getFolderPageSize: () => folderPageSize.value,
  });
  const config = useLaunchpadSettingsConfig({
    applyNativeWindowEffects: () => {
      calls.applyNativeWindowEffects += 1;
    },
    clonePages: helpers.clonePages,
    closeSettingsPanel: () => {
      calls.closeSettingsPanel += 1;
    },
    commitFolderPageIndex: (value) => calls.commitFolderPageIndex.push(value),
    commitPageIndex: (value) => calls.commitPageIndex.push(value),
    commitPages: (next) => {
      calls.commitPages.push(next);
      state.pages.value = next;
    },
    commitSearchPageIndex: (value) => calls.commitSearchPageIndex.push(value),
    compactPages: helpers.compactPages,
    draftBackgroundImageOpacity: state.draftBackgroundImageOpacity,
    draftBackgroundImagePath: state.draftBackgroundImagePath,
    draftBackgroundImageUrl: state.draftBackgroundImageUrl,
    draftBackgroundRenderMode: state.draftBackgroundRenderMode,
    draftCols: state.draftCols,
    draftFolderCols: state.draftFolderCols,
    draftFolderIconSize: state.draftFolderIconSize,
    draftFolderIconSizeMode: state.draftFolderIconSizeMode,
    draftFolderRows: state.draftFolderRows,
    draftIconSize: state.draftIconSize,
    draftIsTextlessMode: state.draftIsTextlessMode,
    draftRows: state.draftRows,
    draftWindowEffectAppearance: state.draftWindowEffectAppearance,
    draftWindowEffectMaterial: state.draftWindowEffectMaterial,
    ensurePage: helpers.ensurePage,
    folderCols: state.folderCols,
    folderIconSize: state.folderIconSize,
    folderIconSizeMode: state.folderIconSizeMode,
    folderPageIndex: state.folderPageIndex,
    folderPageSize,
    folderRows: state.folderRows,
    gridCols: state.gridCols,
    gridRows: state.gridRows,
    iconSize: state.iconSize,
    isDragActive: () => Boolean(overrides.isDragActive),
    isTextlessMode: state.isTextlessMode,
    backgroundImageOpacity: state.backgroundImageOpacity,
    backgroundImagePath: state.backgroundImagePath,
    backgroundImageUrl: state.backgroundImageUrl,
    backgroundRenderMode: state.backgroundRenderMode,
    isChoosingBackgroundImage: state.isChoosingBackgroundImage,
    pageIndex: state.pageIndex,
    pageSize,
    pages: state.pages,
    repackFoldersForPageSize: helpers.repackFoldersForPageSize,
    schedulePageGridMetrics: () => {
      calls.schedulePageGridMetrics += 1;
    },
    searchPageIndex: state.searchPageIndex,
    windowEffectAppearance: state.windowEffectAppearance,
    windowEffectMaterial: state.windowEffectMaterial,
    windowEffectsSupport: state.windowEffectsSupport,
  });

  return { calls, config, state };
}

export function runLaunchpadSettingsConfigTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad settings config test failed] ${message}`);
  };

  assert(clampLaunchpadIconSize(8) === 32, "icon size clamp should enforce the minimum");
  assert(clampLaunchpadIconSize(160) === 128, "icon size clamp should enforce the maximum");
  assert(clampLaunchpadIconSize("bad") === 64, "icon size clamp should fall back to the default");
  assert(normalizeFolderIconSizeMode(FOLDER_ICON_SIZE_MODE_CUSTOM) === FOLDER_ICON_SIZE_MODE_CUSTOM, "custom folder icon mode should be preserved");
  assert(normalizeFolderIconSizeMode("unknown") === FOLDER_ICON_SIZE_MODE_GLOBAL, "unknown folder icon modes should fall back to global");
  assert(normalizeBackgroundRenderMode(BACKGROUND_RENDER_MODE_IMAGE) === BACKGROUND_RENDER_MODE_IMAGE, "image background mode should be preserved");
  assert(normalizeBackgroundRenderMode("unknown") === BACKGROUND_RENDER_MODE_MATERIAL, "unknown background modes should fall back to material");
  assert(normalizeBackgroundImagePath(" C:/Images/wallpaper.png ") === "C:/Images/wallpaper.png", "background image paths should be trimmed");
  assert(normalizeBackgroundImagePath("") === null, "empty background image paths should become null");
  assert(clampBackgroundImageOpacity(-12) === 0, "background image opacity should clamp to the minimum");
  assert(clampBackgroundImageOpacity(120) === 100, "background image opacity should clamp to the maximum");
  assert(clampBackgroundImageOpacity("bad") === 46, "invalid background image opacity should fall back to the default");
  assert(normalizeWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_MICA) === WINDOW_EFFECT_MATERIAL_MICA, "mica window effect material should be preserved");
  assert(normalizeWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_MICA_ALT) === WINDOW_EFFECT_MATERIAL_MICA_ALT, "mica alt window effect material should be preserved");
  assert(normalizeWindowEffectMaterial("unknown") === WINDOW_EFFECT_MATERIAL_ACRYLIC, "unknown window effect materials should fall back to acrylic");
  assert(normalizeWindowEffectAppearance(WINDOW_EFFECT_APPEARANCE_LIGHT) === WINDOW_EFFECT_APPEARANCE_LIGHT, "light window effect appearance should be preserved");
  assert(normalizeWindowEffectAppearance("unknown") === WINDOW_EFFECT_APPEARANCE_DARK, "unknown window effect appearances should fall back to dark");
  assert(
    resolveWindowEffectMaterialForSupport(WINDOW_EFFECT_MATERIAL_MICA, { supportsAcrylic: true, supportsMica: false, supportsMicaAlt: false }) === WINDOW_EFFECT_MATERIAL_ACRYLIC,
    "mica should fall back to acrylic when the system does not support mica"
  );
  assert(
    resolveWindowEffectMaterialForSupport(WINDOW_EFFECT_MATERIAL_MICA_ALT, { supportsAcrylic: true, supportsMica: true, supportsMicaAlt: false }) === WINDOW_EFFECT_MATERIAL_MICA,
    "mica alt should fall back to mica when the system supports mica"
  );

  const sync = createSettingsConfig({
    draftRows: 8,
    draftCols: 10,
    draftFolderRows: 6,
    draftFolderCols: 8,
    draftIconSize: 128,
    draftFolderIconSizeMode: FOLDER_ICON_SIZE_MODE_CUSTOM,
    draftFolderIconSize: 120,
    draftIsTextlessMode: false,
    draftBackgroundRenderMode: BACKGROUND_RENDER_MODE_IMAGE,
    draftBackgroundImageOpacity: 12,
    draftBackgroundImagePath: "C:/Draft/old.png",
    draftBackgroundImageUrl: "asset://draft",
    gridRows: 4,
    gridCols: 5,
    folderRows: 3,
    folderCols: 4,
    iconSize: 72,
    folderIconSizeMode: FOLDER_ICON_SIZE_MODE_GLOBAL,
    folderIconSize: 72,
    isTextlessMode: true,
    backgroundRenderMode: BACKGROUND_RENDER_MODE_MATERIAL,
    backgroundImageOpacity: 58,
    backgroundImagePath: "C:/Images/current.png",
    backgroundImageUrl: "asset://current",
    windowEffectMaterial: WINDOW_EFFECT_MATERIAL_MICA_ALT,
    windowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
  });
  syncLaunchpadSettingsDraftsFromState(sync.state);
  assert(sync.state.draftRows.value === 4 && sync.state.draftCols.value === 5, "sync should reset desktop draft dimensions from current settings");
  assert(sync.state.draftFolderRows.value === 3 && sync.state.draftFolderCols.value === 4, "sync should reset folder draft dimensions from current settings");
  assert(sync.state.draftIconSize.value === 72, "sync should reset icon draft size from current settings");
  assert(sync.state.draftFolderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_GLOBAL, "sync should reset folder icon mode from current settings");
  assert(sync.state.draftFolderIconSize.value === 72, "sync should reset folder icon size from current settings");
  assert(sync.state.draftIsTextlessMode.value === true, "sync should reset textless draft from current settings");
  assert(sync.state.draftBackgroundRenderMode.value === BACKGROUND_RENDER_MODE_MATERIAL, "sync should reset background render draft from current settings");
  assert(sync.state.draftBackgroundImageOpacity.value === 58, "sync should reset background opacity draft from current settings");
  assert(sync.state.draftBackgroundImagePath.value === "C:/Images/current.png", "sync should reset background image path draft from current settings");
  assert(sync.state.draftBackgroundImageUrl.value === "asset://current", "sync should reset background image url draft from current settings");
  assert(sync.state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA_ALT, "sync should reset window effect material draft from current settings");
  assert(sync.state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "sync should reset window effect appearance draft from current settings");

  const draft = createSettingsConfig({
    draftCols: 10,
    draftFolderCols: 8,
    draftFolderRows: 6,
    draftRows: 8,
  });
  draft.config.changeDraftRows(1);
  draft.config.changeDraftCols(1);
  draft.config.changeDraftFolderRows(1);
  draft.config.changeDraftFolderCols(1);
  assert(draft.state.draftRows.value === 8, "draft desktop rows should clamp to the maximum");
  assert(draft.state.draftCols.value === 10, "draft desktop columns should clamp to the maximum");
  assert(draft.state.draftFolderRows.value === 6, "draft folder rows should clamp to the maximum");
  assert(draft.state.draftFolderCols.value === 8, "draft folder columns should clamp to the maximum");

  const folderIconMode = createSettingsConfig({
    draftFolderIconSizeMode: FOLDER_ICON_SIZE_MODE_GLOBAL,
    draftIconSize: 96,
    folderIconSizeMode: FOLDER_ICON_SIZE_MODE_GLOBAL,
  });
  folderIconMode.config.setDraftFolderIconSizeMode(FOLDER_ICON_SIZE_MODE_CUSTOM);
  assert(folderIconMode.state.draftFolderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_CUSTOM, "folder icon draft mode should switch to custom");
  assert(folderIconMode.state.draftFolderIconSize.value === 96, "switching to custom should seed from the desktop draft size");
  folderIconMode.config.changeDraftFolderIconSize(10);
  assert(folderIconMode.state.draftFolderIconSize.value === 128, "folder icon draft size should clamp after step changes");
  const windowEffectMode = createSettingsConfig({
    draftWindowEffectMaterial: WINDOW_EFFECT_MATERIAL_ACRYLIC,
    windowEffectsSupport: { supportsAcrylic: true, supportsMica: false, supportsMicaAlt: false },
  });
  windowEffectMode.config.setDraftWindowEffectMaterial(WINDOW_EFFECT_MATERIAL_MICA_ALT);
  assert(windowEffectMode.state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_ACRYLIC, "unavailable window effect materials should not be selected");
  windowEffectMode.config.setDraftWindowEffectAppearance(WINDOW_EFFECT_APPEARANCE_LIGHT);
  assert(windowEffectMode.state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "window effect appearance should update from segmented controls");
  const backgroundMode = createSettingsConfig();
  backgroundMode.config.setDraftBackgroundRenderMode(BACKGROUND_RENDER_MODE_IMAGE);
  backgroundMode.config.setDraftBackgroundImageOpacity(120);
  assert(backgroundMode.state.draftBackgroundRenderMode.value === BACKGROUND_RENDER_MODE_IMAGE, "background render mode should update from segmented controls");
  assert(backgroundMode.state.draftBackgroundImageOpacity.value === 100, "background opacity should clamp from slider input");
  backgroundMode.config.changeDraftBackgroundImageOpacity(-120);
  assert(backgroundMode.state.draftBackgroundImageOpacity.value === 0, "background opacity step changes should clamp to the minimum");
  backgroundMode.state.draftBackgroundImagePath.value = "C:/Images/custom.png";
  backgroundMode.state.draftBackgroundImageUrl.value = "asset://custom";
  backgroundMode.config.clearDraftBackgroundImage();
  assert(backgroundMode.state.draftBackgroundImagePath.value === null, "clearing the draft background image should remove the custom path");
  assert(backgroundMode.state.draftBackgroundImageUrl.value === null, "clearing the draft background image should remove the custom url");

  const apply = createSettingsConfig({
    gridCols: 3,
    gridRows: 3,
    draftCols: 3,
    draftRows: 2,
    draftBackgroundRenderMode: BACKGROUND_RENDER_MODE_IMAGE,
    draftBackgroundImageOpacity: 67,
    draftBackgroundImagePath: "C:/Images/applied.webp",
    draftBackgroundImageUrl: "asset://applied",
    draftWindowEffectMaterial: WINDOW_EFFECT_MATERIAL_MICA_ALT,
    draftWindowEffectAppearance: WINDOW_EFFECT_APPEARANCE_LIGHT,
    pages: [makeItems(7)],
  });
  apply.config.applySettingsConfig();
  assert(apply.state.gridRows.value === 2 && apply.state.gridCols.value === 3, "desktop grid dimensions should apply from drafts");
  assert(apply.state.folderRows.value === 2 && apply.state.folderCols.value === 2, "folder grid dimensions should apply from drafts");
  assert(apply.state.iconSize.value === 72, "desktop icon size should apply from the draft value");
  assert(apply.state.folderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_CUSTOM, "folder icon mode should apply from the draft value");
  assert(apply.state.folderIconSize.value === 80, "folder icon size should apply from the draft value");
  assert(apply.state.isTextlessMode.value === false, "textless mode should apply from the draft value");
  assert(apply.state.backgroundRenderMode.value === BACKGROUND_RENDER_MODE_IMAGE, "background render mode should apply from the draft value");
  assert(apply.state.backgroundImageOpacity.value === 67, "background opacity should apply from the draft value");
  assert(apply.state.backgroundImagePath.value === "C:/Images/applied.webp", "background image path should apply from the draft value");
  assert(apply.state.backgroundImageUrl.value === "asset://applied", "background image url should apply from the draft value");
  assert(apply.state.windowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA_ALT, "window effect material should apply from the draft value");
  assert(apply.state.windowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "window effect appearance should apply from the draft value");
  assert(apply.calls.commitPages.length === 1, "applying settings should commit repacked pages");
  assert(apply.calls.commitPages[0].length === 2, "shrinking page capacity should overflow items to another page");
  assert(apply.calls.commitPageIndex.join(",") === "2", "applying settings should reclamp the desktop page index");
  assert(apply.calls.commitSearchPageIndex.join(",") === "1", "applying settings should reclamp the search page index");
  assert(apply.calls.commitFolderPageIndex.join(",") === "1", "applying settings should reclamp the folder page index");
  assert(apply.calls.schedulePageGridMetrics === 1, "applying settings should schedule page metrics");
  assert(apply.calls.applyNativeWindowEffects === 1, "applying settings should refresh native window effects");
  assert(apply.calls.closeSettingsPanel === 1, "applying settings from the panel should close it");

  const textless = createSettingsConfig({
    draftIsTextlessMode: true,
    isTextlessMode: false,
  });
  textless.config.applySettingsConfig();
  assert(textless.state.isTextlessMode.value === true, "applying settings should commit draft textless mode");
  assert(textless.state.draftIsTextlessMode.value === true, "applying settings should sync the textless draft");

  const dragActive = createSettingsConfig({ isDragActive: true });
  dragActive.config.applyGridConfig();
  assert(dragActive.calls.commitPages.length === 0, "drag-active settings apply should not repack pages");
  assert(dragActive.calls.schedulePageGridMetrics === 1, "drag-active settings apply should still request metrics refresh");
}
