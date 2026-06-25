import { MOTION_LAB_SCENARIOS } from "./motionLabScenarios.js";
import {
  applyMotionLabParamPreset,
  buildMotionLabParamPresetRows,
  DEFAULT_MOTION_LAB_PARAMS,
  MOTION_LAB_EASE_OPTIONS,
  MOTION_LAB_INTERRUPT_OPTIONS,
  MOTION_LAB_PARAM_PRESET_IDS,
  MOTION_LAB_PARAM_PRESETS,
  getMotionLabParamPreset,
  normalizeMotionLabParams,
  resolveMotionLabParamPresetId,
} from "./motionLabParams.js";
import {
  MOTION_LAB_QUERY_PARAM,
  shouldMountMotionLab,
} from "./motionLabGate.js";
import { createMotionFocusedDebugExport } from "../components/backgroundDebug/motionFocusedDebugExportModel.js";

export { MOTION_LAB_SCENARIOS };
export {
  MOTION_LAB_QUERY_PARAM,
  shouldMountMotionLab,
};
export {
  applyMotionLabParamPreset,
  buildMotionLabParamPresetRows,
  DEFAULT_MOTION_LAB_PARAMS,
  MOTION_LAB_EASE_OPTIONS,
  MOTION_LAB_INTERRUPT_OPTIONS,
  MOTION_LAB_PARAM_PRESET_IDS,
  MOTION_LAB_PARAM_PRESETS,
  getMotionLabParamPreset,
  normalizeMotionLabParams,
  resolveMotionLabParamPresetId,
};

export const MOTION_LAB_COMPARE_SCHEMA = "pixi-motion-lab-compare/v1";
export const MOTION_LAB_FOCUSED_DEBUG_SCHEMA = "pixi-motion-lab-focused-debug/v1";
export const MOTION_LAB_TRACE_DIFF_SCHEMA = "pixi-motion-lab-trace-diff/v1";
const MOTION_LAB_COMPARE_PARAM_KEYS = Object.freeze(Object.keys(DEFAULT_MOTION_LAB_PARAMS));
const MOTION_LAB_RAW_REF_KEYS = Object.freeze(new Set([
  "app",
  "displayObject",
  "domNode",
  "element",
  "overlayTarget",
  "pixiApp",
  "rawTarget",
  "runtime",
  "scene",
  "target",
]));

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

function cloneSafePlain(value) {
  if (value == null) return value;
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(value, (key, entry) => {
    if (MOTION_LAB_RAW_REF_KEYS.has(key)) return undefined;
    if (typeof entry === "function" || typeof entry === "symbol") return undefined;
    if (entry && typeof entry === "object") {
      if (seen.has(entry)) return undefined;
      seen.add(entry);
    }
    return entry;
  }));
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

function getMotionLabParamDigits(key = "") {
  if (key.endsWith("Scale") || key === "springMass") return 2;
  if (key === "jiggleRotationDeg") return 1;
  return 0;
}

