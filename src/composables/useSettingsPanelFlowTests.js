import { ref } from "vue";
import {
  BACKGROUND_RENDER_MODE_IMAGE,
  BACKGROUND_RENDER_MODE_MATERIAL,
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
    backgroundRenderMode: ref(overrides.backgroundRenderMode ?? BACKGROUND_RENDER_MODE_IMAGE),
    backgroundImageOpacity: ref(overrides.backgroundImageOpacity ?? 58),
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
    draftBackgroundRenderMode: ref(overrides.draftBackgroundRenderMode ?? BACKGROUND_RENDER_MODE_MATERIAL),
    draftBackgroundImageOpacity: ref(overrides.draftBackgroundImageOpacity ?? 12),
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
    assert(state.draftBackgroundRenderMode.value === BACKGROUND_RENDER_MODE_IMAGE, "opening settings should reset background render draft");
    assert(state.draftBackgroundImageOpacity.value === 58, "opening settings should reset background opacity draft");
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
    state.draftBackgroundRenderMode.value = BACKGROUND_RENDER_MODE_MATERIAL;
    state.draftBackgroundImageOpacity.value = 4;
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
    assert(state.draftBackgroundRenderMode.value === BACKGROUND_RENDER_MODE_IMAGE, "closing settings should discard background render draft");
    assert(state.draftBackgroundImageOpacity.value === 58, "closing settings should discard background opacity draft");
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
