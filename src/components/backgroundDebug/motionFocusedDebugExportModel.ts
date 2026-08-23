import {
  matchesMotionCaptureProfileRecord,
  normalizeMotionCaptureProfile,
} from "./motionCaptureProfileModel.js";
import { createDiagnosticPresentation } from "../../diagnostics/diagnosticPresentation.js";
import {
  getMotionReplayTimeRange,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "./motionReplayViewerModel.js";
import {
  collectRecordText,
  makeTargetsById,
  makeTrackKey,
  normalizeQuery,
  readNumber,
} from "../../rendering/motionPort.js";
import type { MotionTraceRange, MotionTraceRecord } from "../../rendering/motionPort.js";
import type { MotionCaptureProfile, MotionCaptureProfileLike } from "./motionCaptureProfileModel.js";
import type { MotionReplayBookmarkInput } from "./motionReplayBookmarkModel.js";
import type {
  MotionReplayFilters,
  MotionReplayFrameInput,
  MotionReplayTrace,
  MotionReplayTraceInput,
} from "./motionReplayViewerModel.js";

export interface MotionFocusedSelection {
  kind: string;
  label: string;
  lane: string;
  laneKey: string;
  layer: string;
  prop: string;
  sourceLabel: string;
  targetId: unknown;
}

export interface MotionFocusedDebugExportOptions {
  bookmark?: MotionReplayBookmarkInput | null;
  captureProfile?: MotionCaptureProfileLike | null;
  endMs?: unknown;
  filters?: MotionReplayFilters;
  generatedAt?: string;
  interval?: Readonly<{ endMs?: unknown; startMs?: unknown }>;
  presentation?: unknown;
  selection?: Readonly<Record<string, unknown>>;
  startMs?: unknown;
  track?: Readonly<Record<string, unknown>>;
  visibleTracks?: readonly unknown[];
}

interface MotionFocusedInterval {
  endMs: number;
  startMs: number;
}

interface MotionFocusedValue {
  driver: string;
  from: unknown;
  lane: string;
  laneKey: string;
  layer: string | undefined;
  prop: string;
  sourceLabel: string | undefined;
  targetId: number | string | null;
  targetKind: string | undefined;
  targetLabel: string | undefined;
  to: number;
  value: number;
  velocity: number;
}

interface MotionFocusedEvent extends MotionFocusedValue {
  frame: number;
  reason: string | null;
  timeMs: number;
  type: string;
}

interface MotionFocusedFrame {
  activeAnimationCount: number;
  frame: number;
  timeMs: number;
  values: MotionFocusedValue[];
}

interface MotionFocusedTrack {
  driver: string;
  eventCount: number;
  key: string;
  lane: string;
  laneKey: string;
  layer: string | undefined;
  maxDelta: number | null;
  maxVelocity: number | null;
  overshootCount: number;
  prop: string;
  retargetCount: number;
  sampleCount: number;
  sourceLabel: string | undefined;
  targetId: number | string | null;
  timeRangeMs: MotionTraceRange;
  valueRange: MotionTraceRange;
  velocityRange: MotionTraceRange;
}

interface MotionFocusedBookmark {
  createdAt: string;
  endMs: number;
  id: string;
  label: string;
  startMs: number;
}

export interface MotionFocusedDebugExportData {
  context: {
    bookmark: MotionFocusedBookmark | null;
    captureProfile: MotionCaptureProfile | null;
    filters: { query: string };
    generatedAt: string;
    interval: MotionFocusedInterval;
    selection: MotionFocusedSelection;
    source: { generatedAt: string | null; mode: string | null; schema: string; version: number | null };
    visibleTracks: string[];
  };
  schema: string;
  summary: { eventCount: number; frameCount: number; targetCount: number; trackCount: number; valueCount: number; warningCount: number };
  targets: Array<Readonly<Record<string, unknown>>>;
  timeline: { events: MotionFocusedEvent[]; frames: MotionFocusedFrame[] };
  tracks: MotionFocusedTrack[];
  version: number;
  warnings: Array<Readonly<Record<string, unknown>>>;
}

export const MOTION_FOCUSED_DEBUG_SCHEMA = "pixi-motion-focused-debug/v1";

function readString(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function readNullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeRange(value: unknown): MotionTraceRange {
  if (!value || typeof value !== "object") return { max: null, min: null };
  const range = value as Readonly<Record<string, unknown>>;
  return { max: readNullableNumber(range.max), min: readNullableNumber(range.min) };
}

function makeFocusedTrackKey(record: Pick<MotionFocusedValue, "lane" | "laneKey" | "prop" | "targetId">): string {
  return makeTrackKey({
    lane: record.lane,
    laneKey: record.laneKey,
    prop: record.prop,
    targetId: typeof record.targetId === "number" ? record.targetId : null,
  });
}

function normalizeInterval(trace: MotionReplayTraceInput = {}, options: MotionFocusedDebugExportOptions = {}): MotionFocusedInterval {
  const range = getMotionReplayTimeRange(trace);
  const start = normalizeMotionReplayTime(trace, options.startMs ?? options.interval?.startMs ?? range.min);
  const end = normalizeMotionReplayTime(trace, options.endMs ?? options.interval?.endMs ?? range.max);
  return {
    endMs: Math.max(start, end),
    startMs: Math.min(start, end),
  };
}

function normalizeSelection(options: MotionFocusedDebugExportOptions = {}): MotionFocusedSelection {
  const source = options.selection && typeof options.selection === "object"
    ? options.selection
    : {};
  const track = options.track && typeof options.track === "object"
    ? options.track
    : {};
  return {
    kind: readString(source.kind ?? track.kind, ""),
    label: readString(source.label ?? track.label, ""),
    lane: readString(source.lane ?? track.lane, ""),
    laneKey: readString(source.laneKey ?? track.laneKey, ""),
    layer: readString(source.layer ?? track.layer, ""),
    prop: readString(source.prop ?? track.prop, ""),
    sourceLabel: readString(source.sourceLabel ?? track.sourceLabel, ""),
    targetId: source.targetId ?? track.targetId ?? null,
  };
}

function normalizeVisibleTrackKeys(visibleTracks: readonly unknown[] = []): Set<string> {
  const keys = new Set<string>();
  for (const track of Array.isArray(visibleTracks) ? visibleTracks : []) {
    if (typeof track === "string") {
      const key = readString(track);
      if (key) keys.add(key);
      continue;
    }
    if (!track || typeof track !== "object") continue;
    const record = track as MotionTraceRecord;
    keys.add(readString(record.key, makeTrackKey(record)));
  }
  return keys;
}

function hasSelectionFilter(selection: MotionFocusedSelection): boolean {
  return Boolean(
    selection.targetId != null
    || selection.sourceLabel
    || selection.label
    || selection.layer
    || selection.kind
    || selection.prop
    || selection.lane
    || selection.laneKey
  );
}

function targetMatchesSelection(record: MotionTraceRecord = {}, target: MotionTraceRecord = {}, selection: MotionFocusedSelection): boolean {
  if (selection.targetId != null && String(record.targetId ?? target.targetId) !== String(selection.targetId)) return false;
  if (selection.sourceLabel && record.sourceLabel !== selection.sourceLabel && target.sourceLabel !== selection.sourceLabel) return false;
  if (selection.label && record.targetLabel !== selection.label && record.label !== selection.label && target.label !== selection.label) return false;
  if (selection.layer && record.layer !== selection.layer && target.layer !== selection.layer) return false;
  if (selection.kind && record.targetKind !== selection.kind && record.kind !== selection.kind && target.kind !== selection.kind) return false;
  return true;
}

function trackMatchesSelection(record: MotionTraceRecord = {}, selection: MotionFocusedSelection): boolean {
  if (selection.prop && record.prop !== selection.prop) return false;
  if (selection.lane && record.lane !== selection.lane) return false;
  if (selection.laneKey && record.laneKey !== selection.laneKey) return false;
  return true;
}

function createRecordPredicate(trace: MotionReplayTraceInput = {}, options: MotionFocusedDebugExportOptions = {}): (record?: MotionTraceRecord, type?: string) => boolean {
  const targetsById = makeTargetsById(trace);
  const selection = normalizeSelection(options);
  const query = normalizeQuery(options.filters?.query);
  const visibleTrackKeys = normalizeVisibleTrackKeys(options.visibleTracks);
  const profileSource = options.captureProfile || trace.capture?.profile as MotionCaptureProfileLike | null | undefined || null;
  const profile = profileSource ? normalizeMotionCaptureProfile(profileSource) : null;
  return (record: MotionTraceRecord = {}, type = "sample") => {
    const target = record.targetId != null ? targetsById.get(record.targetId) || {} : {};
    const recordWithType = { type, ...record };
    if (hasSelectionFilter(selection) && !targetMatchesSelection(recordWithType, target, selection)) return false;
    if (!trackMatchesSelection(recordWithType, selection)) return false;
    if (visibleTrackKeys.size && !visibleTrackKeys.has(makeTrackKey(recordWithType))) return false;
    if (query && !collectRecordText(recordWithType, targetsById, { includeLayer: true, includeTargetLayer: true }).includes(query)) return false;
    if (profile && !matchesMotionCaptureProfileRecord(recordWithType, profile)) return false;
    return true;
  };
}

function sanitizeTarget(target: MotionTraceRecord = {}): Readonly<Record<string, unknown>> {
  return {
    folderId: target.folderId ?? null,
    itemId: target.itemId ?? null,
    itemType: target.itemType ?? null,
    kind: target.kind ?? null,
    label: target.label ?? null,
    layer: target.layer ?? null,
    pageIndex: target.pageIndex ?? null,
    sourceLabel: target.sourceLabel ?? null,
    sourceType: target.sourceType ?? null,
    targetId: target.targetId ?? null,
    targetPart: target.targetPart ?? null,
  };
}

function sanitizeTrack(track: MotionTraceRecord = {}): MotionFocusedTrack {
  return {
    driver: track.driver || "unknown",
    eventCount: Math.max(0, Math.floor(readNumber(track.eventCount, 0))),
    key: readString(track.key, makeTrackKey(track)),
    lane: track.lane || "base",
    laneKey: track.laneKey || "default",
    layer: track.layer,
    maxDelta: readNullableNumber(track.maxDelta),
    maxVelocity: readNullableNumber(track.maxVelocity),
    overshootCount: Math.max(0, Math.floor(readNumber(track.overshootCount, 0))),
    prop: track.prop || "unknown",
    retargetCount: Math.max(0, Math.floor(readNumber(track.retargetCount, 0))),
    sampleCount: Math.max(0, Math.floor(readNumber(track.sampleCount, 0))),
    sourceLabel: track.sourceLabel,
    targetId: track.targetId ?? null,
    timeRangeMs: sanitizeRange(track.timeRangeMs),
    valueRange: sanitizeRange(track.valueRange),
    velocityRange: sanitizeRange(track.velocityRange),
  };
}

function sanitizeValue(value: MotionTraceRecord = {}): MotionFocusedValue {
  return {
    driver: value.driver || "unknown",
    from: value.from ?? null,
    lane: value.lane || "base",
    laneKey: value.laneKey || "default",
    layer: value.layer,
    prop: value.prop || "unknown",
    sourceLabel: value.sourceLabel,
    targetId: value.targetId ?? null,
    targetKind: value.targetKind,
    targetLabel: value.targetLabel,
    to: readNumber(value.to, 0),
    value: readNumber(value.value, 0),
    velocity: readNumber(value.velocity, 0),
  };
}

function sanitizeEvent(event: MotionTraceRecord = {}): MotionFocusedEvent {
  return {
    ...sanitizeValue(event),
    frame: Math.max(0, Math.floor(readNumber(event.frame, 0))),
    reason: event.reason ?? null,
    timeMs: readNumber(event.timeMs, 0),
    type: event.type || "event",
  };
}

function sanitizeWarning(warning: MotionTraceRecord = {}): Readonly<Record<string, unknown>> {
  return {
    laneKey: warning.laneKey ?? null,
    prop: warning.prop ?? null,
    sourceLabel: warning.sourceLabel ?? null,
    targetId: warning.targetId ?? null,
    type: warning.type || "warning",
  };
}

function sanitizeBookmark(bookmark: MotionReplayBookmarkInput | null | undefined = null): MotionFocusedBookmark | null {
  if (!bookmark || typeof bookmark !== "object") return null;
  const startMs = readNumber(bookmark.startMs ?? bookmark.interval?.startMs, NaN);
  const endMs = readNumber(bookmark.endMs ?? bookmark.interval?.endMs, NaN);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return {
    createdAt: readString(bookmark.createdAt, ""),
    endMs: Math.max(startMs, endMs),
    id: readString(bookmark.id, ""),
    label: readString(bookmark.label, `${Math.min(startMs, endMs)}ms..${Math.max(startMs, endMs)}ms`),
    startMs: Math.min(startMs, endMs),
  };
}

function collectUsedTargetIds(frames: readonly MotionFocusedFrame[] = [], events: readonly MotionFocusedEvent[] = []): Set<number | string> {
  const ids = new Set<number | string>();
  for (const frame of frames) {
    for (const value of frame.values || []) if (value.targetId != null) ids.add(value.targetId);
  }
  for (const event of events) if (event.targetId != null) ids.add(event.targetId);
  return ids;
}

function collectUsedTrackKeys(frames: readonly MotionFocusedFrame[] = [], events: readonly MotionFocusedEvent[] = []): Set<string> {
  const keys = new Set<string>();
  for (const frame of frames) {
    for (const value of frame.values || []) keys.add(makeFocusedTrackKey(value));
  }
  for (const event of events) keys.add(makeFocusedTrackKey(event));
  return keys;
}

function summarize(frames: readonly MotionFocusedFrame[] = [], events: readonly MotionFocusedEvent[] = [], targets: readonly object[] = [], tracks: readonly MotionFocusedTrack[] = [], warnings: readonly object[] = []): MotionFocusedDebugExportData["summary"] {
  return {
    eventCount: events.length,
    frameCount: frames.length,
    targetCount: targets.length,
    trackCount: tracks.length,
    valueCount: frames.reduce((total, frame) => total + (frame.values?.length || 0), 0),
    warningCount: warnings.length,
  };
}

function makeContext(trace: MotionReplayTrace, options: MotionFocusedDebugExportOptions, interval: MotionFocusedInterval, selection: MotionFocusedSelection): MotionFocusedDebugExportData["context"] {
  const captureProfile = options.captureProfile || trace.capture?.profile as MotionCaptureProfileLike | null | undefined || null;
  return {
    bookmark: sanitizeBookmark(options.bookmark),
    captureProfile: captureProfile ? normalizeMotionCaptureProfile(captureProfile) : null,
    filters: {
      query: normalizeQuery(options.filters?.query),
    },
    generatedAt: options.generatedAt || new Date().toISOString(),
    interval,
    selection,
    source: {
      generatedAt: trace.generatedAt ?? null,
      mode: trace.mode ?? null,
      schema: trace.schema,
      version: trace.version ?? null,
    },
    visibleTracks: Array.from(normalizeVisibleTrackKeys(options.visibleTracks)),
  };
}

export function createMotionFocusedDebugExport(traceInput: MotionReplayTraceInput = {}, options: MotionFocusedDebugExportOptions = {}) {
  const trace = normalizeMotionReplayTrace(traceInput);
  const interval = normalizeInterval(trace, options);
  const selection = normalizeSelection(options);
  const predicate = createRecordPredicate(trace, options);
  const frames = (trace.timeline?.frames || [])
    .filter((frame) => readNumber(frame.timeMs, 0) >= interval.startMs && readNumber(frame.timeMs, 0) <= interval.endMs)
    .map((frame) => ({
      activeAnimationCount: Math.max(0, Math.floor(readNumber(frame.activeAnimationCount, 0))),
      frame: Math.max(0, Math.floor(readNumber(frame.frame, 0))),
      timeMs: readNumber(frame.timeMs, 0),
      values: (frame.values || [])
        .filter((value) => predicate(value, "sample"))
        .map(sanitizeValue),
    }))
    .filter((frame) => frame.values.length > 0);
  const events = (trace.timeline?.events || [])
    .filter((event) => readNumber(event.timeMs, 0) >= interval.startMs && readNumber(event.timeMs, 0) <= interval.endMs)
    .filter((event) => predicate(event, event.type || "event"))
    .map(sanitizeEvent);
  const usedTargetIds = collectUsedTargetIds(frames, events);
  const usedTrackKeys = collectUsedTrackKeys(frames, events);
  const targets = (trace.targets || [])
    .filter((target) => target?.targetId != null && usedTargetIds.has(target.targetId))
    .map(sanitizeTarget);
  const tracks = (trace.tracks || [])
    .filter((track) => usedTrackKeys.has(readString(track.key, makeTrackKey(track))))
    .map(sanitizeTrack);
  const warnings = (trace.warnings || [])
    .filter((warning) => warning?.targetId != null && usedTargetIds.has(warning.targetId))
    .map(sanitizeWarning);
  const data: MotionFocusedDebugExportData = {
    context: makeContext(trace, options, interval, selection),
    schema: MOTION_FOCUSED_DEBUG_SCHEMA,
    summary: summarize(frames, events, targets, tracks, warnings),
    targets,
    timeline: {
      events,
      frames,
    },
    tracks,
    version: 1,
    warnings,
  };
  return createDiagnosticPresentation(data, {
    formatMarkdown: formatMotionFocusedDebugMarkdown,
    presentation: options.presentation,
  });
}

function formatRecordLine(record: MotionFocusedValue): string {
  const label = record.sourceLabel || record.targetLabel || `target ${record.targetId ?? "unknown"}`;
  return `${label}.${record.prop || "unknown property"} ${record.value} → ${record.to}, velocity=${record.velocity}`;
}

function formatTrackLines(tracks: readonly MotionFocusedTrack[] = []): string {
  if (!tracks.length) return "- None";
  return tracks
    .slice(0, 12)
    .map((track) => `- ${track.sourceLabel || `target ${track.targetId}`}.${track.prop}: samples=${track.sampleCount}, events=${track.eventCount}, lane=${track.lane}/${track.laneKey}`)
    .join("\n");
}

function formatEventLines(events: readonly MotionFocusedEvent[] = []): string {
  if (!events.length) return "- None";
  return events
    .slice(0, 16)
    .map((event) => `- ${event.timeMs}ms ${event.type}: ${formatRecordLine(event)}${event.reason ? `, reason=${event.reason}` : ""}`)
    .join("\n");
}

function formatFrameLines(frames: readonly MotionFocusedFrame[] = []): string {
  if (!frames.length) return "- None";
  return frames
    .slice(0, 8)
    .map((frame) => `- ${frame.timeMs}ms, frame=${frame.frame}: ${frame.values.slice(0, 6).map(formatRecordLine).join(" / ")}`)
    .join("\n");
}

export function formatMotionFocusedDebugMarkdown(data: MotionFocusedDebugExportData): string {
  const context = data.context || {};
  const summary = data.summary || {};
  return [
    "# Pixi Motion focused debug report",
    "",
    `Schema: ${data.schema || MOTION_FOCUSED_DEBUG_SCHEMA}`,
    `Generated at: ${context.generatedAt || "-"}`,
    `Interval: ${context.interval?.startMs ?? 0}ms..${context.interval?.endMs ?? 0}ms`,
    `Bookmark: ${context.bookmark ? `${context.bookmark.label} (${context.bookmark.startMs}ms..${context.bookmark.endMs}ms)` : "None"}`,
    `Selection: ${JSON.stringify(context.selection || {})}`,
    `Capture profile: ${context.captureProfile?.label || context.captureProfile?.id || "None"}`,
    `Filters: ${JSON.stringify(context.filters || {})}`,
    `Visible tracks: ${(context.visibleTracks || []).join(", ") || "All"}`,
    "",
    "## Summary",
    `- Frames / events: ${summary.frameCount || 0}/${summary.eventCount || 0}`,
    `- Tracks / targets: ${summary.trackCount || 0}/${summary.targetCount || 0}`,
    `- Values / warnings: ${summary.valueCount || 0}/${summary.warningCount || 0}`,
    "",
    "## Tracks",
    formatTrackLines(data.tracks || []),
    "",
    "## Events",
    formatEventLines(data.timeline?.events || []),
    "",
    "## Frame samples",
    formatFrameLines(data.timeline?.frames || []),
  ].join("\n");
}
