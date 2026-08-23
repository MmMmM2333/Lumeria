import { motionRuntime } from "./motionRuntime.js";
import type {
  MotionDebugConfig,
  MotionDebugHistory,
  MotionDebugRecord,
  MotionDebugReport,
  MotionRuntime,
} from "./motionRuntime.js";
import {
  MOTION_REPLAY_TRACE_SCHEMA,
  MOTION_REPLAY_TRACE_VERSION,
} from "./motionReplayTraceSchema.js";
import {
  aggregateMotionTracks,
  clamp,
  collectMotionTrackRecordsFromReplay,
  expandRange,
  finalizeRange,
  makeTrackKey,
  readNumber,
} from "./motionTraceShared.js";
import type { MotionTraceRange, MotionTraceRecord, MotionTrackRecord } from "./motionTraceShared.js";

export {
  MOTION_REPLAY_TRACE_SCHEMA,
  MOTION_REPLAY_TRACE_VERSION,
} from "./motionReplayTraceSchema.js";
export const MOTION_REPLAY_CAPTURE_DEFAULT_SECONDS = 30;
export const MOTION_REPLAY_CAPTURE_MIN_SECONDS = 1;
export const MOTION_REPLAY_CAPTURE_MAX_SECONDS = 300;
export const MOTION_REPLAY_CAPTURE_SAMPLE_HZ = 60;

interface MotionReplayCaptureProfile extends Readonly<Record<string, unknown>> {
  id?: string;
  includeEvents?: boolean;
  includeSamples?: boolean;
  label?: string;
  propAllowlist?: readonly string[];
  targetFilters?: Readonly<Record<string, unknown>>;
}

interface MotionReplayCaptureConfigOptions {
  captureProfile?: MotionReplayCaptureProfile | null | undefined;
  recordFilter?: MotionReplayCaptureProfile | null;
  sampleHz?: unknown;
  seconds?: unknown;
}

interface MotionReplayTraceOptions {
  captureProfile?: MotionReplayCaptureProfile | null | undefined;
  durationMs?: unknown;
  generatedAt?: string | null;
  sampleHz?: unknown;
  startedAt?: string | null;
  stoppedAt?: string | null;
}

interface MotionReplayTraceValue extends MotionTraceRecord {
  blendDuration?: number;
  blendProgress?: number;
  driver: string;
  from: number | null;
  lane: string;
  laneKey: string;
  layer: string | undefined;
  prop: string;
  released?: boolean;
  sourceLabel: string | undefined;
  targetId: number | null;
  targetKind: string | undefined;
  targetLabel: string | undefined;
  to: number;
  value: number;
  velocity: number;
}

interface MotionReplayTraceFrame {
  activeAnimationCount: number;
  frame: number;
  timeMs: number;
  values: MotionReplayTraceValue[];
}

interface MotionReplayTraceSummary {
  byDriver: Record<string, number>;
  byProp: Record<string, number>;
  eventCount: number;
  frameCount: number;
  targetCount: number;
  trackCount: number;
  valueCount: number;
  warningCount: number;
}

interface MotionReplayTrace {
  capture: {
    durationMs: number;
    profile: MotionReplayCaptureProfile | null;
    requestedDurationMs: number;
    sampleHz: number;
    startedAt: string | null;
    stoppedAt: string | null;
    timeScale: number;
  };
  curveStats: MotionDebugRecord[];
  generatedAt: string;
  mode: "property-accurate-visual-replay";
  schema: typeof MOTION_REPLAY_TRACE_SCHEMA;
  source: {
    reportVersion: number | null;
    runtime: {
      activeAnimationCount?: number;
      frames?: number;
      timeMs?: number;
    };
  };
  summary: MotionReplayTraceSummary;
  targets: MotionDebugRecord[];
  timeline: {
    events: MotionDebugRecord[];
    frames: MotionReplayTraceFrame[];
    timeRangeMs: MotionTraceRange;
  };
  tracks: MotionTrackRecord[];
  version: typeof MOTION_REPLAY_TRACE_VERSION;
  warnings: MotionDebugRecord[];
}

