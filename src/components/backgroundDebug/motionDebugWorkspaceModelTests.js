import {
  createMotionDebugWorkspaceSession,
  isMotionDebugQuickPanelControl,
  isMotionDebugWorkspaceSection,
  MOTION_DEBUG_DEFAULT_PROFILE_ID,
  MOTION_DEBUG_QUICK_PANEL_CONTROLS,
  MOTION_DEBUG_WORKSPACE_MODE_DOCK,
  MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN,
  MOTION_DEBUG_WORKSPACE_REGIONS,
  selectMotionDebugWorkspaceTarget,
  selectMotionDebugWorkspaceTrack,
  setMotionDebugWorkspaceFilters,
  toggleMotionDebugWorkspacePin,
} from "./motionDebugWorkspaceModel.js";

export function runMotionDebugWorkspaceModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion debug workspace model test failed] ${message}`);
  };

  const quickIds = MOTION_DEBUG_QUICK_PANEL_CONTROLS.map((control) => control.id);
  assert(quickIds.includes("record"), "quick panel should expose record toggle");
  assert(quickIds.includes("overlay"), "quick panel should expose overlay toggle");
  assert(quickIds.includes("time-scale"), "quick panel should expose time scale control");
  assert(quickIds.includes("replay-capture"), "quick panel should expose replay capture command");
  assert(quickIds.includes("open-workspace"), "quick panel should expose workspace entry");
  assert(quickIds.includes("copy-ai-report"), "quick panel should expose AI report copy");
  assert(!quickIds.includes("timeline"), "quick panel should not own timeline analysis");
  assert(!quickIds.includes("curves"), "quick panel should not own curve analysis");
  assert(isMotionDebugQuickPanelControl("record"), "quick panel control lookup should accept known controls");
  assert(!isMotionDebugQuickPanelControl("inspector"), "quick panel control lookup should reject workspace sections");

  const regions = new Map(MOTION_DEBUG_WORKSPACE_REGIONS.map((region) => [region.id, region]));
  assert(regions.get("left")?.sections.includes("layer-tree"), "workspace left region should own layer tree");
  assert(regions.get("left")?.sections.includes("target-tree"), "workspace left region should own target tree");
  assert(regions.get("center")?.sections.includes("timeline"), "workspace center region should own timeline");
  assert(regions.get("center")?.sections.includes("curves"), "workspace center region should own curves");
  assert(regions.get("right")?.sections.includes("inspector"), "workspace right region should own inspector");
  assert(regions.get("right")?.sections.includes("ai-export"), "workspace right region should own AI export");
  assert(isMotionDebugWorkspaceSection("lane-breakdown"), "workspace section lookup should accept inspector details");
  assert(!isMotionDebugWorkspaceSection("record"), "workspace section lookup should reject quick controls");

  const defaults = createMotionDebugWorkspaceSession();
  assert(defaults.captureProfileId === MOTION_DEBUG_DEFAULT_PROFILE_ID, "session should default to the default visual profile");
  assert(defaults.isOpen === false, "workspace should default closed");
  assert(defaults.mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK, "workspace should default to dock mode");
  assert(defaults.selectedTarget === null, "workspace should default without selected target");
  assert(defaults.selectedTrack === null, "workspace should default without selected track");
  assert(defaults.selectedTimeMs === 0, "workspace should default to time zero");
  assert(defaults.filters.preset === "all" && defaults.filters.query === "", "workspace filters should default to all");
  assert(Array.isArray(defaults.pinnedTargets) && defaults.pinnedTargets.length === 0, "workspace pins should default empty");

  const normalized = createMotionDebugWorkspaceSession({
    captureProfileId: " alpha-focus ",
    filters: { preset: " active ", query: " panel " },
    isOpen: true,
    mode: MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN,
    pinnedTargets: [
      { targetId: 3, sourceLabel: "folder.panel", rawTarget: { y: 1 } },
      { targetId: 3, sourceLabel: "folder.panel" },
      "desktop.icon.node",
    ],
    selectedTarget: { kind: "FolderPanel", layer: "folder", sourceLabel: "folder.panel", targetId: "3" },
    selectedTimeMs: -20,
    selectedTrack: { lane: "base", laneKey: "panel-y", prop: "y", sourceLabel: "folder.panel", targetId: 3 },
  });
  assert(normalized.captureProfileId === "alpha-focus", "session should trim capture profile id");
  assert(normalized.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN, "session should preserve fullscreen mode");
  assert(normalized.selectedTimeMs === 0, "session should clamp negative selected time");
  assert(normalized.filters.preset === "active" && normalized.filters.query === "panel", "session should normalize filters");
  assert(normalized.selectedTarget.targetId === 3, "session should normalize selected target ids");
  assert(!("rawTarget" in normalized.pinnedTargets[0]), "pins should not preserve raw target object references");
  assert(normalized.pinnedTargets.length === 2, "pins should be deduplicated by target identity");
  assert(normalized.selectedTrack.prop === "y" && normalized.selectedTrack.laneKey === "panel-y", "session should normalize selected track");

  const unknownMode = createMotionDebugWorkspaceSession({ mode: "float" });
  assert(unknownMode.mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK, "unknown workspace modes should fall back to dock");

  const selectedTarget = selectMotionDebugWorkspaceTarget(defaults, { sourceLabel: "desktop.icon.node", layer: "desktop" });
  assert(selectedTarget.selectedTarget.sourceLabel === "desktop.icon.node", "target selection should set selected target");
  const clearedTarget = selectMotionDebugWorkspaceTarget(selectedTarget, null);
  assert(clearedTarget.selectedTarget === null && clearedTarget.selectedTrack === null, "clearing target should clear track selection");

  const selectedTrack = selectMotionDebugWorkspaceTrack(defaults, {
    lane: "factor",
    laneKey: "hover-scale",
    prop: "scale",
    sourceLabel: "desktop.icon.hover",
  });
  assert(selectedTrack.selectedTrack.lane === "factor", "track selection should preserve lane");
  assert(selectedTrack.selectedTarget.sourceLabel === "desktop.icon.hover", "track selection should infer selected target");
  const switchedTarget = selectMotionDebugWorkspaceTarget(selectedTrack, { sourceLabel: "folder.panel" });
  assert(switchedTarget.selectedTrack === null, "selecting another target should clear stale track selection");

  const filtered = setMotionDebugWorkspaceFilters(defaults, { preset: "warnings", query: "jiggle" });
  assert(filtered.filters.preset === "warnings" && filtered.filters.query === "jiggle", "filter setter should normalize filter patch");

  const pinned = toggleMotionDebugWorkspacePin(defaults, { targetId: 9, sourceLabel: "desktop.icon.jiggle" });
  assert(pinned.pinnedTargets.length === 1, "pin toggle should add a target");
  assert(pinned.pinnedTargets[0].key === "id:9", "pin toggle should store a stable key");
  const unpinned = toggleMotionDebugWorkspacePin(pinned, { targetId: 9 });
  assert(unpinned.pinnedTargets.length === 0, "pin toggle should remove an existing target");
}
