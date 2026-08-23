import {
  clamp,
  collectRecordText,
  makeTrackKey,
  normalizeQuery,
  readNumber,
  resolveRecordLabel,
} from "../../rendering/motionPort.js";
import type {
  MotionDebugConfig,
  MotionDebugCounters,
  MotionDebugReport,
  MotionDebugSummary,
  MotionTraceRecord,
} from "../../rendering/motionPort.js";
import { normalizeMotionCaptureProfile } from "./motionCaptureProfileModel.js";
import type { MotionCaptureProfile, MotionCaptureProfileInput } from "./motionCaptureProfileModel.js";
import type { DiagnosticTranslate, MotionReplayTraceInput } from "./motionReplayViewerModel.js";

export interface MotionDebugFilters {
  preset?: unknown;
  query?: unknown;
}

interface MotionDebugHistorySample extends Readonly<Record<string, unknown>> {
  animations?: readonly MotionTraceRecord[];
  frame?: number;
  timeMs?: number;
}

export type MotionDebugReportInput = Readonly<
  Partial<Omit<MotionDebugReport, "config" | "counters" | "history" | "summary">>
  & {
    config?: Partial<MotionDebugConfig>;
    counters?: Partial<MotionDebugCounters>;
    history?: Readonly<{ events?: readonly MotionTraceRecord[]; samples?: readonly MotionDebugHistorySample[] }>;
    summary?: Partial<MotionDebugSummary>;
  }
>;

export interface MotionRuntimeDebugConfigInput {
  customSeconds?: unknown;
  enabled?: unknown;
  overlayEnabled?: unknown;
  recordEnabled?: unknown;
  timeScale?: unknown;
  windowPreset?: unknown;
}

export interface MotionReplayCaptureStatusInput extends Readonly<Record<string, unknown>> {
  active?: boolean;
  captureProfile?: MotionCaptureProfileInput | null;
  sampleHz?: unknown;
  seconds?: unknown;
}

export interface MotionDiagnosticDescription {
  readonly status?: Readonly<{
    capture?: MotionReplayCaptureStatusInput;
    config?: Partial<MotionDebugConfig>;
  }>;
}

export type MotionDiagnosticSnapshot = MotionDebugReportInput & Readonly<{
  capture?: MotionReplayCaptureStatusInput;
}>;

export interface MotionReplayCaptureTraceInput extends MotionReplayTraceInput {
  capture?: Readonly<{ profile?: MotionCaptureProfileInput; requestedDurationMs?: number; sampleHz?: unknown }>;
  summary?: Readonly<{ eventCount?: unknown; frameCount?: unknown; targetCount?: unknown; trackCount?: unknown }>;
}

interface MotionReplayCaptureRowsOptions {
  actualBytes?: unknown;
  estimate?: Readonly<{ eventCount?: unknown; frameCount?: unknown; jsonSizeLabel?: string }>;
  profile?: MotionCaptureProfileInput;
  t?: DiagnosticTranslate;
}

interface MotionSeriesRange {
  max: number;
  min: number;
}

interface MotionTargetTreeEntry {
  activeCount: number;
  eventCount: number;
  id: string;
  kind: string;
  label: string;
  layer: string;
  props: string[];
  searchText: string;
  sourceLabel: string;
  warningCount: number;
}

interface MotionTargetTreeAccumulator {
  animations: MotionTraceRecord[];
  events: MotionTraceRecord[];
  id: string;
  target: MotionTraceRecord;
  warnings: MotionTraceRecord[];
}

type UnknownRecord = Record<string, unknown>;

const MOTION_CONFIG_BOOLEAN_FIELDS = ["enabled", "overlayEnabled", "recordHistory"] as const;
const MOTION_CONFIG_NUMBER_FIELDS = ["maxEvents", "maxSamples", "recordWindowMs", "sampleHz", "timeScale"] as const;
const MOTION_TRACE_STRING_FIELDS = [
  "driver",
  "kind",
  "label",
  "lane",
  "laneKey",
  "layer",
  "prop",
  "reason",
  "sourceLabel",
  "targetKind",
  "targetLabel",
  "type",
  "warningType",
] as const;
const MOTION_TRACE_NUMBER_FIELDS = ["frame", "timeMs", "to", "value", "velocity"] as const;
const MOTION_COUNTER_NUMBER_FIELDS = [
  "activeChannels",
  "activeTargets",
  "afterFrameFlushes",
  "canceled",
  "completed",
  "frames",
  "released",
  "started",
  "writes",
  "writesLastFrame",
] as const;
const MOTION_SUMMARY_NUMBER_FIELDS = [
  "activeAnimationCount",
  "activeChannelCount",
  "activeTargetCount",
  "warningCount",
] as const;
const MOTION_SUMMARY_MAP_FIELDS = ["byDriver", "byLane", "byLaneKey", "byProp", "byTargetId"] as const;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  const record = asRecord(value);
  if (!record) throw new TypeError(`${label} must be an object`);
  return record;
}

function requireOptionalBooleanFields(
  record: UnknownRecord,
  fields: readonly string[],
  label: string,
): void {
  for (const field of fields) {
    if (record[field] !== undefined && typeof record[field] !== "boolean") {
      throw new TypeError(`${label}.${field} must be a boolean`);
    }
  }
}

