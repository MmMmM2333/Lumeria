import { createSettingsPanelState } from "./useLaunchpadViewAdapters.js";

export function runLaunchpadViewAdaptersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Launchpad view adapters test failed] ${message}`);
  };

  const expected = {
    changeDraftBackgroundBaseOpacity: () => {},
    draftBackgroundBaseColor: { value: "#112233" },
    draftBackgroundBaseOpacity: { value: 42 },
    setDraftBackgroundBaseColor: () => {},
    setDraftBackgroundBaseOpacity: () => {},
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
  assert(state.changeDraftBackgroundBaseOpacity === controller.changeDraftBackgroundBaseOpacity, "settings panel state should expose background base opacity stepping");
  assert(state.setDraftBackgroundBaseColor === controller.setDraftBackgroundBaseColor, "settings panel state should expose background base color setter");
  assert(state.setDraftBackgroundBaseOpacity === controller.setDraftBackgroundBaseOpacity, "settings panel state should expose background base opacity setter");
}
