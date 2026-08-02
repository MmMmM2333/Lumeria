import {
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "../components/backgroundDebug/motionReplayViewerModel.js";
import {
  collectRecordText,
  makeTargetsById,
  makeTrackKey,
  normalizeQuery,
  readNumber,
  resolveRecordLabel,
} from "../rendering/pixi/animation/motionTraceShared.js";
import {
  DEFAULT_DIAGNOSTIC_LOCALE,
  translateDiagnosticMessage,
} from "./diagnosticMessages.js";

export const MOTION_REPLAY_ANALYSIS_SCHEMA = "lumeria-motion-replay-analysis/v1";
export const MOTION_REPLAY_FINDING_CODES = Object.freeze([
  "motion.peak-velocity",
  "motion.peak-delta",
  "motion.overshoot",
  "motion.warning",
  "motion.cancel",
  "motion.retarget",
]);

const SEVERITY_ORDER = Object.freeze({ critical: 4, error: 3, warning: 2, info: 1 });

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const fixed = number.toFixed(digits);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

function translate(key, values, locale) {
  return translateDiagnosticMessage(key, values, { locale });
}

function matchesFilters(record = {}, targetsById = new Map(), filters = {}) {
  const query = normalizeQuery(filters.query);
  return !query || collectRecordText(record, targetsById, {
    includeLayer: true,
    includeRecordKind: true,
    includeTargetLayer: true,
    includeWarningType: true,
  }).includes(query);
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

function warningMatchesRecord(warning = {}, record = {}) {
  if (warning.targetId != null && String(warning.targetId) !== String(record.targetId)) return false;
  if (warning.sourceLabel && warning.sourceLabel !== record.sourceLabel) return false;
  if (warning.prop && warning.prop !== record.prop) return false;
  if (warning.lane && warning.lane !== record.lane) return false;
  if (warning.laneKey && warning.laneKey !== record.laneKey) return false;
  return true;
}

function compareScore(left, right) {
  return readNumber(right?.score, 0) - readNumber(left?.score, 0)
    || readNumber(left?.timeMs, 0) - readNumber(right?.timeMs, 0)
    || String(left?.sourceLabel || "").localeCompare(String(right?.sourceLabel || ""));
}

function stronger(current, candidate) {
  if (!candidate) return current;
  if (!current || compareScore(current, candidate) > 0) return candidate;
  return current;
}

function makeLocation(trace, record, targetsById) {
  const timeMs = normalizeMotionReplayTime(trace, record?.timeMs ?? 0);
  return {
    timeLabel: `${formatNumber(timeMs, 0)}ms`,
    timeMs,
    track: toTrackRef(record, targetsById),
  };
}

function makeInspectAction(location, locale) {
  return {
    id: "motion.inspect-track-time",
    label: translate("diagnostics.analysis.nextAction.inspect", { timeMs: formatNumber(location.timeMs, 0) }, locale),
    operation: "replay.document.view",
    params: {
      options: {
        selectedTimeMs: location.timeMs,
        selectedTrack: location.track,
      },
      view: "inspector",
    },
  };
}

function makeFinding({
  code,
  confidence = 1,
  counterEvidence = [],
  evidence,
  location,
  message,
  nextActions = [],
  observations,
  severity,
  title,
}, documentId) {
  return {
    code,
    confidence: {
      level: confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low",
      score: confidence,
    },
    counterEvidence,
    evidence,
    id: `${documentId || "motion-capture"}:${code}:${formatNumber(location.timeMs, 3)}:${location.track.key}`,
    location,
    message,
    nextActions,
    observations,
    severity,
    title,
  };
}

function collectCandidates(trace, targetsById, filters) {
  let maxDelta = null;
  let maxVelocity = null;
  const matchingWarnings = (trace.warnings || [])
    .map((warning) => ({ ...warning, warningType: warning.type || "warning" }))
    .filter((warning) => matchesFilters(warning, targetsById, filters))
    .map((warning) => ({
      explicitTime: Number.isFinite(Number(warning.timeMs)),
      firstValue: null,
      lastSample: null,
      nearest: null,
      overshoot: null,
      strongest: null,
      warning,
    }));

  for (const frame of trace.timeline?.frames || []) {
    for (const value of frame.values || []) {
      const record = {
        ...value,
        sourceLabel: resolveRecordLabel(value, targetsById),
        timeMs: readNumber(frame.timeMs, 0),
      };
      if (!matchesFilters(record, targetsById, filters)) continue;
      const delta = readNumber(record.to, 0) - readNumber(record.value, 0);
      maxDelta = stronger(maxDelta, { ...record, delta, score: Math.abs(delta) });
      maxVelocity = stronger(maxVelocity, { ...record, delta, score: Math.abs(readNumber(record.velocity, 0)) });

      for (const warningState of matchingWarnings) {
        if (!warningMatchesRecord(warningState.warning, record)) continue;
        if (warningState.firstValue == null) warningState.firstValue = readNumber(record.value, 0);
        warningState.lastSample = record;
        warningState.strongest = stronger(warningState.strongest, {
          ...record,
          score: Math.max(Math.abs(delta), Math.abs(readNumber(record.velocity, 0))),
        });
        if (warningState.explicitTime) {
          const distance = Math.abs(readNumber(record.timeMs, 0) - readNumber(warningState.warning.timeMs, 0));
          if (!warningState.nearest || distance < warningState.nearest.distance) {
            warningState.nearest = { ...record, distance, score: -distance };
          }
        }
        const direction = readNumber(record.to, 0) - readNumber(warningState.firstValue, 0);
        const overshootAmount = direction >= 0
          ? readNumber(record.value, 0) - readNumber(record.to, 0)
          : readNumber(record.to, 0) - readNumber(record.value, 0);
        if (overshootAmount > readNumber(warningState.overshoot?.score, 0)) {
          warningState.overshoot = { ...record, score: overshootAmount };
        }
      }
    }
  }

  const eventTypes = {
    cancel: { count: 0, strongest: null },
    retarget: { count: 0, strongest: null },
  };
  for (const event of trace.timeline?.events || []) {
    const type = String(event.type || "").toLowerCase();
    if (!eventTypes[type] || !matchesFilters(event, targetsById, filters)) continue;
    eventTypes[type].count += 1;
    eventTypes[type].strongest = stronger(eventTypes[type].strongest, {
      ...event,
      score: Math.abs(readNumber(event.velocity, 0))
        + Math.abs(readNumber(event.to, 0) - readNumber(event.value, 0)),
      sourceLabel: resolveRecordLabel(event, targetsById),
    });
  }

  return {
    cancel: eventTypes.cancel,
    maxDelta: maxDelta?.score > 0 ? maxDelta : null,
    maxVelocity: maxVelocity?.score > 0 ? maxVelocity : null,
    retarget: eventTypes.retarget,
    warnings: matchingWarnings.map((state) => {
      const isOvershoot = String(state.warning.warningType).toLowerCase() === "overshoot";
      const record = state.explicitTime
        ? state.nearest || state.warning
        : isOvershoot
          ? state.overshoot || state.strongest || state.warning
          : state.strongest || state.warning;
      return { ...state, isOvershoot, record };
    }),
  };
}

function makePeakFinding(type, record, trace, targetsById, locale, documentId) {
  const location = makeLocation(trace, record, targetsById);
  const isVelocity = type === "maxVelocity";
  const code = isVelocity ? "motion.peak-velocity" : "motion.peak-delta";
  const messagePrefix = isVelocity ? "maxVelocity" : "maxDelta";
  const value = Math.abs(isVelocity ? readNumber(record.velocity, 0) : readNumber(record.delta, 0));
  const values = {
    prop: location.track.prop,
    sourceLabel: location.track.sourceLabel,
    timeMs: formatNumber(location.timeMs, 0),
    value: formatNumber(value),
  };
  return makeFinding({
    code,
    confidence: 1,
    evidence: [{
      id: `${code}.sample`,
      kind: "motion-sample",
      message: translate(`diagnostics.analysis.finding.${messagePrefix}.observation`, values, locale),
      metrics: isVelocity ? { absVelocity: value } : { absDelta: value },
      timeMs: location.timeMs,
      track: location.track,
    }],
    location,
    message: translate(`diagnostics.analysis.finding.${messagePrefix}.message`, values, locale),
    nextActions: [makeInspectAction(location, locale)],
    observations: [{
      code: isVelocity ? "motion.sample.max-abs-velocity" : "motion.sample.max-abs-delta",
      message: translate(`diagnostics.analysis.finding.${messagePrefix}.observation`, values, locale),
      values: isVelocity ? { absVelocity: value } : { absDelta: value },
    }],
    severity: "info",
    title: translate(`diagnostics.analysis.finding.${messagePrefix}.title`, values, locale),
  }, documentId);
}

function makeWarningFinding(state, trace, targetsById, locale, documentId) {
  const location = makeLocation(trace, state.record, targetsById);
  const warningType = state.warning.warningType;
  const prefix = state.isOvershoot ? "overshoot" : "warning";
  const code = state.isOvershoot ? "motion.overshoot" : "motion.warning";
  const values = {
    prop: location.track.prop,
    sourceLabel: location.track.sourceLabel,
    timeMs: formatNumber(location.timeMs, 0),
    warningType,
  };
  const lastDelta = state.lastSample
    ? Math.abs(readNumber(state.lastSample.to, 0) - readNumber(state.lastSample.value, 0))
    : Infinity;
  const counterEvidence = state.lastSample && lastDelta <= 0.01
    ? [{
      code: "motion.sample.settled-after-warning",
      message: translate("diagnostics.analysis.finding.counterEvidence.settled", {}, locale),
      timeMs: readNumber(state.lastSample.timeMs, 0),
    }]
    : [];
  return makeFinding({
    code,
    confidence: 1,
    counterEvidence,
    evidence: [{
      id: `${code}.runtime-warning`,
      kind: "runtime-warning",
      message: translate(`diagnostics.analysis.finding.${prefix}.observation`, values, locale),
      metrics: {
        delta: readNumber(state.record.to, 0) - readNumber(state.record.value, 0),
        value: readNumber(state.record.value, 0),
        velocity: readNumber(state.record.velocity, 0),
      },
      timeMs: location.timeMs,
      track: location.track,
      warningType,
    }],
    location,
    message: translate(`diagnostics.analysis.finding.${prefix}.message`, values, locale),
    nextActions: [
      makeInspectAction(location, locale),
      {
        id: "motion.review-runtime-warning",
        label: translate("diagnostics.analysis.nextAction.reviewWarning", values, locale),
      },
    ],
    observations: [{
      code: "motion.runtime-warning.observed",
      message: translate(`diagnostics.analysis.finding.${prefix}.observation`, values, locale),
      values: { warningType },
    }],
    severity: "warning",
    title: translate(`diagnostics.analysis.finding.${prefix}.title`, values, locale),
  }, documentId);
}

function makeEventFinding(type, eventState, trace, targetsById, locale, documentId) {
  const record = eventState.strongest;
  const location = makeLocation(trace, record, targetsById);
  const code = `motion.${type}`;
  const reason = record.reason || "unspecified";
  const values = {
    count: eventState.count,
    reason,
    timeMs: formatNumber(location.timeMs, 0),
  };
  return makeFinding({
    code,
    confidence: 1,
    evidence: [{
      id: `${code}.event`,
      kind: "motion-event",
      message: translate(`diagnostics.analysis.finding.${type}.observation`, values, locale),
      reason,
      timeMs: location.timeMs,
      track: location.track,
    }],
    location,
    message: translate(`diagnostics.analysis.finding.${type}.message`, values, locale),
    nextActions: [
      makeInspectAction(location, locale),
      {
        id: `motion.review-${type}`,
        label: translate(`diagnostics.analysis.nextAction.review${type === "cancel" ? "Cancel" : "Retarget"}`, values, locale),
      },
    ],
    observations: [{
      code: `motion.event.${type}`,
      message: translate(`diagnostics.analysis.finding.${type}.observation`, values, locale),
      values: { count: eventState.count, reason },
    }],
    severity: "info",
    title: translate(`diagnostics.analysis.finding.${type}.title`, values, locale),
  }, documentId);
}

function analyzeDataQuality(trace, locale) {
  const frameTimes = (trace.timeline?.frames || [])
    .map((frame) => Number(frame.timeMs))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  const frameGaps = frameTimes.slice(1).map((time, index) => Math.max(0, time - frameTimes[index]));
  const maxFrameGapMs = frameGaps.length ? Math.max(...frameGaps) : 0;
  const averageFrameGapMs = frameGaps.length
    ? frameGaps.reduce((total, gap) => total + gap, 0) / frameGaps.length
    : 0;
  const requestedDurationMs = Math.max(0, readNumber(trace.capture?.requestedDurationMs, 0));
  const actualDurationMs = frameTimes.length > 1 ? frameTimes.at(-1) - frameTimes[0] : 0;
  const coverageRatio = requestedDurationMs > 0 ? Math.min(1, actualDurationMs / requestedDurationMs) : null;
  const sampleHz = Math.max(0, readNumber(trace.capture?.sampleHz, 0));
  const expectedFrameGapMs = sampleHz > 0 ? 1000 / sampleHz : null;
  const issues = [];
  if (!frameTimes.length) {
    issues.push({
      code: "capture.frames.missing",
      message: translate("diagnostics.analysis.dataQuality.issue.noFrames", {}, locale),
      severity: "error",
    });
  }
  if (coverageRatio != null && coverageRatio < 0.8) {
    issues.push({
      code: "capture.duration.low-coverage",
      message: translate("diagnostics.analysis.dataQuality.issue.coverage", {
        coveragePercent: formatNumber(coverageRatio * 100, 0),
      }, locale),
      severity: "warning",
      values: { actualDurationMs, coverageRatio, requestedDurationMs },
    });
  }
  if (expectedFrameGapMs != null && maxFrameGapMs > expectedFrameGapMs * 2.5) {
    issues.push({
      code: "capture.frames.large-gap",
      message: translate("diagnostics.analysis.dataQuality.issue.frameGap", {
        expectedFrameGapMs: formatNumber(expectedFrameGapMs),
        maxFrameGapMs: formatNumber(maxFrameGapMs),
      }, locale),
      severity: "warning",
      values: { expectedFrameGapMs, maxFrameGapMs },
    });
  }
  const status = !frameTimes.length ? "insufficient" : issues.length ? "limited" : "good";
  return {
    headline: translate(`diagnostics.analysis.dataQuality.${status}`, {}, locale),
    issues,
    metrics: {
      actualDurationMs,
      averageFrameGapMs,
      coverageRatio,
      eventCount: trace.timeline?.events?.length || 0,
      expectedFrameGapMs,
      frameCount: frameTimes.length,
      maxFrameGapMs,
      requestedDurationMs,
      warningCount: trace.warnings?.length || 0,
    },
    status,
  };
}

function summarize(findings, dataQuality, locale) {
  const countsBySeverity = { critical: 0, error: 0, info: 0, warning: 0 };
  for (const finding of findings) countsBySeverity[finding.severity] += 1;
  const highestSeverity = Object.keys(countsBySeverity)
    .filter((severity) => countsBySeverity[severity] > 0)
    .sort((left, right) => SEVERITY_ORDER[right] - SEVERITY_ORDER[left])[0] || null;
  const warningCount = countsBySeverity.critical + countsBySeverity.error + countsBySeverity.warning;
  const infoCount = countsBySeverity.info;
  const status = dataQuality.status === "insufficient"
    ? "insufficient"
    : warningCount > 0
      ? "attention"
      : "ok";
  const headlineKey = status === "insufficient"
    ? "diagnostics.analysis.summary.insufficient"
    : status === "attention"
      ? "diagnostics.analysis.summary.attention"
      : findings.length
        ? "diagnostics.analysis.summary.ok"
        : "diagnostics.analysis.summary.empty";
  return {
    countsBySeverity,
    findingCount: findings.length,
    headline: translate(headlineKey, { infoCount, warningCount }, locale),
    highestSeverity,
    status,
  };
}

function makeMetrics(trace, candidates, range, locale) {
  const metrics = [{
    id: "capture.duration_ms",
    label: translate("diagnostics.analysis.metric.duration", {}, locale),
    unit: "ms",
    value: Math.max(0, readNumber(range.max, 0) - readNumber(range.min, 0)),
  }, {
    id: "capture.frame_count",
    label: translate("diagnostics.analysis.metric.frameCount", {}, locale),
    unit: "count",
    value: trace.timeline?.frames?.length || 0,
  }, {
    id: "capture.event_count",
    label: translate("diagnostics.analysis.metric.eventCount", {}, locale),
    unit: "count",
    value: trace.timeline?.events?.length || 0,
  }, {
    id: "capture.track_count",
    label: translate("diagnostics.analysis.metric.trackCount", {}, locale),
    unit: "count",
    value: trace.tracks?.length || 0,
  }, {
    id: "capture.warning_count",
    label: translate("diagnostics.analysis.metric.warningCount", {}, locale),
    unit: "count",
    value: trace.warnings?.length || 0,
  }];
  if (candidates.maxVelocity) {
    metrics.push({
      id: "motion.max_abs_velocity",
      label: translate("diagnostics.analysis.metric.maxVelocity", {}, locale),
      location: makeLocation(trace, candidates.maxVelocity, makeTargetsById(trace)),
      unit: "value/s",
      value: Math.abs(readNumber(candidates.maxVelocity.velocity, 0)),
    });
  }
  if (candidates.maxDelta) {
    metrics.push({
      id: "motion.max_abs_delta",
      label: translate("diagnostics.analysis.metric.maxDelta", {}, locale),
      location: makeLocation(trace, candidates.maxDelta, makeTargetsById(trace)),
      unit: "value",
      value: Math.abs(readNumber(candidates.maxDelta.delta, 0)),
    });
  }
  return metrics;
}

export function analyzeMotionReplayTrace(traceInput, options = {}) {
  const trace = normalizeMotionReplayTrace(traceInput);
  const locale = String(options.locale || DEFAULT_DIAGNOSTIC_LOCALE);
  const filters = options.filters || {};
  const targetsById = makeTargetsById(trace);
  const candidates = collectCandidates(trace, targetsById, filters);
  const findings = [];
  if (candidates.maxVelocity) findings.push(makePeakFinding("maxVelocity", candidates.maxVelocity, trace, targetsById, locale, options.documentId));
  if (candidates.maxDelta) findings.push(makePeakFinding("maxDelta", candidates.maxDelta, trace, targetsById, locale, options.documentId));

  const overshoot = candidates.warnings.filter((warning) => warning.isOvershoot).sort((left, right) => compareScore(left.record, right.record))[0];
  const otherWarning = candidates.warnings.filter((warning) => !warning.isOvershoot).sort((left, right) => compareScore(left.record, right.record))[0];
  if (overshoot) findings.push(makeWarningFinding(overshoot, trace, targetsById, locale, options.documentId));
  if (otherWarning) findings.push(makeWarningFinding(otherWarning, trace, targetsById, locale, options.documentId));
  if (candidates.cancel.strongest) findings.push(makeEventFinding("cancel", candidates.cancel, trace, targetsById, locale, options.documentId));
  if (candidates.retarget.strongest) findings.push(makeEventFinding("retarget", candidates.retarget, trace, targetsById, locale, options.documentId));

  const dataQuality = analyzeDataQuality(trace, locale);
  const range = trace.timeline?.timeRangeMs || { max: 0, min: 0 };
  return {
    dataQuality,
    documentId: options.documentId || null,
    filters: { query: String(filters.query || "") },
    findings,
    generatedAt: String(options.generatedAt || new Date().toISOString()),
    locale,
    metrics: makeMetrics(trace, candidates, range, locale),
    schema: MOTION_REPLAY_ANALYSIS_SCHEMA,
    summary: summarize(findings, dataQuality, locale),
    title: translate("diagnostics.analysis.motion.title", {}, locale),
  };
}
