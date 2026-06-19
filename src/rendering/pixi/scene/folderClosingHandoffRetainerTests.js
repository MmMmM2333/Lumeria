import {
  createFolderClosingHandoffRetainer,
  getRectMaxDelta,
} from "./folderClosingHandoffRetainer.js";

function makeMetrics(delta = 1) {
  return {
    layoutRect: { height: 100, left: 10, top: 20, width: 200 },
    rect: { height: 100 + delta, left: 10 + delta, top: 20, width: 200 },
  };
}

export function runFolderClosingHandoffRetainerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Folder closing handoff retainer test failed] ${message}`);
  };

  assert(getRectMaxDelta(makeMetrics(4).rect, makeMetrics(4).layoutRect) === 4, "rect max delta should report the largest absolute rect difference");
  assert(getRectMaxDelta(null, makeMetrics(4).layoutRect) === Number.POSITIVE_INFINITY, "missing rects should never be treated as settled");

  {
    const retainer = createFolderClosingHandoffRetainer();
    const active = retainer.resolve(makeMetrics(4), "folder-1", { now: 10 });

    assert(active.folderClosingHandoffId === "folder-1", "active prop should resolve to the prop handoff id");
    assert(active.decision.phase === "prop-active", "active prop should record the prop-active phase");
    assert(retainer.retainedFolderId === "folder-1", "active prop should retain the folder id for release");
    assert(retainer.shouldRun({ propFolderClosingHandoffId: "folder-1" }), "active prop should keep the handoff render loop running");
  }

  {
    const retainer = createFolderClosingHandoffRetainer({ settleEpsilon: 0.16, settleFrames: 3 });
    retainer.resolve(makeMetrics(1), "folder-1", { now: 10 });

    const waiting = retainer.resolve(makeMetrics(0.4), null, { now: 20 });
    assert(waiting.folderClosingHandoffId === "folder-1", "unsettled release should keep the retained folder id");
    assert(waiting.decision.phase === "release-wait", "unsettled release should wait");
    assert(waiting.decision.settledFrames === 0, "unsettled release should reset settled frame count");

    retainer.resolve(makeMetrics(0), null, { now: 30 });
    const almostSettled = retainer.resolve(makeMetrics(0), null, { now: 40 });
    assert(almostSettled.folderClosingHandoffId === "folder-1", "release should wait until the configured settle frame count");
    const released = retainer.resolve(makeMetrics(0), null, { now: 50 });

    assert(released.folderClosingHandoffId === null, "settled release should stop retaining the folder id");
    assert(released.decision.phase === "release-commit", "settled release should commit");
    assert(released.decision.reason === "settled", "settled release should record the settled reason");
    assert(released.decision.settledFrames === 3, "settled release should report the settle frame count at commit");
  }

  {
    const retainer = createFolderClosingHandoffRetainer({ postReleaseFrames: 2, releaseFallbackMs: 100, settleFrames: 3 });
    retainer.resolve(makeMetrics(2), "folder-2", { now: 0 });
    const waiting = retainer.resolve(makeMetrics(2), null, { now: 50 });
    assert(waiting.folderClosingHandoffId === "folder-2", "timeout path should retain before the fallback age");

    const released = retainer.resolve(makeMetrics(2), null, { now: 150, timelineDebug: true });
    assert(released.folderClosingHandoffId === null, "timeout release should stop retaining the folder id");
    assert(released.decision.reason === "timeout", "timeout release should record timeout reason");
    assert(retainer.postReleaseFrames === 2, "timeline debug should keep post-release frames");
    assert(retainer.shouldRun({ timelineDebug: true }), "post-release debug frames should keep the handoff loop running");

    const postRelease = retainer.resolve(makeMetrics(2), null, { now: 170 });
    assert(postRelease.decision.phase === "post-release", "post-release frames should publish post-release decisions");
    assert(postRelease.decision.folderId === "folder-2", "post-release decisions should keep the released folder id for debug snapshots");
    retainer.consumePostReleaseFrame(null);
    retainer.consumePostReleaseFrame(null);
    assert(!retainer.shouldRun({ timelineDebug: true }), "consumed post-release frames should stop the debug handoff loop");
  }

  {
    const retainer = createFolderClosingHandoffRetainer();
    retainer.resolve(makeMetrics(0), "folder-3", { now: 0 });
    retainer.reset();

    assert(retainer.retainedFolderId === null, "reset should clear retained folder id");
    assert(retainer.decision === null, "reset should clear the last decision");
    assert(!retainer.shouldRun({}), "reset should stop the handoff loop");
  }
}
