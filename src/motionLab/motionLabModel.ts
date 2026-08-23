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
import { createMotionReplayDocument } from "../diagnostics/motionReplayDocument.js";
import { createDiagnosticPresentation } from "../diagnostics/diagnosticPresentation.js";
import type {
  MotionDebugConfig,
  MotionDebugReport,
  MotionDebugSummary,
  MotionTraceRecord,
} from "../rendering/motionPort.js";
import type {
  MotionLabAssertionResult,
  MotionLabScenario,
} from "./motionLabScenarios.js";
import type {
  MotionLabParams,
  MotionLabParamsInput,
} from "./motionLabParams.js";
import type {
  DiagnosticTranslate,
  MotionReplayTraceInput,
} from "../components/backgroundDebug/motionReplayViewerModel.js";

export type MotionLabReportInput = Readonly<
  Partial<Omit<MotionDebugReport, "config" | "history" | "summary">>
  & {
    config?: Partial<MotionDebugConfig>;
    history?: Readonly<{ events?: readonly MotionTraceRecord[]; samples?: readonly Readonly<Record<string, unknown>>[] }>;
    summary?: Partial<MotionDebugSummary>;
  }
>;

interface MotionLabTraceSummaryInput {
  byDriver?: Readonly<Record<string, unknown>>;
  byProp?: Readonly<Record<string, unknown>>;
  eventCount?: unknown;
  frameCount?: unknown;
  targetCount?: unknown;
  trackCount?: unknown;
  valueCount?: unknown;
  warningCount?: unknown;
}

export interface MotionLabTraceInput extends MotionReplayTraceInput {
  capture?: Readonly<{ durationMs?: unknown; profile?: unknown }>;
  summary?: MotionLabTraceSummaryInput;
}

export interface MotionLabRunSummary {
  activeAnimationCount: number;
  assertionFailedCount: number;
  assertionPassedCount: number;
  curveCount: number;
  durationMs: number;
  eventCount: number;
  maxVelocity: number;
  overshootCount: number;
  retargetCount: number;
  sampleCount: number;
  traceEventCount: number;
  traceFrameCount: number;
  traceTargetCount: number;
  traceTrackCount: number;
  traceValueCount: number;
  warningCount: number;
}

export interface MotionLabRunSnapshot {
  createdAt: string;
  params: MotionLabParams;
  scenario: { id: string; label: string };
  schema?: undefined;
  summary: MotionLabRunSummary;
}

export interface MotionLabMetricRow {
  changed: boolean;
  current: string;
  delta: string;
  label: string;
  machineName: string;
  previous: string;
  value: number;
}

interface MotionLabScenarioInput extends Readonly<Record<string, unknown>> {
  description?: string;
  id?: string;
  label?: string;
  stage?: string;
}

interface MotionLabRunSnapshotInput {
  assertions?: readonly Partial<MotionLabAssertionResult>[];
  params?: MotionLabParamsInput;
  report?: MotionLabReportInput;
  scenario?: MotionLabScenarioInput;
  trace?: MotionLabTraceInput | null;
}

interface MotionLabFocusedExportInput extends Readonly<Record<string, unknown>> {
  assertions?: readonly Partial<MotionLabAssertionResult>[];
  baselineSnapshot?: MotionLabRunSnapshot | null;
  compareMode?: unknown;
  compareRows?: readonly MotionLabMetricRow[];
  currentRunSnapshot?: MotionLabRunSnapshot | null;
  params?: MotionLabParamsInput;
  replayTrace?: MotionLabTraceInput | null;
  report?: MotionLabReportInput;
  scenario?: MotionLabScenarioInput;
  trace?: MotionLabTraceInput | null;
  traceDiffRows?: readonly MotionLabMetricRow[];
}

