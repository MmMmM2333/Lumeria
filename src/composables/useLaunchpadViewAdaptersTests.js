import { createSettingsPanelState } from "./useLaunchpadViewAdapters.js";

export function runLaunchpadViewAdaptersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad view adapters test failed] ${message}`);
  };

  const expected = {
    changeDraftBackgroundBaseOpacity: () => {},
    draftBackgroundAcrylicAppearance: { value: "system" },
    draftBackgroundAcrylicDarkParams: { value: { brightness: 0.8 } },
    draftBackgroundAcrylicLightParams: { value: { brightness: 1 } },
    draftBackgroundBaseColor: { value: "#112233" },
    draftBackgroundBaseOpacity: { value: 42 },
    draftBackgroundBlurStrength: { value: 68 },
    draftBackgroundDarkenColor: { value: "#1c1c1c" },
    draftBackgroundDarkenStrength: { value: 37 },
    draftBackgroundImageLayout: { value: "fill" },
    liveDesktopBackgroundSupport: { value: { supportsLiveDesktopBackground: false, reason: "probeFailed" } },
    liveDesktopRuntimeStatus: { value: { phase: "running", detail: "adapter 0" } },
    refreshLiveDesktopRuntimeStatus: () => {},
    syncLiveDesktopBackgroundRuntime: () => {},
    setDraftBackgroundBaseColor: () => {},
    setDraftBackgroundBaseOpacity: () => {},
    setDraftBackgroundBlurStrength: () => {},
    setDraftBackgroundDarkenColor: () => {},
    setDraftBackgroundDarkenStrength: () => {},
    setDraftBackgroundAcrylicAppearance: () => {},
    setDraftBackgroundAcrylicParam: () => {},
    resetDraftBackgroundAcrylicParams: () => {},
    setDraftBackgroundImageLayout: () => {},
  };
  const controller = new Proxy(expected, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];
      return () => {};
    },
  });

  const state = createSettingsPanelState(controller, "0.1.0");

  assert(state.draftBackgroundBaseColor === controller.draftBackgroundBaseColor, "settings panel state should expose background base color draft");
  assert(state.draftBackgroundBaseOpacity === controller.draftBackgroundBaseOpacity, "settings panel state should expose background base opacity draft");
  assert(state.draftBackgroundAcrylicAppearance === controller.draftBackgroundAcrylicAppearance, "settings panel state should expose acrylic appearance draft");
  assert(state.draftBackgroundAcrylicDarkParams === controller.draftBackgroundAcrylicDarkParams, "settings panel state should expose acrylic dark params draft");
  assert(state.draftBackgroundAcrylicLightParams === controller.draftBackgroundAcrylicLightParams, "settings panel state should expose acrylic light params draft");
  assert(state.draftBackgroundBlurStrength === controller.draftBackgroundBlurStrength, "settings panel state should expose background blur strength draft");
  assert(state.draftBackgroundDarkenColor === controller.draftBackgroundDarkenColor, "settings panel state should expose background darken color draft");
  assert(state.draftBackgroundDarkenStrength === controller.draftBackgroundDarkenStrength, "settings panel state should expose background darken strength draft");
  assert(state.draftBackgroundImageLayout === controller.draftBackgroundImageLayout, "settings panel state should expose background image layout draft");
  assert(state.liveDesktopBackgroundSupport === controller.liveDesktopBackgroundSupport, "settings panel state should expose live desktop support");
  assert(state.liveDesktopRuntimeStatus === controller.liveDesktopRuntimeStatus, "settings panel state should expose live desktop runtime status");
  assert(state.refreshLiveDesktopRuntimeStatus === controller.refreshLiveDesktopRuntimeStatus, "settings panel state should expose live desktop runtime refresh");
  assert(state.syncLiveDesktopBackgroundRuntime === controller.syncLiveDesktopBackgroundRuntime, "settings panel state should expose live desktop runtime sync");
  assert(state.changeDraftBackgroundBaseOpacity === controller.changeDraftBackgroundBaseOpacity, "settings panel state should expose background base opacity stepping");
  assert(state.setDraftBackgroundBaseColor === controller.setDraftBackgroundBaseColor, "settings panel state should expose background base color setter");
  assert(state.setDraftBackgroundBaseOpacity === controller.setDraftBackgroundBaseOpacity, "settings panel state should expose background base opacity setter");
  assert(state.setDraftBackgroundBlurStrength === controller.setDraftBackgroundBlurStrength, "settings panel state should expose background blur strength setter");
  assert(state.setDraftBackgroundDarkenColor === controller.setDraftBackgroundDarkenColor, "settings panel state should expose background darken color setter");
  assert(state.setDraftBackgroundDarkenStrength === controller.setDraftBackgroundDarkenStrength, "settings panel state should expose background darken strength setter");
  assert(state.setDraftBackgroundAcrylicAppearance === controller.setDraftBackgroundAcrylicAppearance, "settings panel state should expose acrylic appearance setter");
  assert(state.setDraftBackgroundAcrylicParam === controller.setDraftBackgroundAcrylicParam, "settings panel state should expose acrylic param setter");
  assert(state.resetDraftBackgroundAcrylicParams === controller.resetDraftBackgroundAcrylicParams, "settings panel state should expose acrylic params reset");
  assert(state.setDraftBackgroundImageLayout === controller.setDraftBackgroundImageLayout, "settings panel state should expose background image layout setter");
}
