import { MOTION_REPLAY_TRACE_SCHEMA } from "../../rendering/pixi/animation/motionReplayTrace.js";

export const MOTION_REPLAY_INTERVAL_SCHEMA = "pixi-motion-replay-interval/v1";
export const MOTION_REPLAY_IMPORT_MAX_BYTES = 6 * 1024 * 1024;

const MAX_REPLAY_FRAME_ROWS = 10;
const MAX_REPLAY_EVENT_ROWS = 16;
const MAX_REPLAY_CURVE_GROUPS = 4;
const MAX_REPLAY_OVERLAY_ROWS = 8;

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function formatCount(value) {
  return String(Math.max(0, Math.floor(readNumber(value, 0))));
}

function makeTrackKey(record = {}) {
  return [
    record.targetId ?? "unknown",
    record.prop ?? "unknown",
    record.lane ?? "unknown",
    record.laneKey ?? "unknown",
  ].join(":");
}

function makeTargetLaneKey(record = {}) {
  return [
    record.targetId ?? "unknown",
    record.lane ?? "unknown",
    record.laneKey ?? "unknown",
  ].join(":");
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
    record.prop,
    record.driver,
    record.lane,
    record.laneKey,
    target?.kind,
    target?.label,
    target?.sourceLabel,
  ].filter((value) => value != null).join(" ").toLowerCase();
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function makeTargetsById(trace = {}) {
  const targets = new Map();
  for (const target of trace.targets || []) {
    if (target?.targetId != null) targets.set(target.targetId, target);
  }
  return targets;
}

function makeFilterPredicate(trace = {}, filters = {}) {
  const query = normalizeQuery(filters.query);
  const targetsById = makeTargetsById(trace);
  return (record) => !query || collectRecordText(record, targetsById).includes(query);
}

function makeTimeRange(frames = [], events = []) {
  const times = [
    ...frames.map((frame) => readNumber(frame.timeMs, NaN)),
    ...events.map((event) => readNumber(event.timeMs, NaN)),
  ].filter(Number.isFinite);
  if (!times.length) return { max: 0, min: 0 };
  return { max: Math.max(...times), min: Math.min(...times) };
}

function normalizeFrame(frame = {}) {
  const values = Array.isArray(frame.values) ? frame.values : [];
  return {
    activeAnimationCount: Math.max(0, Math.floor(readNumber(frame.activeAnimationCount, values.length))),
    frame: Math.max(0, Math.floor(readNumber(frame.frame, 0))),
    timeMs: readNumber(frame.timeMs, 0),
    values: values.map((value) => ({
      ...value,
      driver: value.driver || "unknown",
      lane: value.lane || "base",
      laneKey: value.laneKey || "default",
      prop: value.prop || "unknown",
      to: readNumber(value.to, 0),
      value: readNumber(value.value, 0),
      velocity: readNumber(value.velocity, 0),
    })),
  };
}

function normalizeEvent(event = {}) {
  return {
    ...event,
    driver: event.driver || "unknown",
    frame: Math.max(0, Math.floor(readNumber(event.frame, 0))),
    lane: event.lane || "base",
    laneKey: event.laneKey || "default",
    prop: event.prop || "unknown",
    timeMs: readNumber(event.timeMs, 0),
    to: readNumber(event.to, 0),
    type: event.type || "event",
    value: readNumber(event.value, 0),
    velocity: readNumber(event.velocity, 0),
  };
}

export function normalizeMotionReplayTrace(trace) {
  if (!trace || typeof trace !== "object") throw new Error("Replay trace is missing.");
  if (trace.schema !== MOTION_REPLAY_TRACE_SCHEMA) {
    throw new Error(`Unsupported replay trace schema: ${trace.schema || "unknown"}`);
  }
  const frames = (trace.timeline?.frames || [])
    .map(normalizeFrame)
    .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
  const events = (trace.timeline?.events || [])
    .map(normalizeEvent)
    .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
  const timeRangeMs = makeTimeRange(frames, events);
  return {
    ...trace,
    summary: trace.summary || {},
    targets: Array.isArray(trace.targets) ? trace.targets.map((target) => ({ ...target })) : [],
    timeline: {
      ...(trace.timeline || {}),
      events,
      frames,
      timeRangeMs,
    },
    tracks: Array.isArray(trace.tracks) ? trace.tracks.map((track) => ({ ...track })) : [],
    warnings: Array.isArray(trace.warnings) ? trace.warnings.map((warning) => ({ ...warning })) : [],
  };
}

export function assertMotionReplayImportSize(size, maxBytes = MOTION_REPLAY_IMPORT_MAX_BYTES) {
  const byteCount = Math.max(0, Math.floor(readNumber(size, 0)));
  const limit = Math.max(1, Math.floor(readNumber(maxBytes, MOTION_REPLAY_IMPORT_MAX_BYTES)));
  if (byteCount > limit) {
    const mb = (limit / (1024 * 1024)).toFixed(0);
    throw new Error(`Replay trace import is too large. Maximum supported size is ${mb}MB.`);
  }
}

