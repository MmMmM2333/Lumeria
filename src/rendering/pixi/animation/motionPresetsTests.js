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
  assert(typeof motionPresets.folderOpenGhost.ease === "function", "folder open ghost ease should be a cubic-bezier function");
  assert(typeof motionPresets.folderClose.ease === "function", "folder close ease should be a cubic-bezier function");
  assert(typeof motionPresets.folderPreviewSettle.ease === "function", "folder preview settle ease should be a cubic-bezier function");
  assert(motionPresets.folderOpenGhost.ease(0) === 0 && motionPresets.folderOpenGhost.ease(1) === 1, "open ghost ease should start and end at rest");
  assert(motionPresets.folderClose.ease(0) === 0 && motionPresets.folderClose.ease(1) === 1, "close ease should start and end at rest");
  assert(motionPresets.folderPreviewSettle.ease(0) === 0 && motionPresets.folderPreviewSettle.ease(1) === 1, "preview settle ease should start and end at rest");
  assert(motionPresets.folderOpen.duration === 0.38, "folderOpen preset should preserve current duration");
  assert(motionPresets.folderOpenGhost.duration === 0.36, "folderOpenGhost preset should preserve current duration");
  assert(motionPresets.folderPanelClose.ease === motionEases.material, "folderPanelClose should use material close ease");
  assert(motionPresets.folderPanelClose.duration === 0.38, "folderPanelClose preset should preserve current duration");
  assert(motionPresets.folderPanelOpen.spring === motionSprings.folderPanelOpen, "folderPanelOpen should use the dedicated panel spring");
  assert(motionSprings.layout.stiffness === 190, "layout spring should preserve current stiffness");
  assert(motionSprings.handoff.stiffness === 340, "handoff spring should preserve current stiffness");
  assert(motionSprings.folderPanelOpen.stiffness > motionSprings.handoff.stiffness, "folder panel open spring should lead the icon handoff spring");

  const custom = getMotionPreset("fade", { duration: 0.2 });
  assert(custom.duration === 0.2 && custom.ease === motionPresets.fade.ease, "getMotionPreset should merge overrides");
}
