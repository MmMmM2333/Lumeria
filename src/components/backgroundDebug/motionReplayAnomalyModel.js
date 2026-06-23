import {
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "./motionReplayViewerModel.js";

export const MOTION_REPLAY_ANOMALY_TYPES = [
  "max-velocity",
  "max-delta",
  "overshoot",
  "warning",
  "cancel",
  "retarget",
];

const ANOMALY_LABELS = {
  cancel: "Cancel",
  "max-delta": "Max delta",
  "max-velocity": "Max velocity",
  overshoot: "Overshoot",
  retarget: "Retarget",
  warning: "Warning",
};

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const fixed = number.toFixed(digits);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
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
    record.warningType,
    record.targetId,
    record.targetKind,
    record.targetLabel,
    record.sourceLabel,
    record.label,
    record.layer,
    record.kind,
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

function toTrackRef(record = {}, targetsById = new Map()) {
  const sourceLabel = resolveRecordLabel(record, targetsById);
  return {
    driver: record.driver || "unknown",
    key: makeTrackKey(record),
    lane: record.lane || "base",
    laneKey: record.laneKey || "default",
    layer: record.layer,
    prop: record.prop || "unknown",
    sourceLabel,
    targetId: record.targetId ?? null,
  };
}

function makeCandidate(type, record = {}, options = {}) {
  const targetsById = options.targetsById || new Map();
  const timeMs = normalizeMotionReplayTime(options.trace, options.timeMs ?? record.timeMs ?? 0);
  const value = readNumber(record.value, 0);
  const to = readNumber(record.to, 0);
  const delta = to - value;
  const velocity = readNumber(record.velocity, 0);
  const sourceLabel = resolveRecordLabel(record, targetsById);
  const metricLabel = options.metricLabel || `${formatNumber(Math.abs(options.score ?? 0))}`;
  const eventBits = [
    record.type || options.warningType,
    record.reason ? `reason=${record.reason}` : null,
  ].filter(Boolean).join(" / ");
  return {
    delta,
    detail: [
      `${sourceLabel}.${record.prop || "unknown"}`,
      `${formatNumber(timeMs, 0)}ms`,
      metricLabel,
      eventBits || null,
    ].filter(Boolean).join(" / "),
    key: `${type}:${formatNumber(timeMs, 0)}:${makeTrackKey(record)}:${options.warningType || record.type || "sample"}`,
    label: ANOMALY_LABELS[type] || type,
    metricLabel,
    reason: record.reason || "",
    sourceLabel,
    timeLabel: `${formatNumber(timeMs, 0)}ms`,
    timeMs,
    to,
    track: toTrackRef(record, targetsById),
    type,
    value,
    velocity,
    warningType: options.warningType || "",
  };
}

function compareCandidateScore(a, b) {
  return readNumber(b.score, 0) - readNumber(a.score, 0)
    || readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0)
    || String(a.sourceLabel || "").localeCompare(String(b.sourceLabel || ""))
    || String(a.prop || "").localeCompare(String(b.prop || ""));
}

function pickStrongest(candidates = []) {
  return candidates.slice().sort(compareCandidateScore)[0] || null;
}

function collectSampleCandidates(trace = {}, targetsById = new Map(), filters = {}) {
  const candidates = [];
  for (const frame of trace.timeline?.frames || []) {
    for (const value of frame.values || []) {
      const record = {
        ...value,
        timeMs: frame.timeMs,
      };
      if (!matchesFilters(record, targetsById, filters)) continue;
      const delta = readNumber(record.to, 0) - readNumber(record.value, 0);
      candidates.push({
        ...record,
        delta,
        scoreDelta: Math.abs(delta),
        scoreVelocity: Math.abs(readNumber(record.velocity, 0)),
        sourceLabel: resolveRecordLabel(record, targetsById),
      });
    }
  }
  return candidates;
}

function collectEventCandidates(trace = {}, targetsById = new Map(), filters = {}, type) {
  return (trace.timeline?.events || [])
    .filter((event) => String(event.type || "").toLowerCase() === type)
    .filter((event) => matchesFilters(event, targetsById, filters))
    .map((event) => ({
      ...event,
      score: Math.abs(readNumber(event.velocity, 0))
        + Math.abs(readNumber(event.to, 0) - readNumber(event.value, 0)),
      sourceLabel: resolveRecordLabel(event, targetsById),
    }));
}

function warningMatchesRecord(warning = {}, record = {}) {
  if (warning.targetId != null && String(warning.targetId) !== String(record.targetId)) return false;
  if (warning.sourceLabel && warning.sourceLabel !== record.sourceLabel) return false;
  if (warning.prop && warning.prop !== record.prop) return false;
  if (warning.lane && warning.lane !== record.lane) return false;
  if (warning.laneKey && warning.laneKey !== record.laneKey) return false;
  return true;
}

