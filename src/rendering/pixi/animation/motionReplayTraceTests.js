import { createMotionRuntime, tween } from "./motionRuntime.js";
import {
  buildMotionReplayCaptureDebugConfig,
  createMotionReplayCaptureController,
  createMotionReplayTrace,
  MOTION_REPLAY_CAPTURE_SAMPLE_HZ,
  MOTION_REPLAY_TRACE_SCHEMA,
  normalizeMotionReplayCaptureSeconds,
} from "./motionReplayTrace.js";

function containsReference(value, reference, seen = new Set()) {
  if (value === reference) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((entry) => containsReference(entry, reference, seen));
}

function seedReplayRuntime(runtime) {
  const icon = { alpha: 1, x: 0, y: 0 };
  runtime.describeTarget(icon, {
    itemId: "app-a",
    kind: "Icon",
    label: "App A",
    layer: "desktop",
    sourceLabel: "desktop.icon.node",
  });
  runtime.animate(icon, "x", 120, {
    driver: tween({ duration: 1, ease: "linear" }),
    from: 0,
    laneKey: "layout-x",
  });
  runtime.animate(icon, "alpha", 0.5, {
    driver: tween({ duration: 1, ease: "linear" }),
    from: 1,
    laneKey: "fade",
  });
  for (let index = 0; index < 3; index += 1) runtime.step(1 / 60);
  return icon;
}

