import {
  getMotionPreset,
  motionEases,
  motionPresets,
  motionSprings,
} from "./motionPresets.js";

export function runMotionPresetsTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Motion presets test failed] ${message}`);
  };

  assert(typeof motionEases.emphasized === "function", "emphasized ease should be callable");
  assert(motionEases.emphasized(0) === 0 && motionEases.emphasized(1) === 1, "emphasized ease should start and end at rest");
  const fade = motionPresets.fade;
  const folderClose = motionPresets.folderClose;
  const folderOpen = motionPresets.folderOpen;
  const folderOpenGhost = motionPresets.folderOpenGhost;
  const folderPanelClose = motionPresets.folderPanelClose;
  const folderPanelOpen = motionPresets.folderPanelOpen;
  const folderPreviewSettle = motionPresets.folderPreviewSettle;
  assert(
    fade && folderClose && folderOpen && folderOpenGhost && folderPanelClose && folderPanelOpen && folderPreviewSettle,
    "named motion presets should exist",
  );
  assert(typeof folderOpenGhost.ease === "function", "folder open ghost ease should be a cubic-bezier function");
  assert(typeof folderClose.ease === "function", "folder close ease should be a cubic-bezier function");
  assert(typeof folderPreviewSettle.ease === "function", "folder preview settle ease should be a cubic-bezier function");
  assert(folderOpenGhost.ease(0) === 0 && folderOpenGhost.ease(1) === 1, "open ghost ease should start and end at rest");
  assert(folderClose.ease(0) === 0 && folderClose.ease(1) === 1, "close ease should start and end at rest");
  assert(folderPreviewSettle.ease(0) === 0 && folderPreviewSettle.ease(1) === 1, "preview settle ease should start and end at rest");
  assert(folderOpen.duration === 0.38, "folderOpen preset should preserve current duration");
  assert(folderOpenGhost.duration === 0.36, "folderOpenGhost preset should preserve current duration");
  assert(folderPanelClose.ease === motionEases.material, "folderPanelClose should use material close ease");
  assert(folderPanelClose.duration === 0.38, "folderPanelClose preset should preserve current duration");
  assert(folderPanelOpen.spring === motionSprings.folderPanelOpen, "folderPanelOpen should use the dedicated panel spring");
  assert(motionSprings.layout.stiffness === 190, "layout spring should preserve current stiffness");
  assert(motionSprings.handoff.stiffness === 340, "handoff spring should preserve current stiffness");
  assert(motionSprings.folderPanelOpen.stiffness > motionSprings.handoff.stiffness, "folder panel open spring should lead the icon handoff spring");

  const custom = getMotionPreset("fade", { duration: 0.2 });
  assert(custom.duration === 0.2 && custom.ease === fade.ease, "getMotionPreset should merge overrides");
}
