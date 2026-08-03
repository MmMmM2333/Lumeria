import { DiagnosticError } from "./diagnosticError.js";
import {
  createBrowserLiveDesktopDebugSettingsStore,
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  normalizeLiveDesktopDebugSettings,
  validateLiveDesktopDebugSettingsPatch,
  validateLiveDesktopRestartOptions,
} from "./liveDesktopDebugSettings.js";

export const LIVE_DESKTOP_DIAGNOSTICS_STATE_SCHEMA = "lumeria-live-desktop-diagnostics-state/v1";

const SETTING_NAMES = Object.freeze(Object.keys(DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS));
const FRONTEND_ONLY_SETTING_NAMES = Object.freeze(["compositorKeeper"]);
const RUNTIME_SETTING_NAMES = Object.freeze([
  "cssFallbackEffects",
  "debugFrameSourceOverride",
  "disableMouseRelay",
  "forceDwmFlush",
  "skipBlankFrames",
]);

function clonePlain(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function changedSettingNames(before, after) {
  return SETTING_NAMES.filter((name) => before[name] !== after[name]);
}

function calculateConsistency(state) {
  const desired = state.desired.values;
  const persisted = state.persisted.values;
  const applied = state.applied.values;
  const desiredVsPersisted = SETTING_NAMES.filter((name) => desired[name] !== persisted[name]);
  const desiredVsApplied = SETTING_NAMES.filter((name) => (
    Object.hasOwn(applied, name) && desired[name] !== applied[name]
  ));
  const unconfirmedAppliedKeys = SETTING_NAMES.filter((name) => !state.applied.confirmedKeys.includes(name));
  return {
    desiredVsApplied,
    desiredVsPersisted,
    status: desiredVsApplied.length || desiredVsPersisted.length
      ? "drifted"
      : unconfirmedAppliedKeys.length
        ? "unverified"
        : "consistent",
    unconfirmedAppliedKeys,
  };
}

function normalizeRuntimeStatus(status) {
  if (!status || typeof status !== "object") return null;
  return clonePlain(status);
}

function runtimeConfirmedSettings(status) {
  return status?.active === true && status?.phase === "running";
}

function shouldRestart(changedNames, settings) {
  if (changedNames.includes("debugFrameSourceOverride")) return true;
  return changedNames.includes("disableMouseRelay")
    && settings.debugFrameSourceOverride !== "testPattern";
}

export function createLiveDesktopDiagnosticsController(options = {}) {
  const settingsStore = options.settingsStore || createBrowserLiveDesktopDebugSettingsStore();
  const applyRuntimePort = options.applyRuntime;
  const refreshRuntimePort = options.refreshRuntime;
  const getRuntimeStatus = typeof options.getRuntimeStatus === "function" ? options.getRuntimeStatus : () => null;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  if (!settingsStore || typeof settingsStore.read !== "function" || typeof settingsStore.write !== "function") {
    throw new TypeError("LiveDesktopDiagnosticsController requires a settingsStore with read() and write()");
  }
  if (typeof applyRuntimePort !== "function" || typeof refreshRuntimePort !== "function") {
    throw new TypeError("LiveDesktopDiagnosticsController requires applyRuntime() and refreshRuntime()");
  }

  const initialSettings = settingsStore.read();
  const initialValues = normalizeLiveDesktopDebugSettings(initialSettings.values);
  let state = {
    applied: {
      confirmedKeys: [],
      updatedAt: null,
      values: {},
      verification: "unknown",
    },
    consistency: null,
    desired: {
      revision: 0,
      updatedAt: String(now()),
      values: clonePlain(initialValues),
    },
    lastFailure: initialSettings.issues.length
      ? {
        at: String(now()),
        code: "live-desktop-settings-read-failed",
        message: "Live Desktop debug settings were not read completely",
        stage: "read",
        details: { issues: initialSettings.issues },
      }
      : null,
    lastRefreshFailure: null,
    persisted: {
      issues: clonePlain(initialSettings.issues),
      updatedAt: String(now()),
      values: clonePlain(initialValues),
    },
    phase: initialSettings.issues.length ? "failed" : "ready",
    runtimeStatus: normalizeRuntimeStatus(getRuntimeStatus()),
    schema: LIVE_DESKTOP_DIAGNOSTICS_STATE_SCHEMA,
  };
  state.consistency = calculateConsistency(state);
  let disposed = false;
  let disposing = false;
  let disposePromise = null;
  let operationQueue = Promise.resolve();

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("live-desktop-diagnostics-disposed", "The Live Desktop diagnostics controller has been disposed", {
        nextActions: ["Wait for the diagnostic entry point to be reinstalled"],
      });
    }
  }

  function ensureAcceptingOperations() {
    if (disposed || disposing) {
      throw new DiagnosticError("live-desktop-diagnostics-disposed", "The Live Desktop diagnostics controller has been disposed", {
        nextActions: ["Wait for the diagnostic entry point to be reinstalled"],
      });
    }
  }

  function commit(patch) {
    state = { ...state, ...patch };
    state.consistency = calculateConsistency(state);
  }

  function getState() {
    ensureActive();
    return clonePlain(state);
  }

  function recordFailure(stage, error, code, message, statePatch = {}) {
    const diagnosticError = error instanceof DiagnosticError
      ? error
      : new DiagnosticError(code, message, {
        cause: error,
        details: { technicalDetail: String(error?.message || error) },
      });
    commit({
      ...statePatch,
      lastFailure: {
        at: String(now()),
        code: diagnosticError.code,
        details: clonePlain(diagnosticError.details),
        message: diagnosticError.message,
        nextActions: [...diagnosticError.nextActions],
        stage,
      },
      phase: "failed",
    });
    return diagnosticError;
  }

  function recordRefreshFailure(error) {
    const diagnosticError = error instanceof DiagnosticError
      ? error
      : new DiagnosticError("live-desktop-runtime-refresh-failed", "Failed to refresh Live Desktop runtime state", {
        cause: error,
        details: { technicalDetail: String(error?.message || error) },
        nextActions: ["Check that the native bridge is available, then retry the refresh"],
      });
    commit({
      lastRefreshFailure: {
        at: String(now()),
        code: diagnosticError.code,
        details: clonePlain(diagnosticError.details),
        message: diagnosticError.message,
        nextActions: [...diagnosticError.nextActions],
        stage: "refresh",
      },
      phase: "failed",
    });
    return diagnosticError;
  }

  function enqueue(operation) {
    ensureAcceptingOperations();
    const request = operationQueue.then(() => {
      ensureAcceptingOperations();
      return operation();
    });
    operationQueue = request.catch(() => undefined);
    return request;
  }

  async function applyCurrentSettings(changedNames, applyOptions = {}) {
    const nextValues = state.desired.values;
    const runtimeChangedNames = changedNames.filter((name) => RUNTIME_SETTING_NAMES.includes(name));
    const frontendChangedNames = changedNames.filter((name) => FRONTEND_ONLY_SETTING_NAMES.includes(name));
    const confirmedKeys = state.applied.confirmedKeys.filter((name) => !changedNames.includes(name));
    const appliedValues = { ...state.applied.values };
    for (const name of frontendChangedNames) {
      appliedValues[name] = nextValues[name];
      confirmedKeys.push(name);
    }
    commit({
      applied: {
        ...state.applied,
        confirmedKeys: Array.from(new Set(confirmedKeys)),
        values: appliedValues,
      },
    });
    if (!runtimeChangedNames.length && !applyOptions.force) {
      const retainedFailure = state.consistency.status === "consistent" ? null : state.lastFailure;
      commit({
        applied: {
          ...state.applied,
          updatedAt: String(now()),
          verification: "frontend-event-dispatched",
        },
        lastFailure: retainedFailure,
        phase: retainedFailure || state.lastRefreshFailure ? "failed" : "ready",
      });
      return getState();
    }

    let runtimeStatus;
    try {
      runtimeStatus = normalizeRuntimeStatus(await applyRuntimePort({
        restart: applyOptions.restart ?? shouldRestart(changedNames, nextValues),
        settings: clonePlain(nextValues),
      }));
    } catch (error) {
      throw recordFailure("apply", error, "live-desktop-runtime-apply-failed", "Failed to apply Live Desktop debug settings");
    }
    if (runtimeStatus?.phase === "failed") {
      throw recordFailure(
        "apply",
        new DiagnosticError("live-desktop-runtime-apply-failed", "The Live Desktop runtime rejected the debug settings", {
          details: { runtimeStatus },
          nextActions: ["Inspect runtimeStatus.reason, detail, and the latest error before retrying"],
        }),
        "live-desktop-runtime-apply-failed",
        "The Live Desktop runtime rejected the debug settings",
        { runtimeStatus },
      );
    }
    if (!runtimeConfirmedSettings(runtimeStatus)) {
      throw recordFailure(
        "apply",
        new DiagnosticError("live-desktop-runtime-apply-unconfirmed", "The Live Desktop runtime did not confirm that the debug settings took effect", {
          details: { runtimeStatus },
          nextActions: ["Confirm the native bridge and Live Desktop runtime are running, then retry"],
        }),
        "live-desktop-runtime-apply-unconfirmed",
        "The Live Desktop runtime did not confirm that the debug settings took effect",
        { runtimeStatus },
      );
    }
    commit({
      applied: {
        confirmedKeys: [...SETTING_NAMES],
        updatedAt: String(now()),
        values: clonePlain(nextValues),
        verification: "runtime-accepted",
      },
      lastFailure: null,
      lastRefreshFailure: null,
      phase: "ready",
      runtimeStatus,
    });
    return getState();
  }

  function updateSettings(patch = {}, updateOptions = {}) {
    return enqueue(async () => {
      const validatedPatch = validateLiveDesktopDebugSettingsPatch(patch);
      const validatedOptions = validateLiveDesktopRestartOptions(updateOptions, "settings.update.options ");
      const before = state.desired.values;
      const nextValues = normalizeLiveDesktopDebugSettings({ ...before, ...validatedPatch });
      const changedNames = changedSettingNames(before, nextValues);
      if (!changedNames.length) return getState();
      commit({
        desired: {
          revision: state.desired.revision + 1,
          updatedAt: String(now()),
          values: clonePlain(nextValues),
        },
        phase: "persisting",
      });
      let persisted;
      try {
        persisted = settingsStore.write(nextValues);
      } catch (error) {
        if (error?.code === "live-desktop-settings-notify-failed" && error?.details?.persisted === true) {
          commit({
            persisted: {
              issues: [],
              updatedAt: String(now()),
              values: normalizeLiveDesktopDebugSettings(error.details.values),
            },
          });
          throw recordFailure("notify", error, "live-desktop-settings-notify-failed", "Live Desktop debug settings were saved, but notifying the application failed");
        }
        throw recordFailure("persist", error, "live-desktop-settings-write-failed", "Failed to save Live Desktop debug settings");
      }
      commit({
        persisted: {
          issues: clonePlain(persisted.issues || []),
          updatedAt: String(now()),
          values: clonePlain(persisted.values),
        },
        phase: "applying",
      });
      return applyCurrentSettings(changedNames, validatedOptions);
    });
  }

  function applyDesired(applyOptions = {}) {
    return enqueue(async () => {
      const validatedOptions = validateLiveDesktopRestartOptions(applyOptions, "runtime.apply params ");
      commit({ phase: "applying" });
      return applyCurrentSettings([...SETTING_NAMES], { ...validatedOptions, force: true });
    });
  }

  function refreshRuntime() {
    return enqueue(async () => {
      commit({ phase: "refreshing" });
      try {
        const runtimeStatus = normalizeRuntimeStatus(await refreshRuntimePort());
        commit({
          lastRefreshFailure: null,
          phase: state.lastFailure ? "failed" : "ready",
          runtimeStatus,
        });
        return getState();
      } catch (error) {
        throw recordRefreshFailure(error);
      }
    });
  }

  function dispose() {
    if (disposePromise) return disposePromise;
    if (disposed) return Promise.resolve();
    disposing = true;
    disposePromise = operationQueue
      .catch(() => undefined)
      .then(() => {
        disposed = true;
        disposing = false;
        state = { ...state, phase: "disposed" };
      });
    return disposePromise;
  }

  return Object.freeze({ applyDesired, dispose, getState, refreshRuntime, updateSettings });
}
