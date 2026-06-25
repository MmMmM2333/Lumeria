import {
  getMotionReplayTimeRange,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "./motionReplayViewerModel.js";
import {
  clamp,
  collectRecordText,
  makeTargetsById,
  makeTrackKey,
  normalizeQuery,
  readNumber,
  resolveRecordLabel,
} from "../../rendering/pixi/animation/motionTraceShared.js";

export const MOTION_TRACK_CHART_DISPLAY_RAW = "raw";
export const MOTION_TRACK_CHART_DISPLAY_NORMALIZED = "normalized";
export const MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT = 240;
export const MOTION_TRACK_CHART_DEFAULT_TRACK_LIMIT = 24;
export const MOTION_TRACK_CHART_SERIES_KEYS = ["value", "to", "delta", "velocity"];

const DEFAULT_SERIES_VISIBILITY = {
  delta: true,
  to: true,
  value: true,
  velocity: true,
};

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  const fixed = number.toFixed(digits);
  if (!fixed.includes(".")) return fixed;
  const text = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return text || "0";
}

function normalizeDisplayMode(value) {
  return value === MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    ? MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    : MOTION_TRACK_CHART_DISPLAY_RAW;
}

function normalizePositiveInteger(value, fallback, min = 1, max = 10000) {
  const number = Math.floor(readNumber(value, fallback));
  return Math.min(max, Math.max(min, number));
}

function matchesFilters(record = {}, targetsById = new Map(), filters = {}) {
  const query = normalizeQuery(filters.query);
  return !query || collectRecordText(record, targetsById, { includeLayer: true, includeTargetLayer: true }).includes(query);
}

function normalizeRange(values = []) {
  const finite = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!finite.length) return { max: 1, min: 0 };
  let min = Math.min(...finite);
  let max = Math.max(...finite);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { max, min };
}

function normalizeSeriesValue(value, range = { max: 1, min: 0 }) {
  const span = readNumber(range.max, 1) - readNumber(range.min, 0);
  if (span <= 0) return 0.5;
  return clamp((readNumber(value, 0) - readNumber(range.min, 0)) / span, 0, 1);
}

function formatPath(points = []) {
  if (!points.length) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    .join(" ");
}

function formatTimeLabel(timeMs) {
  return `${formatNumber(timeMs, 0)}ms`;
}

function formatRangeLabel(range = {}, hasPoints = true) {
  if (!hasPoints) return "none";
  return `${formatNumber(range.min)}..${formatNumber(range.max)}`;
}

function downsamplePoints(points = [], maxPoints = MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT) {
  const limit = normalizePositiveInteger(maxPoints, MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT, 2, 10000);
  if (points.length <= limit) return points;
  const sampled = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index / (limit - 1)) * lastIndex);
    sampled.push(points[sourceIndex]);
  }
  return sampled;
}

function normalizeTimePercent(timeWindow = {}, timeMs = 0) {
  const startMs = readNumber(timeWindow.startMs, 0);
  const endMs = readNumber(timeWindow.endMs, startMs);
  const span = endMs - startMs;
  if (span <= 0) return 0;
  return clamp(((readNumber(timeMs, startMs) - startMs) / span) * 100, 0, 100);
}

function isInsideWindow(timeMs, timeWindow = {}) {
  const time = readNumber(timeMs, 0);
  return time >= readNumber(timeWindow.startMs, 0) && time <= readNumber(timeWindow.endMs, 0);
}

export function normalizeMotionTrackChartSeriesVisibility(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return MOTION_TRACK_CHART_SERIES_KEYS.reduce((visibility, key) => ({
    ...visibility,
    [key]: source[key] == null ? DEFAULT_SERIES_VISIBILITY[key] : Boolean(source[key]),
  }), {});
}

function normalizeTrackLimit(value) {
  return normalizePositiveInteger(value, MOTION_TRACK_CHART_DEFAULT_TRACK_LIMIT, 1, 500);
}

function normalizePointLimit(value) {
  return normalizePositiveInteger(value, MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT, 2, 10000);
}

function normalizeAxisTickCount(value) {
  return normalizePositiveInteger(value, 5, 1, 12);
}

export function normalizeMotionTrackChartZoomWindow(traceInput = {}, windowInput = {}) {
  const trace = normalizeMotionReplayTrace(traceInput);
  const range = getMotionReplayTimeRange(trace);
  const start = normalizeMotionReplayTime(trace, windowInput.startMs ?? range.min);
  const end = normalizeMotionReplayTime(trace, windowInput.endMs ?? range.max);
  return {
    endMs: Math.max(start, end),
    startMs: Math.min(start, end),
  };
}

