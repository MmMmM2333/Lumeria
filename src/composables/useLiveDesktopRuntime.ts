import { readonly, ref } from "vue";
import type {
  LiveDesktopBackgroundSupport,
  LiveDesktopRuntimeConfig,
  LiveDesktopRuntimeDiagnostics,
  LiveDesktopRuntimeStatus,
  LiveDesktopWindowDiagnostics,
  LiveDesktopWindowInfo,
  LiveDesktopWindowRect,
} from "../api/liveDesktopContract.js";
import { isLiveDesktopExperimentEnabled } from "../domain/experimentalFeatures.js";
import { liveDesktopPort, type LiveDesktopPort } from "../platform/launchpadPorts.js";
import {
  DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT,
  normalizeLiveDesktopBackgroundSupport,
} from "./useLaunchpadSettingsConfig.js";

const LIVE_DESKTOP_IDLE_STOP_DELAY_MS = 10_000;
const LIVE_DESKTOP_EXPERIMENT_DISABLED_REASON = "experimentDisabled";
const LIVE_DESKTOP_EXPERIMENT_DISABLED_DETAIL = "Live desktop experiment flag is disabled.";

export type LiveDesktopSupportSummary = Readonly<Pick<
  LiveDesktopBackgroundSupport,
  "detail" | "platform" | "reason" | "supportsLiveDesktopBackground" | "supportsLiveDesktopBackgroundEffects"
>>;

export type LiveDesktopRuntimeRequest = Readonly<{
  config: LiveDesktopRuntimeConfig;
  enabled: boolean;
  visible: boolean;
}>;

export type LiveDesktopRuntimeSuccess = Readonly<{
  ok: true;
  skipped?: boolean;
  stale?: boolean;
  status: LiveDesktopRuntimeStatus;
  support?: LiveDesktopSupportSummary;
}>;

export type LiveDesktopRuntimeFailure = Readonly<{
  error: unknown;
  ok: false;
  status: LiveDesktopRuntimeStatus;
  support?: LiveDesktopSupportSummary;
}>;

export type LiveDesktopRuntimeOutcome = LiveDesktopRuntimeSuccess | LiveDesktopRuntimeFailure;

export type LiveDesktopTimerAdapter = Readonly<{
  clearTimeout(timer: unknown): void;
  setTimeout(callback: () => void, delay: number): unknown;
}>;

export type LiveDesktopRuntimeOptions = Readonly<{
  isExperimentEnabled?: () => boolean;
  port?: LiveDesktopPort;
  timers?: LiveDesktopTimerAdapter;
}>;

const DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS: LiveDesktopRuntimeStatus = Object.freeze({
  phase: "stopped",
  active: false,
  generation: 0,
  reason: "nativeBridgeUnavailable",
  detail: "",
  diagnostics: {
    framesCopied: 0,
    frameTimeouts: 0,
    copyErrors: 0,
    commitErrors: 0,
    frameArrivedEvents: 0,
    frameArrivedDroppedSignals: 0,
    frameCopySamples: 0,
    frameCopyMicrosTotal: 0,
    lastFrameCopyMicros: 0,
    maxFrameCopyMicros: 0,
    frameCommitSamples: 0,
    frameCommitMicrosTotal: 0,
    lastFrameCommitMicros: 0,
    maxFrameCommitMicros: 0,
    configUpdates: 0,
    configErrors: 0,
    lastFrameWidth: 0,
    lastFrameHeight: 0,
    lastFrameFormat: 0,
    testPatternFrames: 0,
    pixelProbeSamples: 0,
    pixelProbeErrors: 0,
    blankFrameSkips: 0,
    shaderCopyFallbacks: 0,
    abandonedRendererWorkers: 0,
    reapedAbandonedRendererWorkers: 0,
    lastPixelProbeWidth: 0,
    lastPixelProbeHeight: 0,
    lastPixelProbeMinRgb: 0,
    lastPixelProbeMaxRgb: 0,
    lastPixelProbeAvgRgb: 0,
    lastPixelProbeMinAlpha: 0,
    lastPixelProbeMaxAlpha: 0,
    lastPixelProbeAvgAlpha: 0,
    lastShaderCopyError: "",
    lastAbandonedRendererReason: "",
    lastError: "",
    recentErrors: [],
  },
  windowDiagnostics: {
    platform: "unknown",
    available: false,
    reason: "nativeBridgeUnavailable",
    detail: "",
    windowCount: 0,
    candidateCount: 0,
    windows: [],
    candidates: [],
  },
});

function normalizeCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function normalizeLiveDesktopRuntimeDiagnostics(
  diagnostics: LiveDesktopRuntimeDiagnostics | null | undefined,
): LiveDesktopRuntimeDiagnostics {
  return {
    framesCopied: normalizeCount(diagnostics?.framesCopied),
    frameTimeouts: normalizeCount(diagnostics?.frameTimeouts),
    copyErrors: normalizeCount(diagnostics?.copyErrors),
    commitErrors: normalizeCount(diagnostics?.commitErrors),
    frameArrivedEvents: normalizeCount(diagnostics?.frameArrivedEvents),
    frameArrivedDroppedSignals: normalizeCount(diagnostics?.frameArrivedDroppedSignals),
    frameCopySamples: normalizeCount(diagnostics?.frameCopySamples),
    frameCopyMicrosTotal: normalizeCount(diagnostics?.frameCopyMicrosTotal),
    lastFrameCopyMicros: normalizeCount(diagnostics?.lastFrameCopyMicros),
    maxFrameCopyMicros: normalizeCount(diagnostics?.maxFrameCopyMicros),
    frameCommitSamples: normalizeCount(diagnostics?.frameCommitSamples),
    frameCommitMicrosTotal: normalizeCount(diagnostics?.frameCommitMicrosTotal),
    lastFrameCommitMicros: normalizeCount(diagnostics?.lastFrameCommitMicros),
    maxFrameCommitMicros: normalizeCount(diagnostics?.maxFrameCommitMicros),
    configUpdates: normalizeCount(diagnostics?.configUpdates),
    configErrors: normalizeCount(diagnostics?.configErrors),
    lastFrameWidth: normalizeCount(diagnostics?.lastFrameWidth),
    lastFrameHeight: normalizeCount(diagnostics?.lastFrameHeight),
    lastFrameFormat: normalizeCount(diagnostics?.lastFrameFormat),
    testPatternFrames: normalizeCount(diagnostics?.testPatternFrames),
    pixelProbeSamples: normalizeCount(diagnostics?.pixelProbeSamples),
    pixelProbeErrors: normalizeCount(diagnostics?.pixelProbeErrors),
    blankFrameSkips: normalizeCount(diagnostics?.blankFrameSkips),
    shaderCopyFallbacks: normalizeCount(diagnostics?.shaderCopyFallbacks),
    abandonedRendererWorkers: normalizeCount(diagnostics?.abandonedRendererWorkers),
    reapedAbandonedRendererWorkers: normalizeCount(diagnostics?.reapedAbandonedRendererWorkers),
    lastPixelProbeWidth: normalizeCount(diagnostics?.lastPixelProbeWidth),
    lastPixelProbeHeight: normalizeCount(diagnostics?.lastPixelProbeHeight),
    lastPixelProbeMinRgb: normalizeCount(diagnostics?.lastPixelProbeMinRgb),
    lastPixelProbeMaxRgb: normalizeCount(diagnostics?.lastPixelProbeMaxRgb),
    lastPixelProbeAvgRgb: normalizeCount(diagnostics?.lastPixelProbeAvgRgb),
    lastPixelProbeMinAlpha: normalizeCount(diagnostics?.lastPixelProbeMinAlpha),
    lastPixelProbeMaxAlpha: normalizeCount(diagnostics?.lastPixelProbeMaxAlpha),
    lastPixelProbeAvgAlpha: normalizeCount(diagnostics?.lastPixelProbeAvgAlpha),
    lastShaderCopyError: String(diagnostics?.lastShaderCopyError || ""),
    lastAbandonedRendererReason: String(diagnostics?.lastAbandonedRendererReason || ""),
    lastError: String(diagnostics?.lastError || ""),
    recentErrors: diagnostics?.recentErrors?.map((error) => String(error)) ?? [],
  };
}

