import { MOTION_LAB_SCENARIOS } from "./motionLabScenarios.js";
import {
  DEFAULT_MOTION_LAB_PARAMS,
  MOTION_LAB_EASE_OPTIONS,
  MOTION_LAB_INTERRUPT_OPTIONS,
  normalizeMotionLabParams,
} from "./motionLabParams.js";

export const MOTION_LAB_QUERY_PARAM = "motionLab";
export { MOTION_LAB_SCENARIOS };
export {
  DEFAULT_MOTION_LAB_PARAMS,
  MOTION_LAB_EASE_OPTIONS,
  MOTION_LAB_INTERRUPT_OPTIONS,
  normalizeMotionLabParams,
};

export const MOTION_LAB_COMPARE_SCHEMA = "pixi-motion-lab-compare/v1";
export const MOTION_LAB_TRACE_DIFF_SCHEMA = "pixi-motion-lab-trace-diff/v1";

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function formatCount(value) {
  return String(Math.max(0, Math.floor(readNumber(value, 0))));
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function formatSignedDelta(value, digits = 0) {
  const number = readNumber(value, 0);
  if (Math.abs(number) < 0.000001) return "0";
  const formatted = Math.abs(number).toFixed(digits);
  return `${number > 0 ? "+" : "-"}${formatted}`;
}

function makeMetric(label, current, previous, digits = 0) {
  const currentNumber = readNumber(current, 0);
  const previousNumber = readNumber(previous, 0);
  return {
    changed: Math.abs(currentNumber - previousNumber) > 0.000001,
    current: digits > 0 ? formatNumber(currentNumber, digits) : formatCount(currentNumber),
    delta: formatSignedDelta(currentNumber - previousNumber, digits),
    label,
    previous: digits > 0 ? formatNumber(previousNumber, digits) : formatCount(previousNumber),
    value: currentNumber - previousNumber,
  };
}

function normalizeSearch(search = "") {
  const text = String(search || "");
  if (!text) return "";
  return text.startsWith("?") ? text : `?${text}`;
}

export function shouldMountMotionLab(search = "", dev = false) {
  if (!dev) return false;
  try {
    const params = new URLSearchParams(normalizeSearch(search));
    if (!params.has(MOTION_LAB_QUERY_PARAM)) return false;
    const value = String(params.get(MOTION_LAB_QUERY_PARAM) || "1").trim().toLowerCase();
    return value !== "0" && value !== "false" && value !== "off";
  } catch {
    return false;
  }
}

export function buildMotionLabScenarioRows(scenarios = MOTION_LAB_SCENARIOS, selectedId = "") {
  return scenarios.map((scenario, index) => ({
    assertionCount: Array.isArray(scenario.assertions) ? scenario.assertions.length : 0,
    description: scenario.description || "",
    id: scenario.id || `scenario-${index}`,
    label: scenario.label || scenario.id || `Scenario ${index + 1}`,
    selected: scenario.id === selectedId || (!selectedId && index === 0),
    stage: scenario.stage || "draft",
  }));
}

export function buildMotionLabOverviewRows(report = {}, trace = null) {
  const summary = report.summary || {};
  const history = report.history || {};
  const config = report.config || {};
  const traceSummary = trace?.summary || {};
  return [
    { label: "runtime", value: config.enabled ? "debug" : "idle" },
    { label: "active", value: formatCount(summary.activeAnimationCount) },
    { label: "warnings", value: formatCount(summary.warningCount) },
    { label: "events/samples", value: `${formatCount(history.events?.length)} / ${formatCount(history.samples?.length)}`, wide: true },
    { label: "trace", value: trace ? "ready" : "none" },
    { label: "trace frames/events", value: `${formatCount(traceSummary.frameCount)} / ${formatCount(traceSummary.eventCount)}`, wide: true },
  ];
}

export function buildMotionLabAssertionRows(assertions = []) {
  return assertions.map((assertion, index) => ({
    detail: assertion.detail || assertion.label || "-",
    id: assertion.id || `assertion-${index}`,
    label: assertion.label || assertion.id || `Assertion ${index + 1}`,
    passed: assertion.passed === true,
    status: assertion.status || (assertion.passed ? "pass" : "fail"),
  }));
}

export function buildMotionLabTimelineRows(report = {}, limit = 10) {
  const events = Array.isArray(report.history?.events) ? report.history.events : [];
  return events
    .slice(-Math.max(0, Math.floor(readNumber(limit, 10))))
    .reverse()
    .map((event, index) => ({
      detail: [
        event.sourceLabel || event.targetLabel || (event.targetId != null ? `target ${event.targetId}` : "unknown"),
        event.prop || "-",
        `${formatNumber(event.value, 2)} -> ${formatNumber(event.to, 2)}`,
        event.reason ? `reason=${event.reason}` : null,
      ].filter(Boolean).join(" / "),
      key: `${event.timeMs ?? index}:${event.type || "event"}:${event.targetId ?? "unknown"}:${event.prop || "-"}`,
      time: `${formatNumber(event.timeMs, 0)}ms`,
      type: event.type || "event",
    }));
}

export function buildMotionLabCurveRows(report = {}, limit = 6) {
  const stats = Array.isArray(report.curveStats) ? report.curveStats : [];
  return stats
    .map((curve) => ({
      driver: curve.driver || "-",
      key: curve.key || `${curve.targetId ?? "unknown"}:${curve.prop || "-"}`,
      label: `${curve.sourceLabel || curve.targetLabel || (curve.targetId != null ? `target ${curve.targetId}` : "unknown")}.${curve.prop || "-"}`,
      lane: [curve.lane, curve.laneKey].filter(Boolean).join("/") || "-",
      maxVelocity: formatNumber(curve.maxVelocity, 2),
      samples: formatCount(curve.sampleCount),
    }))
    .sort((a, b) => (readNumber(b.samples) - readNumber(a.samples)) || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 6))));
}

