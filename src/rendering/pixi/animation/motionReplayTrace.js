import { motionRuntime } from "./motionRuntime.js";
import {
  aggregateMotionTracks,
  clamp,
  collectMotionTrackRecordsFromReplay,
  expandRange,
  finalizeRange,
  makeTrackKey,
  readNumber,
} from "./motionTraceShared.js";

export const MOTION_REPLAY_TRACE_SCHEMA = "pixi-motion-replay-trace/v1";
export const MOTION_REPLAY_TRACE_VERSION = 1;
export const MOTION_REPLAY_CAPTURE_DEFAULT_SECONDS = 30;
export const MOTION_REPLAY_CAPTURE_MIN_SECONDS = 1;
export const MOTION_REPLAY_CAPTURE_MAX_SECONDS = 300;
export const MOTION_REPLAY_CAPTURE_SAMPLE_HZ = 60;

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function countBy(records = [], getKey = () => "unknown") {
  const counts = {};
  for (const record of records) {
    const key = getKey(record) ?? "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export function normalizeMotionReplayCaptureSeconds(value) {
  return clamp(
    Math.round(readNumber(value, MOTION_REPLAY_CAPTURE_DEFAULT_SECONDS)),
    MOTION_REPLAY_CAPTURE_MIN_SECONDS,
    MOTION_REPLAY_CAPTURE_MAX_SECONDS
  );
}

export function buildMotionReplayCaptureDebugConfig(options = {}, previousConfig = {}) {
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

function makeTraceValue(record = {}) {
  const value = {
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

function makeTraceFrame(sample = {}) {
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

function makeTraceTimeRange(frames = [], events = []) {
  const range = { max: null, min: null };
  for (const frame of frames) expandRange(range, frame.timeMs);
  for (const event of events) expandRange(range, event.timeMs);
  return finalizeRange(range);
}

function collectUsedTargetIds(frames = [], events = []) {
  const ids = new Set();
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

function filterByUsedTargets(records = [], usedTargetIds) {
  if (!usedTargetIds.size) return [];
  return records.filter((record) => record?.targetId != null && usedTargetIds.has(record.targetId));
}

function makeTraceSummary({ events, frames, targets, tracks, warnings }) {
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

export function createMotionReplayTrace(report = {}, options = {}) {
  const history = report.history || {};
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
  const captureConfig = report.config || {};
  const requestedDurationMs = readNumber(options.durationMs, readNumber(captureConfig.recordWindowMs, 0));
  const sampleHz = readNumber(options.sampleHz, readNumber(captureConfig.sampleHz, MOTION_REPLAY_CAPTURE_SAMPLE_HZ));
  const captureProfile = clonePlain(options.captureProfile ?? null);
  const trace = {
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
  return trace;
}

export function createMotionReplayTraceFromRuntime(runtime = motionRuntime, options = {}) {
  const report = runtime.debugReport({
    includeChannels: true,
    includeCurveStats: true,
    includeHistory: true,
    includeTargets: true,
  });
  return createMotionReplayTrace(report, options);
}

export function createMotionReplayCaptureController(runtime = motionRuntime, options = {}) {
  let active = false;
  let previousConfig = null;
  let startedAt = null;
  let captureOptions = {};

  function status() {
    return {
      active,
      captureProfile: clonePlain(captureOptions.captureProfile ?? null),
      sampleHz: MOTION_REPLAY_CAPTURE_SAMPLE_HZ,
      seconds: normalizeMotionReplayCaptureSeconds(captureOptions.seconds),
      startedAt,
    };
  }

  function start(startOptions = {}) {
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

  function stop(stopOptions = {}) {
    const stoppedAt = stopOptions.stoppedAt || new Date().toISOString();
    const trace = createMotionReplayTraceFromRuntime(runtime, {
      captureProfile: captureOptions.captureProfile,
      durationMs: normalizeMotionReplayCaptureSeconds(captureOptions.seconds) * 1000,
      sampleHz: MOTION_REPLAY_CAPTURE_SAMPLE_HZ,
      startedAt,
      stoppedAt,
    });
    if (stopOptions.restore !== false && previousConfig) runtime.configureDebug(previousConfig);
    active = false;
    previousConfig = null;
    startedAt = null;
    return {
      json: JSON.stringify(trace, null, 2),
      status: status(),
      trace,
    };
  }

  return {
    start,
    status,
    stop,
  };
}
