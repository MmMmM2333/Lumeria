export const MOTION_REPLAY_BOOKMARK_LIMIT = 12;

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatTimeLabel(value) {
  return `${Math.round(readNumber(value, 0))}ms`;
}

function normalizeBookmarkTime(normalizeTime, value, fallback = 0) {
  const timeMs = readNumber(value, fallback);
  return typeof normalizeTime === "function" ? normalizeTime(timeMs) : timeMs;
}

function normalizeBookmarkInterval(normalizeTime, input = {}) {
  const startSource = input.startMs ?? input.interval?.startMs ?? 0;
  const endSource = input.endMs ?? input.interval?.endMs ?? startSource;
  const start = normalizeBookmarkTime(normalizeTime, startSource, 0);
  const end = normalizeBookmarkTime(normalizeTime, endSource, start);
  return {
    endMs: Math.max(start, end),
    startMs: Math.min(start, end),
  };
}

function normalizeTargetRef(target = null) {
  if (!target || typeof target !== "object") return null;
  const normalized = {};
  if (target.targetId != null && Number.isFinite(Number(target.targetId))) normalized.targetId = Number(target.targetId);
  if (target.sourceLabel != null) normalized.sourceLabel = String(target.sourceLabel);
  if (target.label != null) normalized.label = String(target.label);
  if (target.layer != null) normalized.layer = String(target.layer);
  if (target.kind != null) normalized.kind = String(target.kind);
  return Object.keys(normalized).length ? normalized : null;
}

function normalizeTrackRef(track = null) {
  if (!track || typeof track !== "object") return null;
  const normalized = {
    lane: readString(track.lane, "base"),
    laneKey: readString(track.laneKey, "default"),
    prop: readString(track.prop, "unknown"),
  };
  const target = normalizeTargetRef(track);
  if (target?.targetId != null) normalized.targetId = target.targetId;
  if (target?.sourceLabel != null) normalized.sourceLabel = target.sourceLabel;
  return normalized;
}

function normalizeBookmarkFilters(filters = {}) {
  return {
    query: readString(filters.query, ""),
  };
}

function makeBookmarkId(interval, index = 0) {
  return `bookmark-${Math.max(1, Math.floor(readNumber(index, 0)) + 1)}-${Math.round(interval.startMs)}-${Math.round(interval.endMs)}`;
}

function makeBookmarkLabel(interval, input = {}) {
  const track = normalizeTrackRef(input.track);
  const trackLabel = track?.sourceLabel && track?.prop
    ? `${track.sourceLabel}.${track.prop}`
    : "";
  const intervalLabel = `${formatTimeLabel(interval.startMs)}..${formatTimeLabel(interval.endMs)}`;
  return readString(input.label, trackLabel ? `${trackLabel} ${intervalLabel}` : intervalLabel);
}

export function createMotionReplayBookmark(input = {}, options = {}) {
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

export function normalizeMotionReplayBookmarks(bookmarks = [], options = {}) {
  const maxCount = Math.max(1, Math.floor(readNumber(options.maxCount, MOTION_REPLAY_BOOKMARK_LIMIT)));
  const normalized = [];
  const seen = new Set();
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

export function addMotionReplayBookmark(bookmarks = [], input = {}, options = {}) {
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

export function removeMotionReplayBookmark(bookmarks = [], id) {
  const bookmarkId = readString(id);
  if (!bookmarkId) return normalizeMotionReplayBookmarks(bookmarks);
  return normalizeMotionReplayBookmarks(bookmarks).filter((bookmark) => bookmark.id !== bookmarkId);
}