interface MotionReplayCaptureStatus {
  active: boolean;
  captureProfile: MotionReplayCaptureProfile | null;
  sampleHz: number;
  seconds: number;
  startedAt: string | null;
}

interface MotionReplayCaptureStartOptions extends MotionReplayCaptureConfigOptions {
  startedAt?: string | null;
}

interface MotionReplayCaptureLeaveOptions {
  restore?: boolean;
}

interface MotionReplayCaptureStopOptions extends MotionReplayCaptureLeaveOptions {
  stoppedAt?: string | null;
}

interface MotionReplayCaptureController {
  cancel(options?: MotionReplayCaptureLeaveOptions): MotionReplayCaptureStatus;
  start(options?: MotionReplayCaptureStartOptions): MotionReplayCaptureStatus;
  status(): MotionReplayCaptureStatus;
  stop(options?: MotionReplayCaptureStopOptions): {
    status: MotionReplayCaptureStatus;
    trace: MotionReplayTrace;
  };
}

interface MotionReplayCaptureDebugConfig {
  enabled: true;
  maxEvents: number;
  maxSamples: number;
  overlayEnabled: boolean;
  recordFilter: MotionReplayCaptureProfile | null;
  recordHistory: true;
  recordWindowMs: number;
  sampleHz: number;
  timeScale: number;
}

function clonePlain<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

function countBy<T>(
  records: readonly T[] = [],
  getKey: (record: T) => string | null | undefined = () => "unknown",
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const key = getKey(record) ?? "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function normalizeMotionReplayCaptureSeconds(value: unknown): number {
  return clamp(
    Math.round(readNumber(value, MOTION_REPLAY_CAPTURE_DEFAULT_SECONDS)),
    MOTION_REPLAY_CAPTURE_MIN_SECONDS,
    MOTION_REPLAY_CAPTURE_MAX_SECONDS
  );
}

export function buildMotionReplayCaptureDebugConfig(
  options: MotionReplayCaptureConfigOptions = {},
  previousConfig: Partial<MotionDebugConfig> = {},
): MotionReplayCaptureDebugConfig {
  const seconds = normalizeMotionReplayCaptureSeconds(options.seconds);
  const sampleHz = Math.max(1, readNumber(options.sampleHz, MOTION_REPLAY_CAPTURE_SAMPLE_HZ));
  const expectedSamples = Math.ceil(seconds * sampleHz);
  return {
    enabled: true,
    maxEvents: Math.min(60000, Math.max(1000, expectedSamples * 2)),
    maxSamples: Math.min(20000, Math.max(120, expectedSamples + 120)),
    overlayEnabled: previousConfig.overlayEnabled === true,
    recordFilter: clonePlain(options.recordFilter ?? options.captureProfile ?? null),
    recordHistory: true,
    recordWindowMs: seconds * 1000,
    sampleHz,
    timeScale: readNumber(previousConfig.timeScale, 1),
  };
}

function makeTraceValue(record: MotionDebugRecord = {}): MotionReplayTraceValue {
  const value: MotionReplayTraceValue = {
    driver: record.driver || "unknown",
    from: record.from ?? null,
    lane: record.lane || "base",
    laneKey: record.laneKey || "default",
    layer: record.layer,
    prop: record.prop || "unknown",
    sourceLabel: record.sourceLabel,
    targetId: record.targetId ?? null,
    targetKind: record.targetKind,
    targetLabel: record.targetLabel,
    to: readNumber(record.to, 0),
    value: readNumber(record.value, 0),
    velocity: readNumber(record.velocity, 0),
  };
  if (record.blendDuration != null) value.blendDuration = readNumber(record.blendDuration, 0);
  if (record.blendProgress != null) value.blendProgress = readNumber(record.blendProgress, 1);
  if (record.released != null) value.released = Boolean(record.released);
  return value;
}

