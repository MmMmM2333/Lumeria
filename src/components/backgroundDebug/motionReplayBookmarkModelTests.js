import {
  addMotionReplayBookmark,
  createMotionReplayBookmark,
  MOTION_REPLAY_BOOKMARK_LIMIT,
  normalizeMotionReplayBookmarks,
  removeMotionReplayBookmark,
} from "./motionReplayBookmarkModel.js";

function makeTrace() {
  return {
    schema: "pixi-motion-replay-trace/v1",
    timeline: {
      events: [],
      frames: [
        { frame: 0, timeMs: 0, values: [] },
        { frame: 1, timeMs: 100, values: [] },
      ],
      timeRangeMs: { max: 100, min: 0 },
    },
  };
}

export function runMotionReplayBookmarkModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion replay bookmark model test failed] ${message}`);
  };

  const bookmark = createMotionReplayBookmark({
    endMs: 40,
    filters: { query: " icon " },
    rawTarget: { shouldNotLeak: true },
    selection: {
      kind: "Icon",
      rawTarget: { shouldNotLeak: true },
      sourceLabel: "desktop.icon.node",
      targetId: "7",
    },
    startMs: 80,
    track: {
      lane: " base ",
      laneKey: "layout",
      prop: "x",
      rawTarget: { shouldNotLeak: true },
      sourceLabel: "desktop.icon.node",
      targetId: "7",
    },
  }, {
    createdAt: "2026-06-22T00:00:00.000Z",
    index: 2,
    trace: makeTrace(),
  });
  assert(bookmark.id === "bookmark-3-40-80", "bookmark should get deterministic id from normalized interval");
  assert(bookmark.label === "desktop.icon.node.x 40ms..80ms", "bookmark should derive readable track label");
  assert(bookmark.startMs === 40 && bookmark.endMs === 80, "bookmark should sort interval bounds");
  assert(bookmark.createdAt === "2026-06-22T00:00:00.000Z", "bookmark should preserve createdAt");
  assert(bookmark.filters.query === "icon", "bookmark should normalize filters");
  assert(bookmark.selection.targetId === 7 && bookmark.track.targetId === 7, "bookmark should normalize target ids");
  assert(!JSON.stringify(bookmark).includes("rawTarget"), "bookmark should not retain raw target refs");

  const clamped = createMotionReplayBookmark({ endMs: 999, startMs: -20 }, { trace: makeTrace() });
  assert(clamped.startMs === 0 && clamped.endMs === 100, "bookmark should clamp to trace range when trace is provided");

  const added = addMotionReplayBookmark([bookmark], {
    endMs: 80,
    id: bookmark.id,
    startMs: 40,
  }, {
    trace: makeTrace(),
  });
  assert(added.length === 2, "add should append bookmark");
  assert(added[1].id === `${bookmark.id}-2`, "add should avoid duplicate ids");

  const limited = normalizeMotionReplayBookmarks(Array.from({ length: MOTION_REPLAY_BOOKMARK_LIMIT + 2 }, (_, index) => ({
    endMs: index + 1,
    id: `b-${index}`,
    startMs: index,
  })));
  assert(limited.length === MOTION_REPLAY_BOOKMARK_LIMIT, "normalization should cap bookmark count");
  assert(limited[0].id === "b-2", "normalization should keep most recent bookmarks");

  const removed = removeMotionReplayBookmark(added, bookmark.id);
  assert(removed.length === 1 && removed[0].id !== bookmark.id, "remove should drop matching bookmark id");
}