function buildTimeAxis(zoomWindow = {}, tickCountInput = 5) {
  const tickCount = normalizeAxisTickCount(tickCountInput);
  const startMs = readNumber(zoomWindow.startMs, 0);
  const endMs = readNumber(zoomWindow.endMs, startMs);
  const span = endMs - startMs;
  if (tickCount <= 1 || span <= 0) {
    return {
      ticks: [{
        label: formatTimeLabel(startMs),
        timeMs: startMs,
        x: 0,
      }],
    };
  }
  return {
    ticks: Array.from({ length: tickCount }, (_, index) => {
      const timeMs = startMs + (span * index) / (tickCount - 1);
      return {
        label: formatTimeLabel(timeMs),
        timeMs,
        x: normalizeTimePercent(zoomWindow, timeMs),
      };
    }),
  };
}

function collectTrackRecords(trace = {}, zoomWindow = {}, filters = {}) {
  const targetsById = makeTargetsById(trace);
  const tracks = new Map();
  const ensureTrack = (record = {}) => {
    const key = makeTrackKey(record);
    let track = tracks.get(key);
    if (!track) {
      track = {
        driver: record.driver || "unknown",
        events: [],
        key,
        label: `${resolveRecordLabel(record, targetsById)}.${record.prop || "unknown"}`,
        lane: record.lane || "base",
        laneKey: record.laneKey || "default",
        layer: record.layer,
        prop: record.prop || "unknown",
        samples: [],
        sourceLabel: record.sourceLabel || resolveRecordLabel(record, targetsById),
        targetId: record.targetId ?? null,
      };
      tracks.set(key, track);
    }
    return track;
  };
  for (const frame of trace.timeline?.frames || []) {
    if (!isInsideWindow(frame.timeMs, zoomWindow)) continue;
    for (const value of frame.values || []) {
      if (!matchesFilters(value, targetsById, filters)) continue;
      const track = ensureTrack(value);
      track.samples.push({
        delta: readNumber(value.to, 0) - readNumber(value.value, 0),
        frame: frame.frame,
        timeMs: readNumber(frame.timeMs, 0),
        to: readNumber(value.to, 0),
        value: readNumber(value.value, 0),
        velocity: readNumber(value.velocity, 0),
      });
    }
  }
  for (const event of trace.timeline?.events || []) {
    if (!isInsideWindow(event.timeMs, zoomWindow)) continue;
    if (!matchesFilters(event, targetsById, filters)) continue;
    const track = ensureTrack(event);
    track.events.push(event);
  }
  return Array.from(tracks.values());
}

function buildSeries(track = {}, key, options = {}) {
  const values = track.samples.map((sample) => sample[key]);
  const rawRange = normalizeRange(values);
  const allPoints = track.samples.map((sample) => {
    const raw = readNumber(sample[key], 0);
    const normalized = normalizeSeriesValue(raw, rawRange);
    return {
      frame: sample.frame,
      normalized,
      raw,
      timeMs: sample.timeMs,
      value: options.displayMode === MOTION_TRACK_CHART_DISPLAY_NORMALIZED ? normalized : raw,
      x: normalizeTimePercent(options.zoomWindow, sample.timeMs),
      y: 100 - normalized * 100,
    };
  });
  const points = downsamplePoints(allPoints, options.maxPointsPerSeries);
  const visible = Boolean(options.seriesVisibility[key]);
  return {
    key,
    normalizedRange: { max: 1, min: 0 },
    path: visible ? formatPath(points) : "",
    pointCount: allPoints.length,
    points,
    rawRange,
    rangeLabel: formatRangeLabel(rawRange, allPoints.length > 0),
    renderedPointCount: points.length,
    visible,
  };
}

function buildTrackTimeline(track = {}, zoomWindow = {}) {
  const times = [
    ...track.samples.map((sample) => sample.timeMs),
    ...track.events.map((event) => event.timeMs),
  ].filter(Number.isFinite);
  const startMs = times.length ? Math.min(...times) : readNumber(zoomWindow.startMs, 0);
  const endMs = times.length ? Math.max(...times) : readNumber(zoomWindow.endMs, startMs);
  const startX = normalizeTimePercent(zoomWindow, startMs);
  const endX = normalizeTimePercent(zoomWindow, endMs);
  return {
    endMs,
    endX,
    startMs,
    startX,
    width: Math.max(0, endX - startX),
  };
}

function buildEventMarkers(track = {}, zoomWindow = {}) {
  return track.events
    .slice()
    .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0))
    .map((event) => ({
      detail: [
        event.type || "event",
        `${formatNumber(event.timeMs, 0)}ms`,
        event.reason ? `reason=${event.reason}` : null,
      ].filter(Boolean).join(" "),
      reason: event.reason ?? null,
      timeMs: readNumber(event.timeMs, 0),
      type: event.type || "event",
      x: normalizeTimePercent(zoomWindow, event.timeMs),
    }));
}

function findCursorSample(samples = [], cursorTimeMs = 0) {
  if (!samples.length) return null;
  const cursor = readNumber(cursorTimeMs, 0);
  let selected = samples[0];
  for (const sample of samples) {
    if (readNumber(sample.timeMs, 0) > cursor) break;
    selected = sample;
  }
  return selected;
}

