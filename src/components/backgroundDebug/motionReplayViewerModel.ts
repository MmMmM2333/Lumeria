import { MOTION_REPLAY_TRACE_SCHEMA } from "../../rendering/motionPort.js";
import { DiagnosticError } from "../../diagnostics/diagnosticError.js";
import { createDiagnosticPresentation } from "../../diagnostics/diagnosticPresentation.js";
import {
  clamp,
  collectRecordText,
  makeTargetsById,
  makeTrackKey,
  normalizeQuery,
  readNumber,
  resolveRecordLabel,
} from "../../rendering/motionPort.js";
import type { MotionTraceRecord } from "../../rendering/motionPort.js";

export type MotionReplayStepDirection = "next" | "previous" | "prev" | 1 | -1;

export interface MotionReplayTimeRange {
  max: number;
  min: number;
}

export interface MotionReplayTimeRangeInput {
  max: number | null;
  min: number | null;
}

export interface MotionReplayFrameInput {
  activeAnimationCount?: number;
  frame?: number;
  timeMs?: number | undefined;
  values?: readonly MotionTraceRecord[];
}

export interface MotionReplayFrame extends Readonly<Record<string, unknown>> {
  activeAnimationCount: number;
  frame: number;
  timeMs: number;
  values: MotionTraceRecord[];
}

export interface MotionReplayTimelineInput {
  events?: readonly MotionTraceRecord[];
  frames?: readonly MotionReplayFrameInput[];
  timeRangeMs?: MotionReplayTimeRangeInput;
}

export interface MotionReplayTimeline extends Readonly<Record<string, unknown>> {
  events: MotionTraceRecord[];
  frames: MotionReplayFrame[];
  timeRangeMs: MotionReplayTimeRange;
}

export interface MotionReplayTraceSummaryInput {
  byDriver?: Readonly<Record<string, unknown>>;
  byProp?: Readonly<Record<string, unknown>>;
  eventCount?: unknown;
  frameCount?: unknown;
  targetCount?: unknown;
  trackCount?: unknown;
  valueCount?: unknown;
  warningCount?: unknown;
}

export interface MotionReplayTraceInput {
  capture?: Readonly<{ profile?: unknown }>;
  generatedAt?: string | null;
  mode?: string;
  schema?: string;
  summary?: MotionReplayTraceSummaryInput;
  targets?: readonly MotionTraceRecord[];
  timeline?: MotionReplayTimelineInput;
  tracks?: readonly MotionTraceRecord[];
  version?: number | null;
  warnings?: readonly MotionTraceRecord[];
}

export interface MotionReplayTrace extends Readonly<Record<string, unknown>> {
  capture?: Readonly<{ profile?: unknown }>;
  generatedAt?: string | null;
  mode?: string;
  schema: string;
  summary: MotionReplayTraceSummaryInput;
  targets: MotionTraceRecord[];
  timeline: MotionReplayTimeline;
  tracks: MotionTraceRecord[];
  version?: number | null;
  warnings: MotionTraceRecord[];
}

export interface MotionReplayFilters {
  query?: unknown;
}

export interface MotionReplaySelectionRef extends MotionTraceRecord {
  label?: string;
}

export interface MotionReplayOverlayOptions {
  limit?: number;
  selectedTarget?: MotionReplaySelectionRef | null;
  selectedTrack?: MotionReplaySelectionRef | null;
}

export interface MotionReplayIntervalExportOptions {
  endMs?: unknown;
  filters?: MotionReplayFilters;
  presentation?: unknown;
  startMs?: unknown;
}

export type DiagnosticTranslate = (key: string, params?: Readonly<Record<string, unknown>>) => string;

interface ReplayCurvePoint {
  delta: number;
  timeMs: number;
  to: unknown;
  value: unknown;
  velocity: unknown;
}

interface ReplayCurveTrack extends MotionTraceRecord {
  driver: string;
  events: MotionTraceRecord[];
  key: string;
  points: ReplayCurvePoint[];
}

interface ReplayOverlayValue {
  isSelected: boolean;
  key: string;
  summary: string;
  track: MotionReplaySelectionRef;
}

interface ReplayOverlayGroup extends MotionReplaySelectionRef {
  label: string;
  laneKeys: Set<string>;
  primaryTrack: MotionReplaySelectionRef | null;
  props: string[];
  values: ReplayOverlayValue[];
}