interface MotionLabFocusedExportOptions {
  generatedAt?: string;
  presentation?: unknown;
  replay?: Readonly<Record<string, unknown>>;
}

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
const MOTION_LAB_COMPARE_PARAM_KEYS = Object.freeze(Object.keys(DEFAULT_MOTION_LAB_PARAMS) as (keyof MotionLabParams)[]);
const MOTION_LAB_RAW_REF_KEYS = Object.freeze(new Set<string>([
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

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value: unknown, digits = 0): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function formatCount(value: unknown): string {
  return String(Math.max(0, Math.floor(readNumber(value, 0))));
}

function localize(t: DiagnosticTranslate | undefined, key: string, params: Readonly<Record<string, unknown>>, technicalText: string): string {
  return typeof t === "function" ? t(key, params) : technicalText;
}

function clonePlain<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

function cloneSafePlain<T>(value: T): T {
  if (value == null) return value;
  const seen = new WeakSet<object>();
  return JSON.parse(JSON.stringify(value, (key: string, entry: unknown) => {
    if (MOTION_LAB_RAW_REF_KEYS.has(key)) return undefined;
    if (typeof entry === "function" || typeof entry === "symbol") return undefined;
    if (entry && typeof entry === "object") {
      if (seen.has(entry)) return undefined;
      seen.add(entry);
    }
    return entry;
  })) as T;
}

function formatSignedDelta(value: unknown, digits = 0): string {
  const number = readNumber(value, 0);
  if (Math.abs(number) < 0.000001) return "0";
  const formatted = Math.abs(number).toFixed(digits);
  return `${number > 0 ? "+" : "-"}${formatted}`;
}

function makeMetric(label: string, current: unknown, previous: unknown, digits = 0, machineName = label): MotionLabMetricRow {
  const currentNumber = readNumber(current, 0);
  const previousNumber = readNumber(previous, 0);
  return {
    changed: Math.abs(currentNumber - previousNumber) > 0.000001,
    current: digits > 0 ? formatNumber(currentNumber, digits) : formatCount(currentNumber),
    delta: formatSignedDelta(currentNumber - previousNumber, digits),
    label,
    machineName,
    previous: digits > 0 ? formatNumber(previousNumber, digits) : formatCount(previousNumber),
    value: currentNumber - previousNumber,
  };
}

function getMotionLabParamDigits(key: keyof MotionLabParams): number {
  if (key.endsWith("Scale") || key === "springMass") return 2;
  if (key === "jiggleRotationDeg") return 1;
  return 0;
}

function makeMotionLabParamCompareRows(currentParams: MotionLabParamsInput = {}, previousParams: MotionLabParamsInput = {}, limit: unknown = 8, t?: DiagnosticTranslate): MotionLabMetricRow[] {
  const current = normalizeMotionLabParams(currentParams);
  const previous = normalizeMotionLabParams(previousParams);
  return MOTION_LAB_COMPARE_PARAM_KEYS
    .map((key) => {
      const currentValue = current[key];
      const previousValue = previous[key];
      if (typeof currentValue === "number" && typeof previousValue === "number") {
        return makeMetric(
          localize(t, "motionLab.metrics.parameter", { key }, `Parameter: ${key}`),
          currentValue,
          previousValue,
          getMotionLabParamDigits(key),
          `param:${key}`,
        );
      }
      return {
        changed: currentValue !== previousValue,
        current: String(currentValue),
        delta: currentValue === previousValue ? "0" : localize(t, "motionLab.values.changed", {}, "Changed"),
        label: localize(t, "motionLab.metrics.parameter", { key }, `Parameter: ${key}`),
        machineName: `param:${key}`,
        previous: String(previousValue),
        value: currentValue === previousValue ? 0 : 1,
      };
    })
    .filter((row) => row.changed)
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 8))));
}

export function buildMotionLabScenarioRows(scenarios: readonly MotionLabScenario[] = MOTION_LAB_SCENARIOS, selectedId = "", t?: DiagnosticTranslate) {
  return scenarios.map((scenario, index) => ({
    assertionCount: Array.isArray(scenario.assertions) ? scenario.assertions.length : 0,
    description: scenario.descriptionKey
      ? localize(t, scenario.descriptionKey, {}, scenario.description || "")
      : (scenario.description || ""),
    id: scenario.id || `scenario-${index}`,
    label: scenario.labelKey
      ? localize(t, scenario.labelKey, {}, scenario.label || scenario.id)
      : (scenario.label || scenario.id || `Scenario ${index + 1}`),
    selected: scenario.id === selectedId || (!selectedId && index === 0),
    stage: scenario.stage || "draft",
  }));
}