function makeTraceFrame(sample: MotionDebugRecord = {}): MotionReplayTraceFrame {
  const values = (sample.animations || [])
    .map(makeTraceValue)
    .sort((a, b) => makeTrackKey(a).localeCompare(makeTrackKey(b)));
  return {
    activeAnimationCount: values.length,
    frame: Math.max(0, Math.floor(readNumber(sample.frame, 0))),
    timeMs: readNumber(sample.timeMs, 0),
    values,
  };
}

function makeTraceTimeRange(
  frames: readonly MotionReplayTraceFrame[] = [],
  events: readonly MotionDebugRecord[] = [],
): MotionTraceRange {
  const range: MotionTraceRange = { max: null, min: null };
  for (const frame of frames) expandRange(range, frame.timeMs);
  for (const event of events) expandRange(range, event.timeMs);
  return finalizeRange(range);
}

function collectUsedTargetIds(
  frames: readonly MotionReplayTraceFrame[] = [],
  events: readonly MotionDebugRecord[] = [],
): Set<number> {
  const ids = new Set<number>();
  for (const frame of frames) {
    for (const value of frame.values || []) {
      if (value.targetId != null) ids.add(value.targetId);
    }
  }
  for (const event of events) {
    if (event.targetId != null) ids.add(event.targetId);
  }
  return ids;
}

function filterByUsedTargets<T extends { targetId?: number | null | undefined }>(
  records: readonly T[] = [],
  usedTargetIds: ReadonlySet<number>,
): T[] {
  if (!usedTargetIds.size) return [];
  return records.filter((record) => record?.targetId != null && usedTargetIds.has(record.targetId));
}

function makeTraceSummary({ events, frames, targets, tracks, warnings }: {
  events: readonly MotionDebugRecord[];
  frames: readonly MotionReplayTraceFrame[];
  targets: readonly MotionDebugRecord[];
  tracks: readonly MotionTrackRecord[];
  warnings: readonly MotionDebugRecord[];
}): MotionReplayTraceSummary {
  const values = frames.flatMap((frame) => frame.values || []);
  return {
    byDriver: countBy(values, (value) => value.driver),
    byProp: countBy(values, (value) => value.prop),
    eventCount: events.length,
    frameCount: frames.length,
    targetCount: targets.length,
    trackCount: tracks.length,
    valueCount: values.length,
    warningCount: warnings.length,
  };
}

export function createMotionReplayTrace(
  report: Partial<MotionDebugReport> = {},
  options: MotionReplayTraceOptions = {},
): MotionReplayTrace {
  const history: Partial<MotionDebugHistory> = report.history || {};
  const frames = (history.samples || []).map(makeTraceFrame);
  const events = clonePlain(history.events || []);
  const curveStats = clonePlain(report.curveStats || []);
  const tracks = aggregateMotionTracks(
    collectMotionTrackRecordsFromReplay(frames, events),
    curveStats,
    { includeLayer: true, sortMode: "key" }
  );
  const usedTargetIds = collectUsedTargetIds(frames, events);
  const targets = filterByUsedTargets(clonePlain(report.targets || []), usedTargetIds);
  const warnings = filterByUsedTargets(clonePlain(report.warnings || []), usedTargetIds);
  const timeRangeMs = makeTraceTimeRange(frames, events);
  const captureConfig: Partial<MotionDebugConfig> = report.config || {};
  const requestedDurationMs = readNumber(options.durationMs, readNumber(captureConfig.recordWindowMs, 0));
  const sampleHz = readNumber(options.sampleHz, readNumber(captureConfig.sampleHz, MOTION_REPLAY_CAPTURE_SAMPLE_HZ));
  const captureProfile = clonePlain(options.captureProfile ?? null);
  const trace: Omit<MotionReplayTrace, "summary"> & { summary: MotionReplayTraceSummary | null } = {
    capture: {
      durationMs: timeRangeMs.max != null && timeRangeMs.min != null ? Math.max(0, timeRangeMs.max - timeRangeMs.min) : 0,
      profile: captureProfile,
      requestedDurationMs,
      sampleHz,
      startedAt: options.startedAt ?? null,
      stoppedAt: options.stoppedAt ?? null,
      timeScale: readNumber(captureConfig.timeScale, 1),
    },
    curveStats,
    generatedAt: options.generatedAt || new Date().toISOString(),
    mode: "property-accurate-visual-replay",
    schema: MOTION_REPLAY_TRACE_SCHEMA,
    source: {
      reportVersion: report.version ?? null,
      runtime: clonePlain(report.runtime || {}),
    },
    summary: null,
    targets,
    timeline: {
      events,
      frames,
      timeRangeMs,
    },
    tracks,
    version: MOTION_REPLAY_TRACE_VERSION,
    warnings,
  };
  trace.summary = makeTraceSummary({ events, frames, targets, tracks, warnings });
  return trace as MotionReplayTrace;
}

