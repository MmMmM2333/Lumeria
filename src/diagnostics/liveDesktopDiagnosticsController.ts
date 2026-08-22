import { DiagnosticError } from "./diagnosticError.js";
import {
  createBrowserLiveDesktopDebugSettingsStore,
  DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS,
  normalizeLiveDesktopDebugSettings,
  validateLiveDesktopDebugSettingsPatch,
  validateLiveDesktopRestartOptions,
} from "./liveDesktopDebugSettings.js";
import type {
  LiveDesktopDebugSettingName,
  LiveDesktopDebugSettings,
  LiveDesktopDebugSettingsIssue,
  LiveDesktopDebugSettingsPatch,
  LiveDesktopDebugSettingsStore,
  LiveDesktopRestartOptions,
} from "./liveDesktopDebugSettings.js";

export const LIVE_DESKTOP_DIAGNOSTICS_STATE_SCHEMA = "lumeria-live-desktop-diagnostics-state/v1";

const SETTING_NAMES = Object.freeze(
  Object.keys(DEFAULT_LIVE_DESKTOP_DEBUG_SETTINGS) as LiveDesktopDebugSettingName[],
);
const FRONTEND_ONLY_SETTING_NAMES = Object.freeze<readonly LiveDesktopDebugSettingName[]>(["compositorKeeper"]);
const RUNTIME_SETTING_NAMES = Object.freeze<readonly LiveDesktopDebugSettingName[]>([
  "cssFallbackEffects",
  "debugFrameSourceOverride",
  "disableMouseRelay",
  "forceDwmFlush",
  "skipBlankFrames",
]);

type UnknownRecord = Record<string, unknown>;

export type LiveDesktopDiagnosticsPhase =
  | "applying"
  | "disposed"
  | "failed"
  | "persisting"
  | "ready"
  | "refreshing";

export type LiveDesktopRuntimeSnapshot = Readonly<{
  active: boolean;
  detail: string;
  diagnostics: unknown | null;
  generation: number;
  phase: "failed" | "running" | "starting" | "stopped";
  reason: string;
  windowDiagnostics: unknown | null;
}>;

export type LiveDesktopDiagnosticsFailure = Readonly<{
  at: string;
  code: string;
  details?: unknown;
  message: string;
  nextActions?: readonly string[];
  stage: "apply" | "notify" | "persist" | "read" | "refresh";
}>;

export type LiveDesktopDiagnosticsConsistency = Readonly<{
  desiredVsApplied: readonly LiveDesktopDebugSettingName[];
  desiredVsPersisted: readonly LiveDesktopDebugSettingName[];
  status: "consistent" | "drifted" | "unverified";
  unconfirmedAppliedKeys: readonly LiveDesktopDebugSettingName[];
}>;

export type LiveDesktopDiagnosticsState = Readonly<{
  applied: Readonly<{
    confirmedKeys: readonly LiveDesktopDebugSettingName[];
    updatedAt: string | null;
    values: Partial<LiveDesktopDebugSettings>;
    verification: "frontend-event-dispatched" | "runtime-accepted" | "unknown";
  }>;
  consistency: LiveDesktopDiagnosticsConsistency;
  desired: Readonly<{
    revision: number;
    updatedAt: string;
    values: LiveDesktopDebugSettings;
  }>;
  lastFailure: LiveDesktopDiagnosticsFailure | null;
  lastRefreshFailure: LiveDesktopDiagnosticsFailure | null;
  persisted: Readonly<{
    issues: readonly LiveDesktopDebugSettingsIssue[];
    updatedAt: string;
    values: LiveDesktopDebugSettings;
  }>;
  phase: LiveDesktopDiagnosticsPhase;
  runtimeStatus: LiveDesktopRuntimeSnapshot | null;
  schema: typeof LIVE_DESKTOP_DIAGNOSTICS_STATE_SCHEMA;
}>;

export type LiveDesktopRuntimeApplyRequest = Readonly<{
  restart: boolean;
  settings: LiveDesktopDebugSettings;
}>;

