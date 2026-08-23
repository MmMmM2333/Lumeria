import { normalizeMotionReplayTrace } from "../src/components/backgroundDebug/motionReplayViewerModel.js";
import type { MotionReplaySelectionRef } from "../src/components/backgroundDebug/motionReplayViewerModel.js";
import { createDiagnosticArtifactStore } from "../src/diagnostics/diagnosticArtifactStore.js";
import { createMotionReplayDocument } from "../src/diagnostics/motionReplayDocument.js";
import type {
  DiagnosticArtifactPage,
  DiagnosticArtifactReference,
} from "../src/diagnostics/diagnosticProtocol.js";

type BenchmarkDurationSeconds = number | null;
type UnknownRecord = Record<string, unknown>;

interface BenchmarkConfig {
  durations: BenchmarkDurationSeconds[];
  sampleHz: number;
  trackCount: number;
}

interface BenchmarkTrack extends MotionReplaySelectionRef {
  driver: "spring" | "tween";
  key: string;
  lane: "base";
  laneKey: string;
  layer: "desktop" | "folder";
  prop: string;
  sourceLabel: string;
  targetId: number;
}

interface OperationMeasurement<Sample> {
  durationMsMedian: number;
  heapDeltaBytesMedian: number;
  iterations: number;
  sample: Sample | null;
}

interface RetainedOperationMeasurement<Output, Sample> {
  measurement: OperationMeasurement<Sample>;
  output: Output;
}

const TRACE_SCHEMA = "pixi-motion-replay-trace/v1";
const DEFAULT_DURATIONS_SECONDS = [30, 300];
const DEFAULT_TRACK_COUNT = 8;
const DEFAULT_SAMPLE_HZ = 60;
const ITERATIONS = 3;
const BENCHMARK_PROPS: readonly string[] = Object.freeze(["x", "y", "alpha", "scale"]);

function readPositiveInteger(value: unknown, fallback: number, label: string): number;
function readPositiveInteger(value: unknown, fallback: null, label: string): number | null;
function readPositiveInteger(value: unknown, fallback: number | null, label: string): number | null {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return number;
}

function readArgs(argv: readonly string[]): BenchmarkConfig {
  const values = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(argument);
    if (!match) throw new TypeError(`Unsupported argument: ${argument}`);
    const key = match[1];
    const value = match[2];
    if (key === undefined || value === undefined) throw new TypeError(`Unsupported argument: ${argument}`);
    values.set(key, value);
  }
  const durations = String(values.get("durations") || DEFAULT_DURATIONS_SECONDS.join(","))
    .split(",")
    .map((value) => readPositiveInteger(value.trim(), null, "durations"));
  return {
    durations,
    sampleHz: readPositiveInteger(values.get("sample-hz"), DEFAULT_SAMPLE_HZ, "sample-hz"),
    trackCount: readPositiveInteger(values.get("tracks"), DEFAULT_TRACK_COUNT, "tracks"),
  };
}

function makeTrack(index: number): BenchmarkTrack {
  const prop = BENCHMARK_PROPS[index % BENCHMARK_PROPS.length];
  if (prop === undefined) throw new RangeError("Benchmark motion property lookup failed");
  const targetId = index + 1;
  return {
    driver: index % 2 === 0 ? "spring" : "tween",
    key: `${targetId}:${prop}:base:track-${targetId}`,
    lane: "base",
    laneKey: `track-${targetId}`,
    layer: index % 3 === 0 ? "folder" : "desktop",
    prop,
    sourceLabel: `benchmark.target.${targetId}`,
    targetId,
  };
}