function requireOptionalNumberFields(
  record: UnknownRecord,
  fields: readonly string[],
  label: string,
): void {
  for (const field of fields) {
    if (record[field] !== undefined && (typeof record[field] !== "number" || !Number.isFinite(record[field]))) {
      throw new TypeError(`${label}.${field} must be a finite number`);
    }
  }
}

function requireOptionalStringFields(
  record: UnknownRecord,
  fields: readonly string[],
  label: string,
): void {
  for (const field of fields) {
    if (record[field] !== undefined && typeof record[field] !== "string") {
      throw new TypeError(`${label}.${field} must be a string`);
    }
  }
}

function requireNumberFields(record: UnknownRecord, fields: readonly string[], label: string): void {
  for (const field of fields) {
    if (typeof record[field] !== "number" || !Number.isFinite(record[field])) {
      throw new TypeError(`${label}.${field} must be a finite number`);
    }
  }
}

function requireNumberMap(value: unknown, label: string): void {
  const record = requireRecord(value, label);
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new TypeError(`${label}.${key} must be a finite number`);
    }
  }
}

function requireMotionTraceRecord(value: unknown, label: string): void {
  const record = requireRecord(value, label);
  requireOptionalStringFields(record, MOTION_TRACE_STRING_FIELDS, label);
  requireOptionalNumberFields(record, MOTION_TRACE_NUMBER_FIELDS, label);
  if (
    record.targetId !== undefined
    && record.targetId !== null
    && typeof record.targetId !== "number"
    && typeof record.targetId !== "string"
  ) {
    throw new TypeError(`${label}.targetId must be a string, number, or null`);
  }
}

function requireMotionTraceRecordArray(value: unknown, label: string): void {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  value.forEach((entry, index) => requireMotionTraceRecord(entry, `${label}[${index}]`));
}

export function requireMotionRuntimeDebugConfig(value: unknown): Partial<MotionDebugConfig> {
  const config = requireRecord(value, "Motion diagnostic config");
  requireOptionalBooleanFields(config, MOTION_CONFIG_BOOLEAN_FIELDS, "Motion diagnostic config");
  requireOptionalNumberFields(config, MOTION_CONFIG_NUMBER_FIELDS, "Motion diagnostic config");
  if (config.recordFilter !== undefined && config.recordFilter !== null) {
    const filter = requireRecord(config.recordFilter, "Motion diagnostic config.recordFilter");
    for (const field of ["includeEvents", "includeSamples"] as const) {
      if (typeof filter[field] !== "boolean") {
        throw new TypeError(`Motion diagnostic config.recordFilter.${field} must be a boolean`);
      }
    }
    for (const field of ["eventTypes", "kinds", "layers", "props", "sourceLabels"] as const) {
      if (!Array.isArray(filter[field]) || filter[field].some((entry) => typeof entry !== "string")) {
        throw new TypeError(`Motion diagnostic config.recordFilter.${field} must be an array of strings`);
      }
    }
    if (typeof filter.sourceQuery !== "string") {
      throw new TypeError("Motion diagnostic config.recordFilter.sourceQuery must be a string");
    }
  }
  return config as Partial<MotionDebugConfig>;
}

export function requireMotionReplayCaptureStatus(value: unknown): MotionReplayCaptureStatusInput {
  const status = requireRecord(value, "Motion replay capture status");
  requireOptionalBooleanFields(status, ["active"], "Motion replay capture status");
  requireOptionalNumberFields(status, ["sampleHz", "seconds"], "Motion replay capture status");
  if (status.captureProfile !== undefined && status.captureProfile !== null && !asRecord(status.captureProfile)) {
    throw new TypeError("Motion replay capture status.captureProfile must be an object or null");
  }
  return status as MotionReplayCaptureStatusInput;
}

export function requireMotionDebugReportInput(value: unknown): MotionDebugReportInput {
  const report = requireRecord(value, "Motion diagnostic report");
  for (const key of ["animations", "channels", "curveStats", "targets", "warnings"] as const) {
    if (report[key] !== undefined) requireMotionTraceRecordArray(report[key], `Motion diagnostic report.${key}`);
  }
  if (report.config !== undefined) requireMotionRuntimeDebugConfig(report.config);
  if (report.counters !== undefined) {
    const counters = requireRecord(report.counters, "Motion diagnostic report.counters");
    requireOptionalNumberFields(counters, MOTION_COUNTER_NUMBER_FIELDS, "Motion diagnostic report.counters");
    if (counters.canceledByReason !== undefined) {
      requireNumberMap(counters.canceledByReason, "Motion diagnostic report.counters.canceledByReason");
    }
  }
  if (report.summary !== undefined) {
    const summary = requireRecord(report.summary, "Motion diagnostic report.summary");
    requireOptionalNumberFields(summary, MOTION_SUMMARY_NUMBER_FIELDS, "Motion diagnostic report.summary");
    for (const field of MOTION_SUMMARY_MAP_FIELDS) {
      if (summary[field] !== undefined) requireNumberMap(summary[field], `Motion diagnostic report.summary.${field}`);
    }
  }
  if (report.history !== undefined) {
    const history = requireRecord(report.history, "Motion diagnostic report.history");
    if (history.events !== undefined) {
      requireMotionTraceRecordArray(history.events, "Motion diagnostic report.history.events");
    }
    if (history.samples !== undefined) {
      if (!Array.isArray(history.samples)) {
        throw new TypeError("Motion diagnostic report.history.samples must be an array");
      }
      history.samples.forEach((sampleValue, index) => {
        const sample = requireRecord(sampleValue, `Motion diagnostic report.history.samples[${index}]`);
        requireOptionalNumberFields(sample, ["frame", "timeMs"], `Motion diagnostic report.history.samples[${index}]`);
        if (sample.animations !== undefined) {
          requireMotionTraceRecordArray(
            sample.animations,
            `Motion diagnostic report.history.samples[${index}].animations`,
          );
        }
      });
    }
  }
  if (report.runtime !== undefined) {
    const runtime = requireRecord(report.runtime, "Motion diagnostic report.runtime");
    requireNumberFields(runtime, ["activeAnimationCount", "frames", "timeMs"], "Motion diagnostic report.runtime");
  }
  if (report.version !== undefined && report.version !== 1) {
    throw new TypeError("Motion diagnostic report.version must be 1");
  }
  return report as MotionDebugReportInput;
}

