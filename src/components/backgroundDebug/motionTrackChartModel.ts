import {
  getMotionReplayTimeRange,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "./motionReplayViewerModel.js";
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
import type {
  DiagnosticTranslate,
  MotionReplayFilters,
  MotionReplayTraceInput,
  MotionReplayTimeRange,
} from "./motionReplayViewerModel.js";

export const MOTION_TRACK_CHART_DISPLAY_RAW = "raw";
export const MOTION_TRACK_CHART_DISPLAY_NORMALIZED = "normalized";
export const MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT = 240;
export const MOTION_TRACK_CHART_DEFAULT_TRACK_LIMIT = 24;
export const MOTION_TRACK_CHART_SERIES_KEYS = ["value", "to", "delta", "velocity"] as const;

export type MotionTrackChartDisplayMode = typeof MOTION_TRACK_CHART_DISPLAY_RAW | typeof MOTION_TRACK_CHART_DISPLAY_NORMALIZED;
export type MotionTrackChartSeriesKey = (typeof MOTION_TRACK_CHART_SERIES_KEYS)[number];
export type MotionTrackChartSeriesVisibility = Record<MotionTrackChartSeriesKey, boolean>;

export interface MotionTrackChartWindow {
  endMs: number;
  startMs: number;
}

export interface MotionTrackChartOptions {
  axisTickCount?: unknown;
  cursorTimeMs?: unknown;
  displayMode?: unknown;
  filters?: MotionReplayFilters;
  interval?: Partial<Record<keyof MotionTrackChartWindow, unknown>>;
  maxPointsPerSeries?: unknown;
  selectedTrack?: unknown;
  seriesVisibility?: Partial<Record<MotionTrackChartSeriesKey, unknown>>;
  t?: DiagnosticTranslate;
  trackLimit?: unknown;
  zoomWindow?: Partial<Record<keyof MotionTrackChartWindow, unknown>>;
}

interface MotionTrackSample {
  delta: number;
  frame: number | undefined;
  timeMs: number;
  to: number;
  value: number;
  velocity: number;
}

interface MotionTrackChartRecord {
  driver: string;
  events: MotionTraceRecord[];
  key: string;
  label: string;
  lane: string;
  laneKey: string;
  layer: string | undefined;
  prop: string;
  samples: MotionTrackSample[];
  sourceLabel: string;
  targetId: number | string | null;
}

export interface MotionTrackChartPoint {
  frame: number | undefined;
  normalized: number;
  raw: number;
  timeMs: number;
  value: number;
  x: number;
  y: number;
}

export interface MotionTrackChartSeries {
  key: MotionTrackChartSeriesKey;
  normalizedRange: MotionReplayTimeRange;
  path: string;
  pointCount: number;
  points: MotionTrackChartPoint[];
  rawRange: MotionReplayTimeRange;
  rangeLabel: string;
  renderedPointCount: number;
  visible: boolean;
}

export interface MotionTrackChartModel {
  axis: { ticks: { label: string; timeMs: number; x: number }[] };
  cursor: { timeMs: number; x: number };
  displayMode: MotionTrackChartDisplayMode;
  limits: { maxPointsPerSeries: number; trackLimit: number; tracksLimited: boolean };
  seriesVisibility: MotionTrackChartSeriesVisibility;
  summary: { eventCount: number; hiddenTrackCount: number; sampleCount: number; trackCount: number; visibleTrackCount: number; windowDurationMs: number };
  timeRangeMs: MotionReplayTimeRange;
  tracks: Array<Readonly<Record<string, unknown>> & {
    current: Readonly<{ delta: number; frame: number | null; timeMs: number; to: number; value: number; velocity: number; x: number }> | null;
    driver: string;
    eventCount: number;
    eventMarkers: Array<{ detail: string; reason: string | null; timeMs: number; type: string; x: number }>;
    isSelected: boolean;
    key: string;
    label: string;
    lane: string;
    laneLabel: string;
    laneKey: string;
    layer: string | undefined;
    prop: string;
    rangeLabels: Record<MotionTrackChartSeriesKey, string>;
    sampleCount: number;
    series: Record<MotionTrackChartSeriesKey, MotionTrackChartSeries>;
    sourceLabel: string;
    stats: { eventCount: number; maxAbsDelta: number; maxAbsVelocity: number; sampleCount: number };
    summary: string;
    targetId: number | string | null;
    targetProp: string;
    timeline: { endMs: number; endX: number; startMs: number; startX: number; width: number };
    visibleSeries: MotionTrackChartSeriesKey[];
  }>;
  zoomWindow: MotionTrackChartWindow;
}

function localize(t: DiagnosticTranslate | undefined, key: string, params: Readonly<Record<string, unknown>>, technicalText: string): string {
  return typeof t === "function" ? t(key, params) : technicalText;
}

const DEFAULT_SERIES_VISIBILITY: MotionTrackChartSeriesVisibility = {
  delta: true,
  to: true,
  value: true,
  velocity: true,
};

function formatNumber(value: unknown, digits = 2): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  const fixed = number.toFixed(digits);
  if (!fixed.includes(".")) return fixed;
  const text = fixed.replace(/0+$/, "").replace(/\.$/, "");
  return text || "0";
}

