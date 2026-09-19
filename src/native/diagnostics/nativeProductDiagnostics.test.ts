import assert from "node:assert/strict";
import { createNativeProductDiagnostics } from "./nativeProductDiagnostics.js";
import {
  createMotionRuntime,
  MOTION_REPLAY_TRACE_SCHEMA,
  tween,
} from "../../rendering/motionPort.js";
import { normalizeMotionReplayTrace } from "../../components/backgroundDebug/motionReplayViewerModel.js";

function createRuntimeFixture() {
  const runtime = createMotionRuntime({ autoStart: false });
  const target = { x: 0 };
  return { runtime, target };
}

async function run() {
  const { runtime, target } = createRuntimeFixture();
  const backgroundCalls: unknown[] = [];
  const layoutCalls: unknown[] = [];
  const backgroundCallsRestore = { count: 0 };
  const layoutCallsRestore = { count: 0 };
  const diagnostics = createNativeProductDiagnostics({
    background: {
      getState: () => ({ effect: "blur", blurStrength: 50 }),
      preview: (patch) => {
        backgroundCalls.push(patch);
        return { preview: true, patch };
      },
      restore: () => {
        backgroundCallsRestore.count += 1;
        return { restored: true };
      },
    },
    layout: {
      getState: () => ({ enabled: false, hostMaxHeightPx: 960 }),
      preview: (patch) => {
        layoutCalls.push(patch);
        return { preview: true, patch };
      },
      restore: () => {
        layoutCallsRestore.count += 1;
        return { restored: true };
      },
    },
    liveDesktop: {
      getState: () => ({ active: false, phase: "idle" }),
    },
    motion: runtime,
    now: () => new Date("2026-09-18T00:00:00.000Z"),
  });
  runtime.describeTarget(target, {
    kind: "NativeDiagnosticsTestTarget",
    label: "Diagnostics test target",
    sourceLabel: "native.test.target",
  });

  const config = await diagnostics.command({
    action: "motion-config",
    enabled: true,
    maxEvents: 400,
    maxSamples: 200,
    recordHistory: true,
    recordWindowMs: 30_000,
    sampleHz: 60,
    timeScale: 1,
  }) as Record<string, unknown>;
  assert.equal(config.enabled, true);
  assert.equal(config.recordHistory, true);

  runtime.animate(target, "x", 20, {
    driver: tween({ duration: 0.1 }),
    lane: "base",
    laneKey: "diagnostics-test",
  });
  for (let index = 0; index < 12; index += 1) runtime.step(0.01);

  const report = await diagnostics.command({
    action: "motion-report",
    includeChannels: true,
    includeCurveStats: true,
    includeHistory: true,
    includeTargets: true,
    maxAnimations: 2,
    maxCurveStats: 2,
    maxEvents: 4,
    maxSamples: 3,
    maxTargets: 2,
    maxWarnings: 2,
  }) as Record<string, unknown>;
  const reportHistory = report.history as Record<string, unknown>;
  assert.ok(Array.isArray(report.animations) && report.animations.length <= 2);
  assert.ok(Array.isArray(reportHistory.samples) && reportHistory.samples.length <= 3);
  assert.ok(Array.isArray(report.targets));
  assert.ok(Array.isArray(report.curveStats));
  assert.ok((report.targets as unknown[]).some((entry) => (
    (entry as Record<string, unknown>).sourceLabel === "native.test.target"
  )));
  assert.equal((report.bounds as Record<string, unknown>).maxSamples, 3);

  const trace = await diagnostics.command({
    action: "motion-trace",
    maxCurveStats: 2,
    maxEvents: 4,
    maxFrames: 3,
    maxTargets: 2,
    maxTracks: 2,
    maxValuesPerFrame: 2,
    maxWarnings: 2,
    seconds: 2,
    sampleHz: 30,
  }) as Record<string, unknown>;
  assert.equal(trace.schema, MOTION_REPLAY_TRACE_SCHEMA);
  const traceTimeline = trace.timeline as Record<string, unknown>;
  assert.ok(Array.isArray(traceTimeline.frames) && traceTimeline.frames.length <= 3);
  assert.ok(Array.isArray(traceTimeline.events) && traceTimeline.events.length <= 4);
  normalizeMotionReplayTrace(trace);

  const cleared = await diagnostics.command({ action: "motion-clear" }) as Record<string, unknown>;
  assert.equal(cleared.cleared, true);
  const emptyReport = await diagnostics.command({
    action: "motion-report",
    maxSamples: 2,
  }) as Record<string, unknown>;
  assert.equal((emptyReport.history as Record<string, unknown>).samples instanceof Array, true);
  assert.equal(((emptyReport.history as Record<string, unknown>).samples as unknown[]).length, 0);

  const backgroundPreview = await diagnostics.command({
    action: "background-preview",
    blurStrength: 72,
    darkenColor: "#AABBCC",
    effect: "acrylic",
  }) as Record<string, unknown>;
  assert.equal((backgroundPreview.patch as Record<string, unknown>).darkenColor, "#aabbcc");
  assert.deepEqual(backgroundCalls[0], { blurStrength: 72, darkenColor: "#aabbcc", effect: "acrylic" });

  const layoutPreview = await diagnostics.command({
    action: "layout-preview",
    gridPaddingTopPx: 42,
    hostMaxHeightPx: 1200,
  }) as Record<string, unknown>;
  assert.deepEqual(layoutPreview.patch, { gridPaddingTopPx: 42, hostMaxHeightPx: 1200 });
  assert.equal(layoutCalls.length, 1);

  const liveStatus = diagnostics.status();
  assert.equal((liveStatus.motion as Record<string, unknown>).config instanceof Object, true);
  assert.equal((liveStatus.background as Record<string, unknown>).available, true);
  assert.equal((liveStatus.layout as Record<string, unknown>).available, true);
  assert.equal((liveStatus.liveDesktop as Record<string, unknown>).available, true);

  await assert.rejects(
    diagnostics.command({ action: "not-a-command" }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-action-unknown",
  );
  assert.equal((diagnostics.status().lastError as Record<string, unknown>).action, "not-a-command");

  await assert.rejects(
    diagnostics.command({ action: "motion-config", unknown: true }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-params-invalid",
  );
  await assert.rejects(
    diagnostics.command({ action: "motion-config", timeScale: 9 }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-params-invalid",
  );
  await assert.rejects(
    diagnostics.command({ action: "motion-report", maxSamples: -1 }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-params-invalid",
  );
  await assert.rejects(
    diagnostics.command({ action: "motion-trace", seconds: 1, durationMs: 1000 }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-params-invalid",
  );
  await assert.rejects(
    diagnostics.command({ action: "background-preview", effect: "invalid" }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-params-invalid",
  );
  await assert.rejects(
    diagnostics.command({ action: "layout-preview", hostMaxHeightPx: 5000 }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-params-invalid",
  );

  const disposeResult = await diagnostics.dispose();
  assert.equal(disposeResult.errors.length, 0);
  assert.equal(backgroundCallsRestore.count, 1);
  assert.equal(layoutCallsRestore.count, 1);
  assert.equal(runtime.configureDebug().enabled, false);
  assert.equal(runtime.debugReport({ includeHistory: true }).history?.samples.length ?? 0, 0);
  assert.equal(diagnostics.status().disposed, true);
  await assert.rejects(
    diagnostics.command({ action: "motion-report" }),
    (error: unknown) => (error as { code?: string }).code === "native-diagnostics-disposed",
  );
  const secondDispose = await diagnostics.dispose();
  assert.deepEqual(secondDispose, disposeResult);
}

await run();