export function runMotionReplayTraceTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[motion replay trace test failed] ${message}`);
  };

  assert(normalizeMotionReplayCaptureSeconds(0) === 1, "replay capture seconds should clamp to 1s");
  assert(normalizeMotionReplayCaptureSeconds(999) === 300, "replay capture seconds should clamp to 300s");
  const config = buildMotionReplayCaptureDebugConfig({ seconds: 30 }, { overlayEnabled: true, timeScale: 0.5 });
  assert(config.recordHistory === true, "replay capture config should force history recording");
  assert(config.sampleHz === MOTION_REPLAY_CAPTURE_SAMPLE_HZ, "replay capture should default to 60Hz");
  assert(config.recordWindowMs === 30000, "replay capture should default to a 30s window");
  assert(config.maxSamples >= 1800, "replay capture should retain a full 30s 60Hz sample window");
  assert(config.overlayEnabled === true, "replay capture config should preserve overlay state");
  assert(config.recordFilter === null, "replay capture should clear previous record filters when no profile is supplied");
  assert(config.timeScale === 0.5, "replay capture config should preserve timeScale");
  const profileConfig = buildMotionReplayCaptureDebugConfig({
    captureProfile: {
      id: "alpha-focus",
      includeEvents: true,
      includeSamples: true,
      label: "Alpha Focus",
      propAllowlist: ["alpha"],
      targetFilters: { layer: "desktop" },
    },
    seconds: 2,
  });
  assert(profileConfig.recordFilter?.propAllowlist?.[0] === "alpha", "replay capture config should pass capture profile as recordFilter");
  assert(profileConfig.recordFilter?.targetFilters?.layer === "desktop", "replay capture config should preserve target filters");

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    runtime.configureDebug({ enabled: true, recordHistory: false, sampleHz: 10, timeScale: 1 });
    const controller = createMotionReplayCaptureController(runtime);
    const started = controller.start({ seconds: 2, startedAt: "2026-06-21T00:00:00.000Z" });
    assert(started.active === true, "controller should enter active capture state");
    assert(runtime.configureDebug().sampleHz === 60, "controller start should configure the runtime for 60Hz capture");
    const duplicateStarted = controller.start({ seconds: 3 });
    assert(duplicateStarted.seconds === 2, "controller should ignore duplicate active capture starts");
    assert(runtime.configureDebug().recordWindowMs === 2000, "duplicate capture starts should not overwrite the active capture config");

    const icon = seedReplayRuntime(runtime);
    const stopped = controller.stop({ stoppedAt: "2026-06-21T00:00:01.000Z" });
    const trace = stopped.trace;

    assert(stopped.status.active === false, "controller should leave active capture state after stop");
    assert(runtime.configureDebug().sampleHz === 10, "controller stop should restore previous runtime sample rate");
    assert(trace.schema === MOTION_REPLAY_TRACE_SCHEMA, "trace should expose the replay schema");
    assert(trace.version === 1, "trace should expose a version");
    assert(trace.mode === "property-accurate-visual-replay", "trace should declare property-accurate visual replay mode");
    assert(trace.capture.sampleHz === 60, "trace capture metadata should preserve sample rate");
    assert(trace.capture.requestedDurationMs === 2000, "trace capture metadata should preserve requested duration");
    assert(trace.timeline.frames.length > 0, "trace should include sampled replay frames");
    assert(trace.timeline.frames[0].values.length > 0, "trace frames should include property values");
    assert(trace.timeline.events.some((event) => event.type === "start"), "trace should include lifecycle events");
    assert(trace.curveStats.length > 0, "runtime replay trace should include opt-in curve stats");
    assert(trace.targets.some((target) => target.sourceLabel === "desktop.icon.node"), "trace should include used target metadata");
    assert(trace.tracks.some((track) => track.prop === "x"), "trace should include track summaries");
    assert(trace.summary.frameCount === trace.timeline.frames.length, "trace summary should count frames");
    assert(trace.summary.trackCount === trace.tracks.length, "trace summary should count tracks");
    assert(!Object.hasOwn(stopped, "json"), "capture stop should not eagerly duplicate a large trace as pretty JSON");
    assert(typeof JSON.stringify(trace) === "string", "trace should be JSON serializable");
    assert(!containsReference(trace, icon), "trace should not retain raw target references");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    runtime.configureDebug({ enabled: true, recordHistory: false, sampleHz: 10, timeScale: 0.75 });
    const controller = createMotionReplayCaptureController(runtime);
    controller.start({ seconds: 2 });
    const canceled = controller.cancel();

    assert(canceled.active === false, "cancel should leave replay capture state without materializing a trace");
    assert(runtime.configureDebug().sampleHz === 10, "cancel should restore the previous runtime sample rate");
    assert(runtime.configureDebug().timeScale === 0.75, "cancel should restore the previous runtime time scale");
    assert(controller.cancel().active === false, "cancel should be idempotent when no capture is active");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    runtime.configureDebug({ enabled: true, recordHistory: false, sampleHz: 10, timeScale: 1 });
    const alphaProfile = {
      id: "alpha-focus",
      includeEvents: true,
      includeSamples: true,
      label: "Alpha Focus",
      propAllowlist: ["alpha"],
      targetFilters: { layer: "desktop" },
    };
    const controller = createMotionReplayCaptureController(runtime);
    const started = controller.start({
      captureProfile: alphaProfile,
      seconds: 2,
      startedAt: "2026-06-21T00:00:03.000Z",
    });
    assert(started.captureProfile.label === "Alpha Focus", "capture status should expose the active capture profile");
    assert(runtime.configureDebug().recordFilter.props[0] === "alpha", "controller start should configure runtime recordFilter from profile");

    const icon = seedReplayRuntime(runtime);
    const stopped = controller.stop({ stoppedAt: "2026-06-21T00:00:04.000Z" });
    const trace = stopped.trace;
    const frameValues = trace.timeline.frames.flatMap((frame) => frame.values);

    assert(trace.capture.profile.label === "Alpha Focus", "trace capture metadata should include the capture profile");
    assert(trace.timeline.events.length > 0, "profile-filtered trace should keep matching lifecycle events");
    assert(trace.timeline.events.every((event) => event.prop === "alpha"), "profile-filtered trace should only keep alpha events");
    assert(frameValues.length > 0, "profile-filtered trace should keep matching frame values");
    assert(frameValues.every((value) => value.prop === "alpha"), "profile-filtered trace should only keep alpha frame values");
    assert(frameValues.every((value) => value.layer === "desktop"), "profile-filtered trace should preserve layer on frame values");
    assert(trace.tracks.length === 1 && trace.tracks[0].prop === "alpha", "profile-filtered trace should only summarize matching tracks");
    assert(trace.targets.length === 1 && trace.targets[0].sourceLabel === "desktop.icon.node", "profile-filtered trace should only include used targets");
    assert(!containsReference(trace, icon), "profile-filtered trace should not retain raw target references");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    runtime.configureDebug({
      enabled: true,
      maxEvents: 100,
      maxSamples: 100,
      recordHistory: true,
      sampleHz: 60,
    });
    const icon = seedReplayRuntime(runtime);
    const report = runtime.debugReport({ includeCurveStats: true, includeHistory: true, includeTargets: true });
    const trace = createMotionReplayTrace(report, {
      durationMs: 30000,
      generatedAt: "2026-06-21T00:00:02.000Z",
      sampleHz: 60,
    });
    assert(trace.generatedAt === "2026-06-21T00:00:02.000Z", "trace builder should preserve generatedAt override");
    assert(trace.timeline.timeRangeMs.max >= trace.timeline.timeRangeMs.min, "trace should expose a valid timeline range");
    assert(!containsReference(trace, icon), "trace builder should only use report data");
  }
}
