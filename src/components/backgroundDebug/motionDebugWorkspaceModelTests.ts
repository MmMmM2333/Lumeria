import {
  buildMotionDebugWorkspaceCaptureProfile,
  closeMotionDebugWorkspace,
  createMotionDebugWorkspaceSession,
  isMotionDebugQuickPanelControl,
  isMotionDebugWorkspaceSection,
  MOTION_DEBUG_DEFAULT_PROFILE_ID,
  MOTION_DEBUG_QUICK_PANEL_CONTROLS,
  MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_DEFAULT,
  MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX,
  MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
  MOTION_DEBUG_WORKSPACE_MODE_DOCK,
  MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN,
  MOTION_DEBUG_WORKSPACE_REGIONS,
  normalizeMotionDebugWorkspaceDockWidth,
  openMotionDebugWorkspace,
  resizeMotionDebugWorkspaceDockByDelta,
  resizeMotionDebugWorkspaceDock,
  selectMotionDebugWorkspaceTarget,
  selectMotionDebugWorkspaceTrack,
  setMotionDebugWorkspaceCaptureProfile,
  setMotionDebugWorkspaceCaptureTargetFilters,
  setMotionDebugWorkspaceFilters,
  setMotionDebugWorkspaceMode,
  setMotionDebugWorkspaceTime,
  toggleMotionDebugWorkspaceFullscreen,
  toggleMotionDebugWorkspaceCaptureProp,
  toggleMotionDebugWorkspacePin,
} from "./motionDebugWorkspaceModel.js";
import {
  MOTION_CAPTURE_ALLOWED_PROPS,
  MOTION_CAPTURE_PROFILE_ALPHA_FOCUS,
  MOTION_CAPTURE_PROFILE_CUSTOM,
  MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS,
} from "./motionCaptureProfileModel.js";

export function runMotionDebugWorkspaceModelTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[Motion debug workspace model test failed] ${message}`);
  }

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
  assert(defaults.dockWidthPx === MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_DEFAULT, "session should default to the default dock width");
  assert(defaults.isOpen === false, "workspace should default closed");
  assert(defaults.mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK, "workspace should default to dock mode");
  assert(defaults.selectedTarget === null, "workspace should default without selected target");
  assert(defaults.selectedTrack === null, "workspace should default without selected track");
  assert(defaults.selectedTimeMs === 0, "workspace should default to time zero");
  assert(defaults.filters.preset === "all" && defaults.filters.query === "", "workspace filters should default to all");
  assert(Array.isArray(defaults.pinnedTargets) && defaults.pinnedTargets.length === 0, "workspace pins should default empty");
  assert(defaults.capturePropAllowlist.join(",") === MOTION_CAPTURE_ALLOWED_PROPS.join(","), "session should default to all capture props");
  assert(defaults.captureTargetFilters.layers.length === 0, "session should default without capture target filters");

  const normalized = createMotionDebugWorkspaceSession({
    captureProfileId: " alpha-focus ",
    filters: { preset: " active ", query: " panel " },
    dockWidthPx: 9999,
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
  assert(normalized.capturePropAllowlist.join(",") === "alpha", "session should derive props from the selected profile");
  assert(normalized.dockWidthPx === MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX, "session should clamp oversized dock width");
  assert(normalized.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN, "session should preserve fullscreen mode");
  assert(normalized.selectedTimeMs === 0, "session should clamp negative selected time");
  assert(normalized.filters.preset === "active" && normalized.filters.query === "panel", "session should normalize filters");
  assert(normalized.selectedTarget !== null, "session should retain the selected target");
  assert(normalized.selectedTarget.targetId === 3, "session should normalize selected target ids");
  const normalizedPin = normalized.pinnedTargets[0];
  assert(normalizedPin !== undefined, "session should retain the normalized pin");
  assert(!("rawTarget" in normalizedPin), "pins should not preserve raw target object references");
  assert(normalized.pinnedTargets.length === 2, "pins should be deduplicated by target identity");
  assert(normalized.selectedTrack !== null, "session should retain the selected track");
  assert(normalized.selectedTrack.prop === "y" && normalized.selectedTrack.laneKey === "panel-y", "session should normalize selected track");

  const unknownMode = createMotionDebugWorkspaceSession({ mode: "float" });
  assert(unknownMode.mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK, "unknown workspace modes should fall back to dock");

  assert(normalizeMotionDebugWorkspaceDockWidth(10) === MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN, "dock width should clamp to min");
  assert(normalizeMotionDebugWorkspaceDockWidth(9999) === MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MAX, "dock width should clamp to max");
  assert(
    normalizeMotionDebugWorkspaceDockWidth(900, { viewportWidth: 700 }) === 652,
    "dock width should leave viewport margin when viewport is known",
  );
  assert(
    normalizeMotionDebugWorkspaceDockWidth(400, { viewportWidth: 500 }) === MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN,
    "dock width should never go below minimum even on narrow viewport",
  );

  const opened = openMotionDebugWorkspace(defaults, { dockWidthPx: 720 });
  assert(opened.isOpen && opened.mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK, "opening workspace should open in dock mode by default");
  assert(opened.dockWidthPx === 720, "opening workspace should accept a dock width");
  const openedFullscreen = openMotionDebugWorkspace(defaults, { mode: MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN });
  assert(openedFullscreen.isOpen && openedFullscreen.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN, "opening workspace should support fullscreen mode");
  const closed = closeMotionDebugWorkspace(openedFullscreen);
  assert(!closed.isOpen && closed.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN, "closing workspace should preserve last mode");
  const docked = setMotionDebugWorkspaceMode(openedFullscreen, MOTION_DEBUG_WORKSPACE_MODE_DOCK);
  assert(docked.mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK && docked.isOpen, "mode setter should preserve open state");
  const full = toggleMotionDebugWorkspaceFullscreen(docked);
  assert(full.isOpen && full.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN, "fullscreen toggle should open fullscreen");
  const backToDock = toggleMotionDebugWorkspaceFullscreen(full);
  assert(backToDock.mode === MOTION_DEBUG_WORKSPACE_MODE_DOCK, "fullscreen toggle should return to dock");
  const resized = resizeMotionDebugWorkspaceDock(full, 600);
  assert(resized.mode === MOTION_DEBUG_WORKSPACE_MODE_FULLSCREEN, "resize should preserve current mode");
  assert(resized.dockWidthPx === 600, "resize should store the next dock width");
  const widenedByDelta = resizeMotionDebugWorkspaceDockByDelta(resized, 80);
  assert(widenedByDelta.dockWidthPx === 680, "delta resize should increase dock width");
  const narrowedByDelta = resizeMotionDebugWorkspaceDockByDelta(widenedByDelta, -200);
  assert(narrowedByDelta.dockWidthPx === MOTION_DEBUG_WORKSPACE_DOCK_WIDTH_MIN, "delta resize should clamp to the minimum width");
  const viewportClampedDelta = resizeMotionDebugWorkspaceDockByDelta(
    resized,
    500,
    { viewportWidth: 700 },
  );
  assert(viewportClampedDelta.dockWidthPx === 652, "delta resize should respect viewport-aware maximum width");

  const selectedTarget = selectMotionDebugWorkspaceTarget(defaults, { sourceLabel: "desktop.icon.node", layer: "desktop" });
  assert(selectedTarget.selectedTarget !== null, "target selection should retain the selected target");
  assert(selectedTarget.selectedTarget.sourceLabel === "desktop.icon.node", "target selection should set selected target");
  const clearedTarget = selectMotionDebugWorkspaceTarget(selectedTarget, null);
  assert(clearedTarget.selectedTarget === null && clearedTarget.selectedTrack === null, "clearing target should clear track selection");

  const selectedTrack = selectMotionDebugWorkspaceTrack(defaults, {
    lane: "factor",
    laneKey: "hover-scale",
    prop: "scale",
    sourceLabel: "desktop.icon.hover",
  });
  assert(selectedTrack.selectedTrack !== null, "track selection should retain the selected track");
  assert(selectedTrack.selectedTrack.lane === "factor", "track selection should preserve lane");
  assert(selectedTrack.selectedTarget !== null, "track selection should infer the selected target");
  assert(selectedTrack.selectedTarget.sourceLabel === "desktop.icon.hover", "track selection should infer selected target");
  const switchedTarget = selectMotionDebugWorkspaceTarget(selectedTrack, { sourceLabel: "folder.panel" });
  assert(switchedTarget.selectedTrack === null, "selecting another target should clear stale track selection");

  const filtered = setMotionDebugWorkspaceFilters(defaults, { preset: "warnings", query: "jiggle" });
  assert(filtered.filters.preset === "warnings" && filtered.filters.query === "jiggle", "filter setter should normalize filter patch");

  const alphaCapture = setMotionDebugWorkspaceCaptureProfile(defaults, MOTION_CAPTURE_PROFILE_ALPHA_FOCUS);
  assert(alphaCapture.captureProfileId === MOTION_CAPTURE_PROFILE_ALPHA_FOCUS, "capture profile setter should accept built-in ids");
  assert(alphaCapture.capturePropAllowlist.join(",") === "alpha", "capture profile setter should update props from the built-in profile");
  const profileFromSession = buildMotionDebugWorkspaceCaptureProfile(alphaCapture);
  assert(profileFromSession.id === MOTION_CAPTURE_PROFILE_ALPHA_FOCUS, "capture profile builder should preserve selected profile id");
  assert(profileFromSession.propAllowlist.join(",") === "alpha", "capture profile builder should expose selected props");

  const customProps = toggleMotionDebugWorkspaceCaptureProp(alphaCapture, "x", true);
  assert(customProps.captureProfileId === MOTION_CAPTURE_PROFILE_CUSTOM, "editing capture props should switch to custom profile");
  assert(customProps.capturePropAllowlist.join(",") === "x,alpha", "editing capture props should keep allowed props in stable order");
  const removedAlpha = toggleMotionDebugWorkspaceCaptureProp(customProps, "alpha", false);
  assert(removedAlpha.capturePropAllowlist.join(",") === "x", "capture prop toggle should remove enabled props");
  const refusedEmpty = toggleMotionDebugWorkspaceCaptureProp(removedAlpha, "x", false);
  assert(refusedEmpty.capturePropAllowlist.join(",") === "x", "capture prop toggle should keep at least one selected prop");
  const ignoredProp = toggleMotionDebugWorkspaceCaptureProp(removedAlpha, "z", true);
  assert(ignoredProp.capturePropAllowlist.join(",") === "x", "capture prop toggle should ignore unsupported props");

  const interruptionCapture = setMotionDebugWorkspaceCaptureProfile(defaults, MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS);
  const filteredCapture = setMotionDebugWorkspaceCaptureTargetFilters(interruptionCapture, {
    kinds: [" Icon ", "Icon"],
    layers: "desktop",
    sourceLabels: ["desktop.icon.node"],
    sourceQuery: " icon ",
  });
  assert(filteredCapture.captureProfileId === MOTION_CAPTURE_PROFILE_CUSTOM, "editing target filters should switch to custom profile");
  assert(filteredCapture.captureTargetFilters.layers.join(",") === "desktop", "capture target filters should normalize layers");
  assert(filteredCapture.captureTargetFilters.kinds.join(",") === "Icon", "capture target filters should dedupe kinds");
  assert(filteredCapture.captureTargetFilters.sourceQuery === "icon", "capture target filters should trim query");
  const customCaptureProfile = buildMotionDebugWorkspaceCaptureProfile(filteredCapture);
  assert(!customCaptureProfile.includeSamples, "customized interruption filters should preserve sample/event semantics");
  assert(customCaptureProfile.eventTypes.includes("cancel"), "customized interruption filters should preserve event types");

  const selectedTime = setMotionDebugWorkspaceTime(defaults, 42.8);
  assert(selectedTime.selectedTimeMs === 42.8, "time setter should preserve finite selected time");
  const clampedTime = setMotionDebugWorkspaceTime(defaults, -5);
  assert(clampedTime.selectedTimeMs === 0, "time setter should clamp negative selected time");

  const pinned = toggleMotionDebugWorkspacePin(defaults, { targetId: 9, sourceLabel: "desktop.icon.jiggle" });
  assert(pinned.pinnedTargets.length === 1, "pin toggle should add a target");
  const addedPin = pinned.pinnedTargets[0];
  assert(addedPin !== undefined && addedPin.key === "id:9", "pin toggle should store a stable key");
  const unpinned = toggleMotionDebugWorkspacePin(pinned, { targetId: 9 });
  assert(unpinned.pinnedTargets.length === 0, "pin toggle should remove an existing target");
}
