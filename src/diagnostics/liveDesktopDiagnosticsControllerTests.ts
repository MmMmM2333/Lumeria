import { readonly } from "vue";
import { createLiveDesktopDebugSettingsStore } from "./liveDesktopDebugSettings.js";
import {
  createLiveDesktopDiagnosticsController,
  requireLiveDesktopDiagnosticsState,
} from "./liveDesktopDiagnosticsController.js";
import { DiagnosticError } from "./diagnosticError.js";
import type { LiveDesktopRuntimeSnapshot } from "./liveDesktopDiagnosticsController.js";
import type { LiveDesktopRuntimeApplyRequest } from "./liveDesktopDiagnosticsController.js";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, String(value)),
  };
}

export async function runLiveDesktopDiagnosticsControllerTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[live desktop diagnostics controller test failed] ${message}`);
  };
  const applyCalls: LiveDesktopRuntimeApplyRequest[] = [];
  const reactiveRuntimeDiagnostics = readonly({ framesCopied: 12 });
  let runtimeStatus: Partial<LiveDesktopRuntimeSnapshot> = {
    active: true,
    diagnostics: reactiveRuntimeDiagnostics,
    generation: 3,
    phase: "running",
    reason: "running",
  };
  let runtimeRefreshFailure: Error | null = null;
  const settingsStore = createLiveDesktopDebugSettingsStore({ storage: createMemoryStorage() });
  const controller = createLiveDesktopDiagnosticsController({
    applyRuntime: async ({ restart, settings }) => {
      applyCalls.push({ restart, settings: { ...settings } });
      return runtimeStatus;
    },
    getRuntimeStatus: () => runtimeStatus,
    now: () => "2026-08-02T03:00:00.000Z",
    refreshRuntime: async () => {
      if (runtimeRefreshFailure) throw runtimeRefreshFailure;
      return runtimeStatus;
    },
    settingsStore,
  });

  const initial = controller.getState();
  const decodedInitial = requireLiveDesktopDiagnosticsState(initial);
  assert(decodedInitial.desired.revision === 0, "state decoder should preserve a fully validated controller state");
  let malformedStateError: unknown = null;
  try {
    requireLiveDesktopDiagnosticsState({
      ...initial,
      desired: {
        ...initial.desired,
        values: { ...initial.desired.values, skipBlankFrames: "yes" },
      },
    });
  } catch (error) {
    malformedStateError = error;
  }
  assert(malformedStateError instanceof DiagnosticError || malformedStateError instanceof TypeError, "state decoder should reject malformed nested settings");
  assert(initial.schema === "lumeria-live-desktop-diagnostics-state/v1", "controller state should expose a stable schema");
  assert(initial.consistency.status === "unverified", "persisted startup settings must not be mislabeled as applied");
  assert(initial.applied.confirmedKeys.length === 0, "initial applied state should state its lack of confirmation");
  assert(
    (initial.runtimeStatus?.diagnostics as { framesCopied?: number } | null)?.framesCopied === 12,
    "runtime diagnostics should preserve data from a Vue readonly proxy",
  );
  assert(initial.runtimeStatus?.diagnostics !== reactiveRuntimeDiagnostics, "runtime diagnostics snapshots must not retain Vue proxies");

  const updated = await controller.updateSettings({ debugFrameSourceOverride: "testPattern", skipBlankFrames: true });
  assert(updated.phase === "ready", "a confirmed update should return to ready state");
  assert(updated.desired.values.skipBlankFrames === true, "desired state should record the caller request");
  assert(updated.persisted.values.skipBlankFrames === true, "persisted state should only advance after storage succeeds");
  assert(updated.applied.values.skipBlankFrames === true, "applied state should advance after runtime acceptance");
  assert(updated.applied.verification === "runtime-accepted", "the controller must disclose the strength of apply verification");
  assert(updated.consistency.status === "consistent", "matching desired/applied/persisted states should be explicit");
  const firstApplyCall = applyCalls[0];
  assert(firstApplyCall, "a confirmed update should reach the runtime port");
  assert(firstApplyCall.restart === true, "frame-source changes should request a runtime restart");

  runtimeStatus = { active: false, detail: "renderer rejected config", generation: 4, phase: "failed", reason: "configureFailed" };
  let applyFailure: DiagnosticError | null = null;
  try {
    await controller.updateSettings({ forceDwmFlush: true });
  } catch (error) {
    applyFailure = error instanceof DiagnosticError ? error : null;
  }
  const failed = controller.getState();
  assert(applyFailure?.code === "live-desktop-runtime-apply-failed", "runtime rejection should reject the caller with a stable code");
  assert(failed.phase === "failed" && failed.lastFailure?.stage === "apply", "failed apply state should retain its stage");
  assert(failed.persisted.values.forceDwmFlush === true, "a persisted-but-not-applied request should remain observable");
  assert(!failed.applied.confirmedKeys.includes("forceDwmFlush"), "runtime rejection must not fabricate applied confirmation");
  assert(failed.consistency.status === "drifted", "persisted/applied divergence should be machine-visible");
  assert(failed.runtimeStatus?.phase === "failed", "runtime rejection should update the top-level observed runtime status");

  runtimeStatus = {
    active: false,
    generation: 4,
    phase: "stopped",
    reason: "nativeBridgeUnavailable",
  };
  let unavailableFailure: DiagnosticError | null = null;
  try {
    await controller.updateSettings({ skipBlankFrames: false });
  } catch (error) {
    unavailableFailure = error instanceof DiagnosticError ? error : null;
  }
  const unavailable = controller.getState();
  assert(unavailableFailure?.code === "live-desktop-runtime-apply-unconfirmed", "an unavailable runtime must not be treated as accepting settings");
  assert(unavailable.phase === "failed", "an unavailable runtime should remain visibly failed");
  assert(!unavailable.applied.confirmedKeys.includes("skipBlankFrames"), "an unavailable runtime must not fabricate applied confirmation");
  assert(unavailable.consistency.status !== "consistent", "unconfirmed runtime settings must not be reported as consistent");
  assert(unavailable.runtimeStatus?.phase === "stopped", "unconfirmed runtime responses should update the top-level runtime status");

  runtimeStatus = { active: true, generation: 5, phase: "running", reason: "running" };
  runtimeRefreshFailure = new Error("native status channel unavailable");
  let refreshFailure: DiagnosticError | null = null;
  try {
    await controller.refreshRuntime();
  } catch (error) {
    refreshFailure = error instanceof DiagnosticError ? error : null;
  }
  const refreshFailed = controller.getState();
  assert(refreshFailure?.code === "live-desktop-runtime-refresh-failed", "runtime refresh failures should expose a stable code");
  assert(refreshFailed.lastFailure?.code === "live-desktop-runtime-apply-unconfirmed", "a refresh failure must not overwrite the unresolved apply failure");
  assert(refreshFailed.lastRefreshFailure?.code === "live-desktop-runtime-refresh-failed", "refresh failures should be tracked independently");
  runtimeRefreshFailure = null;
  const refreshed = await controller.refreshRuntime();
  assert(refreshed.runtimeStatus?.generation === 5, "runtime refresh should update observed runtime state");
  assert(refreshed.lastFailure?.code === "live-desktop-runtime-apply-unconfirmed", "status refresh must retain an unapplied settings failure");
  assert(refreshed.lastRefreshFailure == null, "a successful refresh should clear only the refresh failure");
  assert(refreshed.phase === "failed", "status refresh must not claim the controller recovered before settings are reapplied");
  const reapplied = await controller.applyDesired();
  assert(reapplied.lastFailure == null && reapplied.phase === "ready", "a successful reapply should clear the retained apply failure");

  const applyCallCountBeforeInvalidOptions = applyCalls.length;
  let invalidUpdateOptionsFailure: DiagnosticError | null = null;
  try {
    await controller.updateSettings({ forceDwmFlush: false }, { restart: "false" });
  } catch (error) {
    invalidUpdateOptionsFailure = error instanceof DiagnosticError ? error : null;
  }
  assert(invalidUpdateOptionsFailure?.code === "diagnostic-params-invalid", "updateSettings should reject non-boolean restart options");
  assert(controller.getState().desired.values.forceDwmFlush === true, "invalid update options must not mutate desired settings");
  let invalidApplyOptionsFailure: DiagnosticError | null = null;
  try {
    await controller.applyDesired({ restart: "false" });
  } catch (error) {
    invalidApplyOptionsFailure = error instanceof DiagnosticError ? error : null;
  }
  assert(invalidApplyOptionsFailure?.code === "diagnostic-params-invalid", "applyDesired should reject non-boolean restart options");
  assert(applyCalls.length === applyCallCountBeforeInvalidOptions, "invalid restart options must not reach the runtime port");

  let notifyApplyCalls = 0;
  const notifyFailureController = createLiveDesktopDiagnosticsController({
    applyRuntime: async () => {
      notifyApplyCalls += 1;
      return runtimeStatus;
    },
    now: () => "2026-08-02T03:01:00.000Z",
    refreshRuntime: async () => runtimeStatus,
    settingsStore: createLiveDesktopDebugSettingsStore({
      notify() {
        throw new Error("event dispatch blocked");
      },
      storage: createMemoryStorage(),
    }),
  });
  let notifyFailure: DiagnosticError | null = null;
  try {
    await notifyFailureController.updateSettings({ compositorKeeper: true });
  } catch (error) {
    notifyFailure = error instanceof DiagnosticError ? error : null;
  }
  const notifyFailedState = notifyFailureController.getState();
  assert(notifyFailure?.code === "live-desktop-settings-notify-failed", "post-persist notification failures should retain their stable store code");
  assert(notifyFailedState.lastFailure?.stage === "notify", "post-persist notification failures should identify the correct stage");
  assert(notifyFailedState.desired.values.compositorKeeper === true, "notification failures should retain the requested desired value");
  assert(notifyFailedState.persisted.values.compositorKeeper === true, "notification failures must not hide the value already committed to storage");
  assert(notifyApplyCalls === 0, "runtime apply should wait until the frontend settings notification succeeds");
  await notifyFailureController.dispose();

  const partialApplyController = createLiveDesktopDiagnosticsController({
    applyRuntime: async () => ({
      active: false,
      detail: "native effect rejected",
      phase: "failed",
      reason: "configureFailed",
    }),
    now: () => "2026-08-02T03:02:00.000Z",
    refreshRuntime: async () => null,
    settingsStore: createLiveDesktopDebugSettingsStore({ storage: createMemoryStorage() }),
  });
  let partialApplyFailure: DiagnosticError | null = null;
  try {
    await partialApplyController.updateSettings({ cssFallbackEffects: true });
  } catch (error) {
    partialApplyFailure = error instanceof DiagnosticError ? error : null;
  }
  const partialApplyState = partialApplyController.getState();
  assert(partialApplyFailure?.code === "live-desktop-runtime-apply-failed", "dual-consumer setting rejection should fail explicitly");
  assert(!partialApplyState.applied.confirmedKeys.includes("cssFallbackEffects"), "a frontend-only acknowledgement must not claim a dual-consumer setting is fully applied");
  assert(partialApplyState.consistency.status === "unverified", "partially applied dual-consumer settings should remain unverified");
  await partialApplyController.dispose();

  let releaseInFlightApply: ((status: unknown) => void) | undefined;
  let markInFlightApplyStarted: (() => void) | undefined;
  const inFlightApplyStarted = new Promise<void>((resolve) => {
    markInFlightApplyStarted = resolve;
  });
  const inFlightController = createLiveDesktopDiagnosticsController({
    applyRuntime: () => new Promise((resolve) => {
      releaseInFlightApply = resolve;
      markInFlightApplyStarted?.();
    }),
    getRuntimeStatus: () => ({ active: true, phase: "running" }),
    refreshRuntime: async () => ({ active: true, phase: "running" }),
    settingsStore: createLiveDesktopDebugSettingsStore({ storage: createMemoryStorage() }),
  });
  const inFlightUpdate = inFlightController.updateSettings({ skipBlankFrames: true });
  await inFlightApplyStarted;
  let disposalFinished = false;
  const inFlightDisposal = inFlightController.dispose().then(() => {
    disposalFinished = true;
  });
  await Promise.resolve();
  assert(disposalFinished === false, "dispose should wait for an in-flight settings apply");
  let operationDuringDisposeFailure: DiagnosticError | null = null;
  try {
    await inFlightController.applyDesired();
  } catch (error) {
    operationDuringDisposeFailure = error instanceof DiagnosticError ? error : null;
  }
  assert(operationDuringDisposeFailure?.code === "live-desktop-diagnostics-disposed", "dispose should reject new operations while draining the queue");
  releaseInFlightApply?.({ active: true, generation: 8, phase: "running", reason: "running" });
  const completedInFlightState = await inFlightUpdate;
  await inFlightDisposal;
  assert(completedInFlightState.applied.values.skipBlankFrames === true, "dispose should let the accepted in-flight operation finish consistently");
  assert(Number(disposalFinished) === 1, "dispose should finish after the in-flight operation settles");

  await controller.dispose();
  let disposedFailure: DiagnosticError | null = null;
  try {
    await controller.updateSettings({ compositorKeeper: true });
  } catch (error) {
    disposedFailure = error instanceof DiagnosticError ? error : null;
  }
  assert(disposedFailure?.code === "live-desktop-diagnostics-disposed", "disposed controllers should fail explicitly");
}
