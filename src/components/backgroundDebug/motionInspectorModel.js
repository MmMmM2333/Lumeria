import {
  findMotionReplayFrame,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "./motionReplayViewerModel.js";
import {
  makeTargetsById,
  makeTrackKey,
  readNumber,
  resolveRecordLabel,
} from "../../rendering/motionPort.js";

const DEFAULT_EVENT_LIMIT = 6;
const DEFAULT_WARNING_LIMIT = 6;
const LANE_ORDER = new Map([
  ["base", 0],
  ["additive", 1],
  ["factor", 2],
]);

function readString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const fixed = number.toFixed(digits);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

function normalizeTargetRef(target = null) {
  if (!target || typeof target !== "object") return null;
  const normalized = {};
  if (target.targetId != null && Number.isFinite(Number(target.targetId))) normalized.targetId = Number(target.targetId);
  if (target.sourceLabel != null) normalized.sourceLabel = String(target.sourceLabel);
  if (target.label != null) normalized.label = String(target.label);
  if (target.layer != null) normalized.layer = String(target.layer);
  if (target.kind != null) normalized.kind = String(target.kind);
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeTrackRef(track = null) {
  if (!track || typeof track !== "object") return null;
  const normalized = {
    lane: readString(track.lane, "base"),
    laneKey: readString(track.laneKey, "default"),
    prop: readString(track.prop, "unknown"),
  };
  const target = normalizeTargetRef(track);
  if (target?.targetId != null) normalized.targetId = target.targetId;
  if (target?.sourceLabel != null) normalized.sourceLabel = target.sourceLabel;
  return normalized;
}

function targetMatches(record = {}, target = {}, selection = null) {
  if (!selection) return true;
  if (selection.targetId != null && String(record.targetId ?? target.targetId) !== String(selection.targetId)) return false;
  if (selection.sourceLabel && record.sourceLabel !== selection.sourceLabel && target.sourceLabel !== selection.sourceLabel) return false;
  if (selection.label && record.targetLabel !== selection.label && record.label !== selection.label && target.label !== selection.label) return false;
  if (selection.layer && record.layer !== selection.layer && target.layer !== selection.layer) return false;
  if (selection.kind && record.targetKind !== selection.kind && record.kind !== selection.kind && target.kind !== selection.kind) return false;
  return true;
}

function trackMatches(record = {}, track = null) {
  if (!track) return true;
  if (track.targetId != null && String(record.targetId) !== String(track.targetId)) return false;
  if (track.sourceLabel && record.sourceLabel !== track.sourceLabel) return false;
  if (track.prop && record.prop !== track.prop) return false;
  if (track.lane && record.lane !== track.lane) return false;
  if (track.laneKey && record.laneKey !== track.laneKey) return false;
  return true;
}

function targetPropMatches(record = {}, selectedTarget = null, selectedTrack = null, targetsById = new Map()) {
  const target = record.targetId != null ? targetsById.get(record.targetId) : {};
  if (selectedTrack) {
    if (selectedTrack.targetId != null && String(record.targetId) !== String(selectedTrack.targetId)) return false;
    if (selectedTrack.sourceLabel && record.sourceLabel !== selectedTrack.sourceLabel) return false;
    return record.prop === selectedTrack.prop;
  }
  return targetMatches(record, target, selectedTarget);
}

function toInspectorValue(record = {}, frame = {}, targetsById = new Map(), selectedTrack = null) {
  const value = readNumber(record.value, 0);
  const to = readNumber(record.to, 0);
  const velocity = readNumber(record.velocity, 0);
  const delta = to - value;
  return {
    delta,
    deltaLabel: formatNumber(delta),
    driver: record.driver || "unknown",
    frame: Math.max(0, Math.floor(readNumber(frame.frame, 0))),
    isSelected: Boolean(selectedTrack && trackMatches(record, selectedTrack)),
    key: makeTrackKey(record),
    lane: record.lane || "base",
    laneKey: record.laneKey || "default",
    prop: record.prop || "unknown",
    sourceLabel: resolveRecordLabel(record, targetsById),
    targetId: record.targetId ?? null,
    timeMs: readNumber(frame.timeMs, 0),
    to,
    toLabel: formatNumber(to),
    value,
    valueLabel: formatNumber(value),
    velocity,
    velocityLabel: formatNumber(velocity),
  };
}

function sortLaneBreakdown(a, b) {
  const laneA = LANE_ORDER.has(a.lane) ? LANE_ORDER.get(a.lane) : 99;
  const laneB = LANE_ORDER.has(b.lane) ? LANE_ORDER.get(b.lane) : 99;
  return laneA - laneB
    || a.lane.localeCompare(b.lane)
    || a.laneKey.localeCompare(b.laneKey)
    || a.prop.localeCompare(b.prop);
}

function buildLaneBreakdown(trace = {}, frame = null, selectedTarget = null, selectedTrack = null) {
  if (!frame) return [];
  const targetsById = makeTargetsById(trace);
  return (frame.values || [])
    .filter((record) => targetPropMatches(record, selectedTarget, selectedTrack, targetsById))
    .map((record) => toInspectorValue(record, frame, targetsById, selectedTrack))
    .sort(sortLaneBreakdown);
}

function pickCurrentValue(laneBreakdown = [], selectedTrack = null) {
  if (!laneBreakdown.length) return null;
  return laneBreakdown.find((row) => row.isSelected)
    || (selectedTrack ? null : laneBreakdown[0]);
}

function eventMatches(event = {}, selectedTarget = null, selectedTrack = null, targetsById = new Map()) {
  const target = event.targetId != null ? targetsById.get(event.targetId) : {};
  if (selectedTrack) return trackMatches(event, selectedTrack);
  return targetMatches(event, target, selectedTarget);
}

function buildRecentEvents(trace = {}, timeMs = 0, selectedTarget = null, selectedTrack = null, limit = DEFAULT_EVENT_LIMIT) {
  const targetsById = makeTargetsById(trace);
  const currentTime = normalizeMotionReplayTime(trace, timeMs);
  return (trace.timeline?.events || [])
    .filter((event) => eventMatches(event, selectedTarget, selectedTrack, targetsById))
    .map((event) => ({
      detail: [
        event.prop || "unknown",
        `${formatNumber(event.value)} -> ${formatNumber(event.to)}`,
        event.driver || "unknown",
        event.reason ? `reason=${event.reason}` : null,
      ].filter(Boolean).join(" / "),
      driver: event.driver || "unknown",
      isCurrent: Math.abs(readNumber(event.timeMs, 0) - currentTime) <= 1,
      key: `${Math.round(readNumber(event.timeMs, 0))}:${event.type || "event"}:${makeTrackKey(event)}`,
      lane: event.lane || "base",
      laneKey: event.laneKey || "default",
      prop: event.prop || "unknown",
      reason: event.reason || "",
      sourceLabel: resolveRecordLabel(event, targetsById),
      timeLabel: `${formatNumber(event.timeMs, 0)}ms`,
      timeMs: readNumber(event.timeMs, 0),
      type: event.type || "event",
    }))
    .sort((a, b) => Math.abs(a.timeMs - currentTime) - Math.abs(b.timeMs - currentTime) || a.timeMs - b.timeMs)
    .slice(0, Math.max(0, Math.floor(readNumber(limit, DEFAULT_EVENT_LIMIT))));
}

function warningMatches(warning = {}, selectedTarget = null, selectedTrack = null, targetsById = new Map()) {
  const target = warning.targetId != null ? targetsById.get(warning.targetId) : {};
  if (selectedTrack) {
    if (selectedTrack.targetId != null && String(warning.targetId) !== String(selectedTrack.targetId)) return false;
    if (selectedTrack.sourceLabel && warning.sourceLabel !== selectedTrack.sourceLabel) return false;
    if (selectedTrack.prop && warning.prop !== selectedTrack.prop) return false;
    return true;
  }
  return targetMatches(warning, target, selectedTarget);
}

function buildWarnings(trace = {}, selectedTarget = null, selectedTrack = null, limit = DEFAULT_WARNING_LIMIT) {
  const targetsById = makeTargetsById(trace);
  return (trace.warnings || [])
    .filter((warning) => warningMatches(warning, selectedTarget, selectedTrack, targetsById))
    .map((warning, index) => ({
      detail: [
        warning.type || "warning",
        warning.prop,
        warning.laneKey,
        warning.sourceLabel || (warning.targetId != null ? `target ${warning.targetId}` : null),
      ].filter(Boolean).join(" / "),
      key: `${warning.type || "warning"}:${warning.targetId ?? "target"}:${warning.prop ?? "prop"}:${warning.laneKey ?? index}`,
      laneKey: warning.laneKey || "",
      prop: warning.prop || "",
      sourceLabel: warning.sourceLabel || "",
      targetId: warning.targetId ?? null,
      type: warning.type || "warning",
    }))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, DEFAULT_WARNING_LIMIT))));
}