function buildCurrentValues(track = {}, cursorTimeMs = 0, zoomWindow = {}) {
  const sample = findCursorSample(track.samples, cursorTimeMs);
  if (!sample) return null;
  return {
    delta: readNumber(sample.delta, 0),
    frame: sample.frame ?? null,
    timeMs: readNumber(sample.timeMs, 0),
    to: readNumber(sample.to, 0),
    value: readNumber(sample.value, 0),
    velocity: readNumber(sample.velocity, 0),
    x: normalizeTimePercent(zoomWindow, sample.timeMs),
  };
}

function buildStats(track = {}) {
  const absoluteDeltas = track.samples.map((sample) => Math.abs(readNumber(sample.delta, 0)));
  const absoluteVelocities = track.samples.map((sample) => Math.abs(readNumber(sample.velocity, 0)));
  return {
    eventCount: track.events.length,
    maxAbsDelta: absoluteDeltas.length ? Math.max(...absoluteDeltas) : 0,
    maxAbsVelocity: absoluteVelocities.length ? Math.max(...absoluteVelocities) : 0,
    sampleCount: track.samples.length,
  };
}

function normalizeSelectedTrackKey(selectedTrack = null) {
  if (!selectedTrack) return "";
  if (typeof selectedTrack === "string") return selectedTrack;
  if (typeof selectedTrack !== "object") return "";
  return selectedTrack.key || makeTrackKey(selectedTrack);
}

export function buildMotionTrackChartModel(traceInput = {}, options = {}) {
  const trace = normalizeMotionReplayTrace(traceInput);
  const displayMode = normalizeDisplayMode(options.displayMode);
  const maxPointsPerSeries = normalizePointLimit(options.maxPointsPerSeries);
  const selectedTrackKey = normalizeSelectedTrackKey(options.selectedTrack);
  const trackLimit = normalizeTrackLimit(options.trackLimit);
  const zoomWindow = normalizeMotionTrackChartZoomWindow(trace, options.zoomWindow || options.interval || {});
  const seriesVisibility = normalizeMotionTrackChartSeriesVisibility(options.seriesVisibility);
  const cursorTimeMs = clamp(
    readNumber(options.cursorTimeMs, zoomWindow.startMs),
    zoomWindow.startMs,
    Math.max(zoomWindow.startMs, zoomWindow.endMs),
  );
  const allTracks = collectTrackRecords(trace, zoomWindow, options.filters)
    .map((track) => {
      const series = MOTION_TRACK_CHART_SERIES_KEYS.reduce((result, key) => ({
        ...result,
        [key]: buildSeries(track, key, {
          displayMode,
          maxPointsPerSeries,
          seriesVisibility,
          zoomWindow,
        }),
      }), {});
      const rangeLabels = MOTION_TRACK_CHART_SERIES_KEYS.reduce((result, key) => ({
        ...result,
        [key]: series[key].rangeLabel,
      }), {});
      return {
        current: buildCurrentValues(track, cursorTimeMs, zoomWindow),
        driver: track.driver,
        eventCount: track.events.length,
        eventMarkers: buildEventMarkers(track, zoomWindow),
        isSelected: Boolean(selectedTrackKey && selectedTrackKey === track.key),
        key: track.key,
        label: track.label,
        lane: track.lane,
        laneLabel: [track.lane, track.laneKey].filter(Boolean).join("/") || "-",
        laneKey: track.laneKey,
        layer: track.layer,
        prop: track.prop,
        rangeLabels,
        sampleCount: track.samples.length,
        series,
        sourceLabel: track.sourceLabel,
        stats: buildStats(track),
        summary: `${track.samples.length} samples / ${track.events.length} events`,
        targetId: track.targetId,
        targetProp: track.label,
        timeline: buildTrackTimeline(track, zoomWindow),
        visibleSeries: MOTION_TRACK_CHART_SERIES_KEYS.filter((key) => seriesVisibility[key]),
      };
    })
    .sort((a, b) => (b.sampleCount - a.sampleCount) || a.label.localeCompare(b.label));
  const tracks = allTracks.slice(0, trackLimit);
  const totalSampleCount = allTracks.reduce((total, track) => total + track.sampleCount, 0);
  const totalEventCount = allTracks.reduce((total, track) => total + track.eventCount, 0);
  return {
    axis: buildTimeAxis(zoomWindow, options.axisTickCount),
    cursor: {
      timeMs: cursorTimeMs,
      x: normalizeTimePercent(zoomWindow, cursorTimeMs),
    },
    displayMode,
    limits: {
      maxPointsPerSeries,
      trackLimit,
      tracksLimited: allTracks.length > tracks.length,
    },
    seriesVisibility,
    summary: {
      eventCount: totalEventCount,
      hiddenTrackCount: Math.max(0, allTracks.length - tracks.length),
      sampleCount: totalSampleCount,
      trackCount: allTracks.length,
      visibleTrackCount: tracks.length,
      windowDurationMs: Math.max(0, readNumber(zoomWindow.endMs, 0) - readNumber(zoomWindow.startMs, 0)),
    },
    timeRangeMs: getMotionReplayTimeRange(trace),
    tracks,
    zoomWindow,
  };
}