function normalizeLiveDesktopWindowRect(rect: LiveDesktopWindowRect): LiveDesktopWindowRect {
  const normalizeInteger = (value: number) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  };
  return {
    left: normalizeInteger(rect?.left),
    top: normalizeInteger(rect?.top),
    right: normalizeInteger(rect?.right),
    bottom: normalizeInteger(rect?.bottom),
    width: Math.max(0, normalizeInteger(rect?.width)),
    height: Math.max(0, normalizeInteger(rect?.height)),
  };
}

function normalizeLiveDesktopWindowInfo(windowInfo: LiveDesktopWindowInfo): LiveDesktopWindowInfo {
  return {
    hwnd: String(windowInfo?.hwnd || ""),
    parentHwnd: String(windowInfo?.parentHwnd || ""),
    rootHwnd: String(windowInfo?.rootHwnd || ""),
    pid: Math.max(0, Math.trunc(Number(windowInfo?.pid) || 0)),
    className: String(windowInfo?.className || ""),
    title: String(windowInfo?.title || ""),
    processName: String(windowInfo?.processName || ""),
    role: String(windowInfo?.role || "window"),
    candidateReason: String(windowInfo?.candidateReason || ""),
    visible: Boolean(windowInfo?.visible),
    style: String(windowInfo?.style || ""),
    exStyle: String(windowInfo?.exStyle || ""),
    cloaked: Math.max(0, Math.trunc(Number(windowInfo?.cloaked) || 0)),
    rect: normalizeLiveDesktopWindowRect(windowInfo?.rect),
  };
}

function normalizeLiveDesktopWindowDiagnostics(
  diagnostics: LiveDesktopWindowDiagnostics | null | undefined,
): LiveDesktopWindowDiagnostics {
  const windows = diagnostics?.windows?.map(normalizeLiveDesktopWindowInfo) ?? [];
  const candidates = diagnostics?.candidates?.map(normalizeLiveDesktopWindowInfo) ?? [];
  return {
    platform: String(diagnostics?.platform || DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.windowDiagnostics.platform),
    available: Boolean(diagnostics?.available),
    reason: String(diagnostics?.reason || DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.windowDiagnostics.reason),
    detail: String(diagnostics?.detail || ""),
    windowCount: normalizeCount(diagnostics?.windowCount ?? windows.length),
    candidateCount: normalizeCount(diagnostics?.candidateCount ?? candidates.length),
    windows,
    candidates,
  };
}

function normalizeLiveDesktopRuntimeStatus(
  status: Partial<LiveDesktopRuntimeStatus> | null,
): LiveDesktopRuntimeStatus {
  if (!status) return structuredClone(DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS);
  const generation = Number(status?.generation);
  const phase = status.phase;
  return {
    phase: phase === "failed" || phase === "running" || phase === "starting" || phase === "stopped"
      ? phase
      : DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.phase,
    active: Boolean(status?.active),
    generation: Number.isFinite(generation) && generation >= 0 ? Math.floor(generation) : 0,
    reason: String(status?.reason || DEFAULT_LIVE_DESKTOP_RUNTIME_STATUS.reason),
    detail: String(status?.detail || ""),
    diagnostics: normalizeLiveDesktopRuntimeDiagnostics(status?.diagnostics),
    windowDiagnostics: normalizeLiveDesktopWindowDiagnostics(status?.windowDiagnostics),
  };
}

