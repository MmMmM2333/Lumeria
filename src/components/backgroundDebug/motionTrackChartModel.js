import {
  getMotionReplayTimeRange,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "./motionReplayViewerModel.js";

export const MOTION_TRACK_CHART_DISPLAY_RAW = "raw";
export const MOTION_TRACK_CHART_DISPLAY_NORMALIZED = "normalized";
export const MOTION_TRACK_CHART_SERIES_KEYS = ["value", "to", "delta", "velocity"];

const DEFAULT_SERIES_VISIBILITY = {
  delta: true,
  to: true,
  value: true,
  velocity: true,
};

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(digits).replace(/\.?0+$/, "");
}

function normalizeDisplayMode(value) {
  return value === MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    ? MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    : MOTION_TRACK_CHART_DISPLAY_RAW;
}

function makeTrackKey(record = {}) {
  return [
    record.targetId ?? "unknown",
    record.prop ?? "unknown",
    record.lane ?? "unknown",
    record.laneKey ?? "unknown",
  ].join(":");
}

function makeTargetsById(trace = {}) {
  const targets = new Map();
  for (const target of trace.targets || []) {
    if (target?.targetId != null) targets.set(target.targetId, target);
  }
  return targets;
}

function resolveRecordLabel(record = {}, targetsById = new Map()) {
  const target = record.targetId != null ? targetsById.get(record.targetId) : null;
  return record.sourceLabel
    || record.targetLabel
    || target?.sourceLabel
    || target?.label
    || (record.targetId != null ? `target ${record.targetId}` : "unknown");
}

function collectRecordText(record = {}, targetsById = new Map()) {
  const target = record.targetId != null ? targetsById.get(record.targetId) : null;
  return [
    record.type,
    record.reason,
    record.targetId,
    record.targetKind,
    record.targetLabel,
    record.sourceLabel,
    record.label,
    record.layer,
    record.prop,
    record.driver,
    record.lane,
    record.laneKey,
    target?.kind,
    target?.label,
    target?.layer,
    target?.sourceLabel,
  ].filter((value) => value != null).join(" ").toLowerCase();
}

function matchesFilters(record = {}, targetsById = new Map(), filters = {}) {
  const query = normalizeQuery(filters.query);
  return !query || collectRecordText(record, targetsById).includes(query);
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
  const points = track.samples.map((sample) => {
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
  const visible = Boolean(options.seriesVisibility[key]);
  return {
    key,
    normalizedRange: { max: 1, min: 0 },
    path: visible ? formatPath(points) : "",
    points,
    rawRange,
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

export function buildMotionTrackChartModel(traceInput = {}, options = {}) {
  const trace = normalizeMotionReplayTrace(traceInput);
  const displayMode = normalizeDisplayMode(options.displayMode);
  const zoomWindow = normalizeMotionTrackChartZoomWindow(trace, options.zoomWindow || options.interval || {});
  const seriesVisibility = normalizeMotionTrackChartSeriesVisibility(options.seriesVisibility);
  const cursorTimeMs = clamp(
    readNumber(options.cursorTimeMs, zoomWindow.startMs),
    zoomWindow.startMs,
    Math.max(zoomWindow.startMs, zoomWindow.endMs),
  );
  const tracks = collectTrackRecords(trace, zoomWindow, options.filters)
    .map((track) => {
      const series = MOTION_TRACK_CHART_SERIES_KEYS.reduce((result, key) => ({
        ...result,
        [key]: buildSeries(track, key, { displayMode, seriesVisibility, zoomWindow }),
      }), {});
      return {
        driver: track.driver,
        eventCount: track.events.length,
        eventMarkers: buildEventMarkers(track, zoomWindow),
        key: track.key,
        label: track.label,
        lane: track.lane,
        laneKey: track.laneKey,
        layer: track.layer,
        prop: track.prop,
        sampleCount: track.samples.length,
        series,
        sourceLabel: track.sourceLabel,
        targetId: track.targetId,
        timeline: buildTrackTimeline(track, zoomWindow),
        visibleSeries: MOTION_TRACK_CHART_SERIES_KEYS.filter((key) => seriesVisibility[key]),
      };
    })
    .sort((a, b) => (b.sampleCount - a.sampleCount) || a.label.localeCompare(b.label));
  return {
    cursor: {
      timeMs: cursorTimeMs,
      x: normalizeTimePercent(zoomWindow, cursorTimeMs),
    },
    displayMode,
    seriesVisibility,
    timeRangeMs: getMotionReplayTimeRange(trace),
    tracks,
    zoomWindow,
  };
}
