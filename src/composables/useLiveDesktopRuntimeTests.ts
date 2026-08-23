import { useLiveDesktopRuntime } from "./useLiveDesktopRuntime.js";
import type {
  LiveDesktopBackgroundSupport,
  LiveDesktopRuntimeConfig,
  LiveDesktopRuntimeStatus,
} from "../api/liveDesktopContract.js";
import type { LiveDesktopPort } from "../platform/launchpadPorts.js";

const EMPTY_DIAGNOSTICS = Object.freeze({
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
});

const EMPTY_WINDOW_DIAGNOSTICS = Object.freeze({
  platform: "windows",
  available: true,
  reason: "available",
  detail: "",
  windowCount: 0,
  candidateCount: 0,
  windows: [],
  candidates: [],
});

function makeStatus(
  phase: LiveDesktopRuntimeStatus["phase"],
  active: boolean,
  generation: number,
): LiveDesktopRuntimeStatus {
  return {
    phase,
    active,
    generation,
    reason: phase,
    detail: "",
    diagnostics: EMPTY_DIAGNOSTICS,
    windowDiagnostics: EMPTY_WINDOW_DIAGNOSTICS,
  };
}

const SUPPORT: LiveDesktopBackgroundSupport = {
  platform: "windows",
  supportsLiveDesktopBackground: true,
  supportsLiveDesktopBackgroundEffects: true,
  reason: "available",
  detail: "",
  prerequisiteProbe: {
    supportsD3d11: true,
    adapterCount: 1,
    outputCount: 1,
    reason: "available",
    detail: "",
  },
  rendererProbe: {
    supportsDirectComposition: true,
    supportsWindowTarget: true,
    supportsRootVisual: true,
    supportsNativeRenderer: true,
    supportsNativeEffects: true,
    reason: "available",
    detail: "",
  },
};

const BASE_CONFIG: LiveDesktopRuntimeConfig = {
  effect: "blur",
  debugFrameSourceOverride: null,
  blurStrength: 50,
  darkenStrength: 28,
  darkenColor: "#1c1c1c",
  opacity: 80,
  effectPlan: null,
  acrylicAppearance: "system",
  acrylicParams: {
    brightness: 0.8,
    contrast: 0.85,
    noise: 0.005,
    saturation: 1.5,
    seed: 0,
    tintColor: [0.2, 0.2, 0.2],
    tintStrength: 0.2,
  },
  disableMouseRelay: true,
  skipBlankFrames: false,
  forceDwmFlush: false,
};

function makeTimerAdapter() {
  const pending: Array<() => void> = [];
  const isTimerCallback = (value: unknown): value is (() => void) => typeof value === "function";
  return {
    clearTimeout(timer: unknown) {
      if (!isTimerCallback(timer)) throw new TypeError("test timer handle must be a callback");
      const index = pending.indexOf(timer);
      if (index >= 0) pending.splice(index, 1);
    },
    pending,
    setTimeout(callback: () => void) {
      pending.push(callback);
      return callback;
    },
  };
}

type PortOverrides = Readonly<{
  available?: boolean;
  configureError?: unknown;
  port?: Partial<LiveDesktopPort>;
  startError?: unknown;
  statusError?: unknown;
  supportError?: unknown;
  visibilityError?: unknown;
}>;

function makePort(overrides: PortOverrides = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  let generation = 0;
  const runningStatus = () => makeStatus("running", true, ++generation);
  const port: LiveDesktopPort = {
    configure: async (config: LiveDesktopRuntimeConfig) => {
      calls.push(["configure", config]);
      if (overrides.configureError) throw overrides.configureError;
      return runningStatus();
    },
    getStatus: async () => {
      calls.push(["status"]);
      if (overrides.statusError) throw overrides.statusError;
      return makeStatus("stopped", false, generation);
    },
    getSupport: async () => {
      calls.push(["support"]);
      if (overrides.supportError) throw overrides.supportError;
      return SUPPORT;
    },
    isAvailable: () => overrides.available !== false,
    setVisible: async (visible: boolean) => {
      calls.push(["visible", visible]);
      if (overrides.visibilityError) throw overrides.visibilityError;
      return runningStatus();
    },
    start: async () => {
      calls.push(["start"]);
      if (overrides.startError) throw overrides.startError;
      return runningStatus();
    },
    stop: async () => {
      calls.push(["stop"]);
      return makeStatus("stopped", false, ++generation);
    },
    ...overrides.port,
  };
  return { calls, port };
}