export function parseMotionReplayTraceJson(json, options = {}) {
  const text = String(json || "");
  assertMotionReplayImportSize(text.length, options.maxBytes);
  return normalizeMotionReplayTrace(JSON.parse(text));
}

export function getMotionReplayTimeRange(trace = {}) {
  return trace.timeline?.timeRangeMs || { max: 0, min: 0 };
}

export function normalizeMotionReplayTime(trace = {}, timeMs = 0) {
  const range = getMotionReplayTimeRange(trace);
  const min = readNumber(range.min, 0);
  const max = readNumber(range.max, min);
  return clamp(readNumber(timeMs, min), min, Math.max(min, max));
}

function normalizeTimePercent(trace = {}, timeMs = 0) {
  const range = getMotionReplayTimeRange(trace);
  const min = readNumber(range.min, 0);
  const max = readNumber(range.max, min);
  const span = max - min;
  if (span <= 0) return 0;
  return clamp(((normalizeMotionReplayTime(trace, timeMs) - min) / span) * 100, 0, 100);
}

export function findMotionReplayFrame(trace = {}, timeMs = 0) {
  const frames = trace.timeline?.frames || [];
  if (!frames.length) return null;
  const currentTime = normalizeMotionReplayTime(trace, timeMs);
  let selected = frames[0];
  for (const frame of frames) {
    if (readNumber(frame.timeMs, 0) > currentTime) break;
    selected = frame;
  }
  return selected;
}

export function buildMotionReplayOverviewRows(trace = null, timeMs = 0) {
  if (!trace) {
    return [
      { label: "viewer", value: "empty" },
      { label: "schema", value: "none", wide: true },
    ];
  }
  const range = getMotionReplayTimeRange(trace);
  const currentTime = normalizeMotionReplayTime(trace, timeMs);
  return [
    { label: "viewer", value: "loaded" },
    { label: "schema", value: trace.schema || "unknown", wide: true },
    { label: "mode", value: trace.mode || "-", wide: true },
    { label: "time", value: `${formatNumber(currentTime, 0)}ms` },
    { label: "duration", value: `${formatNumber(readNumber(range.max) - readNumber(range.min), 0)}ms` },
    { label: "frames/events", value: `${formatCount(trace.timeline?.frames?.length)} / ${formatCount(trace.timeline?.events?.length)}`, wide: true },
    { label: "tracks/targets", value: `${formatCount(trace.tracks?.length)} / ${formatCount(trace.targets?.length)}`, wide: true },
  ];
}

export function buildMotionReplayFrameRows(trace = {}, timeMs = 0, filters = {}, limit = MAX_REPLAY_FRAME_ROWS) {
  const frame = findMotionReplayFrame(trace, timeMs);
  if (!frame) return [];
  const targetsById = makeTargetsById(trace);
  const predicate = makeFilterPredicate(trace, filters);
  return (frame.values || [])
    .filter(predicate)
    .slice(0, Math.max(0, Math.floor(readNumber(limit, MAX_REPLAY_FRAME_ROWS))))
    .map((value) => ({
      delta: formatNumber(readNumber(value.to) - readNumber(value.value)),
      driver: value.driver || "-",
      lane: value.lane || "-",
      laneKey: value.laneKey || "-",
      sourceLabel: value.sourceLabel || resolveRecordLabel(value, targetsById),
      targetProp: `${resolveRecordLabel(value, targetsById)}.${value.prop || "-"}`,
      to: formatNumber(value.to),
      value: formatNumber(value.value),
      velocity: formatNumber(value.velocity),
    }));
}

export function buildMotionReplayEventRows(trace = {}, timeMs = 0, filters = {}, limit = MAX_REPLAY_EVENT_ROWS) {
  const targetsById = makeTargetsById(trace);
  const predicate = makeFilterPredicate(trace, filters);
  const currentTime = normalizeMotionReplayTime(trace, timeMs);
  return (trace.timeline?.events || [])
    .filter(predicate)
    .map((event) => ({
      detail: [
        event.prop,
        `${formatNumber(event.value)} -> ${formatNumber(event.to)}`,
        event.driver,
        event.reason ? `reason=${event.reason}` : null,
      ].filter(Boolean).join(" / "),
      isCurrent: Math.abs(readNumber(event.timeMs) - currentTime) <= 1,
      key: `${formatNumber(event.timeMs, 0)}:${event.type}:${makeTrackKey(event)}`,
      label: `${formatNumber(event.timeMs, 0)}ms ${event.type}`,
      prop: event.prop || "-",
      sourceLabel: resolveRecordLabel(event, targetsById),
      time: `${formatNumber(event.timeMs, 0)}ms`,
      timeMs: readNumber(event.timeMs, 0),
      type: event.type || "event",
    }))
    .sort((a, b) => Math.abs(a.timeMs - currentTime) - Math.abs(b.timeMs - currentTime))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, MAX_REPLAY_EVENT_ROWS))));
}

