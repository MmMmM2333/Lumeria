import { ref } from "vue";
import {
  BACKGROUND_ACRYLIC_APPEARANCE_DARK,
  BACKGROUND_ACRYLIC_APPEARANCE_LIGHT,
  BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM,
  BACKGROUND_EFFECT_DIMMED,
  BACKGROUND_EFFECT_NONE,
  BACKGROUND_IMAGE_LAYOUT_CENTER,
  BACKGROUND_IMAGE_LAYOUT_FILL,
  BACKGROUND_IMAGE_LAYOUT_TILE,
  BACKGROUND_SOURCE_CUSTOM_IMAGE,
  BACKGROUND_SOURCE_SYSTEM_MATERIAL,
  DEFAULT_BACKGROUND_BASE_COLOR,
  DEFAULT_BACKGROUND_BASE_OPACITY,
  DEFAULT_BACKGROUND_BLUR_STRENGTH,
  DEFAULT_BACKGROUND_DARKEN_COLOR,
  DEFAULT_BACKGROUND_DARKEN_STRENGTH,
  createDefaultBackgroundAcrylicParams,
  FOLDER_ICON_SIZE_MODE_CUSTOM,
  FOLDER_ICON_SIZE_MODE_GLOBAL,
  WINDOW_EFFECT_APPEARANCE_DARK,
  WINDOW_EFFECT_APPEARANCE_LIGHT,
  WINDOW_EFFECT_MATERIAL_ACRYLIC,
  WINDOW_EFFECT_MATERIAL_MICA_ALT,
} from "./useLaunchpadSettingsConfig.js";
import { useSettingsPanelFlow } from "./useSettingsPanelFlow.js";