interface MotionReplayIntervalExportData {
  filters: { query: string };
  interval: { endMs: number; startMs: number };
  schema: string;
  source: { generatedAt: string | null; schema: string; version: number | null };
  summary: {
    eventCount: number;
    frameCount: number;
    targetCount: number;
    trackCount: number;
    valueCount: number;
    warningCount: number;
  };
  targets: MotionTraceRecord[];
  timeline: { events: MotionTraceRecord[]; frames: MotionReplayFrame[] };
  tracks: MotionTraceRecord[];
  warnings: MotionTraceRecord[];
}

export const MOTION_REPLAY_INTERVAL_SCHEMA = "pixi-motion-replay-interval/v1";
export const MOTION_REPLAY_IMPORT_MAX_BYTES = 6 * 1024 * 1024;

const MAX_REPLAY_FRAME_ROWS = 10;
const MAX_REPLAY_EVENT_ROWS = 16;
const MAX_REPLAY_CURVE_GROUPS = 4;
const MAX_REPLAY_OVERLAY_ROWS = 8;
const NORMALIZED_MOTION_REPLAY_TRACES = new WeakSet<object>();

function localize(t: DiagnosticTranslate | undefined, key: string, params: Readonly<Record<string, unknown>>, technicalText: string): string {
  return typeof t === "function" ? t(key, params) : technicalText;
}

function formatNumber(value: unknown, digits = 2): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function formatCount(value: unknown): string {
  return String(Math.max(0, Math.floor(readNumber(value, 0))));
}

function normalizeComparable(value: unknown): string {
  return value == null ? "" : String(value);
}

function isSameReplayTarget(a: MotionReplaySelectionRef | null = null, b: MotionReplaySelectionRef | null = null): boolean {
  if (!a || !b) return false;
  if (a.targetId != null && b.targetId != null) {
    return normalizeComparable(a.targetId) === normalizeComparable(b.targetId);
  }
  if (a.sourceLabel && b.sourceLabel) return a.sourceLabel === b.sourceLabel;
  if (a.label && b.label) return a.label === b.label;
  if (a.layer && b.layer) return a.layer === b.layer;
  return false;
}

function isSameReplayTrack(a: MotionReplaySelectionRef | null = null, b: MotionReplaySelectionRef | null = null): boolean {
  if (!a || !b) return false;
  return isSameReplayTarget(a, b)
    && normalizeComparable(a.prop || "unknown") === normalizeComparable(b.prop || "unknown")
    && normalizeComparable(a.lane || "base") === normalizeComparable(b.lane || "base")
    && normalizeComparable(a.laneKey || "default") === normalizeComparable(b.laneKey || "default");
}

function makeTargetLaneKey(record: MotionTraceRecord = {}): string {
  return [
    record.targetId ?? "unknown",
    record.lane ?? "unknown",
    record.laneKey ?? "unknown",
  ].join(":");
}

function normalizeStepDirection(value: MotionReplayStepDirection): "next" | "previous" {
  return value === "previous" || value === "prev" || value === -1 ? "previous" : "next";
}

function makeFilterPredicate(trace: MotionReplayTraceInput = {}, filters: MotionReplayFilters = {}): (record: MotionTraceRecord) => boolean {
  const query = normalizeQuery(filters.query);
  const targetsById = makeTargetsById(trace);
  return (record) => !query || collectRecordText(record, targetsById).includes(query);
}

function makeTimeRange(frames: readonly MotionReplayFrameInput[] = [], events: readonly MotionTraceRecord[] = []): MotionReplayTimeRange {
  const times = [
    ...frames.map((frame) => readNumber(frame.timeMs, NaN)),
    ...events.map((event) => readNumber(event.timeMs, NaN)),
  ].filter(Number.isFinite);
  if (!times.length) return { max: 0, min: 0 };
  return { max: Math.max(...times), min: Math.min(...times) };
}

