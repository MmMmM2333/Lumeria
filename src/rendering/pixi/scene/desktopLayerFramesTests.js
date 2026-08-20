import {
  applyDesktopLayerFrameUpdates,
  getDesktopLayerFrameFields,
  makeDesktopLayerFrameUpdates,
} from "./desktopLayerFrames.js";

function makeFrame(lane) {
  return Object.fromEntries(getDesktopLayerFrameFields(lane).map((field) => [field, null]));
}

export function runDesktopLayerFramesTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[desktop layer frames test failed] ${message}`);
  };

  const buildCalls = [];
  const builders = Object.fromEntries([
    "structure",
    "interaction",
    "visual",
    "diagnostics",
    "handoff",
  ].map((lane) => [lane, () => {
    buildCalls.push(lane);
    return makeFrame(lane);
  }]));

  const visualUpdates = makeDesktopLayerFrameUpdates({
    requiresDiagnosticsUpdate: false,
    requiresHandoffUpdate: false,
    requiresInteractionUpdate: false,
    requiresStructureUpdate: false,
    requiresVisualUpdate: true,
  }, builders);
  assert(buildCalls.join(",") === "visual", "a visual invalidation must build only the visual frame");
  assert(visualUpdates.length === 1 && visualUpdates[0].lane === "visual", "a visual invalidation should schedule one visual update");

  buildCalls.length = 0;
  const structureUpdates = makeDesktopLayerFrameUpdates({
    requiresDiagnosticsUpdate: true,
    requiresHandoffUpdate: true,
    requiresInteractionUpdate: true,
    requiresStructureUpdate: true,
    requiresVisualUpdate: true,
  }, builders);
  assert(buildCalls.join(",") === "structure", "structure invalidation must subsume all narrower lanes");
  assert(structureUpdates.length === 1 && structureUpdates[0].lane === "structure", "structure invalidation should schedule one structural update");

  buildCalls.length = 0;
  const narrowUpdates = makeDesktopLayerFrameUpdates({
    requiresDiagnosticsUpdate: false,
    requiresHandoffUpdate: true,
    requiresInteractionUpdate: true,
    requiresStructureUpdate: false,
    requiresVisualUpdate: true,
  }, builders);
  assert(buildCalls.join(",") === "interaction,visual,handoff", "narrow invalidations should build only requested lane frames in commit order");

  const applied = [];
  const layer = {
    tickFolderHandoff: () => { applied.push("handoff"); return { handoffReconciliations: 1 }; },
    updateDiagnostics: () => { applied.push("diagnostics"); },
    updateInteraction: () => { applied.push("interaction"); },
    updateStructure: () => { applied.push("structure"); return { fullPlanBuilds: 1, reconciledNodes: 7 }; },
    updateVisual: () => { applied.push("visual"); },
  };
  const work = applyDesktopLayerFrameUpdates(layer, narrowUpdates);
  assert(applied.join(",") === "interaction,visual,handoff", "lane updates should be applied in the planned order");
  assert(work.interactionFrames === 1 && work.visualFrames === 1 && work.handoffFrames === 1, "work diagnostics should count built lane frames");
  assert(work.structureFrames === 0 && work.diagnosticsFrames === 0, "work diagnostics should keep unbuilt lanes at zero");
  assert(work.fullPlanBuilds === 0 && work.handoffReconciliations === 1, "work diagnostics should merge layer work without inventing plan builds");
}