function withMockWindow(run) {
  const originalWindow = globalThis.window;
  const timers = [];
  globalThis.window = {
    clearTimeout: () => {},
    innerHeight: 900,
    innerWidth: 1200,
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  };

  try {
    run(timers);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

function createSettingsPanelFlowHarness(overrides = {}) {
  const state = {
    gridRows: ref(overrides.gridRows ?? 4),
    gridCols: ref(overrides.gridCols ?? 6),
    folderRows: ref(overrides.folderRows ?? 3),
    folderCols: ref(overrides.folderCols ?? 5),
    iconSize: ref(overrides.iconSize ?? 72),
    folderIconSizeMode: ref(overrides.folderIconSizeMode ?? FOLDER_ICON_SIZE_MODE_GLOBAL),
    folderIconSize: ref(overrides.folderIconSize ?? 72),
    isTextlessMode: ref(overrides.isTextlessMode ?? true),
    backgroundBaseColor: ref(overrides.backgroundBaseColor ?? "#334455"),
    backgroundBaseOpacity: ref(overrides.backgroundBaseOpacity ?? 74),
    backgroundSource: ref(overrides.backgroundSource ?? BACKGROUND_SOURCE_CUSTOM_IMAGE),
    backgroundEffect: ref(overrides.backgroundEffect ?? BACKGROUND_EFFECT_DIMMED),
    backgroundImageOpacity: ref(overrides.backgroundImageOpacity ?? 58),
    backgroundImageLayout: ref(overrides.backgroundImageLayout ?? BACKGROUND_IMAGE_LAYOUT_TILE),
    backgroundBlurStrength: ref(overrides.backgroundBlurStrength ?? 76),
    backgroundDarkenColor: ref(overrides.backgroundDarkenColor ?? "#223344"),
    backgroundDarkenStrength: ref(overrides.backgroundDarkenStrength ?? 62),
    backgroundAcrylicAppearance: ref(overrides.backgroundAcrylicAppearance ?? BACKGROUND_ACRYLIC_APPEARANCE_LIGHT),
    backgroundAcrylicDarkParams: ref(overrides.backgroundAcrylicDarkParams ?? { ...createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_DARK), brightness: 0.7 }),
    backgroundAcrylicLightParams: ref(overrides.backgroundAcrylicLightParams ?? { ...createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT), brightness: 1.2 }),
    backgroundImagePath: ref(overrides.backgroundImagePath ?? "C:/Images/current.png"),
    backgroundImageUrl: ref(overrides.backgroundImageUrl ?? "asset://current"),
    windowEffectMaterial: ref(overrides.windowEffectMaterial ?? WINDOW_EFFECT_MATERIAL_MICA_ALT),
    windowEffectAppearance: ref(overrides.windowEffectAppearance ?? WINDOW_EFFECT_APPEARANCE_LIGHT),
    draftRows: ref(overrides.draftRows ?? 8),
    draftCols: ref(overrides.draftCols ?? 10),
    draftFolderRows: ref(overrides.draftFolderRows ?? 6),
    draftFolderCols: ref(overrides.draftFolderCols ?? 8),
    draftIconSize: ref(overrides.draftIconSize ?? 128),
    draftFolderIconSizeMode: ref(overrides.draftFolderIconSizeMode ?? FOLDER_ICON_SIZE_MODE_CUSTOM),
    draftFolderIconSize: ref(overrides.draftFolderIconSize ?? 120),
    draftIsTextlessMode: ref(overrides.draftIsTextlessMode ?? false),
    draftBackgroundBaseColor: ref(overrides.draftBackgroundBaseColor ?? DEFAULT_BACKGROUND_BASE_COLOR),
    draftBackgroundBaseOpacity: ref(overrides.draftBackgroundBaseOpacity ?? DEFAULT_BACKGROUND_BASE_OPACITY),
    draftBackgroundSource: ref(overrides.draftBackgroundSource ?? BACKGROUND_SOURCE_SYSTEM_MATERIAL),
    draftBackgroundEffect: ref(overrides.draftBackgroundEffect ?? BACKGROUND_EFFECT_NONE),
    draftBackgroundImageOpacity: ref(overrides.draftBackgroundImageOpacity ?? 12),
    draftBackgroundImageLayout: ref(overrides.draftBackgroundImageLayout ?? BACKGROUND_IMAGE_LAYOUT_FILL),
    draftBackgroundBlurStrength: ref(overrides.draftBackgroundBlurStrength ?? DEFAULT_BACKGROUND_BLUR_STRENGTH),
    draftBackgroundDarkenColor: ref(overrides.draftBackgroundDarkenColor ?? DEFAULT_BACKGROUND_DARKEN_COLOR),
    draftBackgroundDarkenStrength: ref(overrides.draftBackgroundDarkenStrength ?? DEFAULT_BACKGROUND_DARKEN_STRENGTH),
    draftBackgroundAcrylicAppearance: ref(overrides.draftBackgroundAcrylicAppearance ?? BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM),
    draftBackgroundAcrylicDarkParams: ref(overrides.draftBackgroundAcrylicDarkParams ?? createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_DARK)),
    draftBackgroundAcrylicLightParams: ref(overrides.draftBackgroundAcrylicLightParams ?? createDefaultBackgroundAcrylicParams(BACKGROUND_ACRYLIC_APPEARANCE_LIGHT)),
    draftBackgroundImagePath: ref(overrides.draftBackgroundImagePath ?? null),
    draftBackgroundImageUrl: ref(overrides.draftBackgroundImageUrl ?? null),
    draftWindowEffectMaterial: ref(overrides.draftWindowEffectMaterial ?? WINDOW_EFFECT_MATERIAL_ACRYLIC),
    draftWindowEffectAppearance: ref(overrides.draftWindowEffectAppearance ?? WINDOW_EFFECT_APPEARANCE_DARK),
  };
  const calls = {
    closeAddManagedAppPage: 0,
    closeScanResultDialog: 0,
  };
  const flow = useSettingsPanelFlow({
    closeAddManagedAppPage: () => {
      calls.closeAddManagedAppPage += 1;
    },
    closeScanResultDialog: () => {
      calls.closeScanResultDialog += 1;
    },
    isDragActive: () => Boolean(overrides.isDragActive),
    ...state,
  });

  return { calls, flow, state };
}