function normalizeFrame(frame: MotionReplayFrameInput = {}): MotionReplayFrame {
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

function normalizeEvent(event: MotionTraceRecord = {}): MotionTraceRecord {
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

export function normalizeMotionReplayTrace(trace: unknown): MotionReplayTrace {
  if (!trace || typeof trace !== "object") {
    throw new DiagnosticError("motion-replay-trace-missing", "Motion replay capture data is missing", {
      nextActions: ["Load or capture a Motion replay trace first"],
    });
  }
  if (NORMALIZED_MOTION_REPLAY_TRACES.has(trace)) return trace as MotionReplayTrace;
  const source = trace as MotionReplayTraceInput;
  if (source.schema !== MOTION_REPLAY_TRACE_SCHEMA) {
    throw new DiagnosticError("motion-replay-schema-not-supported", "The Motion replay schema is not supported", {
      details: { receivedSchema: source.schema || "unknown", supportedSchema: MOTION_REPLAY_TRACE_SCHEMA },
      nextActions: [`Provide capture data using the ${MOTION_REPLAY_TRACE_SCHEMA} schema`],
    });
  }
  const frames = (source.timeline?.frames || [])
    .map(normalizeFrame)
    .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
  const events = (source.timeline?.events || [])
    .map(normalizeEvent)
    .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
  const timeRangeMs = makeTimeRange(frames, events);
  const normalized = {
    ...source,
    schema: source.schema,
    summary: source.summary || {},
    targets: Array.isArray(source.targets) ? source.targets.map((target) => ({ ...target })) : [],
    timeline: {
      ...(source.timeline || {}),
      events,
      frames,
      timeRangeMs,
    },
    tracks: Array.isArray(source.tracks) ? source.tracks.map((track) => ({ ...track })) : [],
    warnings: Array.isArray(source.warnings) ? source.warnings.map((warning) => ({ ...warning })) : [],
  };
  NORMALIZED_MOTION_REPLAY_TRACES.add(normalized);
  return normalized;
}

export function assertMotionReplayImportSize(size: unknown, maxBytes: unknown = MOTION_REPLAY_IMPORT_MAX_BYTES): void {
  const byteCount = Math.max(0, Math.floor(readNumber(size, 0)));
  const limit = Math.max(1, Math.floor(readNumber(maxBytes, MOTION_REPLAY_IMPORT_MAX_BYTES)));
  if (byteCount > limit) {
    const mb = (limit / (1024 * 1024)).toFixed(0);
    throw new DiagnosticError("motion-replay-import-too-large", `Motion replay import is too large; the maximum is ${mb} MB`, {
      details: { byteCount, maxBytes: limit },
      nextActions: ["Shorten the capture, reduce the track count, or import a smaller capture file"],
    });
  }
}

export function parseMotionReplayTraceJson(json: unknown, options: { maxBytes?: unknown } = {}): MotionReplayTrace {
  const text = String(json || "");
  assertMotionReplayImportSize(text.length, options.maxBytes);
  try {
    return normalizeMotionReplayTrace(JSON.parse(text));
  } catch (error) {
    if (error instanceof DiagnosticError) throw error;
    throw new DiagnosticError("motion-replay-json-invalid", "Motion replay JSON could not be parsed", {
      cause: error,
      details: { technicalDetail: String(error instanceof Error ? error.message : error) },
      nextActions: ["Check the JSON syntax and file contents, then try again"],
    });
  }
}

export function getMotionReplayTimeRange(trace: MotionReplayTraceInput = {}): MotionReplayTimeRange {
  const range = trace.timeline?.timeRangeMs;
  const min = readNumber(range?.min, 0);
  return {
    max: readNumber(range?.max, min),
    min,
  };
}

export function normalizeMotionReplayTime(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0): number {
  const range = getMotionReplayTimeRange(trace);
  const min = readNumber(range.min, 0);
  const max = readNumber(range.max, min);
  return clamp(readNumber(timeMs, min), min, Math.max(min, max));
}

function normalizeTimePercent(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0): number {
  const range = getMotionReplayTimeRange(trace);
  const min = readNumber(range.min, 0);
  const max = readNumber(range.max, min);
  const span = max - min;
  if (span <= 0) return 0;
  return clamp(((normalizeMotionReplayTime(trace, timeMs) - min) / span) * 100, 0, 100);
}

export function findMotionReplayFrame(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0): MotionReplayFrameInput | null {
  const frames = trace.timeline?.frames || [];
  if (!frames.length) return null;
  const currentTime = normalizeMotionReplayTime(trace, timeMs);
  let selected = frames[0] ?? null;
  for (const frame of frames) {
    if (readNumber(frame.timeMs, 0) > currentTime) break;
    selected = frame;
  }
  return selected;
}

function uniqueSortedTimes(records: readonly { timeMs?: number | undefined }[] = []): number[] {
  return Array.from(new Set(
    records
      .map((record) => readNumber(record.timeMs, NaN))
      .filter(Number.isFinite)
      .map((timeMs) => Number(timeMs.toFixed(3))),
  )).sort((a, b) => a - b);
}

function findAdjacentTime(times: readonly number[] = [], currentTime = 0, direction: MotionReplayStepDirection = "next"): number | null {
  if (!times.length) return null;
  const normalizedDirection = normalizeStepDirection(direction);
  const current = readNumber(currentTime, times[0]);
  if (normalizedDirection === "previous") {
    for (let index = times.length - 1; index >= 0; index -= 1) {
      if (times[index]! < current) return times[index]!;
    }
    return times[0]!;
  }
  for (const timeMs of times) {
    if (timeMs > current) return timeMs;
  }
  return times.at(-1) ?? null;
}

function findStrictAdjacentTime(times: readonly number[] = [], currentTime = 0, direction: MotionReplayStepDirection = "next"): number | null {
  if (!times.length) return null;
  const normalizedDirection = normalizeStepDirection(direction);
  const current = readNumber(currentTime, times[0]);
  if (normalizedDirection === "previous") {
    for (let index = times.length - 1; index >= 0; index -= 1) {
      if (times[index]! < current) return times[index]!;
    }
    return null;
  }
  for (const timeMs of times) {
    if (timeMs > current) return timeMs;
  }
  return null;
}

export function findMotionReplayFrameStepTime(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, direction: MotionReplayStepDirection = "next"): number {
  const normalized = normalizeMotionReplayTrace(trace);
  const times = uniqueSortedTimes(normalized.timeline?.frames || []);
  const adjacent = findAdjacentTime(times, normalizeMotionReplayTime(normalized, timeMs), direction);
  return adjacent == null ? normalizeMotionReplayTime(normalized, timeMs) : normalizeMotionReplayTime(normalized, adjacent);
}

export function findMotionReplayEventStep(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, direction: MotionReplayStepDirection = "next", filters: MotionReplayFilters = {}): MotionTraceRecord | null {
  const normalized = normalizeMotionReplayTrace(trace);
  const predicate = makeFilterPredicate(normalized, filters);
  const events = (normalized.timeline?.events || []).filter(predicate);
  const times = uniqueSortedTimes(events);
  const adjacent = findStrictAdjacentTime(times, normalizeMotionReplayTime(normalized, timeMs), direction);
  if (adjacent == null) return null;
  const candidates = events
    .filter((event) => Math.abs(readNumber(event.timeMs, 0) - adjacent) <= 0.5)
    .sort((a, b) => readNumber(a.frame, 0) - readNumber(b.frame, 0) || makeTrackKey(a).localeCompare(makeTrackKey(b)));
  return candidates[0] || null;
}

export function findMotionReplayEventStepTime(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, direction: MotionReplayStepDirection = "next", filters: MotionReplayFilters = {}): number {
  const event = findMotionReplayEventStep(trace, timeMs, direction, filters);
  return event ? normalizeMotionReplayTime(trace, event.timeMs) : normalizeMotionReplayTime(trace, timeMs);
}

export function buildMotionReplayOverviewRows(trace: MotionReplayTraceInput | null = null, timeMs: unknown = 0, t?: DiagnosticTranslate) {
  if (!trace) {
    return [
      { label: localize(t, "debug.motion.fields.viewer", {}, "Viewer"), value: localize(t, "debug.common.empty", {}, "Empty") },
      { label: localize(t, "debug.motion.fields.schema", {}, "Schema"), value: localize(t, "debug.common.none", {}, "None"), wide: true },
    ];
  }
  const range = getMotionReplayTimeRange(trace);
  const currentTime = normalizeMotionReplayTime(trace, timeMs);
  return [
    { label: localize(t, "debug.motion.fields.viewer", {}, "Viewer"), value: localize(t, "debug.common.loaded", {}, "Loaded") },
    { label: localize(t, "debug.motion.fields.schema", {}, "Schema"), value: trace.schema || localize(t, "debug.common.unknown", {}, "Unknown"), wide: true },
    { label: localize(t, "debug.motion.fields.mode", {}, "Mode"), value: trace.mode || "-", wide: true },
    { label: localize(t, "debug.motion.fields.currentTime", {}, "Current time"), value: `${formatNumber(currentTime, 0)}ms` },
    { label: localize(t, "debug.motion.fields.duration", {}, "Duration"), value: `${formatNumber(readNumber(range.max) - readNumber(range.min), 0)}ms` },
    { label: localize(t, "debug.motion.fields.framesEvents", {}, "Frames / events"), value: `${formatCount(trace.timeline?.frames?.length)} / ${formatCount(trace.timeline?.events?.length)}`, wide: true },
    { label: localize(t, "debug.motion.fields.tracksTargets", {}, "Tracks / targets"), value: `${formatCount(trace.tracks?.length)} / ${formatCount(trace.targets?.length)}`, wide: true },
  ];
}

export function buildMotionReplayFrameRows(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, filters: MotionReplayFilters = {}, limit: unknown = MAX_REPLAY_FRAME_ROWS) {
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

export function buildMotionReplayEventRows(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, filters: MotionReplayFilters = {}, limit: unknown = MAX_REPLAY_EVENT_ROWS) {
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

function makeSeriesRange(values: readonly unknown[]): MotionReplayTimeRange {
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

function makePoint(trace: MotionReplayTraceInput, timeMs: unknown, value: unknown, valueRange: MotionReplayTimeRange) {
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

function formatPathNumber(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(2).replace(/\.?0+$/, "");
}

function makeSvgPath(points: readonly { x: number; y: number }[]): string {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`).join(" ");
}

function collectReplayCurveTracks(trace: MotionReplayTraceInput = {}, filters: MotionReplayFilters = {}): ReplayCurveTrack[] {
  const predicate = makeFilterPredicate(trace, filters);
  const tracks = new Map<string, ReplayCurveTrack>();
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
        timeMs: readNumber(frame.timeMs, 0),
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

export function buildMotionReplayCurveGroups(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, filters: MotionReplayFilters = {}, limit: unknown = MAX_REPLAY_CURVE_GROUPS, t?: DiagnosticTranslate) {
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
        summary: localize(t, "debug.motion.counts.samplesEvents", {
          events: formatCount(track.events.length),
          samples: formatCount(points.length),
        }, `${formatCount(points.length)} samples / ${formatCount(track.events.length)} events`),
        toPath: makeSvgPath(to),
        valuePath: makeSvgPath(value),
        velocityPath: makeSvgPath(velocity),
      };
    })
    .sort((a, b) => (b.sampleCount - a.sampleCount) || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, MAX_REPLAY_CURVE_GROUPS))));
}

export function buildMotionReplayOverlayRows(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, filters: MotionReplayFilters = {}, limit: number | MotionReplayOverlayOptions = MAX_REPLAY_OVERLAY_ROWS) {
  const options = typeof limit === "object" && limit !== null ? limit : { limit };
  const rowLimit = options.limit ?? MAX_REPLAY_OVERLAY_ROWS;
  const selectedTarget = options.selectedTarget || null;
  const selectedTrack = options.selectedTrack || null;
  const frame = findMotionReplayFrame(trace, timeMs);
  if (!frame) return [];
  const targetsById = makeTargetsById(trace);
  const predicate = makeFilterPredicate(trace, filters);
  const groups = new Map<string, ReplayOverlayGroup>();
  for (const value of frame.values || []) {
    if (!predicate(value)) continue;
    const key = String(value.targetId ?? resolveRecordLabel(value, targetsById));
    let group = groups.get(key);
    if (!group) {
      const target = value.targetId != null ? targetsById.get(value.targetId) : null;
      const newGroup: ReplayOverlayGroup = {
        kind: value.targetKind || target?.kind,
        label: resolveRecordLabel(value, targetsById),
        laneKeys: new Set(),
        layer: value.layer || target?.layer,
        primaryTrack: null,
        props: [],
        sourceLabel: value.sourceLabel || target?.sourceLabel,
        targetId: value.targetId,
        values: [],
      };
      group = newGroup;
      groups.set(key, newGroup);
    }
    const track: MotionReplaySelectionRef = {
      lane: value.lane || "base",
      laneKey: value.laneKey || "default",
      prop: value.prop || "unknown",
      sourceLabel: value.sourceLabel || group.sourceLabel || group.label,
      targetId: value.targetId,
    };
    if (!group.primaryTrack || isSameReplayTrack(track, selectedTrack)) {
      group.primaryTrack = track;
    }
    group.props.push(value.prop || "-");
    group.laneKeys.add([value.lane, value.laneKey].filter(Boolean).join("/") || "-");
    group.values.push({
      isSelected: isSameReplayTrack(track, selectedTrack),
      key: makeTrackKey(track),
      summary: `${value.prop || "-"}=${formatNumber(value.value)}`,
      track,
    });
  }
  return Array.from(groups.values())
    .map((group) => {
      const isSelectedTarget = isSameReplayTarget(group, selectedTarget) || isSameReplayTarget(group, selectedTrack);
      const selectedValue = group.values.find((value) => value.isSelected);
      return {
        isSelected: Boolean(isSelectedTarget || selectedValue),
        key: String(group.targetId ?? group.sourceLabel ?? group.label),
        kind: group.kind,
        label: group.label,
        lane: group.primaryTrack?.lane || "base",
        laneKey: group.primaryTrack?.laneKey || "default",
        laneSummary: Array.from(group.laneKeys).slice(0, 2).join(" "),
        layer: group.layer,
        primaryTrack: selectedValue?.track || group.primaryTrack,
        prop: group.primaryTrack?.prop || "unknown",
        propSummary: Array.from(new Set(group.props)).slice(0, 4).join(","),
        sourceLabel: group.sourceLabel || group.label,
        targetId: group.targetId,
        valueCount: group.values.length,
        valueRows: group.values.slice(0, 4),
        valueSummary: group.values.map((value) => value.summary).slice(0, 4).join(" / "),
      };
    })
    .sort((a, b) => Number(b.isSelected) - Number(a.isSelected) || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, Math.floor(readNumber(rowLimit, MAX_REPLAY_OVERLAY_ROWS))));
}

function collectUsedTargetIds(frames: readonly MotionReplayFrameInput[] = [], events: readonly MotionTraceRecord[] = []): Set<number | string> {
  const ids = new Set<number | string>();
  for (const frame of frames) {
    for (const value of frame.values || []) if (value.targetId != null) ids.add(value.targetId);
  }
  for (const event of events) if (event.targetId != null) ids.add(event.targetId);
  return ids;
}

function collectUsedTrackKeys(frames: readonly MotionReplayFrameInput[] = [], events: readonly MotionTraceRecord[] = []): Set<string> {
  const keys = new Set<string>();
  for (const frame of frames) {
    for (const value of frame.values || []) keys.add(makeTrackKey(value));
  }
  for (const event of events) keys.add(makeTrackKey(event));
  return keys;
}

function formatMotionReplayIntervalMarkdown(data: MotionReplayIntervalExportData): string {
  const summary = data.summary || {};
  return [
    "# Motion replay interval",
    "",
    `- Time: ${data.interval?.startMs ?? 0}ms..${data.interval?.endMs ?? 0}ms`,
    `- Frames / events: ${summary.frameCount ?? 0} / ${summary.eventCount ?? 0}`,
    `- Targets / tracks: ${summary.targetCount ?? 0} / ${summary.trackCount ?? 0}`,
    `- Property values: ${summary.valueCount ?? 0}`,
    "",
    "## Complete structured data",
    "",
    "```json",
    JSON.stringify(data, null, 2),
    "```",
  ].join("\n");
}

export function createMotionReplayIntervalExport(trace: MotionReplayTraceInput = {}, options: MotionReplayIntervalExportOptions = {}) {
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
    .filter((event) => readNumber(event.timeMs, 0) >= minTime && readNumber(event.timeMs, 0) <= maxTime)
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
      generatedAt: typeof normalized.generatedAt === "string" ? normalized.generatedAt : null,
      schema: normalized.schema,
      version: typeof normalized.version === "number" ? normalized.version : null,
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
  return createDiagnosticPresentation(data, {
    formatMarkdown: formatMotionReplayIntervalMarkdown,
    presentation: options.presentation,
  });
}

export function buildMotionReplayFilterSummary(trace: MotionReplayTraceInput = {}, timeMs: unknown = 0, filters: MotionReplayFilters = {}, t?: DiagnosticTranslate) {
  const frameRows = buildMotionReplayFrameRows(trace, timeMs, filters, 100000);
  const eventRows = buildMotionReplayEventRows(trace, timeMs, filters, 100000);
  return {
    query: normalizeQuery(filters.query),
    text: localize(t, "debug.motion.counts.propertiesEvents", {
      events: formatCount(eventRows.length),
      properties: formatCount(frameRows.length),
    }, `${formatCount(frameRows.length)} properties / ${formatCount(eventRows.length)} events`),
  };
}