function liveDesktopRuntimeStatusIsRunning(status: LiveDesktopRuntimeStatus): boolean {
  return Boolean(status?.active || status?.phase === "running");
}

function liveDesktopRuntimeStatusIsStopped(status: LiveDesktopRuntimeStatus): boolean {
  return status?.phase === "stopped";
}

function success(
  status: LiveDesktopRuntimeStatus,
  extra: Omit<Partial<LiveDesktopRuntimeSuccess>, "ok" | "status"> = {},
): LiveDesktopRuntimeSuccess {
  return { ok: true, status, ...extra };
}

function failure(error: unknown, status: LiveDesktopRuntimeStatus): LiveDesktopRuntimeFailure {
  return { ok: false, error, status };
}

function makeFailedStatus(
  current: LiveDesktopRuntimeStatus,
  reason: string,
  error: unknown,
): LiveDesktopRuntimeStatus {
  return {
    ...normalizeLiveDesktopRuntimeStatus(current),
    active: false,
    phase: "failed",
    reason,
    detail: String(error instanceof Error ? error.message : error ?? ""),
  };
}

function makeDefaultTimerAdapter(): LiveDesktopTimerAdapter {
  if (typeof window === "undefined") {
    return {
      clearTimeout(timer: unknown) {
        globalThis.clearTimeout(timer as ReturnType<typeof globalThis.setTimeout>);
      },
      setTimeout(callback: () => void, delay: number) {
        return globalThis.setTimeout(callback, delay);
      },
    };
  }
  return {
    clearTimeout(timer: unknown) {
      window.clearTimeout(timer as number);
    },
    setTimeout(callback: () => void, delay: number) {
      return window.setTimeout(callback, delay);
    },
  };
}

function normalizeRequest(request: LiveDesktopRuntimeRequest): LiveDesktopRuntimeRequest {
  return {
    enabled: Boolean(request?.enabled),
    visible: Boolean(request?.visible),
    config: request?.config,
  };
}