export function runSettingsPanelFlowTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Settings panel flow test failed] ${message}`);
  };

  withMockWindow(() => {
    const { calls, flow, state } = createSettingsPanelFlowHarness();

    flow.openSettingsPanel();
    assert(flow.isSettingsPanelOpen.value === true, "opening settings should show the panel");
    assert(state.draftRows.value === 4 && state.draftCols.value === 6, "opening settings should reset desktop grid drafts");
    assert(state.draftFolderRows.value === 3 && state.draftFolderCols.value === 5, "opening settings should reset folder grid drafts");
    assert(state.draftIconSize.value === 72, "opening settings should reset icon size draft");
    assert(state.draftFolderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_GLOBAL, "opening settings should reset folder icon mode draft");
    assert(state.draftFolderIconSize.value === 72, "opening settings should reset folder icon size draft");
    assert(state.draftIsTextlessMode.value === true, "opening settings should reset textless draft");
    assert(state.draftBackgroundBaseColor.value === "#334455", "opening settings should reset background base color draft");
    assert(state.draftBackgroundBaseOpacity.value === 74, "opening settings should reset background base opacity draft");
    assert(state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "opening settings should reset background source draft");
    assert(state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "opening settings should reset background effect draft");
    assert(state.draftBackgroundImageOpacity.value === 58, "opening settings should reset background opacity draft");
    assert(state.draftBackgroundImageLayout.value === BACKGROUND_IMAGE_LAYOUT_TILE, "opening settings should reset background image layout draft");
    assert(state.draftBackgroundBlurStrength.value === 76, "opening settings should reset background blur strength draft");
    assert(state.draftBackgroundDarkenColor.value === "#223344", "opening settings should reset background darken color draft");
    assert(state.draftBackgroundDarkenStrength.value === 62, "opening settings should reset background darken strength draft");
    assert(state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT, "opening settings should reset acrylic appearance draft");
    assert(state.draftBackgroundAcrylicDarkParams.value.brightness === 0.7, "opening settings should reset acrylic dark params draft");
    assert(state.draftBackgroundAcrylicLightParams.value.brightness === 1.2, "opening settings should reset acrylic light params draft");
    assert(state.draftBackgroundImagePath.value === "C:/Images/current.png", "opening settings should reset background image path draft");
    assert(state.draftBackgroundImageUrl.value === "asset://current", "opening settings should reset background image url draft");
    assert(state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA_ALT, "opening settings should reset window effect material draft");
    assert(state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "opening settings should reset window effect appearance draft");

    state.draftRows.value = 2;
    state.draftCols.value = 3;
    state.draftFolderRows.value = 2;
    state.draftFolderCols.value = 2;
    state.draftIconSize.value = 32;
    state.draftFolderIconSizeMode.value = FOLDER_ICON_SIZE_MODE_CUSTOM;
    state.draftFolderIconSize.value = 40;
    state.draftIsTextlessMode.value = false;
    state.draftBackgroundBaseColor.value = "#abcdef";
    state.draftBackgroundBaseOpacity.value = 3;
    state.draftBackgroundSource.value = BACKGROUND_SOURCE_SYSTEM_MATERIAL;
    state.draftBackgroundEffect.value = BACKGROUND_EFFECT_NONE;
    state.draftBackgroundImageOpacity.value = 4;
    state.draftBackgroundImageLayout.value = BACKGROUND_IMAGE_LAYOUT_CENTER;
    state.draftBackgroundBlurStrength.value = 5;
    state.draftBackgroundDarkenColor.value = "#666666";
    state.draftBackgroundDarkenStrength.value = 6;
    state.draftBackgroundAcrylicAppearance.value = BACKGROUND_ACRYLIC_APPEARANCE_SYSTEM;
    state.draftBackgroundAcrylicDarkParams.value = { ...state.draftBackgroundAcrylicDarkParams.value, brightness: 1.1 };
    state.draftBackgroundAcrylicLightParams.value = { ...state.draftBackgroundAcrylicLightParams.value, brightness: 0.9 };
    state.draftBackgroundImagePath.value = "C:/Images/draft.png";
    state.draftBackgroundImageUrl.value = "asset://draft";
    state.draftWindowEffectMaterial.value = WINDOW_EFFECT_MATERIAL_ACRYLIC;
    state.draftWindowEffectAppearance.value = WINDOW_EFFECT_APPEARANCE_DARK;

    flow.closeSettingsPanel();
    assert(flow.isSettingsPanelOpen.value === false, "closing settings should hide the panel");
    assert(state.draftRows.value === 4 && state.draftCols.value === 6, "closing settings should discard desktop grid drafts");
    assert(state.draftFolderRows.value === 3 && state.draftFolderCols.value === 5, "closing settings should discard folder grid drafts");
    assert(state.draftIconSize.value === 72, "closing settings should discard icon size draft");
    assert(state.draftFolderIconSizeMode.value === FOLDER_ICON_SIZE_MODE_GLOBAL, "closing settings should discard folder icon mode draft");
    assert(state.draftFolderIconSize.value === 72, "closing settings should discard folder icon size draft");
    assert(state.draftIsTextlessMode.value === true, "closing settings should discard textless draft");
    assert(state.draftBackgroundBaseColor.value === "#334455", "closing settings should discard background base color draft");
    assert(state.draftBackgroundBaseOpacity.value === 74, "closing settings should discard background base opacity draft");
    assert(state.draftBackgroundSource.value === BACKGROUND_SOURCE_CUSTOM_IMAGE, "closing settings should discard background source draft");
    assert(state.draftBackgroundEffect.value === BACKGROUND_EFFECT_DIMMED, "closing settings should discard background effect draft");
    assert(state.draftBackgroundImageOpacity.value === 58, "closing settings should discard background opacity draft");
    assert(state.draftBackgroundImageLayout.value === BACKGROUND_IMAGE_LAYOUT_TILE, "closing settings should discard background image layout draft");
    assert(state.draftBackgroundBlurStrength.value === 76, "closing settings should discard background blur strength draft");
    assert(state.draftBackgroundDarkenColor.value === "#223344", "closing settings should discard background darken color draft");
    assert(state.draftBackgroundDarkenStrength.value === 62, "closing settings should discard background darken strength draft");
    assert(state.draftBackgroundAcrylicAppearance.value === BACKGROUND_ACRYLIC_APPEARANCE_LIGHT, "closing settings should discard acrylic appearance draft");
    assert(state.draftBackgroundAcrylicDarkParams.value.brightness === 0.7, "closing settings should discard acrylic dark params draft");
    assert(state.draftBackgroundAcrylicLightParams.value.brightness === 1.2, "closing settings should discard acrylic light params draft");
    assert(state.draftBackgroundImagePath.value === "C:/Images/current.png", "closing settings should discard background image path draft");
    assert(state.draftBackgroundImageUrl.value === "asset://current", "closing settings should discard background image url draft");
    assert(state.draftWindowEffectMaterial.value === WINDOW_EFFECT_MATERIAL_MICA_ALT, "closing settings should discard window effect material draft");
    assert(state.draftWindowEffectAppearance.value === WINDOW_EFFECT_APPEARANCE_LIGHT, "closing settings should discard window effect appearance draft");
    assert(calls.closeAddManagedAppPage === 1, "closing settings should close add managed app flow");
    assert(calls.closeScanResultDialog === 1, "closing settings should close scan result dialog");
  });

  withMockWindow(() => {
    const { flow, state } = createSettingsPanelFlowHarness({ isDragActive: true });
    flow.openSettingsPanel();
    assert(flow.isSettingsPanelOpen.value === false, "drag-active settings should not open the panel");
    assert(state.draftRows.value === 8, "blocked settings open should not reset drafts");
  });
}