function makeSyntheticTrace(durationSeconds: BenchmarkDurationSeconds, trackCount: number, sampleHz: number) {
  const durationValue = Number(durationSeconds);
  const tracks = Array.from({ length: trackCount }, (_value, index) => makeTrack(index));
  const frameCount = durationValue * sampleHz;
  const frameIntervalMs = 1000 / sampleHz;
  const durationMs = frameCount > 1 ? (frameCount - 1) * frameIntervalMs : 0;
  const frames = Array.from({ length: frameCount }, (_value, frame) => {
    const timeMs = frame * frameIntervalMs;
    const progress = durationMs > 0 ? timeMs / durationMs : 0;
    return {
      activeAnimationCount: trackCount,
      frame,
      timeMs,
      values: tracks.map((track, index) => {
        const phase = progress * Math.PI * 2 + index * 0.3;
        const target = index % 3 === 2 ? 1 : 100 + index * 10;
        return {
          driver: track.driver,
          lane: track.lane,
          laneKey: track.laneKey,
          layer: track.layer,
          prop: track.prop,
          sourceLabel: track.sourceLabel,
          targetId: track.targetId,
          to: target,
          value: target * progress + Math.sin(phase) * (index + 1),
          velocity: target / Math.max(1, durationValue) + Math.cos(phase) * 4,
        };
      }),
    };
  });
  const events = tracks.flatMap((track, index) => [
    {
      ...track,
      frame: 0,
      timeMs: 0,
      to: 100 + index * 10,
      type: "start",
      value: 0,
      velocity: 0,
    },
    {
      ...track,
      frame: Math.floor(frameCount / 2),
      reason: "benchmark-retarget",
      timeMs: durationMs / 2,
      to: 100 + index * 10,
      type: "retarget",
      value: 50 + index,
      velocity: 4,
    },
    {
      ...track,
      frame: Math.max(0, frameCount - 1),
      timeMs: durationMs,
      to: 100 + index * 10,
      type: "complete",
      value: 100 + index * 10,
      velocity: 0,
    },
  ]);
  return {
    capture: { requestedDurationMs: durationValue * 1000, sampleHz },
    generatedAt: "2026-08-02T00:00:00.000Z",
    mode: "property-accurate-visual-replay",
    schema: TRACE_SCHEMA,
    summary: {
      eventCount: events.length,
      frameCount: frames.length,
      targetCount: trackCount,
      trackCount,
      valueCount: frames.length * trackCount,
      warningCount: 0,
    },
    targets: tracks.map((track) => ({
      kind: "BenchmarkTarget",
      label: track.sourceLabel,
      layer: track.layer,
      sourceLabel: track.sourceLabel,
      targetId: track.targetId,
    })),
    timeline: {
      events,
      frames,
      timeRangeMs: { max: durationMs, min: 0 },
    },
    tracks: tracks.map((track) => ({ ...track, sampleCount: frameCount })),
    version: 1,
    warnings: [],
  };
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (isUnknownRecord(value)) return value;
  throw new TypeError(`${label} must be an object`);
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (Array.isArray(value)) return value;
  throw new TypeError(`${label} must be an array`);
}

function summarizeTrace(value: unknown): Readonly<{ frameCount: number; trackCount: number }> {
  const trace = requireRecord(value, "Benchmark trace");
  const timeline = requireRecord(trace.timeline, "Benchmark trace timeline");
  return {
    frameCount: requireArray(timeline.frames, "Benchmark trace frames").length,
    trackCount: requireArray(trace.tracks, "Benchmark trace tracks").length,
  };
}

function cloneJson(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Benchmark trace has no JSON representation");
  const parsed: unknown = JSON.parse(serialized);
  return parsed;
}

function jsonByteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Benchmark result has no JSON representation");
  return Buffer.byteLength(serialized);
}

function summarizeArtifactCreation(
  value: Readonly<{ reference: DiagnosticArtifactReference }>,
): Readonly<{ artifactBytes: number | undefined; rootKind: string }> {
  if (!value.reference.root) throw new TypeError("Benchmark artifact reference must include a root summary");
  return {
    artifactBytes: value.reference.byteLength,
    rootKind: value.reference.root.kind,
  };
}