export function buildMotionLabOverviewRows(report: MotionLabReportInput = {}, trace: MotionLabTraceInput | null = null, t?: DiagnosticTranslate) {
  const summary = report.summary || {};
  const history = report.history || {};
  const config = report.config || {};
  const traceSummary = trace?.summary || {};
  return [
    { label: localize(t, "motionLab.fields.runtime", {}, "Runtime"), value: localize(t, config.enabled ? "motionLab.values.debugging" : "motionLab.values.idle", {}, config.enabled ? "Debugging" : "Idle") },
    { label: localize(t, "motionLab.fields.activeAnimations", {}, "Active animations"), value: formatCount(summary.activeAnimationCount) },
    { label: localize(t, "motionLab.fields.warnings", {}, "Warnings"), value: formatCount(summary.warningCount) },
    { label: localize(t, "motionLab.fields.eventsSamples", {}, "Events / samples"), value: `${formatCount(history.events?.length)} / ${formatCount(history.samples?.length)}`, wide: true },
    { label: localize(t, "motionLab.fields.replayTrace", {}, "Replay trace"), value: localize(t, trace ? "motionLab.values.ready" : "debug.common.none", {}, trace ? "Ready" : "None") },
    { label: localize(t, "motionLab.fields.traceFramesEvents", {}, "Trace frames / events"), value: `${formatCount(traceSummary.frameCount)} / ${formatCount(traceSummary.eventCount)}`, wide: true },
  ];
}

export function buildMotionLabAssertionRows(assertions: readonly Partial<MotionLabAssertionResult>[] = [], t?: DiagnosticTranslate) {
  return assertions.map((assertion, index) => ({
    detail: assertion.detailKey
      ? localize(t, assertion.detailKey, {}, assertion.detail || assertion.label || "-")
      : (assertion.detail || assertion.label || "-"),
    id: assertion.id || `assertion-${index}`,
    label: assertion.labelKey
      ? localize(t, assertion.labelKey, {}, assertion.label || assertion.id || `Assertion ${index + 1}`)
      : (assertion.label || assertion.id || `Assertion ${index + 1}`),
    passed: assertion.passed === true,
    status: assertion.status || (assertion.passed ? "pass" : "fail"),
  }));
}

export function buildMotionLabTimelineRows(report: MotionLabReportInput = {}, limit: unknown = 10) {
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

export function buildMotionLabCurveRows(report: MotionLabReportInput = {}, limit: unknown = 6) {
  const stats = Array.isArray(report.curveStats) ? report.curveStats : [];
  return stats
    .map((curve) => ({
      driver: curve.driver || "-",
      key: String(curve.key || `${curve.targetId ?? "unknown"}:${curve.prop || "-"}`),
      label: `${curve.sourceLabel || curve.targetLabel || (curve.targetId != null ? `target ${curve.targetId}` : "unknown")}.${curve.prop || "-"}`,
      lane: [curve.lane, curve.laneKey].filter(Boolean).join("/") || "-",
      maxVelocity: formatNumber(curve.maxVelocity, 2),
      samples: formatCount(curve.sampleCount),
    }))
    .sort((a, b) => (readNumber(b.samples) - readNumber(a.samples)) || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 6))));
}

