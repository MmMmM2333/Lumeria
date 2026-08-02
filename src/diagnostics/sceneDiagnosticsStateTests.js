import {
  createSceneDiagnosticsState,
  SCENE_DIAGNOSTICS_STATE_SCHEMA,
} from "./sceneDiagnosticsState.js";

export function runSceneDiagnosticsStateTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[scene diagnostics state test failed] ${message}`);
  };
  let timestamp = 0;
  const state = createSceneDiagnosticsState({ now: () => `time-${++timestamp}` });

  assert(state.status().availableChannels.length === 0, "new scene diagnostics state should be lightweight and empty");
  assert(state.publish("dragHit", null) == null, "repeated disabled-channel publishing should remain explicitly empty");
  assert(state.status().revision === 0 && timestamp === 0, "publishing null into an empty channel should be a zero-cost state no-op");
  const defaults = state.configureFolderHandoff(true);
  assert(defaults.log === true && defaults.overlay === true && defaults.lineWidth === 3, "boolean configuration should use explicit defaults");
  const configured = state.configureFolderHandoff({ lineWidth: 5, log: false, overlay: true, timeline: true });
  assert(configured.lineWidth === 5 && configured.log === false && configured.timeline === true, "folder handoff options should normalize through one owner");

  const input = { folderId: "folder-1", phase: "overlay-release" };
  state.publish("folderHandoff", input);
  input.phase = "mutated-after-publish";
  const firstRead = state.read("folderHandoff");
  assert(firstRead.phase === "overlay-release", "published snapshots should be owned by the diagnostics state");
  firstRead.phase = "mutated-after-read";
  assert(state.read("folderHandoff").phase === "overlay-release", "snapshot reads should not expose mutable internal state");

  state.publish("folderHandoff", { desktopLogged: true }, { merge: true });
  assert(state.read("folderHandoff").folderId === "folder-1", "merge publishing should retain the previous folder handoff facts");
  assert(state.read("folderHandoff").desktopLogged === true, "merge publishing should apply the new facts");
  state.publish("dragHit", { active: true, targetId: "app-1" });
  state.publish("singleStage", { folderId: "folder-1" });

  const snapshot = state.snapshot();
  assert(snapshot.schema === SCENE_DIAGNOSTICS_STATE_SCHEMA, "scene snapshots should expose a stable schema");
  assert(snapshot.channels.dragHit.available === true, "scene snapshots should describe channel availability");
  assert(snapshot.channels.singleStage.snapshot.folderId === "folder-1", "scene snapshots should retain structured channel data");
  assert(snapshot.folderHandoffConfig.timeline === true, "scene snapshots should include the active handoff configuration");

  let clearCount = 0;
  const unregister = state.registerClearHandler("folderHandoff", () => { clearCount += 1; });
  const cleared = state.clear("folderHandoff");
  assert(clearCount === 1, "channel clear should invoke registered visual cleanup exactly once");
  assert(cleared.clearedChannels[0] === "folderHandoff" && state.read("folderHandoff") == null, "channel clear should remove the snapshot");
  unregister();
  state.clear("folderHandoff");
  assert(clearCount === 1, "unregistered clear handlers should no longer run");

  state.publish("dragHit", { active: true });
  state.registerClearHandler("dragHit", () => { throw new Error("synthetic clear failure"); });
  let clearError = null;
  try {
    state.clear("dragHit");
  } catch (error) {
    clearError = error;
  }
  assert(clearError?.code === "scene-diagnostics-clear-failed", "visual cleanup failures should be explicit");
  assert(state.read("dragHit")?.active === true, "failed clears should retain their diagnostic snapshot for analysis and retry");

  let invalidConfigError = null;
  try {
    state.configureFolderHandoff("enabled");
  } catch (error) {
    invalidConfigError = error;
  }
  assert(invalidConfigError?.code === "scene-diagnostics-config-invalid", "invalid public configuration should fail with a stable code");
}