function localize(t, key, params, technicalText) {
  return typeof t === "function" ? t(key, params) : technicalText;
}

function buildWhyRows({ current, laneBreakdown, recentEvents, t, warnings }) {
  const rows = [];
  if (!current) {
    rows.push({
      detail: localize(t, "debug.motion.inspector.noCurrentSampleDetail", {}, "No replay sample matches the current target or track at the selected time."),
      key: "no-current-sample",
      label: localize(t, "debug.motion.inspector.noCurrentSample", {}, "No current sample"),
      tone: "muted",
    });
  } else {
    rows.push({
      detail: localize(t, "debug.motion.inspector.currentValueDetail", {
        delta: current.deltaLabel,
        prop: current.prop,
        source: current.sourceLabel,
        to: current.toLabel,
        value: current.valueLabel,
        velocity: current.velocityLabel,
      }, `${current.sourceLabel}.${current.prop}: current ${current.valueLabel}, target ${current.toLabel}, delta ${current.deltaLabel}, velocity ${current.velocityLabel}.`),
      key: "current-value",
      label: localize(t, "debug.motion.fields.currentValue", {}, "Current value"),
      tone: Math.abs(current.delta) > 0.001 || Math.abs(current.velocity) > 0.001 ? "active" : "muted",
    });
    rows.push({
      detail: localize(t, "debug.motion.inspector.selectedLaneDetail", {
        driver: current.driver,
        lane: current.lane,
        laneKey: current.laneKey,
      }, `The ${current.driver} driver on ${current.lane}/${current.laneKey} is the selected channel contribution.`),
      key: "selected-lane",
      label: localize(t, "debug.motion.inspector.selectedLane", {}, "Selected lane"),
      tone: "info",
    });
  }
  if (laneBreakdown.length > 1) {
    rows.push({
      detail: laneBreakdown.map((lane) => `${lane.lane}/${lane.laneKey}:${lane.valueLabel}->${lane.toLabel}`).join(" | "),
      key: "lane-breakdown",
      label: localize(t, "debug.motion.inspector.multipleLanes", {}, "Multiple lane composition"),
      tone: "info",
    });
  }
  const latestPastEvent = recentEvents
    .filter((event) => current ? event.timeMs <= current.timeMs : true)
    .sort((a, b) => b.timeMs - a.timeMs)[0] || recentEvents[0];
  if (latestPastEvent) {
    rows.push({
      detail: localize(t, "debug.motion.inspector.recentEventDetail", {
        detail: latestPastEvent.detail,
        reason: latestPastEvent.reason ? ` (${latestPastEvent.reason})` : "",
        time: latestPastEvent.timeLabel,
        type: latestPastEvent.type,
      }, `${latestPastEvent.timeLabel}: ${latestPastEvent.type}${latestPastEvent.reason ? ` (${latestPastEvent.reason})` : ""}: ${latestPastEvent.detail}.`),
      key: "recent-event",
      label: localize(t, "debug.motion.inspector.recentEvent", {}, "Recent event"),
      tone: latestPastEvent.type === "cancel" || latestPastEvent.type === "retarget" ? "warning" : "info",
    });
  }
  if (warnings.length) {
    rows.push({
      detail: warnings.map((warning) => warning.detail).join(" | "),
      key: "warnings",
      label: localize(t, "debug.motion.values.warnings", {}, "Warnings"),
      tone: "warning",
    });
  }
  return rows;
}