function normalizeDisplayMode(value: unknown): MotionTrackChartDisplayMode {
  return value === MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    ? MOTION_TRACK_CHART_DISPLAY_NORMALIZED
    : MOTION_TRACK_CHART_DISPLAY_RAW;
}

function normalizePositiveInteger(value: unknown, fallback: number, min = 1, max = 10000): number {
  const number = Math.floor(readNumber(value, fallback));
  return Math.min(max, Math.max(min, number));
}

function matchesFilters(record: MotionTraceRecord = {}, targetsById: ReadonlyMap<number | string, MotionTraceRecord> = new Map(), filters: MotionReplayFilters = {}): boolean {
  const query = normalizeQuery(filters.query);
  return !query || collectRecordText(record, targetsById, { includeLayer: true, includeTargetLayer: true }).includes(query);
}

function normalizeRange(values: readonly unknown[] = []): MotionReplayTimeRange {
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

function normalizeSeriesValue(value: unknown, range: MotionReplayTimeRange = { max: 1, min: 0 }): number {
  const span = readNumber(range.max, 1) - readNumber(range.min, 0);
  if (span <= 0) return 0.5;
  return clamp((readNumber(value, 0) - readNumber(range.min, 0)) / span, 0, 1);
}

function formatPath(points: readonly { x: number; y: number }[] = []): string {
  if (!points.length) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    .join(" ");
}

function formatTimeLabel(timeMs: unknown): string {
  return `${formatNumber(timeMs, 0)}ms`;
}

function formatRangeLabel(range: Partial<MotionReplayTimeRange> = {}, hasPoints = true): string {
  if (!hasPoints) return "none";
  return `${formatNumber(range.min)}..${formatNumber(range.max)}`;
}

function downsamplePoints<T>(points: readonly T[] = [], maxPoints: unknown = MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT): T[] {
  const limit = normalizePositiveInteger(maxPoints, MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT, 2, 10000);
  if (points.length <= limit) return [...points];
  const sampled: T[] = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index / (limit - 1)) * lastIndex);
    const point = points[sourceIndex];
    if (point !== undefined) sampled.push(point);
  }
  return sampled;
}

function normalizeTimePercent(timeWindow: Partial<MotionTrackChartWindow> = {}, timeMs: unknown = 0): number {
  const startMs = readNumber(timeWindow.startMs, 0);
  const endMs = readNumber(timeWindow.endMs, startMs);
  const span = endMs - startMs;
  if (span <= 0) return 0;
  return clamp(((readNumber(timeMs, startMs) - startMs) / span) * 100, 0, 100);
}