export function createMotionLabRunSnapshot({ assertions = [], params = {}, report = {}, scenario = {}, trace = null }: MotionLabRunSnapshotInput = {}): MotionLabRunSnapshot {
  const history = report.history || {};
  const summary = report.summary || {};
  const traceSummary = trace?.summary || {};
  const curveStats = Array.isArray(report.curveStats) ? report.curveStats : [];
  const maxVelocity = curveStats.reduce((max, curve) => Math.max(max, readNumber(curve.maxVelocity, 0)), 0);
  const retargetCount = curveStats.reduce((count, curve) => count + readNumber(curve.retargetCount, 0), 0);
  const overshootCount = curveStats.reduce((count, curve) => count + readNumber(curve.overshootCount, 0), 0);
  const timeRange = trace?.timeline?.timeRangeMs;
  const durationMs = timeRange?.max != null && timeRange.min != null
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

export function buildMotionLabCompareRows(current: MotionLabRunSnapshot | null = null, previous: MotionLabRunSnapshot | null = null, t?: DiagnosticTranslate): MotionLabMetricRow[] {
  if (!current || !previous) return [];
  const currentSummary = current.summary || {};
  const previousSummary = previous.summary || {};
  const paramRows = makeMotionLabParamCompareRows(current.params, previous.params, 8, t);
  return [
    ...paramRows,
    makeMetric(localize(t, "motionLab.metrics.assertionsPassed", {}, "Assertions passed"), currentSummary.assertionPassedCount, previousSummary.assertionPassedCount, 0, "assert pass"),
    makeMetric(localize(t, "motionLab.metrics.assertionsFailed", {}, "Assertions failed"), currentSummary.assertionFailedCount, previousSummary.assertionFailedCount, 0, "assert fail"),
    makeMetric(localize(t, "motionLab.metrics.events", {}, "Events"), currentSummary.eventCount, previousSummary.eventCount, 0, "events"),
    makeMetric(localize(t, "motionLab.metrics.samples", {}, "Samples"), currentSummary.sampleCount, previousSummary.sampleCount, 0, "samples"),
    makeMetric(localize(t, "motionLab.metrics.curves", {}, "Curves"), currentSummary.curveCount, previousSummary.curveCount, 0, "curves"),
    makeMetric(localize(t, "motionLab.metrics.warnings", {}, "Warnings"), currentSummary.warningCount, previousSummary.warningCount, 0, "warnings"),
    makeMetric(localize(t, "motionLab.metrics.duration", {}, "Duration"), currentSummary.durationMs, previousSummary.durationMs, 0, "duration"),
    makeMetric(localize(t, "motionLab.metrics.maxVelocity", {}, "Maximum velocity"), currentSummary.maxVelocity, previousSummary.maxVelocity, 2, "max velocity"),
    makeMetric(localize(t, "motionLab.metrics.retargets", {}, "Retargets"), currentSummary.retargetCount, previousSummary.retargetCount, 0, "retargets"),
    makeMetric(localize(t, "motionLab.metrics.overshoots", {}, "Overshoots"), currentSummary.overshootCount, previousSummary.overshootCount, 0, "overshoots"),
    makeMetric(localize(t, "motionLab.metrics.traceFrames", {}, "Trace frames"), currentSummary.traceFrameCount, previousSummary.traceFrameCount, 0, "trace frames"),
    makeMetric(localize(t, "motionLab.metrics.traceValues", {}, "Trace values"), currentSummary.traceValueCount, previousSummary.traceValueCount, 0, "trace values"),
  ];
}

function countTraceDuration(trace: MotionLabTraceInput | null = {}): number {
  const source = trace || {};
  const range = source.timeline?.timeRangeMs;
  if (range?.max == null || range.min == null) return readNumber(source.capture?.durationMs, 0);
  return Math.max(0, readNumber(range.max) - readNumber(range.min));
}

function makeTraceMetricRows(currentTrace: MotionLabTraceInput | null = null, previousTrace: MotionLabTraceInput | null = null, t?: DiagnosticTranslate): MotionLabMetricRow[] {
  const current = currentTrace?.summary || {};
  const previous = previousTrace?.summary || {};
  return [
    makeMetric(localize(t, "motionLab.metrics.frames", {}, "Frames"), current.frameCount, previous.frameCount, 0, "frames"),
    makeMetric(localize(t, "motionLab.metrics.events", {}, "Events"), current.eventCount, previous.eventCount, 0, "events"),
    makeMetric(localize(t, "motionLab.metrics.tracks", {}, "Tracks"), current.trackCount, previous.trackCount, 0, "tracks"),
    makeMetric(localize(t, "motionLab.metrics.targets", {}, "Targets"), current.targetCount, previous.targetCount, 0, "targets"),
    makeMetric(localize(t, "motionLab.metrics.values", {}, "Values"), current.valueCount, previous.valueCount, 0, "values"),
    makeMetric(localize(t, "motionLab.metrics.warnings", {}, "Warnings"), current.warningCount, previous.warningCount, 0, "warnings"),
    makeMetric(localize(t, "motionLab.metrics.duration", {}, "Duration"), countTraceDuration(currentTrace), countTraceDuration(previousTrace), 0, "duration"),
  ];
}

function makeCountDiffRows(labelPrefix: string, machinePrefix: string, currentCounts: Readonly<Record<string, unknown>> = {}, previousCounts: Readonly<Record<string, unknown>> = {}, limit: unknown = 6): MotionLabMetricRow[] {
  const keys = Array.from(new Set([
    ...Object.keys(previousCounts || {}),
    ...Object.keys(currentCounts || {}),
  ])).sort();
  return keys
    .map((key) => makeMetric(`${labelPrefix}: ${key}`, currentCounts?.[key], previousCounts?.[key], 0, `${machinePrefix}:${key}`))
    .filter((row) => row.changed)
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 6))));
}