function makeSeriesRange(values) {
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

function makePoint(trace, timeMs, value, valueRange) {
  const range = getMotionReplayTimeRange(trace);
  const timeSpan = readNumber(range.max) - readNumber(range.min);
  const valueSpan = valueRange.max - valueRange.min;
  return {
    raw: readNumber(value, 0),
    timeMs: readNumber(timeMs, 0),
    x: timeSpan > 0 ? clamp(((readNumber(timeMs) - readNumber(range.min)) / timeSpan) * 100, 0, 100) : 0,
    y: valueSpan > 0 ? clamp(100 - ((readNumber(value) - valueRange.min) / valueSpan) * 100, 0, 100) : 50,
  };
}

function formatPathNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(2).replace(/\.?0+$/, "");
}

function makeSvgPath(points) {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`).join(" ");
}

function collectReplayCurveTracks(trace = {}, filters = {}) {
  const predicate = makeFilterPredicate(trace, filters);
  const tracks = new Map();
  for (const frame of trace.timeline?.frames || []) {
    for (const value of frame.values || []) {
      if (!predicate(value)) continue;
      const key = makeTrackKey(value);
      let track = tracks.get(key);
      if (!track) {
        track = {
          driver: value.driver || "unknown",
          events: [],
          key,
          lane: value.lane,
          laneKey: value.laneKey,
          points: [],
          prop: value.prop,
          sourceLabel: value.sourceLabel,
          targetId: value.targetId,
        };
        tracks.set(key, track);
      }
      track.points.push({
        delta: readNumber(value.to) - readNumber(value.value),
        timeMs: frame.timeMs,
        to: value.to,
        value: value.value,
        velocity: value.velocity,
      });
    }
  }
  for (const event of trace.timeline?.events || []) {
    const track = tracks.get(makeTrackKey(event));
    if (track && predicate(event)) track.events.push(event);
  }
  return Array.from(tracks.values());
}

export function buildMotionReplayCurveGroups(trace = {}, timeMs = 0, filters = {}, limit = MAX_REPLAY_CURVE_GROUPS) {
  const targetsById = makeTargetsById(trace);
  const cursorX = normalizeTimePercent(trace, timeMs);
  return collectReplayCurveTracks(trace, filters)
    .map((track) => {
      const points = track.points.sort((a, b) => readNumber(a.timeMs) - readNumber(b.timeMs));
      const valueRange = makeSeriesRange([
        ...points.map((point) => point.value),
        ...points.map((point) => point.to),
      ]);
      const deltaRange = makeSeriesRange(points.map((point) => point.delta));
      const velocityRange = makeSeriesRange(points.map((point) => point.velocity));
      const value = points.map((point) => makePoint(trace, point.timeMs, point.value, valueRange));
      const to = points.map((point) => makePoint(trace, point.timeMs, point.to, valueRange));
      const delta = points.map((point) => makePoint(trace, point.timeMs, point.delta, deltaRange));
      const velocity = points.map((point) => makePoint(trace, point.timeMs, point.velocity, velocityRange));
      const label = `${resolveRecordLabel(track, targetsById)}.${track.prop || "-"}`;
      return {
        cursorX,
        deltaPath: makeSvgPath(delta),
        eventMarkers: track.events.map((event) => ({
          detail: `${event.type || "event"} ${formatNumber(event.timeMs, 0)}ms`,
          type: event.type || "event",
          x: normalizeTimePercent(trace, event.timeMs),
        })),
        key: track.key,
        label,
        laneLabel: [track.lane, track.laneKey].filter(Boolean).join("/") || "-",
        rangeLabels: {
          delta: `${formatNumber(deltaRange.min)}..${formatNumber(deltaRange.max)}`,
          value: `${formatNumber(valueRange.min)}..${formatNumber(valueRange.max)}`,
          velocity: `${formatNumber(velocityRange.min)}..${formatNumber(velocityRange.max)}`,
        },
        sampleCount: points.length,
        sourceLabel: track.sourceLabel || resolveRecordLabel(track, targetsById),
        summary: `${formatCount(points.length)} samples / ${formatCount(track.events.length)} events`,
        toPath: makeSvgPath(to),
        valuePath: makeSvgPath(value),
        velocityPath: makeSvgPath(velocity),
      };
    })
    .sort((a, b) => (b.sampleCount - a.sampleCount) || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, MAX_REPLAY_CURVE_GROUPS))));
}

export function buildMotionReplayOverlayRows(trace = {}, timeMs = 0, filters = {}, limit = MAX_REPLAY_OVERLAY_ROWS) {
  const frame = findMotionReplayFrame(trace, timeMs);
  if (!frame) return [];
  const targetsById = makeTargetsById(trace);
  const predicate = makeFilterPredicate(trace, filters);
  const groups = new Map();
  for (const value of frame.values || []) {
    if (!predicate(value)) continue;
    const key = String(value.targetId ?? resolveRecordLabel(value, targetsById));
    let group = groups.get(key);
    if (!group) {
      group = {
        label: resolveRecordLabel(value, targetsById),
        laneKeys: new Set(),
        props: [],
        targetId: value.targetId,
        values: [],
      };
      groups.set(key, group);
    }
    group.props.push(value.prop || "-");
    group.laneKeys.add([value.lane, value.laneKey].filter(Boolean).join("/") || "-");
    group.values.push(`${value.prop || "-"}=${formatNumber(value.value)}`);
  }
  return Array.from(groups.values())
    .map((group) => ({
      key: String(group.targetId ?? group.label),
      label: group.label,
      laneSummary: Array.from(group.laneKeys).slice(0, 2).join(" "),
      propSummary: Array.from(new Set(group.props)).slice(0, 4).join(","),
      targetId: group.targetId,
      valueSummary: group.values.slice(0, 4).join(" / "),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, MAX_REPLAY_OVERLAY_ROWS))));
}

function collectUsedTargetIds(frames = [], events = []) {
  const ids = new Set();
  for (const frame of frames) {
    for (const value of frame.values || []) if (value.targetId != null) ids.add(value.targetId);
  }
  for (const event of events) if (event.targetId != null) ids.add(event.targetId);
  return ids;
}

function collectUsedTrackKeys(frames = [], events = []) {
  const keys = new Set();
  for (const frame of frames) {
    for (const value of frame.values || []) keys.add(makeTrackKey(value));
  }
  for (const event of events) keys.add(makeTrackKey(event));
  return keys;
}

export function createMotionReplayIntervalExport(trace = {}, options = {}) {
  const normalized = normalizeMotionReplayTrace(trace);
  const filters = options.filters || {};
  const predicate = makeFilterPredicate(normalized, filters);
  const range = getMotionReplayTimeRange(normalized);
  const startMs = normalizeMotionReplayTime(normalized, options.startMs ?? range.min);
  const endMs = normalizeMotionReplayTime(normalized, options.endMs ?? range.max);
  const minTime = Math.min(startMs, endMs);
  const maxTime = Math.max(startMs, endMs);
  const frames = (normalized.timeline.frames || [])
    .filter((frame) => frame.timeMs >= minTime && frame.timeMs <= maxTime)
    .map((frame) => ({
      ...frame,
      values: (frame.values || []).filter(predicate),
    }))
    .filter((frame) => frame.values.length > 0);
  const events = (normalized.timeline.events || [])
    .filter((event) => event.timeMs >= minTime && event.timeMs <= maxTime)
    .filter(predicate);
  const usedTargetIds = collectUsedTargetIds(frames, events);
  const usedTrackKeys = collectUsedTrackKeys(frames, events);
  const targets = (normalized.targets || []).filter((target) => target?.targetId != null && usedTargetIds.has(target.targetId));
  const tracks = (normalized.tracks || []).filter((track) => usedTrackKeys.has(makeTrackKey(track)));
  const warnings = (normalized.warnings || []).filter((warning) => warning?.targetId != null && usedTargetIds.has(warning.targetId));
  const data = {
    filters: {
      query: normalizeQuery(filters.query),
    },
    interval: {
      endMs: maxTime,
      startMs: minTime,
    },
    schema: MOTION_REPLAY_INTERVAL_SCHEMA,
    source: {
      generatedAt: normalized.generatedAt ?? null,
      schema: normalized.schema,
      version: normalized.version ?? null,
    },
    summary: {
      eventCount: events.length,
      frameCount: frames.length,
      targetCount: targets.length,
      trackCount: tracks.length,
      valueCount: frames.reduce((total, frame) => total + frame.values.length, 0),
      warningCount: warnings.length,
    },
    targets,
    timeline: {
      events,
      frames,
    },
    tracks,
    warnings,
  };
  return {
    data,
    json: JSON.stringify(data, null, 2),
  };
}

export function buildMotionReplayFilterSummary(trace = {}, timeMs = 0, filters = {}) {
  const frameRows = buildMotionReplayFrameRows(trace, timeMs, filters, 100000);
  const eventRows = buildMotionReplayEventRows(trace, timeMs, filters, 100000);
  return {
    query: normalizeQuery(filters.query),
    text: `${formatCount(frameRows.length)} props / ${formatCount(eventRows.length)} events`,
  };
}