export async function runLiveDesktopRuntimeTests() {
  const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
    if (!condition) throw new Error(`[Live desktop runtime test failed] ${message}`);
  };

  const timers = makeTimerAdapter();
  const { calls, port } = makePort();
  const firstCallArgument = () => calls[0]?.[1];
  const runtime = useLiveDesktopRuntime({
    isExperimentEnabled: () => true,
    port,
    timers,
  });
  assert(runtime.status.value.phase === "stopped", "live desktop status should start stopped");
  assert(!runtime.support.value.supportsLiveDesktopBackground, "live desktop support should start unavailable");

  const supportOutcome = await runtime.refreshSupport();
  assert(supportOutcome.ok && runtime.support.value.supportsLiveDesktopBackground, "support refresh should publish native capabilities");

  const firstConfig: LiveDesktopRuntimeConfig = BASE_CONFIG;
  const startOutcome = await runtime.sync({ enabled: true, visible: true, config: firstConfig });
  assert(startOutcome.ok && String(runtime.status.value.phase) === "running", "visible enabled backgrounds should start the runtime");
  assert(calls.map(([name]) => name).join(",") === "support,configure,start", "cold start should configure before starting");

  calls.length = 0;
  const secondConfig: LiveDesktopRuntimeConfig = {
    ...BASE_CONFIG,
    effect: "acrylicWebgl",
    opacity: 70,
  };
  await runtime.sync({ enabled: true, visible: true, config: secondConfig });
  assert(calls.map(([name]) => name).join(",") === "configure", "running backgrounds should reconfigure without restarting");
  assert(firstCallArgument() === secondConfig, "runtime configuration should stay an opaque caller-owned value");

  calls.length = 0;
  const restart = runtime.restart({ enabled: true, visible: true, config: secondConfig });
  const overlappingSync = runtime.sync({ enabled: true, visible: true, config: secondConfig });
  await Promise.all([restart, overlappingSync]);
  assert(calls.map(([name]) => name).join(",") === "stop,configure,start", "restart intent should survive an overlapping ordinary sync");

  calls.length = 0;
  await runtime.sync({ enabled: true, visible: false, config: secondConfig });
  assert(calls.map(([name]) => name).join(",") === "visible", "hiding should keep a running background warm");
  assert(firstCallArgument() === false && Number(timers.pending.length) === 1, "hidden backgrounds should schedule one idle stop");

  calls.length = 0;
  await runtime.sync({ enabled: true, visible: true, config: secondConfig });
  assert(Number(timers.pending.length) === 0, "reopening should cancel the pending idle stop");
  assert(calls.map(([name]) => name).join(",") === "visible,configure", "reopening should reuse and show the warm runtime");

  calls.length = 0;
  await runtime.sync({ enabled: true, visible: false, config: secondConfig });
  const idleStop = timers.pending.shift();
  assert(typeof idleStop === "function", "hiding should retain the scheduled idle-stop callback");
  await idleStop();
  assert(calls.map(([name]) => name).join(",") === "visible,stop", "idle expiry should stop a hidden runtime");
  assert(String(runtime.status.value.phase) === "stopped", "idle expiry should publish stopped status");

  const disabledPort = makePort();
  const disabled = useLiveDesktopRuntime({
    isExperimentEnabled: () => false,
    port: disabledPort.port,
    timers: makeTimerAdapter(),
  });
  const disabledOutcome = await disabled.sync({ enabled: true, visible: true, config: firstConfig });
  assert(disabledOutcome.ok && disabledOutcome.skipped, "disabled experiments should return an explicit skipped outcome");
  assert(disabled.status.value.reason === "experimentDisabled", "disabled experiments should expose their reason");
  assert(disabledPort.calls.length === 0, "disabled experiments should not invoke native commands");

  const supportError = new Error("support unavailable");
  const failedSupport = useLiveDesktopRuntime({
    isExperimentEnabled: () => true,
    port: makePort({ supportError }).port,
    timers: makeTimerAdapter(),
  });
  const failedSupportOutcome = await failedSupport.refreshSupport();
  assert(!failedSupportOutcome.ok && failedSupportOutcome.error === supportError, "support failures should remain explicit outcomes");
  assert(!failedSupport.support.value.supportsLiveDesktopBackground, "support failures should restore unavailable capabilities");

  const startError = new Error("renderer failed");
  const failedPort = makePort({ startError });
  const failed = useLiveDesktopRuntime({
    isExperimentEnabled: () => true,
    port: failedPort.port,
    timers: makeTimerAdapter(),
  });
  await failed.refreshSupport();
  const failedOutcome = await failed.sync({ enabled: true, visible: true, config: firstConfig });
  assert(!failedOutcome.ok && failedOutcome.error === startError, "runtime start failures should remain explicit outcomes");
  assert(failed.status.value.phase === "failed" && failed.status.value.reason === "startFailed", "runtime start failures should publish failed status");

  const statusError = new Error("native status channel closed");
  const failedRefresh = useLiveDesktopRuntime({
    isExperimentEnabled: () => true,
    port: makePort({ statusError }).port,
    timers: makeTimerAdapter(),
  });
  const failedRefreshOutcome = await failedRefresh.refreshStatus();
  assert(!failedRefreshOutcome.ok && failedRefreshOutcome.error === statusError, "status refresh failures should remain explicit outcomes");
  assert(failedRefresh.status.value.phase === "failed", "status refresh failures should remain visible in runtime state");
  assert(failedRefresh.status.value.reason === "statusRefreshFailed", "status refresh failures should use a stable reason");
  assert(failedRefresh.status.value.detail === statusError.message, "status refresh failures should preserve technical detail");

  const visibilityError = new Error("native visibility channel closed");
  const visibilityTimers = makeTimerAdapter();
  const failedVisibilityPort = makePort({ visibilityError });
  const failedVisibility = useLiveDesktopRuntime({
    isExperimentEnabled: () => true,
    port: failedVisibilityPort.port,
    timers: visibilityTimers,
  });
  await failedVisibility.refreshSupport();
  await failedVisibility.sync({ enabled: true, visible: true, config: firstConfig });
  failedVisibilityPort.calls.length = 0;
  const failedVisibilityOutcome = await failedVisibility.sync({ enabled: true, visible: false, config: firstConfig });
  assert(!failedVisibilityOutcome.ok && failedVisibilityOutcome.error === visibilityError, "visibility failures should stop the current runtime sync");
  assert(failedVisibilityPort.calls.map(([name]) => name).join(",") === "visible", "visibility failures should not continue into another runtime command");
  assert(failedVisibility.status.value.phase === "failed", "visibility failures should remain visible in runtime state");
  assert(failedVisibility.status.value.reason === "visibilityUpdateFailed", "visibility failures should use a stable reason");
  assert(failedVisibility.status.value.detail === visibilityError.message, "visibility failures should preserve technical detail");
  assert(visibilityTimers.pending.length === 0, "failed hiding should not schedule an idle stop");
}