export function buildMotionLabTraceDiffRows(currentTrace: MotionLabTraceInput | null = null, previousTrace: MotionLabTraceInput | null = null, limit: unknown = 14, t?: DiagnosticTranslate): MotionLabMetricRow[] {
  if (!currentTrace || !previousTrace) return [];
  const summaryRows = makeTraceMetricRows(currentTrace, previousTrace, t);
  const propRows = makeCountDiffRows(localize(t, "motionLab.metrics.property", {}, "Property"), "prop", currentTrace.summary?.byProp, previousTrace.summary?.byProp);
  const driverRows = makeCountDiffRows(localize(t, "motionLab.metrics.driver", {}, "Driver"), "driver", currentTrace.summary?.byDriver, previousTrace.summary?.byDriver);
  return [...summaryRows, ...propRows, ...driverRows]
    .slice(0, Math.max(0, Math.floor(readNumber(limit, 14))));
}

export function createMotionLabCompareExport(current: MotionLabRunSnapshot | null = null, previous: MotionLabRunSnapshot | null = null) {
  return {
    baseline: clonePlain(previous),
    current: clonePlain(current),
    generatedAt: new Date().toISOString(),
    rows: buildMotionLabCompareRows(current, previous),
    schema: MOTION_LAB_COMPARE_SCHEMA,
    version: 1,
  };
}

export function createMotionLabBaselineCompareExport(current: MotionLabRunSnapshot | null = null, baseline: MotionLabRunSnapshot | null = null) {
  return {
    ...createMotionLabCompareExport(current, baseline),
    compareMode: "baseline",
  };
}

export function createMotionLabTraceDiffExport(currentTrace: MotionLabTraceInput | null = null, previousTrace: MotionLabTraceInput | null = null) {
  return {
    baseline: clonePlain(previousTrace),
    current: clonePlain(currentTrace),
    generatedAt: new Date().toISOString(),
    rows: buildMotionLabTraceDiffRows(currentTrace, previousTrace),
    schema: MOTION_LAB_TRACE_DIFF_SCHEMA,
    version: 1,
  };
}

function sanitizeMotionLabScenario(scenario: MotionLabScenarioInput = {}) {
  return {
    description: scenario?.description || "",
    id: scenario?.id || "unknown",
    label: scenario?.label || scenario?.id || "Scenario",
    stage: scenario?.stage || "draft",
  };
}

function sanitizeMotionLabAssertions(assertions: readonly Partial<MotionLabAssertionResult>[] = []) {
  return (Array.isArray(assertions) ? assertions : []).map((assertion, index) => ({
    detail: assertion?.detail || assertion?.label || "-",
    id: assertion?.id || `assertion-${index}`,
    label: assertion?.label || assertion?.id || `Assertion ${index + 1}`,
    passed: assertion?.passed === true,
    status: assertion?.status || (assertion?.passed ? "pass" : "fail"),
  }));
}

function summarizeMotionLabAssertions(assertions: readonly Partial<MotionLabAssertionResult>[] = []) {
  const rows = sanitizeMotionLabAssertions(assertions);
  const passed = rows.filter((row) => row.passed).length;
  return {
    failed: rows.length - passed,
    passed,
    total: rows.length,
  };
}