function findWarningJumpRecord(trace = {}, warning = {}, sampleCandidates = [], targetsById = new Map()) {
  if (Number.isFinite(Number(warning.timeMs))) return warning;
  const matchingSamples = sampleCandidates.filter((sample) => warningMatchesRecord(warning, sample));
  const strongestSample = pickStrongest(matchingSamples.map((sample) => ({
    ...sample,
    score: Math.max(sample.scoreDelta, sample.scoreVelocity),
  })));
  if (strongestSample) return strongestSample;
  const matchingEvent = (trace.timeline?.events || []).find((event) => warningMatchesRecord(warning, {
    ...event,
    sourceLabel: resolveRecordLabel(event, targetsById),
  }));
  return matchingEvent || warning;
}

function collectWarningCandidates(trace = {}, targetsById = new Map(), filters = {}, sampleCandidates = [], typeFilter = null) {
  return (trace.warnings || [])
    .map((warning) => ({
      ...warning,
      warningType: warning.type || "warning",
    }))
    .filter((warning) => !typeFilter || String(warning.warningType).toLowerCase() === typeFilter)
    .filter((warning) => matchesFilters(warning, targetsById, filters))
    .map((warning) => {
      const jumpRecord = findWarningJumpRecord(trace, warning, sampleCandidates, targetsById);
      return {
        ...jumpRecord,
        score: Math.max(
          Math.abs(readNumber(jumpRecord.velocity, 0)),
          Math.abs(readNumber(jumpRecord.to, 0) - readNumber(jumpRecord.value, 0)),
          1,
        ),
        warningType: warning.warningType,
      };
    });
}

export function buildMotionReplayAnomalyJumps(traceInput = null, options = {}) {
  if (!traceInput) return [];
  const trace = normalizeMotionReplayTrace(traceInput);
  const filters = options.filters || {};
  const targetsById = makeTargetsById(trace);
  const sampleCandidates = collectSampleCandidates(trace, targetsById, filters);
  const rows = [];

  const maxVelocity = pickStrongest(sampleCandidates.map((record) => ({
    ...record,
    score: record.scoreVelocity,
  })).filter((record) => record.score > 0));
  if (maxVelocity) {
    rows.push(makeCandidate("max-velocity", maxVelocity, {
      metricLabel: `|v| ${formatNumber(maxVelocity.score)}`,
      score: maxVelocity.score,
      targetsById,
      trace,
    }));
  }

  const maxDelta = pickStrongest(sampleCandidates.map((record) => ({
    ...record,
    score: record.scoreDelta,
  })).filter((record) => record.score > 0));
  if (maxDelta) {
    rows.push(makeCandidate("max-delta", maxDelta, {
      metricLabel: `|delta| ${formatNumber(maxDelta.score)}`,
      score: maxDelta.score,
      targetsById,
      trace,
    }));
  }

  const overshoot = pickStrongest(collectWarningCandidates(trace, targetsById, filters, sampleCandidates, "overshoot"));
  if (overshoot) {
    rows.push(makeCandidate("overshoot", overshoot, {
      metricLabel: "warning overshoot",
      score: overshoot.score,
      targetsById,
      trace,
      warningType: overshoot.warningType,
    }));
  }

  const warningCandidates = collectWarningCandidates(trace, targetsById, filters, sampleCandidates);
  const warning = pickStrongest(warningCandidates.filter((candidate) => String(candidate.warningType).toLowerCase() !== "overshoot"))
    || pickStrongest(warningCandidates);
  if (warning) {
    rows.push(makeCandidate("warning", warning, {
      metricLabel: `warning ${warning.warningType}`,
      score: warning.score,
      targetsById,
      trace,
      warningType: warning.warningType,
    }));
  }

  const cancel = pickStrongest(collectEventCandidates(trace, targetsById, filters, "cancel"));
  if (cancel) {
    rows.push(makeCandidate("cancel", cancel, {
      metricLabel: cancel.reason ? `reason ${cancel.reason}` : "lifecycle cancel",
      score: cancel.score,
      targetsById,
      trace,
    }));
  }

  const retarget = pickStrongest(collectEventCandidates(trace, targetsById, filters, "retarget"));
  if (retarget) {
    rows.push(makeCandidate("retarget", retarget, {
      metricLabel: retarget.reason ? `reason ${retarget.reason}` : "lifecycle retarget",
      score: retarget.score,
      targetsById,
      trace,
    }));
  }

  return rows.map((row, index) => ({
    ...row,
    key: `${row.key}:${index}`,
  }));
}