export function createMotionLabRunSnapshot({ assertions = [], params = {}, report = {}, scenario = {}, trace = null } = {}) {
  const history = report.history || {};
  const summary = report.summary || {};
  const traceSummary = trace?.summary || {};
  const curveStats = Array.isArray(report.curveStats) ? report.curveStats : [];
  const maxVelocity = curveStats.reduce((max, curve) => Math.max(max, readNumber(curve.maxVelocity, 0)), 0);
  const retargetCount = curveStats.reduce((count, curve) => count + readNumber(curve.retargetCount, 0), 0);
  const overshootCount = curveStats.reduce((count, curve) => count + readNumber(curve.overshootCount, 0), 0);
  const timeRange = trace?.timeline?.timeRangeMs || {};
  const durationMs = timeRange.max != null && timeRange.min != null
    ? Math.max(0, readNumber(timeRange.max) - readNumber(timeRange.min))
    : readNumber(trace?.capture?.durationMs, 0);
  const passedAssertions = assertions.filter((assertion) => assertion.passed === true).length;
  const failedAssertions = assertions.length - passedAssertions;
  return {
    createdAt: new Date().toISOString(),
    params: normalizeMotionLabParams(params),
    scenario: {
      id: scenario?.id || "unknown",
      label: scenario?.label || scenario?.id || "Scenario",
    },
    summary: {
      activeAnimationCount: readNumber(summary.activeAnimationCount, 0),
      assertionFailedCount: failedAssertions,
      assertionPassedCount: passedAssertions,
      curveCount: curveStats.length,
      durationMs,
      eventCount: Array.isArray(history.events) ? history.events.length : 0,
      maxVelocity,
      overshootCount,
      retargetCount,
      sampleCount: Array.isArray(history.samples) ? history.samples.length : 0,
      traceEventCount: readNumber(traceSummary.eventCount, 0),
      traceFrameCount: readNumber(traceSummary.frameCount, 0),
      traceTargetCount: readNumber(traceSummary.targetCount, 0),
      traceTrackCount: readNumber(traceSummary.trackCount, 0),
      traceValueCount: readNumber(traceSummary.valueCount, 0),
      warningCount: readNumber(summary.warningCount, 0),
    },
  };
}