function isInsideWindow(timeMs: unknown, timeWindow: Partial<MotionTrackChartWindow> = {}): boolean {
  const time = readNumber(timeMs, 0);
  return time >= readNumber(timeWindow.startMs, 0) && time <= readNumber(timeWindow.endMs, 0);
}

export function normalizeMotionTrackChartSeriesVisibility(input: Partial<Record<MotionTrackChartSeriesKey, unknown>> = {}): MotionTrackChartSeriesVisibility {
  const source = input && typeof input === "object" ? input : {};
  return MOTION_TRACK_CHART_SERIES_KEYS.reduce((visibility, key) => ({
    ...visibility,
    [key]: source[key] == null ? DEFAULT_SERIES_VISIBILITY[key] : Boolean(source[key]),
  }), { ...DEFAULT_SERIES_VISIBILITY });
}

function normalizeTrackLimit(value: unknown): number {
  return normalizePositiveInteger(value, MOTION_TRACK_CHART_DEFAULT_TRACK_LIMIT, 1, 500);
}

function normalizePointLimit(value: unknown): number {
  return normalizePositiveInteger(value, MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT, 2, 10000);
}

function normalizeAxisTickCount(value: unknown): number {
  return normalizePositiveInteger(value, 5, 1, 12);
}

export function normalizeMotionTrackChartZoomWindow(traceInput: MotionReplayTraceInput = {}, windowInput: Partial<Record<keyof MotionTrackChartWindow, unknown>> = {}): MotionTrackChartWindow {
  const trace = normalizeMotionReplayTrace(traceInput);
  const range = getMotionReplayTimeRange(trace);
  const start = normalizeMotionReplayTime(trace, windowInput.startMs ?? range.min);
  const end = normalizeMotionReplayTime(trace, windowInput.endMs ?? range.max);
  return {
    endMs: Math.max(start, end),
    startMs: Math.min(start, end),
  };
}

function buildTimeAxis(zoomWindow: Partial<MotionTrackChartWindow> = {}, tickCountInput: unknown = 5): MotionTrackChartModel["axis"] {
  const tickCount = normalizeAxisTickCount(tickCountInput);
  const startMs = readNumber(zoomWindow.startMs, 0);
  const endMs = readNumber(zoomWindow.endMs, startMs);
  const span = endMs - startMs;
  if (tickCount <= 1 || span <= 0) {
    return {
      ticks: [{
        label: formatTimeLabel(startMs),
        timeMs: startMs,
        x: 0,
      }],
    };
  }
  return {
    ticks: Array.from({ length: tickCount }, (_, index) => {
      const timeMs = startMs + (span * index) / (tickCount - 1);
      return {
        label: formatTimeLabel(timeMs),
        timeMs,
        x: normalizeTimePercent(zoomWindow, timeMs),
      };
    }),
  };
}