function requireArtifactPageInfo(page: DiagnosticArtifactPage) {
  if (!page.page) throw new TypeError("Benchmark artifact query must include page information");
  return page.page;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const value = sorted[Math.floor(sorted.length / 2)];
  if (value === undefined) throw new TypeError("Median requires at least one value");
  return value;
}

function collectGarbage(): void {
  const garbageCollector = globalThis.gc;
  if (typeof garbageCollector !== "function") {
    throw new Error("This benchmark requires Node --expose-gc so heap measurements are comparable");
  }
  garbageCollector();
  garbageCollector();
}

function measureOperation<Output, Sample>(
  operation: () => Output,
  summarize: (output: Output) => Sample,
): OperationMeasurement<Sample> {
  const durationsMs: number[] = [];
  const heapDeltasBytes: number[] = [];
  let sample: Sample | null = null;
  for (let index = 0; index < ITERATIONS; index += 1) {
    collectGarbage();
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    let output: Output | null = operation();
    const durationMs = performance.now() - startedAt;
    const heapAfter = process.memoryUsage().heapUsed;
    sample = summarize(output);
    durationsMs.push(durationMs);
    heapDeltasBytes.push(heapAfter - heapBefore);
    output = null;
  }
  collectGarbage();
  return {
    durationMsMedian: Number(median(durationsMs).toFixed(2)),
    heapDeltaBytesMedian: Math.round(median(heapDeltasBytes)),
    iterations: ITERATIONS,
    sample,
  };
}

function measureRetainedOperation<Output, Sample>(
  operation: () => Output,
  summarize: (output: Output) => Sample,
): RetainedOperationMeasurement<Output, Sample> {
  collectGarbage();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const output = operation();
  const durationMs = performance.now() - startedAt;
  const heapAfter = process.memoryUsage().heapUsed;
  return {
    measurement: {
      durationMsMedian: Number(durationMs.toFixed(2)),
      heapDeltaBytesMedian: Math.round(heapAfter - heapBefore),
      iterations: 1,
      sample: summarize(output),
    },
    output,
  };
}

function warmUp(): void {
  const document = createMotionReplayDocument(makeSyntheticTrace(1, 2, 30));
  document.getView("curve-groups", { limit: 2, timeMs: 500 });
  document.getView("track-chart", { cursorTimeMs: 500, trackLimit: 2 });
  document.getView("inspector", { selectedTimeMs: 500 });
  document.dispose();
}

