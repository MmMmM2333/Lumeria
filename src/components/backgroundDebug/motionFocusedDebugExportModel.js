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
} from "../../rendering/pixi/animation/motionTraceShared.js";

export const MOTION_FOCUSED_DEBUG_SCHEMA = "pixi-motion-focused-debug/v1";

function readString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeInterval(trace = {}, options = {}) {
  const range = getMotionReplayTimeRange(trace);
  const start = normalizeMotionReplayTime(trace, options.startMs ?? options.interval?.startMs ?? range.min);
  const end = normalizeMotionReplayTime(trace, options.endMs ?? options.interval?.endMs ?? range.max);
  return {
    endMs: Math.max(start, end),
    startMs: Math.min(start, end),
  };
}

function normalizeSelection(options = {}) {
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

function normalizeVisibleTrackKeys(visibleTracks = []) {
  const keys = new Set();
  for (const track of Array.isArray(visibleTracks) ? visibleTracks : []) {
    if (typeof track === "string") {
      const key = readString(track);
      if (key) keys.add(key);
      continue;
    }
    if (!track || typeof track !== "object") continue;
    keys.add(readString(track.key, makeTrackKey(track)));
  }
  return keys;
}

function hasSelectionFilter(selection = {}) {
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

function targetMatchesSelection(record = {}, target = {}, selection = {}) {
  if (selection.targetId != null && String(record.targetId ?? target.targetId) !== String(selection.targetId)) return false;
  if (selection.sourceLabel && record.sourceLabel !== selection.sourceLabel && target.sourceLabel !== selection.sourceLabel) return false;
  if (selection.label && record.targetLabel !== selection.label && record.label !== selection.label && target.label !== selection.label) return false;
  if (selection.layer && record.layer !== selection.layer && target.layer !== selection.layer) return false;
  if (selection.kind && record.targetKind !== selection.kind && record.kind !== selection.kind && target.kind !== selection.kind) return false;
  return true;
}

function trackMatchesSelection(record = {}, selection = {}) {
  if (selection.prop && record.prop !== selection.prop) return false;
  if (selection.lane && record.lane !== selection.lane) return false;
  if (selection.laneKey && record.laneKey !== selection.laneKey) return false;
  return true;
}

function createRecordPredicate(trace = {}, options = {}) {
  const targetsById = makeTargetsById(trace);
  const selection = normalizeSelection(options);
  const query = normalizeQuery(options.filters?.query);
  const visibleTrackKeys = normalizeVisibleTrackKeys(options.visibleTracks);
  const profileSource = options.captureProfile || trace.capture?.profile || null;
  const profile = profileSource ? normalizeMotionCaptureProfile(profileSource) : null;
  return (record = {}, type = "sample") => {
    const target = record.targetId != null ? targetsById.get(record.targetId) : {};
    const recordWithType = { type, ...record };
    if (hasSelectionFilter(selection) && !targetMatchesSelection(recordWithType, target, selection)) return false;
    if (!trackMatchesSelection(recordWithType, selection)) return false;
    if (visibleTrackKeys.size && !visibleTrackKeys.has(makeTrackKey(recordWithType))) return false;
    if (query && !collectRecordText(recordWithType, targetsById, { includeLayer: true, includeTargetLayer: true }).includes(query)) return false;
    if (profile && !matchesMotionCaptureProfileRecord(recordWithType, profile)) return false;
    return true;
  };
}

function sanitizeTarget(target = {}) {
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

function sanitizeTrack(track = {}) {
  return {
    driver: track.driver || "unknown",
    eventCount: Math.max(0, Math.floor(readNumber(track.eventCount, 0))),
    key: track.key || makeTrackKey(track),
    lane: track.lane || "base",
    laneKey: track.laneKey || "default",
    layer: track.layer,
    maxDelta: track.maxDelta ?? null,
    maxVelocity: track.maxVelocity ?? null,
    overshootCount: Math.max(0, Math.floor(readNumber(track.overshootCount, 0))),
    prop: track.prop || "unknown",
    retargetCount: Math.max(0, Math.floor(readNumber(track.retargetCount, 0))),
    sampleCount: Math.max(0, Math.floor(readNumber(track.sampleCount, 0))),
    sourceLabel: track.sourceLabel,
    targetId: track.targetId ?? null,
    timeRangeMs: track.timeRangeMs || { max: null, min: null },
    valueRange: track.valueRange || { max: null, min: null },
    velocityRange: track.velocityRange || { max: null, min: null },
  };
}

function sanitizeValue(value = {}) {
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

function sanitizeEvent(event = {}) {
  return {
    ...sanitizeValue(event),
    frame: Math.max(0, Math.floor(readNumber(event.frame, 0))),
    reason: event.reason ?? null,
    timeMs: readNumber(event.timeMs, 0),
    type: event.type || "event",
  };
}

function sanitizeWarning(warning = {}) {
  return {
    laneKey: warning.laneKey ?? null,
    prop: warning.prop ?? null,
    sourceLabel: warning.sourceLabel ?? null,
    targetId: warning.targetId ?? null,
    type: warning.type || "warning",
  };
}

function sanitizeBookmark(bookmark = null) {
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

function collectUsedTargetIds(frames = [], events = []) {
  const ids = new Set();
  for (const frame of frames) {
    for (const value of frame.values || []) if (value.targetId != null) ids.add(value.targetId);
  }
  for (const event of events) if (event.targetId != null) ids.add(event.targetId);
  return ids;
}

function collectUsedTrackKeys(frames = [], events = []) {
  const keys = new Set();
  for (const frame of frames) {
    for (const value of frame.values || []) keys.add(makeTrackKey(value));
  }
  for (const event of events) keys.add(makeTrackKey(event));
  return keys;
}

function summarize(frames = [], events = [], targets = [], tracks = [], warnings = []) {
  return {
    eventCount: events.length,
    frameCount: frames.length,
    targetCount: targets.length,
    trackCount: tracks.length,
    valueCount: frames.reduce((total, frame) => total + (frame.values?.length || 0), 0),
    warningCount: warnings.length,
  };
}

function makeContext(trace = {}, options = {}, interval, selection) {
  const captureProfile = options.captureProfile || trace.capture?.profile || null;
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

export function createMotionFocusedDebugExport(traceInput = {}, options = {}) {
  const trace = normalizeMotionReplayTrace(traceInput);
  const interval = normalizeInterval(trace, options);
  const selection = normalizeSelection(options);
  const predicate = createRecordPredicate(trace, options);
  const frames = (trace.timeline?.frames || [])
    .filter((frame) => frame.timeMs >= interval.startMs && frame.timeMs <= interval.endMs)
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
    .filter((event) => event.timeMs >= interval.startMs && event.timeMs <= interval.endMs)
    .filter((event) => predicate(event, event.type || "event"))
    .map(sanitizeEvent);
  const usedTargetIds = collectUsedTargetIds(frames, events);
  const usedTrackKeys = collectUsedTrackKeys(frames, events);
  const targets = (trace.targets || [])
    .filter((target) => target?.targetId != null && usedTargetIds.has(target.targetId))
    .map(sanitizeTarget);
  const tracks = (trace.tracks || [])
    .filter((track) => usedTrackKeys.has(track.key || makeTrackKey(track)))
    .map(sanitizeTrack);
  const warnings = (trace.warnings || [])
    .filter((warning) => warning?.targetId != null && usedTargetIds.has(warning.targetId))
    .map(sanitizeWarning);
  const data = {
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

function formatRecordLine(record = {}) {
  const label = record.sourceLabel || record.targetLabel || `target ${record.targetId ?? "unknown"}`;
  return `${label}.${record.prop || "unknown property"} ${record.value} → ${record.to}, velocity=${record.velocity}`;
}

function formatTrackLines(tracks = []) {
  if (!tracks.length) return "- None";
  return tracks
    .slice(0, 12)
    .map((track) => `- ${track.sourceLabel || `target ${track.targetId}`}.${track.prop}: samples=${track.sampleCount}, events=${track.eventCount}, lane=${track.lane}/${track.laneKey}`)
    .join("\n");
}

function formatEventLines(events = []) {
  if (!events.length) return "- None";
  return events
    .slice(0, 16)
    .map((event) => `- ${event.timeMs}ms ${event.type}: ${formatRecordLine(event)}${event.reason ? `, reason=${event.reason}` : ""}`)
    .join("\n");
}

function formatFrameLines(frames = []) {
  if (!frames.length) return "- None";
  return frames
    .slice(0, 8)
    .map((frame) => `- ${frame.timeMs}ms, frame=${frame.frame}: ${frame.values.slice(0, 6).map(formatRecordLine).join(" / ")}`)
    .join("\n");
}

export function formatMotionFocusedDebugMarkdown(data = {}) {
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
