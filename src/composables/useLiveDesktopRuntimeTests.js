import { useLiveDesktopRuntime } from "./useLiveDesktopRuntime.js";

function makeTimerAdapter() {
  const pending = [];
  return {
    clearTimeout(timer) {
      const index = pending.indexOf(timer);
      if (index >= 0) pending.splice(index, 1);
    },
    pending,
    setTimeout(callback) {
      pending.push(callback);
      return callback;
    },
  };
}

function makePort(overrides = {}) {
  const calls = [];
  let generation = 0;
  const runningStatus = () => ({ phase: "running", active: true, generation: ++generation, reason: null, detail: "" });
  const port = {
    configure: async (config) => {
      calls.push(["configure", config]);
      if (overrides.configureError) throw overrides.configureError;
      return runningStatus();
    },
    getStatus: async () => {
      calls.push(["status"]);
      return { phase: "stopped", active: false, generation, reason: null, detail: "" };
    },
    getSupport: async () => {
      calls.push(["support"]);
      if (overrides.supportError) throw overrides.supportError;
      return {
        platform: "windows",
        supportsLiveDesktopBackground: true,
        supportsLiveDesktopBackgroundEffects: true,
        reason: null,
        detail: "",
      };
    },
    isAvailable: () => overrides.available !== false,
    setVisible: async (visible) => {
      calls.push(["visible", visible]);
      return runningStatus();
    },
    start: async () => {
      calls.push(["start"]);
      if (overrides.startError) throw overrides.startError;
      return runningStatus();
    },
    stop: async () => {
      calls.push(["stop"]);
      return { phase: "stopped", active: false, generation: ++generation, reason: null, detail: "" };
    },
    ...overrides.port,
  };
  return { calls, port };
}

export async function runLiveDesktopRuntimeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Live desktop runtime test failed] ${message}`);
  };

  const timers = makeTimerAdapter();
  const { calls, port } = makePort();
  const runtime = useLiveDesktopRuntime({
    isExperimentEnabled: () => true,
    port,
    timers,
  });
  assert(runtime.status.value.phase === "stopped", "live desktop status should start stopped");
  assert(!runtime.support.value.supportsLiveDesktopBackground, "live desktop support should start unavailable");

  const supportOutcome = await runtime.refreshSupport();
  assert(supportOutcome.ok && runtime.support.value.supportsLiveDesktopBackground, "support refresh should publish native capabilities");

  const firstConfig = { effect: "blur", opacity: 0.8 };
  const startOutcome = await runtime.sync({ enabled: true, visible: true, config: firstConfig });
  assert(startOutcome.ok && runtime.status.value.phase === "running", "visible enabled backgrounds should start the runtime");
  assert(calls.map(([name]) => name).join(",") === "support,configure,start", "cold start should configure before starting");

  calls.length = 0;
  const secondConfig = { effect: "acrylicWebgl", opacity: 0.7 };
  await runtime.sync({ enabled: true, visible: true, config: secondConfig });
  assert(calls.map(([name]) => name).join(",") === "configure", "running backgrounds should reconfigure without restarting");
  assert(calls[0][1] === secondConfig, "runtime configuration should stay an opaque caller-owned value");

  calls.length = 0;
  const restart = runtime.restart({ enabled: true, visible: true, config: secondConfig });
  const overlappingSync = runtime.sync({ enabled: true, visible: true, config: secondConfig });
  await Promise.all([restart, overlappingSync]);
  assert(calls.map(([name]) => name).join(",") === "stop,configure,start", "restart intent should survive an overlapping ordinary sync");

  calls.length = 0;
  await runtime.sync({ enabled: true, visible: false, config: secondConfig });
  assert(calls.map(([name]) => name).join(",") === "visible", "hiding should keep a running background warm");
  assert(calls[0][1] === false && timers.pending.length === 1, "hidden backgrounds should schedule one idle stop");

  calls.length = 0;
  await runtime.sync({ enabled: true, visible: true, config: secondConfig });
  assert(timers.pending.length === 0, "reopening should cancel the pending idle stop");
  assert(calls.map(([name]) => name).join(",") === "visible,configure", "reopening should reuse and show the warm runtime");

  calls.length = 0;
  await runtime.sync({ enabled: true, visible: false, config: secondConfig });
  const idleStop = timers.pending.shift();
  await idleStop();
  assert(calls.map(([name]) => name).join(",") === "visible,stop", "idle expiry should stop a hidden runtime");
  assert(runtime.status.value.phase === "stopped", "idle expiry should publish stopped status");

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
}