export function buildMotionInspectorModel(traceInput = null, options = {}) {
  if (!traceInput) {
    return {
      current: null,
      laneBreakdown: [],
      recentEvents: [],
      selected: {
        target: normalizeTargetRef(options.selectedTarget),
        timeMs: 0,
        track: normalizeTrackRef(options.selectedTrack),
      },
      warnings: [],
      whyRows: [],
    };
  }
  const trace = normalizeMotionReplayTrace(traceInput);
  const selectedTarget = normalizeTargetRef(options.selectedTarget);
  const selectedTrack = normalizeTrackRef(options.selectedTrack);
  const selectedTimeMs = normalizeMotionReplayTime(trace, options.selectedTimeMs ?? options.timeMs ?? 0);
  const frame = findMotionReplayFrame(trace, selectedTimeMs);
  const laneBreakdown = buildLaneBreakdown(trace, frame, selectedTarget, selectedTrack);
  const current = pickCurrentValue(laneBreakdown, selectedTrack);
  const recentEvents = buildRecentEvents(trace, selectedTimeMs, selectedTarget, selectedTrack, options.eventLimit);
  const warnings = buildWarnings(trace, selectedTarget, selectedTrack, options.warningLimit);
  return {
    current,
    laneBreakdown,
    recentEvents,
    selected: {
      target: selectedTarget,
      timeMs: selectedTimeMs,
      track: selectedTrack,
    },
    warnings,
    whyRows: buildWhyRows({ current, laneBreakdown, recentEvents, t: options.t, warnings }),
  };
}