export function buildMotionLabCompareRows(current = null, previous = null) {
  if (!current || !previous) return [];
  const currentSummary = current.summary || {};
  const previousSummary = previous.summary || {};
  return [
    makeMetric("assert pass", currentSummary.assertionPassedCount, previousSummary.assertionPassedCount),
    makeMetric("assert fail", currentSummary.assertionFailedCount, previousSummary.assertionFailedCount),
    makeMetric("events", currentSummary.eventCount, previousSummary.eventCount),
    makeMetric("samples", currentSummary.sampleCount, previousSummary.sampleCount),
    makeMetric("curves", currentSummary.curveCount, previousSummary.curveCount),
    makeMetric("warnings", currentSummary.warningCount, previousSummary.warningCount),
    makeMetric("duration", currentSummary.durationMs, previousSummary.durationMs),
    makeMetric("max velocity", currentSummary.maxVelocity, previousSummary.maxVelocity, 2),
    makeMetric("retargets", currentSummary.retargetCount, previousSummary.retargetCount),
    makeMetric("overshoots", currentSummary.overshootCount, previousSummary.overshootCount),
    makeMetric("trace frames", currentSummary.traceFrameCount, previousSummary.traceFrameCount),
    makeMetric("trace values", currentSummary.traceValueCount, previousSummary.traceValueCount),
  ];
}

function countTraceDuration(trace = {}) {
  const range = trace.timeline?.timeRangeMs || {};
  if (range.max == null || range.min == null) return readNumber(trace.capture?.durationMs, 0);
  return Math.max(0, readNumber(range.max) - readNumber(range.min));
}

function makeTraceMetricRows(currentTrace = null, previousTrace = null) {
  const current = currentTrace?.summary || {};
  const previous = previousTrace?.summary || {};
  return [
    makeMetric("frames", current.frameCount, previous.frameCount),
    makeMetric("events", current.eventCount, previous.eventCount),
    makeMetric("tracks", current.trackCount, previous.trackCount),
    makeMetric("targets", current.targetCount, previous.targetCount),
    makeMetric("values", current.valueCount, previous.valueCount),
    makeMetric("warnings", current.warningCount, previous.warningCount),
    makeMetric("duration", countTraceDuration(currentTrace), countTraceDuration(previousTrace)),
  ];
}

function makeCountDiffRows(labelPrefix, currentCounts = {}, previousCounts = {}, limit = 6) {
  const keys = Array.from(new Set([
    ...Object.keys(previousCounts || {}),
    ...Object.keys(currentCounts || {}),
  ])).sort();
  return keys
    .map((key) => makeMetric(`${labelPrefix}:${key}`, currentCounts?.[key], previousCounts?.[key]))
    .filter((row) => row.changed)
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 6))));
}

export function buildMotionLabTraceDiffRows(currentTrace = null, previousTrace = null, limit = 14) {
  if (!currentTrace || !previousTrace) return [];
  const summaryRows = makeTraceMetricRows(currentTrace, previousTrace);
  const propRows = makeCountDiffRows("prop", currentTrace.summary?.byProp, previousTrace.summary?.byProp);
  const driverRows = makeCountDiffRows("driver", currentTrace.summary?.byDriver, previousTrace.summary?.byDriver);
  return [...summaryRows, ...propRows, ...driverRows]
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 14))));
}

export function createMotionLabCompareExport(current = null, previous = null) {
  return {
    baseline: clonePlain(previous),
    current: clonePlain(current),
    generatedAt: new Date().toISOString(),
    rows: buildMotionLabCompareRows(current, previous),
    schema: MOTION_LAB_COMPARE_SCHEMA,
    version: 1,
  };
}

export function createMotionLabTraceDiffExport(currentTrace = null, previousTrace = null) {
  return {
    baseline: clonePlain(previousTrace),
    current: clonePlain(currentTrace),
    generatedAt: new Date().toISOString(),
    rows: buildMotionLabTraceDiffRows(currentTrace, previousTrace),
    schema: MOTION_LAB_TRACE_DIFF_SCHEMA,
    version: 1,
  };
}