export function useLiveDesktopRuntime(options: LiveDesktopRuntimeOptions = {}) {
  const port = options.port || liveDesktopPort;
  const timers = options.timers || makeDefaultTimerAdapter();
  const experimentIsEnabled = options.isExperimentEnabled || isLiveDesktopExperimentEnabled;
  if (!port || typeof port.isAvailable !== "function") {
    throw new TypeError("useLiveDesktopRuntime requires a live desktop port");
  }
  if (!timers || typeof timers.setTimeout !== "function" || typeof timers.clearTimeout !== "function") {
    throw new TypeError("useLiveDesktopRuntime requires a timer adapter");
  }

  const supportState = ref<LiveDesktopSupportSummary>({ ...DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT });
  const statusState = ref(normalizeLiveDesktopRuntimeStatus(null));
  const support = readonly(supportState);
  const status = readonly(statusState);
  let backgroundVisible: boolean | null = null;
  let idleStopTimer: unknown = null;
  let latestRequest: LiveDesktopRuntimeRequest | null = null;
  let restartRequested = false;
  let syncGeneration = 0;
  let syncQueue: Promise<void> = Promise.resolve();

  function experimentEnabled() {
    return Boolean(experimentIsEnabled());
  }

  function isAvailable() {
    return Boolean(port.isAvailable());
  }

  function publishUnavailableStatus() {
    statusState.value = normalizeLiveDesktopRuntimeStatus(null);
    backgroundVisible = null;
    return statusState.value;
  }

  function publishExperimentDisabledStatus() {
    statusState.value = normalizeLiveDesktopRuntimeStatus({
      reason: LIVE_DESKTOP_EXPERIMENT_DISABLED_REASON,
      detail: LIVE_DESKTOP_EXPERIMENT_DISABLED_DETAIL,
    });
    backgroundVisible = null;
    return statusState.value;
  }

  function clearIdleStopTimer() {
    if (idleStopTimer !== null) timers.clearTimeout(idleStopTimer);
    idleStopTimer = null;
  }

  function unavailableOutcome() {
    clearIdleStopTimer();
    restartRequested = false;
    return success(publishUnavailableStatus(), { skipped: true });
  }

  function disabledOutcome() {
    clearIdleStopTimer();
    restartRequested = false;
    return success(publishExperimentDisabledStatus(), { skipped: true });
  }

  function guardAvailability() {
    if (!experimentEnabled()) return disabledOutcome();
    if (!isAvailable()) return unavailableOutcome();
    return null;
  }

  async function refreshSupport() {
    if (!experimentEnabled()) {
      supportState.value = normalizeLiveDesktopBackgroundSupport({
        reason: LIVE_DESKTOP_EXPERIMENT_DISABLED_REASON,
        detail: LIVE_DESKTOP_EXPERIMENT_DISABLED_DETAIL,
      });
      return success(statusState.value, { skipped: true, support: supportState.value });
    }
    if (!isAvailable()) {
      supportState.value = { ...DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT };
      return success(statusState.value, { skipped: true, support: supportState.value });
    }
    try {
      supportState.value = normalizeLiveDesktopBackgroundSupport(await port.getSupport());
      return success(statusState.value, { support: supportState.value });
    } catch (error) {
      supportState.value = { ...DEFAULT_LIVE_DESKTOP_BACKGROUND_SUPPORT };
      return { ...failure(error, statusState.value), support: supportState.value };
    }
  }

  async function refreshStatus() {
    const unavailable = guardAvailability();
    if (unavailable) return unavailable;
    try {
      statusState.value = normalizeLiveDesktopRuntimeStatus(await port.getStatus());
      // Native status reports lifecycle but not visual visibility, so the next
      // sync must explicitly reconcile visibility instead of assuming it.
      backgroundVisible = null;
      return success(statusState.value);
    } catch (error) {
      statusState.value = makeFailedStatus(statusState.value, "statusRefreshFailed", error);
      backgroundVisible = null;
      return failure(error, statusState.value);
    }
  }

  async function setVisible(visible: boolean): Promise<LiveDesktopRuntimeOutcome> {
    const unavailable = guardAvailability();
    if (unavailable) return unavailable;
    const nextVisible = Boolean(visible);
    if (backgroundVisible === nextVisible) return success(statusState.value, { skipped: true });
    try {
      statusState.value = normalizeLiveDesktopRuntimeStatus(await port.setVisible(nextVisible));
      backgroundVisible = nextVisible;
      return success(statusState.value);
    } catch (error) {
      statusState.value = makeFailedStatus(statusState.value, "visibilityUpdateFailed", error);
      return failure(error, statusState.value);
    }
  }

  async function configure(config: LiveDesktopRuntimeConfig): Promise<LiveDesktopRuntimeOutcome> {
    const unavailable = guardAvailability();
    if (unavailable) return unavailable;
    try {
      statusState.value = normalizeLiveDesktopRuntimeStatus(await port.configure(config));
      return success(statusState.value);
    } catch (error) {
      statusState.value = makeFailedStatus(statusState.value, "configureFailed", error);
      return failure(error, statusState.value);
    }
  }

  async function start(config: LiveDesktopRuntimeConfig): Promise<LiveDesktopRuntimeOutcome> {
    clearIdleStopTimer();
    const unavailable = guardAvailability();
    if (unavailable) return unavailable;
    const configured = await configure(config);
    if (!configured.ok) return configured;
    try {
      statusState.value = normalizeLiveDesktopRuntimeStatus(await port.start());
      backgroundVisible = liveDesktopRuntimeStatusIsRunning(statusState.value) ? true : null;
      return success(statusState.value);
    } catch (error) {
      statusState.value = makeFailedStatus(statusState.value, "startFailed", error);
      backgroundVisible = null;
      return failure(error, statusState.value);
    }
  }

  async function stop() {
    clearIdleStopTimer();
    const unavailable = guardAvailability();
    if (unavailable) return unavailable;
    try {
      statusState.value = normalizeLiveDesktopRuntimeStatus(await port.stop());
      backgroundVisible = null;
      return success(statusState.value);
    } catch (error) {
      statusState.value = makeFailedStatus(statusState.value, "stopFailed", error);
      return failure(error, statusState.value);
    }
  }

  function requestCanRun(request: LiveDesktopRuntimeRequest): boolean {
    return Boolean(
      request.enabled
      && supportState.value.supportsLiveDesktopBackground
    );
  }

  function requestShouldRun(request: LiveDesktopRuntimeRequest): boolean {
    return Boolean(request.visible && requestCanRun(request));
  }

  function syncIsCurrent(generation: number): boolean {
    return generation === syncGeneration;
  }

  function scheduleIdleStop() {
    clearIdleStopTimer();
    const generation = syncGeneration;
    idleStopTimer = timers.setTimeout(() => {
      idleStopTimer = null;
      const operation = syncQueue.then(async () => {
        if (!syncIsCurrent(generation) || (latestRequest && requestShouldRun(latestRequest))) {
          return success(statusState.value, { skipped: true });
        }
        if (liveDesktopRuntimeStatusIsStopped(statusState.value)) {
          return success(statusState.value, { skipped: true });
        }
        return stop();
      });
      syncQueue = operation.then(() => undefined, () => undefined);
      return operation;
    }, LIVE_DESKTOP_IDLE_STOP_DELAY_MS);
  }

  async function performSync(generation: number): Promise<LiveDesktopRuntimeOutcome> {
    if (!syncIsCurrent(generation)) return success(statusState.value, { stale: true });
    const unavailable = guardAvailability();
    if (unavailable) return unavailable;

    const request = latestRequest;
    if (!request) throw new Error("Live desktop sync request is unavailable");
    const current = normalizeLiveDesktopRuntimeStatus(statusState.value);
    if (!requestShouldRun(request)) {
      if (!requestCanRun(request)) restartRequested = false;
      if (
        !request.visible
        && requestCanRun(request)
        && liveDesktopRuntimeStatusIsRunning(current)
      ) {
        const hidden = await setVisible(false);
        if (!hidden.ok || !syncIsCurrent(generation)) return hidden;
        scheduleIdleStop();
        return success(statusState.value);
      }
      clearIdleStopTimer();
      if (liveDesktopRuntimeStatusIsStopped(current)) {
        return success(statusState.value, { skipped: true });
      }
      return stop();
    }

    clearIdleStopTimer();
    if (restartRequested) {
      if (liveDesktopRuntimeStatusIsRunning(current)) {
        const stopped = await stop();
        if (!stopped.ok || !syncIsCurrent(generation)) return stopped;
      }
      const started = await start(request.config);
      if (started.ok && syncIsCurrent(generation) && liveDesktopRuntimeStatusIsRunning(started.status)) {
        restartRequested = false;
      }
      return started;
    }
    if (liveDesktopRuntimeStatusIsRunning(current)) {
      const shown = await setVisible(true);
      if (!shown.ok || !syncIsCurrent(generation)) return shown;
      return configure(request.config);
    }
    return start(request.config);
  }

  function sync(request: LiveDesktopRuntimeRequest): Promise<LiveDesktopRuntimeOutcome> {
    latestRequest = normalizeRequest(request);
    const generation = ++syncGeneration;
    const operation = syncQueue.then(() => performSync(generation));
    syncQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function restart(request: LiveDesktopRuntimeRequest): Promise<LiveDesktopRuntimeOutcome> {
    restartRequested = true;
    return sync(request);
  }

  function dispose() {
    clearIdleStopTimer();
    syncGeneration += 1;
    restartRequested = false;
  }

  return {
    clearIdleStopTimer,
    configure,
    dispose,
    refreshStatus,
    refreshSupport,
    restart,
    setVisible,
    start,
    status,
    stop,
    support,
    sync,
  };
}
