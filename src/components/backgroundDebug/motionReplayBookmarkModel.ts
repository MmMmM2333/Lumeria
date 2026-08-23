import type { MotionDebugTargetRef, MotionDebugTrackRef } from "./motionDebugWorkspaceModel.js";

export const MOTION_REPLAY_BOOKMARK_LIMIT = 12;

export interface MotionReplayBookmarkInput extends Readonly<Record<string, unknown>> {
  createdAt?: unknown;
  endMs?: unknown;
  filters?: Readonly<{ query?: unknown }>;
  id?: unknown;
  interval?: Readonly<{ endMs?: unknown; startMs?: unknown }>;
  label?: unknown;
  selection?: unknown;
  startMs?: unknown;
  track?: unknown;
}

export interface MotionReplayBookmark extends Readonly<Record<string, unknown>> {
  createdAt: string;
  endMs: number;
  filters: { query: string };
  id: string;
  label: string;
  selection: MotionDebugTargetRef | null;
  startMs: number;
  track: MotionDebugTrackRef | null;
}

export interface MotionReplayBookmarkOptions {
  createdAt?: string | undefined;
  index?: unknown;
  maxCount?: unknown;
  normalizeTime?: ((timeMs: number) => number) | undefined;
}

interface BookmarkInterval {
  endMs: number;
  startMs: number;
}

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readString(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatTimeLabel(value: unknown): string {
  return `${Math.round(readNumber(value, 0))}ms`;
}

function normalizeBookmarkTime(normalizeTime: ((timeMs: number) => number) | undefined, value: unknown, fallback = 0): number {
  const timeMs = readNumber(value, fallback);
  return typeof normalizeTime === "function" ? normalizeTime(timeMs) : timeMs;
}

function normalizeBookmarkInterval(normalizeTime: ((timeMs: number) => number) | undefined, input: MotionReplayBookmarkInput = {}): BookmarkInterval {
  const startSource = input.startMs ?? input.interval?.startMs ?? 0;
  const endSource = input.endMs ?? input.interval?.endMs ?? startSource;
  const start = normalizeBookmarkTime(normalizeTime, startSource, 0);
  const end = normalizeBookmarkTime(normalizeTime, endSource, start);
  return {
    endMs: Math.max(start, end),
    startMs: Math.min(start, end),
  };
}

function normalizeTargetRef(target: unknown = null): MotionDebugTargetRef | null {
  if (!target || typeof target !== "object") return null;
  const source = target as Readonly<Record<string, unknown>>;
  const normalized: MotionDebugTargetRef = {};
  if (source.targetId != null && Number.isFinite(Number(source.targetId))) normalized.targetId = Number(source.targetId);
  if (source.sourceLabel != null) normalized.sourceLabel = String(source.sourceLabel);
  if (source.label != null) normalized.label = String(source.label);
  if (source.layer != null) normalized.layer = String(source.layer);
  if (source.kind != null) normalized.kind = String(source.kind);
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeTrackRef(track: unknown = null): MotionDebugTrackRef | null {
  if (!track || typeof track !== "object") return null;
  const source = track as Readonly<Record<string, unknown>>;
  const normalized: MotionDebugTrackRef = {
    lane: readString(source.lane, "base"),
    laneKey: readString(source.laneKey, "default"),
    prop: readString(source.prop, "unknown"),
  };
  const target = normalizeTargetRef(track);
  if (target?.targetId != null) normalized.targetId = target.targetId;
  if (target?.sourceLabel != null) normalized.sourceLabel = target.sourceLabel;
  return normalized;
}

function normalizeBookmarkFilters(filters: Readonly<{ query?: unknown }> = {}): { query: string } {
  return {
    query: readString(filters.query, ""),
  };
}

function makeBookmarkId(interval: BookmarkInterval, index: unknown = 0): string {
  return `bookmark-${Math.max(1, Math.floor(readNumber(index, 0)) + 1)}-${Math.round(interval.startMs)}-${Math.round(interval.endMs)}`;
}

function makeBookmarkLabel(interval: BookmarkInterval, input: MotionReplayBookmarkInput = {}): string {
  const track = normalizeTrackRef(input.track);
  const trackLabel = track?.sourceLabel && track?.prop
    ? `${track.sourceLabel}.${track.prop}`
    : "";
  const intervalLabel = `${formatTimeLabel(interval.startMs)}..${formatTimeLabel(interval.endMs)}`;
  return readString(input.label, trackLabel ? `${trackLabel} ${intervalLabel}` : intervalLabel);
}

export function createMotionReplayBookmark(input: MotionReplayBookmarkInput = {}, options: MotionReplayBookmarkOptions = {}): MotionReplayBookmark {
  const interval = normalizeBookmarkInterval(options.normalizeTime, input);
  const index = readNumber(options.index, 0);
  return {
    createdAt: readString(input.createdAt, options.createdAt || ""),
    endMs: interval.endMs,
    filters: normalizeBookmarkFilters(input.filters),
    id: readString(input.id, makeBookmarkId(interval, index)),
    label: makeBookmarkLabel(interval, input),
    selection: normalizeTargetRef(input.selection),
    startMs: interval.startMs,
    track: normalizeTrackRef(input.track),
  };
}

export function normalizeMotionReplayBookmarks(bookmarks: readonly MotionReplayBookmarkInput[] = [], options: MotionReplayBookmarkOptions = {}): MotionReplayBookmark[] {
  const maxCount = Math.max(1, Math.floor(readNumber(options.maxCount, MOTION_REPLAY_BOOKMARK_LIMIT)));
  const normalized: MotionReplayBookmark[] = [];
  const seen = new Set<string>();
  for (const [index, bookmark] of (Array.isArray(bookmarks) ? bookmarks : []).entries()) {
    const next = createMotionReplayBookmark(bookmark, {
      createdAt: options.createdAt,
      index,
      normalizeTime: options.normalizeTime,
    });
    if (!next.id || seen.has(next.id)) continue;
    seen.add(next.id);
    normalized.push(next);
  }
  return normalized.slice(-maxCount);
}

export function addMotionReplayBookmark(bookmarks: readonly MotionReplayBookmarkInput[] = [], input: MotionReplayBookmarkInput = {}, options: MotionReplayBookmarkOptions = {}): MotionReplayBookmark[] {
  const current = normalizeMotionReplayBookmarks(bookmarks, options);
  const usedIds = new Set(current.map((bookmark) => bookmark.id));
  const next = createMotionReplayBookmark(input, {
    createdAt: options.createdAt,
    index: current.length,
    normalizeTime: options.normalizeTime,
  });
  const baseId = next.id;
  let suffix = 2;
  while (usedIds.has(next.id)) {
    next.id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const maxCount = Math.max(1, Math.floor(readNumber(options.maxCount, MOTION_REPLAY_BOOKMARK_LIMIT)));
  return [...current, next].slice(-maxCount);
}

export function removeMotionReplayBookmark(bookmarks: readonly MotionReplayBookmarkInput[] = [], id: unknown): MotionReplayBookmark[] {
  const bookmarkId = readString(id);
  if (!bookmarkId) return normalizeMotionReplayBookmarks(bookmarks);
  return normalizeMotionReplayBookmarks(bookmarks).filter((bookmark) => bookmark.id !== bookmarkId);
}