export function requireMotionDiagnosticSnapshot(value: unknown): MotionDiagnosticSnapshot {
  const report = requireMotionDebugReportInput(value);
  const source = requireRecord(value, "Motion diagnostic snapshot");
  return source.capture === undefined
    ? report
    : Object.freeze({ ...report, capture: requireMotionReplayCaptureStatus(source.capture) });
}

export function requireMotionDiagnosticDescription(value: unknown): MotionDiagnosticDescription {
  const description = requireRecord(value, "Motion diagnostic description");
  if (description.status === undefined) return Object.freeze({});
  const status = requireRecord(description.status, "Motion diagnostic description.status");
  return Object.freeze({
    status: Object.freeze({
      ...(status.capture === undefined ? {} : { capture: requireMotionReplayCaptureStatus(status.capture) }),
      ...(status.config === undefined ? {} : { config: requireMotionRuntimeDebugConfig(status.config) }),
    }),
  });
}

interface MotionLayerGroup {
  activeTargetCount: number;
  eventCount: number;
  kinds: string[];
  layer: string;
  props: string[];
  sources: string[];
  targetCount: number;
  warningCount: number;
}

interface MotionCurvePoint {
  delta: number;
  timeMs: unknown;
  to: unknown;
  value: unknown;
  velocity: unknown;
}

interface MotionCurveTrack extends MotionTraceRecord {
  driver: string;
  events: MotionTraceRecord[];
  key: string;
  lane: string;
  laneKey: string;
  points: MotionCurvePoint[];
  prop: string;
}

export const MOTION_RECORD_WINDOW_CUSTOM = "custom";
export const MOTION_RECORD_WINDOW_PRESETS = [
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "60s", value: "60000" },
  { label: "120s", value: "120000" },
  { label: "Custom", labelKey: "debug.motion.values.custom", value: MOTION_RECORD_WINDOW_CUSTOM },
];
export const MOTION_FILTER_PRESETS = [
  { label: "All", labelKey: "debug.common.all", value: "all" },
  { label: "Active", labelKey: "debug.motion.values.active", value: "active" },
  { label: "Warnings", labelKey: "debug.motion.values.warnings", value: "warnings" },
];

const DEFAULT_RECORD_WINDOW_MS = 30000;
const MAX_ROW_COUNT = 12;
const MAX_CURVE_GROUP_COUNT = 4;
const MAX_LAYER_TREE_ROW_COUNT = 8;
const MAX_TIMELINE_EVENT_COUNT = 60;
const MAX_TIMELINE_GROUP_COUNT = 8;
const MIN_CUSTOM_SECONDS = 1;
const MAX_CUSTOM_SECONDS = 300;

export function normalizeMotionCustomSeconds(value: unknown): number {
  return clamp(Math.round(readNumber(value, DEFAULT_RECORD_WINDOW_MS / 1000)), MIN_CUSTOM_SECONDS, MAX_CUSTOM_SECONDS);
}

export function resolveMotionRecordWindowMs(preset: unknown, customSeconds: unknown): number {
  if (preset === MOTION_RECORD_WINDOW_CUSTOM) return normalizeMotionCustomSeconds(customSeconds) * 1000;
  const matchedPreset = MOTION_RECORD_WINDOW_PRESETS.find((entry) => entry.value === String(preset));
  return matchedPreset ? Number(matchedPreset.value) : DEFAULT_RECORD_WINDOW_MS;
}

export function normalizeMotionTimeScale(value: unknown): number {
  return clamp(readNumber(value, 1), 0, 2);
}

export function buildMotionRuntimeDebugConfig(options: MotionRuntimeDebugConfigInput = {}) {
  const enabled = Boolean(options.enabled);
  return {
    enabled,
    overlayEnabled: enabled && Boolean(options.overlayEnabled),
    recordHistory: enabled && Boolean(options.recordEnabled),
    recordWindowMs: resolveMotionRecordWindowMs(options.windowPreset, options.customSeconds),
    sampleHz: 10,
    timeScale: normalizeMotionTimeScale(options.timeScale),
  };
}

