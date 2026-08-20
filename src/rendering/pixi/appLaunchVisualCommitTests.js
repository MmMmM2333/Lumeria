import { createAppLaunchVisualCommitTracker } from "./appLaunchVisualCommit.js";

function createFrameScheduler() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    cancel(id) {
      callbacks.delete(id);
    },
    get size() {
      return callbacks.size;
    },
    request(callback) {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
    runNext() {
      const next = callbacks.entries().next().value;
      if (!next) return false;
      const [id, callback] = next;
      callbacks.delete(id);
      callback();
      return true;
    },
  };
}

const OPEN_VISUAL = Object.freeze({
  desktopAlpha: 1,
  desktopScale: 1,
  folderAlpha: 1,
  folderScale: 1,
});

const CLOSE_TARGET = Object.freeze({
  desktopAlpha: 0,
  desktopScale: 1.08,
  folderAlpha: 0,
  folderScale: 1.08,
});

export function runAppLaunchVisualCommitTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[App launch visual commit test failed] ${message}`);
  };

  const frames = createFrameScheduler();
  const commits = [];
  let currentSessionId = 1;
  const tracker = createAppLaunchVisualCommitTracker({
    cancelAnimationFrame: (id) => frames.cancel(id),
    getCurrentSessionId: () => currentSessionId,
    onCommit: (sessionId) => commits.push(sessionId),
    requestAnimationFrame: (callback) => frames.request(callback),
  });

  tracker.beforeRender({
    scope: "desktop",
    sessionId: 1,
    snapshot: OPEN_VISUAL,
    target: CLOSE_TARGET,
  });
  tracker.afterRender({ sessionId: 1, snapshot: OPEN_VISUAL });
  assert(frames.size === 0, "setting close targets without visible progress should not release native launch");

  tracker.afterRender({
    sessionId: 1,
    snapshot: { ...OPEN_VISUAL, folderAlpha: 0.96, folderScale: 1.004 },
  });
  assert(
    frames.size === 0,
    "an inactive folder layer must not release a launch that is closing the desktop",
  );

  tracker.beforeRender({
    scope: "desktop",
    sessionId: 1,
    snapshot: OPEN_VISUAL,
    target: CLOSE_TARGET,
  });
  tracker.afterRender({
    sessionId: 1,
    snapshot: { ...OPEN_VISUAL, desktopAlpha: 0.96, desktopScale: 1.004 },
  });
  assert(frames.size === 1, "visible close progress should schedule one presentation-frame acknowledgement");
  assert(commits.length === 0, "GPU submission should not commit before the browser gets a presentation opportunity");
  frames.runNext();
  assert(commits.join(",") === "1", "the presentation frame should commit the current launch session");

  tracker.afterRender({
    sessionId: 1,
    snapshot: { ...OPEN_VISUAL, desktopAlpha: 0.8, desktopScale: 1.02 },
  });
  assert(frames.size === 0 && commits.length === 1, "a committed session should not acknowledge more than once");

  currentSessionId = 2;
  const folderBaseline = {
    desktopAlpha: 0,
    desktopScale: 0.92,
    folderAlpha: 1,
    folderScale: 1,
  };
  tracker.beforeRender({
    scope: "folder",
    sessionId: 2,
    snapshot: folderBaseline,
    target: CLOSE_TARGET,
  });
  tracker.afterRender({
    sessionId: 2,
    snapshot: { ...folderBaseline, folderAlpha: 0.94, folderScale: 1.006 },
  });
  assert(frames.size === 1, "folder-only close progress should satisfy the same visual commit barrier");
  currentSessionId = 3;
  frames.runNext();
  assert(commits.length === 1, "a presentation callback should reject a session that became stale");

  tracker.beforeRender({
    scope: "desktop",
    sessionId: 3,
    snapshot: OPEN_VISUAL,
    target: CLOSE_TARGET,
  });
  tracker.afterRender({ sessionId: 3, snapshot: CLOSE_TARGET });
  assert(frames.size === 1, "a reduced-motion snap should still schedule a presentation acknowledgement");
  frames.runNext();
  assert(commits.join(",") === "1,3", "a snapped close should commit after its presentation frame");

  tracker.destroy();
}
