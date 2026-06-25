import {
  createDialogState,
  createFolderOverlayState,
  createOverlayState,
  createSettingsPanelState,
} from "./useLaunchpadViewAdapters.js";

export function runLaunchpadViewAdaptersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad view adapters test failed] ${message}`);
  };

  const settingsPanel = {
    changeDraftBackgroundBaseOpacity: () => {},
    draftBackgroundAcrylicAppearance: { value: "system" },
    draftBackgroundAcrylicBlurStrength: { value: 74 },
    draftBackgroundAcrylicDarkParams: { value: { brightness: 0.8 } },
    draftBackgroundAcrylicLightParams: { value: { brightness: 1 } },
    draftBackgroundBaseColor: { value: "#112233" },
    draftBackgroundBaseOpacity: { value: 42 },
    draftBackgroundBlurStrength: { value: 68 },
    draftBackgroundDarkenColor: { value: "#1c1c1c" },
    draftBackgroundDarkenStrength: { value: 37 },
    draftBackgroundImageLayout: { value: "fill" },
    draftMainWindowShortcut: { value: "control+alt+KeyL" },
    draftWindowMode: { value: "windowed" },
    isApplyingSettingsConfig: { value: false },
    liveDesktopBackgroundSupport: { value: { supportsLiveDesktopBackground: false, reason: "probeFailed" } },
    liveDesktopRuntimeStatus: { value: { phase: "running", detail: "adapter 0" } },
    mainWindowShortcutError: { value: "" },
    refreshLiveDesktopRuntimeStatus: () => {},
    restartLiveDesktopBackgroundRuntime: () => {},
    syncLiveDesktopBackgroundRuntime: () => {},
    setDraftBackgroundBaseColor: () => {},
    setDraftBackgroundBaseOpacity: () => {},
    setDraftBackgroundBlurStrength: () => {},
    setDraftBackgroundAcrylicBlurStrength: () => {},
    setDraftBackgroundDarkenColor: () => {},
    setDraftBackgroundDarkenStrength: () => {},
    setDraftBackgroundAcrylicAppearance: () => {},
    setDraftBackgroundAcrylicParam: () => {},
    resetDraftBackgroundAcrylicParams: () => {},
    setDraftBackgroundImageLayout: () => {},
    setDraftMainWindowShortcut: () => {},
    setMainWindowShortcutCaptureActive: () => {},
    setDraftWindowMode: () => {},
  };

  const state = createSettingsPanelState(settingsPanel, "0.1.0");

  assert(state.appVersion === "0.1.0", "settings panel state should add the app version");
  assert(state.draftBackgroundBaseColor === settingsPanel.draftBackgroundBaseColor, "settings panel state should expose background base color draft");
  assert(state.draftBackgroundBaseOpacity === settingsPanel.draftBackgroundBaseOpacity, "settings panel state should expose background base opacity draft");
  assert(state.draftBackgroundAcrylicAppearance === settingsPanel.draftBackgroundAcrylicAppearance, "settings panel state should expose acrylic appearance draft");
  assert(state.draftBackgroundAcrylicBlurStrength === settingsPanel.draftBackgroundAcrylicBlurStrength, "settings panel state should expose acrylic blur strength draft");
  assert(state.draftBackgroundAcrylicDarkParams === settingsPanel.draftBackgroundAcrylicDarkParams, "settings panel state should expose acrylic dark params draft");
  assert(state.draftBackgroundAcrylicLightParams === settingsPanel.draftBackgroundAcrylicLightParams, "settings panel state should expose acrylic light params draft");
  assert(state.draftBackgroundBlurStrength === settingsPanel.draftBackgroundBlurStrength, "settings panel state should expose background blur strength draft");
  assert(state.draftBackgroundDarkenColor === settingsPanel.draftBackgroundDarkenColor, "settings panel state should expose background darken color draft");
  assert(state.draftBackgroundDarkenStrength === settingsPanel.draftBackgroundDarkenStrength, "settings panel state should expose background darken strength draft");
  assert(state.draftBackgroundImageLayout === settingsPanel.draftBackgroundImageLayout, "settings panel state should expose background image layout draft");
  assert(state.draftMainWindowShortcut === settingsPanel.draftMainWindowShortcut, "settings panel state should expose main window shortcut draft");
  assert(state.draftWindowMode === settingsPanel.draftWindowMode, "settings panel state should expose window mode draft");
  assert(state.isApplyingSettingsConfig === settingsPanel.isApplyingSettingsConfig, "settings panel state should expose settings apply state");
  assert(state.liveDesktopBackgroundSupport === settingsPanel.liveDesktopBackgroundSupport, "settings panel state should expose live desktop support");
  assert(state.liveDesktopRuntimeStatus === settingsPanel.liveDesktopRuntimeStatus, "settings panel state should expose live desktop runtime status");
  assert(state.mainWindowShortcutError === settingsPanel.mainWindowShortcutError, "settings panel state should expose main window shortcut errors");
  assert(state.refreshLiveDesktopRuntimeStatus === settingsPanel.refreshLiveDesktopRuntimeStatus, "settings panel state should expose live desktop runtime refresh");
  assert(state.restartLiveDesktopBackgroundRuntime === settingsPanel.restartLiveDesktopBackgroundRuntime, "settings panel state should expose live desktop runtime restart");
  assert(state.syncLiveDesktopBackgroundRuntime === settingsPanel.syncLiveDesktopBackgroundRuntime, "settings panel state should expose live desktop runtime sync");
  assert(state.changeDraftBackgroundBaseOpacity === settingsPanel.changeDraftBackgroundBaseOpacity, "settings panel state should expose background base opacity stepping");
  assert(state.setDraftBackgroundBaseColor === settingsPanel.setDraftBackgroundBaseColor, "settings panel state should expose background base color setter");
  assert(state.setDraftBackgroundBaseOpacity === settingsPanel.setDraftBackgroundBaseOpacity, "settings panel state should expose background base opacity setter");
  assert(state.setDraftBackgroundBlurStrength === settingsPanel.setDraftBackgroundBlurStrength, "settings panel state should expose background blur strength setter");
  assert(state.setDraftBackgroundAcrylicBlurStrength === settingsPanel.setDraftBackgroundAcrylicBlurStrength, "settings panel state should expose acrylic blur strength setter");
  assert(state.setDraftBackgroundDarkenColor === settingsPanel.setDraftBackgroundDarkenColor, "settings panel state should expose background darken color setter");
  assert(state.setDraftBackgroundDarkenStrength === settingsPanel.setDraftBackgroundDarkenStrength, "settings panel state should expose background darken strength setter");
  assert(state.setDraftBackgroundAcrylicAppearance === settingsPanel.setDraftBackgroundAcrylicAppearance, "settings panel state should expose acrylic appearance setter");
  assert(state.setDraftBackgroundAcrylicParam === settingsPanel.setDraftBackgroundAcrylicParam, "settings panel state should expose acrylic param setter");
  assert(state.resetDraftBackgroundAcrylicParams === settingsPanel.resetDraftBackgroundAcrylicParams, "settings panel state should expose acrylic params reset");
  assert(state.setDraftBackgroundImageLayout === settingsPanel.setDraftBackgroundImageLayout, "settings panel state should expose background image layout setter");
  assert(state.setDraftMainWindowShortcut === settingsPanel.setDraftMainWindowShortcut, "settings panel state should expose main window shortcut setter");
  assert(state.setMainWindowShortcutCaptureActive === settingsPanel.setMainWindowShortcutCaptureActive, "settings panel state should expose main window shortcut capture state setter");
  assert(state.setDraftWindowMode === settingsPanel.setDraftWindowMode, "settings panel state should expose window mode setter");

  const dialogs = { closeWarningDialog: () => {}, warningDialog: { value: null } };
  const folderOverlay = { renderedFolder: { value: null }, commitOpenFolder: () => {} };
  const overlays = { launchGhost: { value: null } };
  assert(createDialogState(dialogs) === dialogs, "dialog adapter should consume the dialog domain directly");
  assert(createFolderOverlayState(folderOverlay) === folderOverlay, "folder overlay adapter should consume the folder overlay domain directly");
  assert(createOverlayState(overlays) === overlays, "overlay adapter should consume the overlay domain directly");
}