export function createMotionReplayTraceFromRuntime(
  runtime: MotionRuntime = motionRuntime,
  options: MotionReplayTraceOptions = {},
): MotionReplayTrace {
  const report = runtime.debugReport({
    includeChannels: true,
    includeCurveStats: true,
    includeHistory: true,
    includeTargets: true,
  });
  return createMotionReplayTrace(report, options);
}

export function createMotionReplayCaptureController(
  runtime: MotionRuntime = motionRuntime,
  options: MotionReplayCaptureConfigOptions = {},
): MotionReplayCaptureController {
  let active = false;
  let previousConfig: MotionDebugConfig | null = null;
  let startedAt: string | null = null;
  let captureOptions: MotionReplayCaptureStartOptions = {};

  function status(): MotionReplayCaptureStatus {
    return {
      active,
      captureProfile: clonePlain(captureOptions.captureProfile ?? null),
      sampleHz: MOTION_REPLAY_CAPTURE_SAMPLE_HZ,
      seconds: normalizeMotionReplayCaptureSeconds(captureOptions.seconds),
      startedAt,
    };
  }

  function start(startOptions: MotionReplayCaptureStartOptions = {}): MotionReplayCaptureStatus {
    if (active) return status();
    previousConfig = runtime.configureDebug();
    captureOptions = {
      seconds: options.seconds ?? MOTION_REPLAY_CAPTURE_DEFAULT_SECONDS,
      ...startOptions,
    };
    startedAt = startOptions.startedAt || new Date().toISOString();
    active = true;
    runtime.clearDebugHistory();
    runtime.configureDebug(buildMotionReplayCaptureDebugConfig(captureOptions, previousConfig));
    return status();
  }

  function leaveCapture(options: MotionReplayCaptureLeaveOptions = {}): void {
    if (options.restore !== false && previousConfig) runtime.configureDebug(previousConfig);
    active = false;
    previousConfig = null;
    startedAt = null;
  }

  function cancel(cancelOptions: MotionReplayCaptureLeaveOptions = {}): MotionReplayCaptureStatus {
    if (!active) return status();
    leaveCapture(cancelOptions);
    return status();
  }

  function stop(stopOptions: MotionReplayCaptureStopOptions = {}): {
    status: MotionReplayCaptureStatus;
    trace: MotionReplayTrace;
  } {
    const stoppedAt = stopOptions.stoppedAt || new Date().toISOString();
    const trace = createMotionReplayTraceFromRuntime(runtime, {
      captureProfile: captureOptions.captureProfile,
      durationMs: normalizeMotionReplayCaptureSeconds(captureOptions.seconds) * 1000,
      sampleHz: MOTION_REPLAY_CAPTURE_SAMPLE_HZ,
      startedAt,
      stoppedAt,
    });
    leaveCapture(stopOptions);
    return {
      status: status(),
      trace,
    };
  }

  return {
    cancel,
    start,
    status,
    stop,
  };
}