export function formatMotionNumber(value: unknown, digits = 2): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function formatCount(value: unknown): string {
  return String(Math.max(0, Math.floor(readNumber(value, 0))));
}

function formatBytes(value: unknown): string {
  const bytes = Math.max(0, Math.floor(readNumber(value, 0)));
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatWindow(ms: unknown): string {
  return `${formatMotionNumber(readNumber(ms, DEFAULT_RECORD_WINDOW_MS) / 1000, 0)}s`;
}

function localize(t: DiagnosticTranslate | undefined, key: string, params: Readonly<Record<string, unknown>>, technicalText: string): string {
  return typeof t === "function" ? t(key, params) : technicalText;
}

function makeEmptyRow(t: DiagnosticTranslate | undefined, label = "None") {
  const localizedLabel = localize(t, "debug.common.none", {}, label);
  return { detail: "-", key: localizedLabel, value: "0" };
}

export function normalizeMotionFilterPreset(value: unknown): string {
  return MOTION_FILTER_PRESETS.find((entry) => entry.value === value)?.value || "all";
}

function makeTargetLaneKey(record: MotionTraceRecord = {}): string {
  return [
    record.targetId ?? "unknown",
    record.lane ?? "unknown",
    record.laneKey ?? "unknown",
  ].join(":");
}

function makeSeriesRange(values: readonly unknown[]): MotionSeriesRange {
  const finiteValues = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!finiteValues.length) return { max: 1, min: 0 };
  let min = Math.min(...finiteValues);
  let max = Math.max(...finiteValues);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { max, min };
}

function makeNormalizedPoint(timeMs: unknown, value: unknown, timeRange: MotionSeriesRange, valueRange: MotionSeriesRange) {
  const time = readNumber(timeMs, 0);
  const number = readNumber(value, 0);
  const timeSpan = timeRange.max - timeRange.min;
  const valueSpan = valueRange.max - valueRange.min;
  return {
    raw: number,
    timeMs: time,
    x: timeSpan > 0 ? clamp(((time - timeRange.min) / timeSpan) * 100, 0, 100) : 50,
    y: valueSpan > 0 ? clamp(100 - ((number - valueRange.min) / valueSpan) * 100, 0, 100) : 50,
  };
}

function formatPathNumber(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(2).replace(/\.?0+$/, "");
}