function runScenario({
  durationSeconds,
  sampleHz,
  trackCount,
}: Readonly<{
  durationSeconds: BenchmarkDurationSeconds;
  sampleHz: number;
  trackCount: number;
}>) {
  const durationValue = Number(durationSeconds);
  let rawTrace: ReturnType<typeof makeSyntheticTrace> | null = makeSyntheticTrace(
    durationSeconds,
    trackCount,
    sampleHz,
  );
  const normalization = measureOperation(
    () => normalizeMotionReplayTrace(rawTrace),
    summarizeTrace,
  );
  const inlineClone = measureOperation(
    () => cloneJson(rawTrace),
    summarizeTrace,
  );
  const artifactCreateResult = measureRetainedOperation(
    () => {
      const store = createDiagnosticArtifactStore({
        maxArtifactBytes: 256 * 1024 * 1024,
        maxBytes: 256 * 1024 * 1024,
      });
      const reference = store.create(rawTrace, {
        source: { operation: "benchmark", requestId: "benchmark-1", toolId: "motion" },
      });
      return { reference, store };
    },
    summarizeArtifactCreation,
  );
  const artifactCreate = artifactCreateResult.measurement;
  const artifactStore = artifactCreateResult.output.store;
  const artifactId = artifactCreateResult.output.reference.artifactId;
  const artifactRootManifest = measureOperation(
    () => artifactStore.query({ artifactId }),
    (page) => {
      const pageInfo = requireArtifactPageInfo(page);
      return { fieldCount: pageInfo.total, returned: pageInfo.returned };
    },
  );
  const artifactJsonPage = measureOperation(
    () => artifactStore.query({ artifactId, limit: 65_536, representation: "json" }),
    (page) => {
      const pageInfo = requireArtifactPageInfo(page);
      return { hasMore: pageInfo.hasMore, returned: pageInfo.returned };
    },
  );
  const artifactStructuredPageCold = measureRetainedOperation(
    () => artifactStore.query({ artifactId, limit: 20, path: ["timeline", "frames"] }),
    (page) => {
      const pageInfo = requireArtifactPageInfo(page);
      return { hasMore: pageInfo.hasMore, returned: pageInfo.returned };
    },
  ).measurement;
  const artifactStructuredPageCacheHit = measureOperation(
    () => artifactStore.query({ artifactId, limit: 20, offset: 20, path: ["timeline", "frames"] }),
    (page) => {
      const pageInfo = requireArtifactPageInfo(page);
      return { hasMore: pageInfo.hasMore, returned: pageInfo.returned };
    },
  );
  artifactStore.dispose();
  collectGarbage();
  const documentLoadResult = measureRetainedOperation(
    () => createMotionReplayDocument(rawTrace),
    (document) => document.summary(),
  );
  const documentLoad = documentLoadResult.measurement;
  const document = documentLoadResult.output;
  rawTrace = null;
  collectGarbage();
  const cursorTimeMs = durationValue * 500;
  const analysisCold = measureRetainedOperation(
    () => document.analyze(),
    (analysis) => ({
      findingCount: analysis.summary.findingCount,
      status: analysis.summary.status,
    }),
  ).measurement;
  const analysisCacheHit = measureOperation(
    () => document.analyze(),
    (analysis) => ({
      findingCount: analysis.summary.findingCount,
      status: analysis.summary.status,
    }),
  );
  const curveGroupsCold = measureRetainedOperation(
    () => document.getView("curve-groups", { limit: trackCount, timeMs: cursorTimeMs }),
    (groups) => ({ groupCount: groups.length, sampleCount: groups.reduce((total, group) => total + group.sampleCount, 0) }),
  ).measurement;
  let curveCursorOffset = 0;
  const curveGroupsCursorUpdate = measureOperation(
    () => document.getView("curve-groups", {
      limit: trackCount,
      timeMs: cursorTimeMs + ++curveCursorOffset,
    }),
    (groups) => ({ groupCount: groups.length, cursorX: groups[0]?.cursorX ?? null }),
  );
  const trackChartOptions = {
    cursorTimeMs,
    maxPointsPerSeries: 240,
    trackLimit: trackCount,
  };
  const trackChartCold = measureRetainedOperation(
    () => document.getView("track-chart", trackChartOptions),
    (model) => ({ sampleCount: model.summary.sampleCount, trackCount: model.summary.trackCount }),
  ).measurement;
  const trackChartCacheHit = measureOperation(
    () => document.getView("track-chart", trackChartOptions),
    (model) => ({ sampleCount: model.summary.sampleCount, trackCount: model.summary.trackCount }),
  );
  let chartCursorOffset = 0;
  const trackChartCursorUpdate = measureOperation(
    () => document.getView("track-chart", {
      maxPointsPerSeries: 240,
      trackLimit: trackCount,
      cursorTimeMs: cursorTimeMs + ++chartCursorOffset,
    }),
    (model) => ({ sampleCount: model.summary.sampleCount, trackCount: model.summary.trackCount }),
  );
  const selectedTrack = makeTrack(0);
  const inspectorCold = measureRetainedOperation(
    () => document.getView("inspector", {
      selectedTarget: { sourceLabel: selectedTrack.sourceLabel, targetId: selectedTrack.targetId },
      selectedTimeMs: cursorTimeMs,
      selectedTrack,
    }),
    (model) => ({ laneCount: model.laneBreakdown.length, recentEventCount: model.recentEvents.length }),
  ).measurement;
  const focusedInterval = {
    endMs: Math.min(document.timeRange().max, cursorTimeMs + 500),
    startMs: Math.max(document.timeRange().min, cursorTimeMs - 500),
  };
  const fullInterval = {
    endMs: document.timeRange().max,
    startMs: document.timeRange().min,
  };
  const intervalStructuredPresentation = measureRetainedOperation(
    () => document.export({
      ...fullInterval,
      format: "interval",
      presentation: "structured",
    }),
    (output) => {
      if (output.presentation !== "structured") {
        throw new TypeError("Interval structured export returned the wrong presentation");
      }
      return {
        hasContent: Object.hasOwn(output, "content"),
        hasData: Object.hasOwn(output, "data"),
        presentation: output.presentation,
        serializedBytes: jsonByteLength(output),
        valueCount: output.data.summary.valueCount || 0,
      };
    },
  ).measurement;
  const intervalJsonPresentation = measureRetainedOperation(
    () => document.export({
      ...fullInterval,
      format: "interval",
      presentation: "json",
    }),
    (output) => {
      if (output.presentation !== "json") {
        throw new TypeError("Interval JSON export returned the wrong presentation");
      }
      return {
        contentBytes: Buffer.byteLength(output.content || ""),
        hasData: Object.hasOwn(output, "data"),
        presentation: output.presentation,
      };
    },
  ).measurement;
  const focusedStructuredPresentation = measureRetainedOperation(
    () => document.export({
      format: "focused",
      interval: focusedInterval,
      presentation: "structured",
    }),
    (output) => {
      if (output.presentation !== "structured") {
        throw new TypeError("Focused structured export returned the wrong presentation");
      }
      return {
        hasContent: Object.hasOwn(output, "content"),
        hasData: Object.hasOwn(output, "data"),
        presentation: output.presentation,
        valueCount: output.data.summary.valueCount || 0,
      };
    },
  ).measurement;
  const focusedMarkdownPresentation = measureRetainedOperation(
    () => document.export({
      format: "focused",
      interval: focusedInterval,
      presentation: "markdown",
    }),
    (output) => {
      if (output.presentation !== "markdown") {
        throw new TypeError("Focused Markdown export returned the wrong presentation");
      }
      return {
        contentLength: output.content.length || 0,
        hasData: Object.hasOwn(output, "data"),
        presentation: output.presentation,
      };
    },
  ).measurement;
  document.dispose();
  collectGarbage();
  return {
    durationSeconds,
    frameCount: durationValue * sampleHz,
    operations: {
      analysisCacheHit,
      analysisCold,
      artifactCreate,
      artifactJsonPage,
      artifactRootManifest,
      artifactStructuredPageCacheHit,
      artifactStructuredPageCold,
      curveGroupsCold,
      curveGroupsCursorUpdate,
      documentLoad,
      focusedMarkdownPresentation,
      focusedStructuredPresentation,
      inspectorCold,
      intervalJsonPresentation,
      intervalStructuredPresentation,
      inlineClone,
      normalization,
      trackChartCacheHit,
      trackChartCold,
      trackChartCursorUpdate,
    },
    sampleHz,
    trackCount,
    valueCount: durationValue * sampleHz * trackCount,
  };
}

if (typeof globalThis.gc !== "function") {
  throw new Error("This benchmark requires Node --expose-gc so heap measurements are comparable");
}

const config = readArgs(process.argv.slice(2));
warmUp();
const report = {
  config: { ...config, iterations: ITERATIONS },
  environment: {
    arch: process.arch,
    node: process.version,
    platform: process.platform,
  },
  generatedAt: new Date().toISOString(),
  scenarios: config.durations.map((durationSeconds) => runScenario({
    durationSeconds,
    sampleHz: config.sampleHz,
    trackCount: config.trackCount,
  })),
  schema: "lumeria-motion-diagnostics-benchmark/v4",
};

console.info(JSON.stringify(report, null, 2));