function collectTrackRecords(trace: MotionReplayTraceInput = {}, zoomWindow: MotionTrackChartWindow, filters: MotionReplayFilters = {}): MotionTrackChartRecord[] {
  const targetsById = makeTargetsById(trace);
  const tracks = new Map<string, MotionTrackChartRecord>();
  const ensureTrack = (record: MotionTraceRecord = {}): MotionTrackChartRecord => {
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

function buildSeries(track: MotionTrackChartRecord, key: MotionTrackChartSeriesKey, options: Readonly<{ displayMode: MotionTrackChartDisplayMode; maxPointsPerSeries: number; seriesVisibility: MotionTrackChartSeriesVisibility; zoomWindow: MotionTrackChartWindow }>): MotionTrackChartSeries {
  const values = track.samples.map((sample) => sample[key]);
  const rawRange = normalizeRange(values);
  const allPoints = track.samples.map((sample) => {
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
  const points = downsamplePoints(allPoints, options.maxPointsPerSeries);
  const visible = Boolean(options.seriesVisibility[key]);
  return {
    key,
    normalizedRange: { max: 1, min: 0 },
    path: visible ? formatPath(points) : "",
    pointCount: allPoints.length,
    points,
    rawRange,
    rangeLabel: formatRangeLabel(rawRange, allPoints.length > 0),
    renderedPointCount: points.length,
    visible,
  };
}

function buildTrackTimeline(track: MotionTrackChartRecord, zoomWindow: MotionTrackChartWindow) {
  const times = [
    ...track.samples.map((sample) => sample.timeMs),
    ...track.events.map((event) => event.timeMs),
  ].map((timeMs) => readNumber(timeMs, NaN)).filter(Number.isFinite);
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

function buildEventMarkers(track: MotionTrackChartRecord, zoomWindow: MotionTrackChartWindow) {
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

function findCursorSample(samples: readonly MotionTrackSample[] = [], cursorTimeMs: unknown = 0): MotionTrackSample | null {
  if (!samples.length) return null;
  const cursor = readNumber(cursorTimeMs, 0);
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (readNumber(samples[middle]?.timeMs, 0) <= cursor) low = middle + 1;
    else high = middle;
  }
  return samples[Math.max(0, low - 1)] ?? null;
}

function buildCurrentValues(samples: readonly MotionTrackSample[], cursorTimeMs: unknown = 0, zoomWindow: MotionTrackChartWindow) {
  const sample = findCursorSample(samples, cursorTimeMs);
  if (!sample) return null;
  return {
    delta: readNumber(sample.delta, 0),
    frame: sample.frame ?? null,
    timeMs: readNumber(sample.timeMs, 0),
    to: readNumber(sample.to, 0),
    value: readNumber(sample.value, 0),
    velocity: readNumber(sample.velocity, 0),
    x: normalizeTimePercent(zoomWindow, sample.timeMs),
  };
}

function buildStats(track: MotionTrackChartRecord) {
  const absoluteDeltas = track.samples.map((sample) => Math.abs(readNumber(sample.delta, 0)));
  const absoluteVelocities = track.samples.map((sample) => Math.abs(readNumber(sample.velocity, 0)));
  return {
    eventCount: track.events.length,
    maxAbsDelta: absoluteDeltas.length ? Math.max(...absoluteDeltas) : 0,
    maxAbsVelocity: absoluteVelocities.length ? Math.max(...absoluteVelocities) : 0,
    sampleCount: track.samples.length,
  };
}

function normalizeSelectedTrackKey(selectedTrack: unknown = null): string {
  if (!selectedTrack) return "";
  if (typeof selectedTrack === "string") return selectedTrack;
  if (typeof selectedTrack !== "object") return "";
  const source = selectedTrack as MotionTraceRecord;
  return String(source.key || makeTrackKey(source));
}

export function createMotionTrackChartProjector(traceInput: MotionReplayTraceInput = {}, options: MotionTrackChartOptions = {}): Readonly<{ project: (projectionOptions?: MotionTrackChartOptions) => MotionTrackChartModel }> {
  const trace = normalizeMotionReplayTrace(traceInput);
  const displayMode = normalizeDisplayMode(options.displayMode);
  const maxPointsPerSeries = normalizePointLimit(options.maxPointsPerSeries);
  const trackLimit = normalizeTrackLimit(options.trackLimit);
  const zoomWindow = normalizeMotionTrackChartZoomWindow(trace, options.zoomWindow || options.interval || {});
  const seriesVisibility = normalizeMotionTrackChartSeriesVisibility(options.seriesVisibility);
  const allTracks = collectTrackRecords(trace, zoomWindow, options.filters)
    .map((track) => {
      const series = MOTION_TRACK_CHART_SERIES_KEYS.reduce<Record<MotionTrackChartSeriesKey, MotionTrackChartSeries>>((result, key) => ({
        ...result,
        [key]: buildSeries(track, key, {
          displayMode,
          maxPointsPerSeries,
          seriesVisibility,
          zoomWindow,
        }),
      }), {} as Record<MotionTrackChartSeriesKey, MotionTrackChartSeries>);
      const rangeLabels = MOTION_TRACK_CHART_SERIES_KEYS.reduce<Record<MotionTrackChartSeriesKey, string>>((result, key) => ({
        ...result,
        [key]: series[key].rangeLabel,
      }), {} as Record<MotionTrackChartSeriesKey, string>);
      return {
        model: {
          driver: track.driver,
          eventCount: track.events.length,
          eventMarkers: buildEventMarkers(track, zoomWindow),
          key: track.key,
          label: track.label,
          lane: track.lane,
          laneLabel: [track.lane, track.laneKey].filter(Boolean).join("/") || "-",
          laneKey: track.laneKey,
          layer: track.layer,
          prop: track.prop,
          rangeLabels,
          sampleCount: track.samples.length,
          series,
          sourceLabel: track.sourceLabel,
          stats: buildStats(track),
          summary: localize(options.t, "debug.motion.counts.samplesEvents", {
            events: track.events.length,
            samples: track.samples.length,
          }, `${track.samples.length} samples / ${track.events.length} events`),
          targetId: track.targetId,
          targetProp: track.label,
          timeline: buildTrackTimeline(track, zoomWindow),
          visibleSeries: MOTION_TRACK_CHART_SERIES_KEYS.filter((key) => seriesVisibility[key]),
        },
        samples: track.samples,
      };
    })
    .sort((a, b) => (b.model.sampleCount - a.model.sampleCount) || a.model.label.localeCompare(b.model.label));
  const visibleTracks = allTracks.slice(0, trackLimit);
  const totalSampleCount = allTracks.reduce((total, track) => total + track.model.sampleCount, 0);
  const totalEventCount = allTracks.reduce((total, track) => total + track.model.eventCount, 0);
  const staticModel = {
    axis: buildTimeAxis(zoomWindow, options.axisTickCount),
    displayMode,
    limits: {
      maxPointsPerSeries,
      trackLimit,
      tracksLimited: allTracks.length > visibleTracks.length,
    },
    seriesVisibility,
    summary: {
      eventCount: totalEventCount,
      hiddenTrackCount: Math.max(0, allTracks.length - visibleTracks.length),
      sampleCount: totalSampleCount,
      trackCount: allTracks.length,
      visibleTrackCount: visibleTracks.length,
      windowDurationMs: Math.max(0, readNumber(zoomWindow.endMs, 0) - readNumber(zoomWindow.startMs, 0)),
    },
    timeRangeMs: getMotionReplayTimeRange(trace),
    zoomWindow,
  };
  let projectionCache: { key: string; value: MotionTrackChartModel } | null = null;

  function project(projectionOptions: MotionTrackChartOptions = {}): MotionTrackChartModel {
    const cursorTimeMs = clamp(
      readNumber(projectionOptions.cursorTimeMs, zoomWindow.startMs),
      zoomWindow.startMs,
      Math.max(zoomWindow.startMs, zoomWindow.endMs),
    );
    const selectedTrackKey = normalizeSelectedTrackKey(projectionOptions.selectedTrack);
    const key = `${cursorTimeMs}:${selectedTrackKey}`;
    if (projectionCache?.key === key) return projectionCache.value;
    const value = {
      ...staticModel,
      cursor: {
        timeMs: cursorTimeMs,
        x: normalizeTimePercent(zoomWindow, cursorTimeMs),
      },
      tracks: visibleTracks.map((track) => ({
        ...track.model,
        current: buildCurrentValues(track.samples, cursorTimeMs, zoomWindow),
        isSelected: Boolean(selectedTrackKey && selectedTrackKey === track.model.key),
      })),
    };
    projectionCache = { key, value };
    return value;
  }

  return Object.freeze({ project });
}

export function buildMotionTrackChartModel(traceInput: MotionReplayTraceInput = {}, options: MotionTrackChartOptions = {}): MotionTrackChartModel {
  return createMotionTrackChartProjector(traceInput, options).project(options);
}