function sanitizeMotionLabConfig(config: Partial<MotionDebugConfig> = {}) {
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

function sanitizeMotionLabEvent(event: MotionTraceRecord = {}, index = 0) {
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

function sanitizeMotionLabCurveStat(curve: MotionTraceRecord = {}, index = 0) {
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

function sanitizeMotionLabWarning(warning: MotionTraceRecord = {}, index = 0) {
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

function sanitizeMotionLabReport(report: MotionLabReportInput = {}, trace: MotionLabTraceInput | null = null) {
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

function sanitizeMotionLabTraceSummary(trace: MotionLabTraceInput | null = null) {
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

function createMotionLabReplayFocus(trace: MotionLabTraceInput | null = null, options: Readonly<Record<string, unknown>> = {}, generatedAt = ""): unknown {
  if (!trace) return null;
  let document = null;
  try {
    document = createMotionReplayDocument(trace);
    const exported = document.export({
      format: "focused",
      generatedAt,
      ...options,
    });
    return exported && typeof exported === "object" && "data" in exported ? exported.data : undefined;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "failed to create replay focus",
      schema: trace?.schema || null,
      summary: sanitizeMotionLabTraceSummary(trace),
    };
  } finally {
    document?.dispose();
  }
}

function formatMotionLabParamLine(params: MotionLabParams): string {
  return [
    `duration=${params.durationMs}ms`,
    `ease=${params.ease}`,
    `spring=${params.springStiffness}/${params.springDamping}/${params.springMass}`,
    `interrupt=${params.interruptPolicy}@${params.interruptDelayMs}ms`,
  ].join(", ");
}

function formatMotionLabFocusedList<T>(rows: readonly T[] = [], formatter: (row: T) => string = (row) => String(row), empty = "- None"): string {
  if (!rows.length) return empty;
  return rows.map(formatter).join("\n");
}

export interface MotionLabFocusedDebugData {
  assertions: { rows: ReturnType<typeof sanitizeMotionLabAssertions>; summary: ReturnType<typeof summarizeMotionLabAssertions> };
  compare: { baseline: MotionLabRunSnapshot | null; mode: "baseline" | "last"; rows: MotionLabMetricRow[] };
  generatedAt: string;
  params: MotionLabParams;
  replay: { focused: unknown; schema: string | null; summary: ReturnType<typeof sanitizeMotionLabTraceSummary> };
  report: ReturnType<typeof sanitizeMotionLabReport>;
  run: { current: MotionLabRunSnapshot };
  scenario: ReturnType<typeof sanitizeMotionLabScenario>;
  schema: typeof MOTION_LAB_FOCUSED_DEBUG_SCHEMA;
  source: { kind: "motion-lab" };
  traceDiff: { rows: MotionLabMetricRow[] };
  version: 1;
}

export function createMotionLabFocusedExport(input: MotionLabFocusedExportInput = {}, options: MotionLabFocusedExportOptions = {}) {
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
  const data: MotionLabFocusedDebugData = {
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
  return createDiagnosticPresentation(data, {
    formatMarkdown: formatMotionLabFocusedDebugMarkdown,
    presentation: options.presentation,
  });
}

export function formatMotionLabFocusedDebugMarkdown(data: MotionLabFocusedDebugData): string {
  const scenario = data.scenario || {};
  const assertions = data.assertions?.summary || {};
  const replay = data.replay?.summary || {};
  const report = data.report || {};
  const params = data.params || {};
  return [
    "# Pixi Motion Lab focused debug report",
    "",
    `Schema: ${data.schema || MOTION_LAB_FOCUSED_DEBUG_SCHEMA}`,
    `Generated at: ${data.generatedAt || "-"}`,
    `Scenario: ${scenario.label || scenario.id || "Scenario"} (${scenario.id || "unknown"})`,
    `Parameters: ${formatMotionLabParamLine(params)}`,
    `Assertions: passed ${assertions.passed || 0} / failed ${assertions.failed || 0} / total ${assertions.total || 0}`,
    `Trace: ${data.replay?.schema || "None"}, frames=${replay.frameCount || 0}, events=${replay.eventCount || 0}, tracks=${replay.trackCount || 0}, targets=${replay.targetCount || 0}`,
    `Comparison: ${data.compare?.mode || "last"}, rows=${data.compare?.rows?.length || 0}`,
    "",
    "## Failed assertions",
    formatMotionLabFocusedList(
      (data.assertions?.rows || []).filter((row) => !row.passed),
      (row) => `- ${row.label}: ${row.detail}`,
    ),
    "",
    "## Recent events",
    formatMotionLabFocusedList(
      report.timeline?.recentEvents || [],
      (event) => `- ${event.timeMs}ms ${event.type}: ${event.sourceLabel || `target ${event.targetId}`}.${event.prop || "-"} ${event.value ?? "-"} → ${event.to ?? "-"}`,
    ),
    "",
    "## Curves",
    formatMotionLabFocusedList(
      report.curves?.rows || [],
      (curve) => `- ${curve.label}: ${curve.samples} samples, lane=${curve.lane}, max velocity=${curve.maxVelocity}`,
    ),
    "",
    "## Comparison details",
    formatMotionLabFocusedList(
      data.compare?.rows || [],
      (row) => `- ${row.label}: ${row.previous} -> ${row.current} (${row.delta})`,
    ),
  ].join("\n");
}