function makeMotionLabParamCompareRows(currentParams = {}, previousParams = {}, limit = 8) {
  const current = normalizeMotionLabParams(currentParams);
  const previous = normalizeMotionLabParams(previousParams);
  return MOTION_LAB_COMPARE_PARAM_KEYS
    .map((key) => {
      const currentValue = current[key];
      const previousValue = previous[key];
      if (typeof currentValue === "number" && typeof previousValue === "number") {
        return makeMetric(`param:${key}`, currentValue, previousValue, getMotionLabParamDigits(key));
      }
      return {
        changed: currentValue !== previousValue,
        current: String(currentValue),
        delta: currentValue === previousValue ? "0" : "changed",
        label: `param:${key}`,
        previous: String(previousValue),
        value: currentValue === previousValue ? 0 : 1,
      };
    })
    .filter((row) => row.changed)
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 8))));
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
  const paramRows = makeMotionLabParamCompareRows(current.params, previous.params);
  return [
    ...paramRows,
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
  const source = trace || {};
  const range = source.timeline?.timeRangeMs || {};
  if (range.max == null || range.min == null) return readNumber(source.capture?.durationMs, 0);
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

export function createMotionLabBaselineCompareExport(current = null, baseline = null) {
  return {
    ...createMotionLabCompareExport(current, baseline),
    compareMode: "baseline",
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

function sanitizeMotionLabScenario(scenario = {}) {
  return {
    description: scenario?.description || "",
    id: scenario?.id || "unknown",
    label: scenario?.label || scenario?.id || "Scenario",
    stage: scenario?.stage || "draft",
  };
}

function sanitizeMotionLabAssertions(assertions = []) {
  return (Array.isArray(assertions) ? assertions : []).map((assertion, index) => ({
    detail: assertion?.detail || assertion?.label || "-",
    id: assertion?.id || `assertion-${index}`,
    label: assertion?.label || assertion?.id || `Assertion ${index + 1}`,
    passed: assertion?.passed === true,
    status: assertion?.status || (assertion?.passed ? "pass" : "fail"),
  }));
}

function summarizeMotionLabAssertions(assertions = []) {
  const rows = sanitizeMotionLabAssertions(assertions);
  const passed = rows.filter((row) => row.passed).length;
  return {
    failed: rows.length - passed,
    passed,
    total: rows.length,
  };
}

function sanitizeMotionLabConfig(config = {}) {
  return {
    enabled: config.enabled === true,
    maxEvents: readNumber(config.maxEvents, 0),
    maxSamples: readNumber(config.maxSamples, 0),
    overlayEnabled: config.overlayEnabled === true,
    recordHistory: config.recordHistory === true,
    recordWindowMs: readNumber(config.recordWindowMs, 0),
    sampleHz: readNumber(config.sampleHz, 0),
    timeScale: readNumber(config.timeScale, 1),
  };
}

function sanitizeMotionLabEvent(event = {}, index = 0) {
  return {
    driver: event.driver || null,
    frame: event.frame == null ? null : Math.max(0, Math.floor(readNumber(event.frame, 0))),
    lane: event.lane || null,
    laneKey: event.laneKey || null,
    prop: event.prop || null,
    reason: event.reason || null,
    sourceLabel: event.sourceLabel || event.targetLabel || null,
    targetId: event.targetId ?? null,
    timeMs: readNumber(event.timeMs, index),
    to: event.to ?? null,
    type: event.type || "event",
    value: event.value ?? null,
    velocity: event.velocity ?? null,
  };
}

function sanitizeMotionLabCurveStat(curve = {}, index = 0) {
  return {
    driver: curve.driver || null,
    key: curve.key || `${curve.targetId ?? "target"}:${curve.prop || "prop"}:${index}`,
    lane: curve.lane || null,
    laneKey: curve.laneKey || null,
    maxVelocity: readNumber(curve.maxVelocity, 0),
    overshootCount: Math.max(0, Math.floor(readNumber(curve.overshootCount, 0))),
    prop: curve.prop || null,
    retargetCount: Math.max(0, Math.floor(readNumber(curve.retargetCount, 0))),
    sampleCount: Math.max(0, Math.floor(readNumber(curve.sampleCount, 0))),
    sourceLabel: curve.sourceLabel || null,
    targetId: curve.targetId ?? null,
  };
}

function sanitizeMotionLabWarning(warning = {}, index = 0) {
  return {
    detail: warning.detail || warning.message || warning.reason || "",
    id: warning.id || `warning-${index}`,
    laneKey: warning.laneKey ?? null,
    prop: warning.prop ?? null,
    sourceLabel: warning.sourceLabel ?? warning.targetLabel ?? null,
    targetId: warning.targetId ?? null,
    type: warning.type || "warning",
  };
}

function sanitizeMotionLabReport(report = {}, trace = null) {
  const events = Array.isArray(report.history?.events) ? report.history.events : [];
  const samples = Array.isArray(report.history?.samples) ? report.history.samples : [];
  const curveStats = Array.isArray(report.curveStats) ? report.curveStats : [];
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  return {
    config: sanitizeMotionLabConfig(report.config || {}),
    curves: {
      rows: buildMotionLabCurveRows(report, 8),
      stats: curveStats.slice(0, 12).map(sanitizeMotionLabCurveStat),
    },
    overviewRows: buildMotionLabOverviewRows(report, trace),
    summary: {
      activeAnimationCount: readNumber(report.summary?.activeAnimationCount, 0),
      curveCount: curveStats.length,
      eventCount: events.length,
      sampleCount: samples.length,
      warningCount: readNumber(report.summary?.warningCount, warnings.length),
    },
    timeline: {
      recentEvents: events.slice(-16).reverse().map(sanitizeMotionLabEvent),
      rows: buildMotionLabTimelineRows(report, 12),
    },
    warnings: warnings.slice(-10).reverse().map(sanitizeMotionLabWarning),
  };
}

function sanitizeMotionLabTraceSummary(trace = null) {
  const summary = trace?.summary || {};
  return {
    durationMs: countTraceDuration(trace),
    eventCount: readNumber(summary.eventCount, 0),
    frameCount: readNumber(summary.frameCount, 0),
    targetCount: readNumber(summary.targetCount, 0),
    trackCount: readNumber(summary.trackCount, 0),
    valueCount: readNumber(summary.valueCount, 0),
    warningCount: readNumber(summary.warningCount, 0),
  };
}

function createMotionLabReplayFocus(trace = null, options = {}, generatedAt = "") {
  if (!trace) return null;
  try {
    return createMotionFocusedDebugExport(trace, {
      generatedAt,
      ...options,
    }).data;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "failed to create replay focus",
      schema: trace?.schema || null,
      summary: sanitizeMotionLabTraceSummary(trace),
    };
  }
}

function formatMotionLabParamLine(params = {}) {
  return [
    `duration=${params.durationMs}ms`,
    `ease=${params.ease}`,
    `spring=${params.springStiffness}/${params.springDamping}/${params.springMass}`,
    `interrupt=${params.interruptPolicy}@${params.interruptDelayMs}ms`,
  ].join(", ");
}

function formatMotionLabFocusedList(rows = [], formatter = (row) => String(row), empty = "- none") {
  if (!rows.length) return empty;
  return rows.map(formatter).join("\n");
}

export function createMotionLabFocusedExport(input = {}, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const trace = input.trace || input.replayTrace || null;
  const assertions = sanitizeMotionLabAssertions(input.assertions || []);
  const scenario = sanitizeMotionLabScenario(input.scenario || {});
  const params = normalizeMotionLabParams(input.params || {});
  const currentRun = input.currentRunSnapshot
    ? cloneSafePlain(input.currentRunSnapshot)
    : createMotionLabRunSnapshot({
      assertions,
      params,
      report: input.report || {},
      scenario,
      trace,
    });
  const baseline = input.baselineSnapshot ? cloneSafePlain(input.baselineSnapshot) : null;
  const compareRows = Array.isArray(input.compareRows)
    ? cloneSafePlain(input.compareRows)
    : buildMotionLabCompareRows(currentRun, baseline);
  const traceDiffRows = Array.isArray(input.traceDiffRows) ? cloneSafePlain(input.traceDiffRows) : [];
  const replayFocused = createMotionLabReplayFocus(trace, options.replay || {}, generatedAt);
  const data = {
    assertions: {
      rows: assertions,
      summary: summarizeMotionLabAssertions(assertions),
    },
    compare: {
      baseline,
      mode: input.compareMode === "baseline" ? "baseline" : "last",
      rows: compareRows,
    },
    generatedAt,
    params,
    replay: {
      focused: replayFocused,
      schema: trace?.schema || null,
      summary: sanitizeMotionLabTraceSummary(trace),
    },
    report: sanitizeMotionLabReport(input.report || {}, trace),
    run: {
      current: currentRun,
    },
    scenario,
    schema: MOTION_LAB_FOCUSED_DEBUG_SCHEMA,
    source: {
      kind: "motion-lab",
    },
    traceDiff: {
      rows: traceDiffRows,
    },
    version: 1,
  };
  const json = JSON.stringify(data, null, 2);
  const markdown = formatMotionLabFocusedDebugMarkdown(data);
  return {
    copyText: `${markdown}\n\n## JSON\n\n\`\`\`json\n${json}\n\`\`\``,
    data,
    json,
    markdown,
  };
}

export function formatMotionLabFocusedDebugMarkdown(data = {}) {
  const scenario = data.scenario || {};
  const assertions = data.assertions?.summary || {};
  const replay = data.replay?.summary || {};
  const report = data.report || {};
  const params = data.params || {};
  return [
    "# Pixi Motion Lab Focused Debug",
    "",
    `Schema: ${data.schema || MOTION_LAB_FOCUSED_DEBUG_SCHEMA}`,
    `Generated: ${data.generatedAt || "-"}`,
    `Scenario: ${scenario.label || scenario.id || "Scenario"} (${scenario.id || "unknown"})`,
    `Params: ${formatMotionLabParamLine(params)}`,
    `Assertions: pass ${assertions.passed || 0} / fail ${assertions.failed || 0} / total ${assertions.total || 0}`,
    `Trace: ${data.replay?.schema || "none"} frames=${replay.frameCount || 0}, events=${replay.eventCount || 0}, tracks=${replay.trackCount || 0}, targets=${replay.targetCount || 0}`,
    `Compare: ${data.compare?.mode || "last"} rows=${data.compare?.rows?.length || 0}`,
    "",
    "## Failed Assertions",
    formatMotionLabFocusedList(
      (data.assertions?.rows || []).filter((row) => !row.passed),
      (row) => `- ${row.label}: ${row.detail}`,
    ),
    "",
    "## Recent Events",
    formatMotionLabFocusedList(
      report.timeline?.recentEvents || [],
      (event) => `- ${event.timeMs}ms ${event.type}: ${event.sourceLabel || `target ${event.targetId}`}.${event.prop || "-"} ${event.value ?? "-"} -> ${event.to ?? "-"}`,
    ),
    "",
    "## Curves",
    formatMotionLabFocusedList(
      report.curves?.rows || [],
      (curve) => `- ${curve.label}: ${curve.samples} samples, lane=${curve.lane}, v=${curve.maxVelocity}`,
    ),
    "",
    "## Compare Rows",
    formatMotionLabFocusedList(
      data.compare?.rows || [],
      (row) => `- ${row.label}: ${row.previous} -> ${row.current} (${row.delta})`,
    ),
  ].join("\n");
}