export type LiveDesktopDiagnosticsControllerOptions = Readonly<{
  applyRuntime?: (request: LiveDesktopRuntimeApplyRequest) => unknown | Promise<unknown>;
  getRuntimeStatus?: () => unknown;
  now?: () => unknown;
  refreshRuntime?: () => unknown | Promise<unknown>;
  settingsStore?: LiveDesktopDebugSettingsStore;
}>;

export type LiveDesktopDiagnosticsController = Readonly<{
  applyDesired(options?: unknown): Promise<LiveDesktopDiagnosticsState>;
  dispose(): Promise<void>;
  getState(): LiveDesktopDiagnosticsState;
  refreshRuntime(): Promise<LiveDesktopDiagnosticsState>;
  updateSettings(patch?: unknown, options?: unknown): Promise<LiveDesktopDiagnosticsState>;
}>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clonePlain<Value>(value: Value): Value {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as Value;
}

function changedSettingNames(
  before: LiveDesktopDebugSettings,
  after: LiveDesktopDebugSettings,
): LiveDesktopDebugSettingName[] {
  return SETTING_NAMES.filter((name) => before[name] !== after[name]);
}

function calculateConsistency(state: Omit<LiveDesktopDiagnosticsState, "consistency"> | LiveDesktopDiagnosticsState): LiveDesktopDiagnosticsConsistency {
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

function normalizeRuntimeStatus(status: unknown): LiveDesktopRuntimeSnapshot | null {
  if (status === null || status === undefined) return null;
  if (!isRecord(status)) throw new TypeError("Live Desktop runtime status must be an object or null");
  const phase = status.phase;
  if (phase !== "failed" && phase !== "running" && phase !== "starting" && phase !== "stopped") {
    throw new TypeError("Live Desktop runtime status has an invalid phase");
  }
  if (typeof status.active !== "boolean") {
    throw new TypeError("Live Desktop runtime status.active must be a boolean");
  }
  const generation = status.generation === undefined ? 0 : status.generation;
  if (typeof generation !== "number" || !Number.isSafeInteger(generation) || generation < 0) {
    throw new TypeError("Live Desktop runtime status.generation must be a non-negative safe integer");
  }
  const detail = status.detail;
  if (detail !== undefined && typeof detail !== "string") {
    throw new TypeError("Live Desktop runtime status.detail must be a string when provided");
  }
  const reason = status.reason;
  if (reason !== undefined && typeof reason !== "string") {
    throw new TypeError("Live Desktop runtime status.reason must be a string when provided");
  }
  return {
    active: status.active,
    detail: detail ?? "",
    diagnostics: clonePlain(status.diagnostics ?? null),
    generation,
    phase,
    reason: reason ?? "",
    windowDiagnostics: clonePlain(status.windowDiagnostics ?? null),
  };
}

function runtimeConfirmedSettings(status: LiveDesktopRuntimeSnapshot | null): boolean {
  return status?.active === true && status?.phase === "running";
}

function shouldRestart(
  changedNames: readonly LiveDesktopDebugSettingName[],
  settings: LiveDesktopDebugSettings,
): boolean {
  if (changedNames.includes("debugFrameSourceOverride")) return true;
  return changedNames.includes("disableMouseRelay")
    && settings.debugFrameSourceOverride !== "testPattern";
}

function copySetting<Name extends LiveDesktopDebugSettingName>(
  target: Partial<LiveDesktopDebugSettings>,
  source: LiveDesktopDebugSettings,
  name: Name,
): void {
  target[name] = source[name];
}

function isPersistedNotificationFailure(error: unknown): error is DiagnosticError & {
  details: { persisted: true; values: unknown };
} {
  return error instanceof DiagnosticError
    && error.code === "live-desktop-settings-notify-failed"
    && isRecord(error.details)
    && error.details.persisted === true
    && Object.hasOwn(error.details, "values");
}

export function createLiveDesktopDiagnosticsController(
  options: LiveDesktopDiagnosticsControllerOptions = {},
): LiveDesktopDiagnosticsController {
  const settingsStore = options.settingsStore || createBrowserLiveDesktopDebugSettingsStore();
  const applyRuntimeCandidate = options.applyRuntime;
  const refreshRuntimeCandidate = options.refreshRuntime;
  const getRuntimeStatus = typeof options.getRuntimeStatus === "function" ? options.getRuntimeStatus : () => null;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  if (!settingsStore || typeof settingsStore.read !== "function" || typeof settingsStore.write !== "function") {
    throw new TypeError("LiveDesktopDiagnosticsController requires a settingsStore with read() and write()");
  }
  if (typeof applyRuntimeCandidate !== "function" || typeof refreshRuntimeCandidate !== "function") {
    throw new TypeError("LiveDesktopDiagnosticsController requires applyRuntime() and refreshRuntime()");
  }
  const applyRuntimePort: NonNullable<LiveDesktopDiagnosticsControllerOptions["applyRuntime"]> = applyRuntimeCandidate;
  const refreshRuntimePort: NonNullable<LiveDesktopDiagnosticsControllerOptions["refreshRuntime"]> = refreshRuntimeCandidate;

  const initialSettings = settingsStore.read();
  const initialValues = normalizeLiveDesktopDebugSettings(initialSettings.values);
  let state: LiveDesktopDiagnosticsState = {
    applied: {
      confirmedKeys: [],
      updatedAt: null,
      values: {},
      verification: "unknown",
    },
    consistency: {
      desiredVsApplied: [],
      desiredVsPersisted: [],
      status: "unverified",
      unconfirmedAppliedKeys: [...SETTING_NAMES],
    },
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
  state = { ...state, consistency: calculateConsistency(state) };
  let disposed = false;
  let disposing = false;
  let disposePromise: Promise<void> | null = null;
  let operationQueue: Promise<void> = Promise.resolve();

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

  function commit(patch: Partial<LiveDesktopDiagnosticsState>): void {
    const nextState = { ...state, ...patch };
    state = { ...nextState, consistency: calculateConsistency(nextState) };
  }

  function getState(): LiveDesktopDiagnosticsState {
    ensureActive();
    return clonePlain(state);
  }

  function recordFailure(
    stage: Exclude<LiveDesktopDiagnosticsFailure["stage"], "read" | "refresh">,
    error: unknown,
    code: string,
    message: string,
    statePatch: Pick<Partial<LiveDesktopDiagnosticsState>, "runtimeStatus"> = {},
  ): DiagnosticError {
    const diagnosticError = error instanceof DiagnosticError
      ? error
      : new DiagnosticError(code, message, {
        cause: error,
        details: { technicalDetail: String(error instanceof Error ? error.message : error) },
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

  function recordRefreshFailure(error: unknown): DiagnosticError {
    const diagnosticError = error instanceof DiagnosticError
      ? error
      : new DiagnosticError("live-desktop-runtime-refresh-failed", "Failed to refresh Live Desktop runtime state", {
        cause: error,
        details: { technicalDetail: String(error instanceof Error ? error.message : error) },
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

  function enqueue<Result>(operation: () => Result | Promise<Result>): Promise<Result> {
    ensureAcceptingOperations();
    const request = operationQueue.then(() => {
      ensureAcceptingOperations();
      return operation();
    });
    operationQueue = request.then(() => undefined, () => undefined);
    return request;
  }

  async function applyCurrentSettings(
    changedNames: readonly LiveDesktopDebugSettingName[],
    applyOptions: LiveDesktopRestartOptions & Readonly<{ force?: boolean }> = {},
  ): Promise<LiveDesktopDiagnosticsState> {
    const nextValues = state.desired.values;
    const runtimeChangedNames = changedNames.filter((name) => RUNTIME_SETTING_NAMES.includes(name));
    const frontendChangedNames = changedNames.filter((name) => FRONTEND_ONLY_SETTING_NAMES.includes(name));
    const confirmedKeys = state.applied.confirmedKeys.filter((name) => !changedNames.includes(name));
    const appliedValues: Partial<LiveDesktopDebugSettings> = { ...state.applied.values };
    for (const name of frontendChangedNames) {
      copySetting(appliedValues, nextValues, name);
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

  function updateSettings(patch: unknown = {}, updateOptions: unknown = {}) {
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
        if (isPersistedNotificationFailure(error)) {
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

  function applyDesired(applyOptions: unknown = {}) {
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