function makeSvgPath(points: readonly { x: number; y: number }[]): string {
  if (!points.length) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`)
    .join(" ");
}

function formatRange(range: MotionSeriesRange, digits = 2): string {
  return `${formatMotionNumber(range.min, digits)}..${formatMotionNumber(range.max, digits)}`;
}

function formatCompactList(values: readonly (string | undefined)[], limit = 4): string {
  const list = Array.from(new Set(values.filter((value): value is string => Boolean(value))));
  if (!list.length) return "-";
  const visible = list.slice(0, limit).join(", ");
  const hiddenCount = list.length - limit;
  return hiddenCount > 0 ? `${visible}, +${hiddenCount}` : visible;
}

function resolveTargetRecordLabel(target: MotionTraceRecord = {}): string {
  return target.sourceLabel
    || target.label
    || target.targetLabel
    || (target.targetId != null ? `target ${target.targetId}` : "unknown");
}

function collectTargetTreeEntries(report: MotionDebugReportInput = {}): MotionTargetTreeEntry[] {
  const entriesById = new Map<string, MotionTargetTreeAccumulator>();
  const ensureEntry = (targetId: number | string | null | undefined): MotionTargetTreeAccumulator => {
    const key = String(targetId ?? "unknown");
    let entry = entriesById.get(key);
    if (!entry) {
      entry = {
        animations: [],
        events: [],
        id: key,
        target: { targetId },
        warnings: [],
      };
      entriesById.set(key, entry);
    }
    return entry;
  };

  for (const target of report.targets || []) {
    ensureEntry(target.targetId).target = target;
  }
  for (const animation of report.animations || []) {
    ensureEntry(animation.targetId).animations.push(animation);
  }
  for (const warning of report.warnings || []) {
    ensureEntry(warning.targetId).warnings.push(warning);
  }
  for (const event of report.history?.events || []) {
    ensureEntry(event.targetId).events.push(event);
  }

  return Array.from(entriesById.values()).map((entry) => {
    const target = entry.target || {};
    const records = [...entry.animations, ...entry.warnings, ...entry.events];
    const label = resolveTargetRecordLabel(target);
    const layer = target.layer || records.find((record) => record.layer)?.layer || "unknown";
    const kind = target.kind || target.targetKind || records.find((record) => record.targetKind)?.targetKind || "unknown";
    const props = records.map((record) => record.prop).filter((prop): prop is string => Boolean(prop));
    const sourceLabels = [
      target.sourceLabel,
      target.label,
      target.targetLabel,
      ...records.map((record) => record.sourceLabel || record.targetLabel || record.label),
    ];
    const displaySource = target.sourceLabel
      || records.find((record) => record.sourceLabel)?.sourceLabel
      || label;
    const searchText = [
      entry.id,
      layer,
      kind,
      label,
      ...props,
      ...sourceLabels,
      ...records.map((record) => collectRecordText(record)),
    ].filter(Boolean).join(" ").toLowerCase();
    return {
      activeCount: entry.animations.length,
      eventCount: entry.events.length,
      id: entry.id,
      kind,
      label,
      layer,
      props: Array.from(new Set(props)),
      searchText,
      sourceLabel: displaySource,
      warningCount: entry.warnings.length,
    };
  });
}

function collectPresetKeys(report: MotionDebugReportInput = {}) {
  const activeTrackKeys = new Set<string>();
  const activeTargetLaneKeys = new Set<string>();
  const warningTrackKeys = new Set<string>();
  const warningTargetLaneKeys = new Set<string>();
  for (const animation of report.animations || []) {
    activeTrackKeys.add(makeTrackKey(animation));
    activeTargetLaneKeys.add(makeTargetLaneKey(animation));
  }
  for (const warning of report.warnings || []) {
    warningTrackKeys.add(makeTrackKey(warning));
    warningTargetLaneKeys.add(makeTargetLaneKey(warning));
  }
  return {
    activeTargetLaneKeys,
    activeTrackKeys,
    warningTargetLaneKeys,
    warningTrackKeys,
  };
}

function makeFilterPredicate(report: MotionDebugReportInput = {}, filters: MotionDebugFilters = {}, keyMode: "targetLane" | "track" = "track"): (record: MotionTraceRecord) => boolean {
  const preset = normalizeMotionFilterPreset(filters.preset);
  const query = normalizeQuery(filters.query);
  const presetKeys = collectPresetKeys(report);
  const keyGetter = keyMode === "targetLane" ? makeTargetLaneKey : makeTrackKey;
  return (record) => {
    if (preset === "active") {
      const keys = keyMode === "targetLane" ? presetKeys.activeTargetLaneKeys : presetKeys.activeTrackKeys;
      if (!keys.has(keyGetter(record))) return false;
    }
    if (preset === "warnings") {
      const keys = keyMode === "targetLane" ? presetKeys.warningTargetLaneKeys : presetKeys.warningTrackKeys;
      if (!keys.has(keyGetter(record))) return false;
    }
    return !query || collectRecordText(record, null, { includeLayer: true }).includes(query);
  };
}

export function buildMotionOverviewRows(report: MotionDebugReportInput = {}, t?: DiagnosticTranslate) {
  const summary = report.summary || {};
  const config = report.config || {};
  const history = report.history || {};
  const eventCount = Array.isArray(history.events) ? history.events.length : 0;
  const sampleCount = Array.isArray(history.samples) ? history.samples.length : 0;
  return [
    { label: localize(t, "debug.motion.fields.activeAnimations", {}, "Active animations"), value: formatCount(summary.activeAnimationCount) },
    { label: localize(t, "debug.motion.fields.targets", {}, "Targets"), value: formatCount(summary.activeTargetCount) },
    { label: localize(t, "debug.motion.fields.channels", {}, "Channels"), value: formatCount(summary.activeChannelCount) },
    { label: localize(t, "debug.motion.fields.warnings", {}, "Warnings"), value: formatCount(summary.warningCount) },
    { label: localize(t, "debug.motion.settings.recordHistory", {}, "Record history"), value: localize(t, config.recordHistory ? "debug.common.on" : "debug.common.off", {}, config.recordHistory ? "On" : "Off") },
    { label: localize(t, "debug.motion.fields.overlay", {}, "Overlay"), value: localize(t, config.overlayEnabled ? "debug.common.on" : "debug.common.off", {}, config.overlayEnabled ? "On" : "Off") },
    { label: localize(t, "debug.motion.fields.recordWindow", {}, "Recording window"), value: formatWindow(config.recordWindowMs) },
    { label: localize(t, "debug.motion.fields.timeScale", {}, "Time scale"), value: `${formatMotionNumber(config.timeScale ?? 1, 2)}x` },
    { label: localize(t, "debug.motion.fields.eventsSamples", {}, "Events / samples"), value: `${formatCount(eventCount)} / ${formatCount(sampleCount)}`, wide: true },
  ];
}

export function buildMotionReplayCaptureRows(status: MotionReplayCaptureStatusInput = {}, trace: MotionReplayCaptureTraceInput | null = null, options: MotionReplayCaptureRowsOptions = {}) {
  const t = options.t;
  const summary = trace?.summary || {};
  const capture = trace?.capture || {};
  const profile = normalizeMotionCaptureProfile(status.captureProfile || capture.profile || options.profile || {});
  const estimate = options.estimate || {};
  const actualBytes = options.actualBytes ?? (trace ? JSON.stringify(trace).length : 0);
  const requestedSeconds = status.seconds ?? (capture.requestedDurationMs != null ? capture.requestedDurationMs / 1000 : 30);
  const sampleHz = status.sampleHz ?? capture.sampleHz ?? 60;
  const profileLabel = profile.labelKey
    ? localize(t, profile.labelKey, {}, profile.label || profile.id)
    : (profile.label || profile.id || localize(t, "debug.common.none", {}, "None"));
  const estimateLabel = estimate.jsonSizeLabel
    ? `${formatCount(estimate.frameCount)}f / ${formatCount(estimate.eventCount)}e / ${estimate.jsonSizeLabel}`
    : "-";
  return [
    { label: localize(t, "debug.motion.fields.captureStatus", {}, "Capture status"), value: localize(t, status.active ? "debug.motion.values.capturing" : "debug.motion.values.idle", {}, status.active ? "Capturing" : "Idle") },
    { label: localize(t, "debug.motion.fields.captureProfile", {}, "Capture profile"), value: profileLabel, wide: true },
    { label: localize(t, "debug.motion.fields.captureWindow", {}, "Capture window"), value: `${formatMotionNumber(normalizeMotionCustomSeconds(requestedSeconds), 0)}s` },
    { label: localize(t, "debug.motion.fields.sampleRate", {}, "Sample rate"), value: `${formatMotionNumber(sampleHz, 0)}Hz` },
    { label: localize(t, "debug.motion.fields.estimatedSize", {}, "Estimated size"), value: estimateLabel, wide: true },
    { label: localize(t, "debug.motion.fields.actualJson", {}, "Actual JSON"), value: trace ? formatBytes(actualBytes) : "-", wide: true },
    { label: localize(t, "debug.motion.fields.framesEvents", {}, "Frames / events"), value: `${formatCount(summary.frameCount)} / ${formatCount(summary.eventCount)}`, wide: true },
    { label: localize(t, "debug.motion.fields.tracksTargets", {}, "Tracks / targets"), value: `${formatCount(summary.trackCount)} / ${formatCount(summary.targetCount)}`, wide: true },
    { label: localize(t, "debug.motion.fields.schema", {}, "Schema"), value: trace?.schema || localize(t, "debug.common.none", {}, "None"), wide: true },
  ];
}

function resolveTargetLabel(animation: MotionTraceRecord = {}): string {
  return resolveRecordLabel(animation);
}

export function buildMotionAnimationRows(report: MotionDebugReportInput = {}, limit = MAX_ROW_COUNT) {
  const animations = Array.isArray(report.animations) ? report.animations : [];
  return animations.slice(0, limit).map((animation) => ({
    driver: animation.driver || "-",
    lane: [animation.lane, animation.laneKey].filter(Boolean).join("/") || "-",
    prop: animation.prop || "-",
    target: resolveTargetLabel(animation),
    valueTo: `${formatMotionNumber(animation.value)} -> ${formatMotionNumber(animation.to)}`,
    velocity: formatMotionNumber(animation.velocity),
  }));
}

export function buildMotionCancelReasonRows(report: MotionDebugReportInput = {}, limit = 6, t?: DiagnosticTranslate) {
  const counts = report.counters?.canceledByReason || {};
  const rows = Object.entries(counts)
    .map(([key, value]) => ({ detail: key, key, value: formatCount(value) }))
    .sort((a, b) => (Number(b.value) - Number(a.value)) || a.key.localeCompare(b.key))
    .slice(0, limit);
  return rows.length ? rows : [makeEmptyRow(t)];
}

export function buildMotionWarningRows(report: MotionDebugReportInput = {}, limit = 6, t?: DiagnosticTranslate) {
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const rows = warnings.slice(0, limit).map((warning) => ({
    detail: [
      warning.type || "warning",
      warning.sourceLabel || warning.targetLabel || (warning.targetId != null ? `target ${warning.targetId}` : null),
      warning.prop,
      warning.laneKey,
    ].filter(Boolean).join(" / "),
    key: warning.type || "warning",
    value: warning.prop || "-",
  }));
  return rows.length ? rows : [makeEmptyRow(t)];
}

export function buildMotionPropertyRows(report: MotionDebugReportInput = {}, filters: MotionDebugFilters = {}, limit = MAX_ROW_COUNT) {
  const predicate = makeFilterPredicate(report, filters, "track");
  return (report.animations || [])
    .filter(predicate)
    .slice(0, limit)
    .map((animation) => {
      const delta = readNumber(animation.to, 0) - readNumber(animation.value, 0);
      return {
        delta: formatMotionNumber(delta),
        driver: animation.driver || "-",
        key: makeTrackKey(animation),
        lane: animation.lane || "-",
        laneKey: animation.laneKey || "-",
        prop: animation.prop || "-",
        sourceLabel: animation.sourceLabel || "-",
        targetId: animation.targetId,
        targetProp: `${resolveRecordLabel(animation)}.${animation.prop || "-"}`,
        to: formatMotionNumber(animation.to),
        value: formatMotionNumber(animation.value),
        velocity: formatMotionNumber(animation.velocity),
      };
    });
}

export function buildMotionLayerTreeRows(report: MotionDebugReportInput = {}, filters: MotionDebugFilters = {}, limit: unknown = MAX_LAYER_TREE_ROW_COUNT, t?: DiagnosticTranslate) {
  const preset = normalizeMotionFilterPreset(filters.preset);
  const query = normalizeQuery(filters.query);
  const groupsByLayer = new Map<string, MotionLayerGroup>();
  for (const entry of collectTargetTreeEntries(report)) {
    if (preset === "active" && entry.activeCount <= 0) continue;
    if (preset === "warnings" && entry.warningCount <= 0) continue;
    if (query && !entry.searchText.includes(query)) continue;
    let group = groupsByLayer.get(entry.layer);
    if (!group) {
      group = {
        activeTargetCount: 0,
        eventCount: 0,
        kinds: [],
        layer: entry.layer,
        props: [],
        sources: [],
        targetCount: 0,
        warningCount: 0,
      };
      groupsByLayer.set(entry.layer, group);
    }
    group.targetCount += 1;
    if (entry.activeCount > 0) group.activeTargetCount += 1;
    group.eventCount += entry.eventCount;
    group.warningCount += entry.warningCount;
    group.kinds.push(entry.kind);
    group.props.push(...entry.props);
    group.sources.push(entry.sourceLabel || entry.label);
  }

  return Array.from(groupsByLayer.values())
    .sort((a, b) => (
      b.activeTargetCount - a.activeTargetCount
      || b.warningCount - a.warningCount
      || b.targetCount - a.targetCount
      || a.layer.localeCompare(b.layer)
    ))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, MAX_LAYER_TREE_ROW_COUNT))))
    .map((group) => ({
      activeCount: formatCount(group.activeTargetCount),
      detail: localize(t, "debug.motion.values.propertiesList", {
        kinds: formatCompactList(group.kinds),
        props: formatCompactList(group.props),
      }, `${formatCompactList(group.kinds)} / properties ${formatCompactList(group.props)}`),
      eventCount: formatCount(group.eventCount),
      key: `layer:${group.layer}`,
      layer: group.layer,
      props: formatCompactList(group.props),
      sources: formatCompactList(group.sources, 5),
      summary: localize(t, "debug.motion.counts.layerSummary", {
        animations: formatCount(group.activeTargetCount),
        targets: formatCount(group.targetCount),
        warnings: formatCount(group.warningCount),
      }, `${formatCount(group.targetCount)} targets / ${formatCount(group.activeTargetCount)} active animations / ${formatCount(group.warningCount)} warnings`),
      targetCount: formatCount(group.targetCount),
      warningCount: formatCount(group.warningCount),
    }));
}

function buildTimelineEventRow(event: MotionTraceRecord = {}) {
  return {
    detail: [
      event.prop,
      `${formatMotionNumber(event.value)} -> ${formatMotionNumber(event.to)}`,
      event.driver,
      event.reason ? `reason=${event.reason}` : null,
    ].filter(Boolean).join(" / "),
    frame: formatCount(event.frame),
    key: `${formatMotionNumber(event.timeMs, 0)}:${event.type || "event"}:${makeTrackKey(event)}`,
    lane: event.lane || "-",
    laneKey: event.laneKey || "-",
    prop: event.prop || "-",
    sourceLabel: event.sourceLabel || event.targetLabel || event.label || "-",
    targetId: event.targetId,
    time: `${formatMotionNumber(event.timeMs, 0)}ms`,
    timeMs: readNumber(event.timeMs, 0),
    type: event.type || "event",
  };
}

export function buildMotionTimelineGroups(report: MotionDebugReportInput = {}, filters: MotionDebugFilters = {}, options: { limit?: unknown } = {}) {
  const predicate = makeFilterPredicate(report, filters, "targetLane");
  const limit = Math.max(0, Math.floor(readNumber(options.limit, MAX_TIMELINE_EVENT_COUNT)));
  const events = (report.history?.events || [])
    .filter(predicate)
    .slice(-limit)
    .reverse();
  const groupsByKey = new Map<string, { events: ReturnType<typeof buildTimelineEventRow>[]; key: string; label: string; lane: string; laneKey: string; prop: string; sourceLabel: string; targetId: number | string | null | undefined }>();
  for (const event of events) {
    const groupKey = makeTargetLaneKey(event);
    let group = groupsByKey.get(groupKey);
    if (!group) {
      const laneLabel = [event.lane, event.laneKey].filter(Boolean).join("/") || "-";
      group = {
        events: [],
        key: groupKey,
        label: `${resolveRecordLabel(event)} / ${laneLabel}`,
        lane: event.lane || "-",
        laneKey: event.laneKey || "-",
        prop: event.prop || "-",
        sourceLabel: event.sourceLabel || event.targetLabel || event.label || "-",
        targetId: event.targetId,
      };
      groupsByKey.set(groupKey, group);
    }
    group.events.push(buildTimelineEventRow(event));
  }
  return Array.from(groupsByKey.values()).slice(0, MAX_TIMELINE_GROUP_COUNT);
}

function collectMotionCurveTracks(report: MotionDebugReportInput = {}, filters: MotionDebugFilters = {}): MotionCurveTrack[] {
  const predicate = makeFilterPredicate(report, filters, "track");
  const tracksByKey = new Map<string, MotionCurveTrack>();
  for (const sample of report.history?.samples || []) {
    for (const animation of sample.animations || []) {
      if (!predicate(animation)) continue;
      const key = makeTrackKey(animation);
      let track = tracksByKey.get(key);
      if (!track) {
        track = {
          driver: animation.driver || "unknown",
          events: [],
          from: animation.from,
          key,
          lane: animation.lane || "unknown",
          laneKey: animation.laneKey || "unknown",
          points: [],
          prop: animation.prop || "unknown",
          sourceLabel: animation.sourceLabel,
          targetId: animation.targetId,
        };
        tracksByKey.set(key, track);
      }
      track.points.push({
        delta: readNumber(animation.to, 0) - readNumber(animation.value, 0),
        timeMs: sample.timeMs,
        to: animation.to,
        value: animation.value,
        velocity: animation.velocity,
      });
    }
  }
  for (const event of report.history?.events || []) {
    const track = tracksByKey.get(makeTrackKey(event));
    if (!track || !predicate(event)) continue;
    track.events.push(event);
  }
  return Array.from(tracksByKey.values());
}

export function buildMotionCurveChartGroups(report: MotionDebugReportInput = {}, filters: MotionDebugFilters = {}, options: { limit?: unknown; t?: DiagnosticTranslate } = {}) {
  const t = options.t;
  const limit = Math.max(0, Math.floor(readNumber(options.limit, MAX_CURVE_GROUP_COUNT)));
  const statsByKey = new Map((report.curveStats || []).map((stats) => [makeTrackKey(stats), stats]));
  return collectMotionCurveTracks(report, filters)
    .map((track) => {
      const points = track.points
        .filter((point) => Number.isFinite(readNumber(point.timeMs, NaN)))
        .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
      const events = track.events
        .filter((event) => Number.isFinite(readNumber(event.timeMs, NaN)))
        .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
      const eventTimes = events.map((event) => readNumber(event.timeMs, 0));
      const pointTimes = points.map((point) => readNumber(point.timeMs, 0));
      const timeRange = makeSeriesRange([...pointTimes, ...eventTimes]);
      const valueRange = makeSeriesRange([
        ...points.map((point) => point.value),
        ...points.map((point) => point.to),
      ]);
      const deltaRange = makeSeriesRange(points.map((point) => point.delta));
      const velocityRange = makeSeriesRange(points.map((point) => point.velocity));
      const value = points.map((point) => makeNormalizedPoint(point.timeMs, point.value, timeRange, valueRange));
      const to = points.map((point) => makeNormalizedPoint(point.timeMs, point.to, timeRange, valueRange));
      const delta = points.map((point) => makeNormalizedPoint(point.timeMs, point.delta, timeRange, deltaRange));
      const velocity = points.map((point) => makeNormalizedPoint(point.timeMs, point.velocity, timeRange, velocityRange));
      const maxDelta = Math.max(0, ...points.map((point) => Math.abs(readNumber(point.delta, 0))));
      const maxVelocity = Math.max(0, ...points.map((point) => Math.abs(readNumber(point.velocity, 0))));
      const eventMarkers = events.map((event) => ({
        detail: [
          event.type || "event",
          event.prop,
          `${formatMotionNumber(event.value)} -> ${formatMotionNumber(event.to)}`,
          event.reason ? `reason=${event.reason}` : null,
        ].filter(Boolean).join(" / "),
        time: `${formatMotionNumber(event.timeMs, 0)}ms`,
        type: event.type || "event",
        x: makeNormalizedPoint(event.timeMs, 0, timeRange, { min: 0, max: 1 }).x,
      }));
      const stats = statsByKey.get(track.key) || {};
      const label = `${resolveRecordLabel(track)}.${track.prop}`;
      return {
        deltaPath: makeSvgPath(delta),
        driver: track.driver,
        eventMarkers,
        key: track.key,
        label,
        lane: track.lane,
        laneKey: track.laneKey,
        laneLabel: [track.lane, track.laneKey].filter(Boolean).join("/") || "-",
        latestTimeMs: timeRange.max,
        normalized: true,
        overlayLabel: `${label} / ${track.laneKey}`,
        prop: track.prop,
        rangeLabels: {
          delta: formatRange(deltaRange),
          value: formatRange(valueRange),
          velocity: formatRange(velocityRange),
        },
        sampleCount: points.length,
        series: { delta, to, value, velocity },
        sourceLabel: track.sourceLabel || "-",
        stats: {
          maxDelta: stats.maxDelta ?? maxDelta,
          maxVelocity: stats.maxVelocity ?? maxVelocity,
          overshootCount: stats.overshootCount ?? 0,
          retargetCount: stats.retargetCount ?? 0,
        },
        summary: localize(t, "debug.motion.values.normalizedSamplesEvents", {
          events: formatCount(events.length),
          samples: formatCount(points.length),
        }, `${formatCount(points.length)} samples / ${formatCount(events.length)} events / normalized`),
        targetId: track.targetId,
        toPath: makeSvgPath(to),
        valuePath: makeSvgPath(value),
        velocityPath: makeSvgPath(velocity),
      };
    })
    .sort((a, b) => (b.sampleCount - a.sampleCount) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function buildMotionFilterSummary(report: MotionDebugReportInput = {}, filters: MotionDebugFilters = {}, t?: DiagnosticTranslate) {
  const predicate = makeFilterPredicate(report, filters, "track");
  const timelinePredicate = makeFilterPredicate(report, filters, "targetLane");
  const properties = (report.animations || []).filter(predicate).length;
  const events = (report.history?.events || []).filter(timelinePredicate).length;
  return {
    preset: normalizeMotionFilterPreset(filters.preset),
    query: normalizeQuery(filters.query),
    text: localize(t, "debug.motion.counts.propertiesEvents", {
      events: formatCount(events),
      properties: formatCount(properties),
    }, `${formatCount(properties)} properties / ${formatCount(events)} events`),
  };
}
