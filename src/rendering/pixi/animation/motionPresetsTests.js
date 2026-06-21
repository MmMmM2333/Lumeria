import {
  getMotionPreset,
  motionEases,
  motionPresets,
  motionSprings,
} from "./motionPresets.js";

export function runMotionPresetsTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion presets test failed] ${message}`);
  };

  assert(typeof motionEases.emphasized === "function", "emphasized ease should be callable");
  assert(motionEases.emphasized(0) === 0 && motionEases.emphasized(1) === 1, "emphasized ease should start and end at rest");
  assert(motionPresets.folderOpen.duration === 0.38, "folderOpen preset should preserve current duration");
  assert(motionPresets.folderPanelClose.ease === motionEases.material, "folderPanelClose should use material close ease");
  assert(motionPresets.folderPanelOpen.spring === motionSprings.folderPanelOpen, "folderPanelOpen should use the dedicated panel spring");
  assert(motionSprings.layout.stiffness === 190, "layout spring should preserve current stiffness");
  assert(motionSprings.handoff.stiffness === 340, "handoff spring should preserve current stiffness");
  assert(motionSprings.folderPanelOpen.stiffness > motionSprings.handoff.stiffness, "folder panel open spring should lead the icon handoff spring");

  const custom = getMotionPreset("fade", { duration: 0.2 });
  assert(custom.duration === 0.2 && custom.ease === motionPresets.fade.ease, "getMotionPreset should merge overrides");
}
