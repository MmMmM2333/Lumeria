export const DEFAULT_FOLDER_CLOSING_HANDOFF_RETAIN_CONFIG = Object.freeze({
  postReleaseFrames: 8,
  releaseFallbackMs: 900,
  settleEpsilon: 0.16,
  settleFrames: 3,
});

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getRectMaxDelta(rect, layoutRect) {
  if (!rect || !layoutRect) return Number.POSITIVE_INFINITY;
  return Math.max(
    Math.abs((rect.left || 0) - (layoutRect.left || 0)),
    Math.abs((rect.top || 0) - (layoutRect.top || 0)),
    Math.abs((rect.width || 0) - (layoutRect.width || 0)),
    Math.abs((rect.height || 0) - (layoutRect.height || 0))
  );
}

export function createFolderClosingHandoffRetainer(config = {}) {
  const retainConfig = {
    ...DEFAULT_FOLDER_CLOSING_HANDOFF_RETAIN_CONFIG,
    ...config,
  };
  let retainedFolderId = null;
  let releaseStartedAt = null;
  let settledFrameCount = 0;
  let postReleaseFrameCount = 0;
  let decision = null;
  let lastReleaseCommitAt = 0;
  let lastReleasedFolderId = null;

  function reset() {
    retainedFolderId = null;
    releaseStartedAt = null;
    settledFrameCount = 0;
    postReleaseFrameCount = 0;
    decision = null;
    lastReleaseCommitAt = 0;
    lastReleasedFolderId = null;
  }

  function resolve(metrics = {}, propFolderId = null, options = {}) {
    const now = safeNumber(options.now);
    const rectMaxDelta = getRectMaxDelta(metrics.rect, metrics.layoutRect);
    if (propFolderId) {
      retainedFolderId = propFolderId;
      releaseStartedAt = null;
      settledFrameCount = 0;
      postReleaseFrameCount = 0;
      decision = {
        folderId: propFolderId,
        phase: "prop-active",
        rectMaxDelta,
        releaseAge: 0,
        reason: null,
        settledFrames: settledFrameCount,
      };
      return { decision, folderClosingHandoffId: propFolderId };
    }

    if (!retainedFolderId) {
      decision = postReleaseFrameCount > 0
        ? {
            folderId: lastReleasedFolderId,
            phase: "post-release",
            rectMaxDelta,
            releaseAge: lastReleaseCommitAt ? now - lastReleaseCommitAt : 0,
            reason: null,
            settledFrames: settledFrameCount,
          }
        : { folderId: null, phase: "idle", rectMaxDelta, releaseAge: 0, reason: null, settledFrames: 0 };
      return { decision, folderClosingHandoffId: null };
    }

    if (releaseStartedAt == null) releaseStartedAt = now;
    const isSettled = rectMaxDelta <= retainConfig.settleEpsilon;
    settledFrameCount = isSettled ? settledFrameCount + 1 : 0;
    const didSettle = settledFrameCount >= retainConfig.settleFrames;
    const releaseAge = now - releaseStartedAt;
    const didTimeout = releaseAge >= retainConfig.releaseFallbackMs;
    if (!didSettle && !didTimeout) {
      decision = {
        folderId: retainedFolderId,
        phase: "release-wait",
        rectMaxDelta,
        releaseAge,
        reason: null,
        settledFrames: settledFrameCount,
      };
      return { decision, folderClosingHandoffId: retainedFolderId };
    }

    const releasedFolderId = retainedFolderId;
    const settledFramesAtDecision = settledFrameCount;
    retainedFolderId = null;
    releaseStartedAt = null;
    settledFrameCount = 0;
    lastReleasedFolderId = releasedFolderId;
    lastReleaseCommitAt = now;
    if (options.timelineDebug) postReleaseFrameCount = retainConfig.postReleaseFrames;
    decision = {
      folderId: releasedFolderId,
      phase: "release-commit",
      rectMaxDelta,
      releaseAge,
      reason: didSettle ? "settled" : "timeout",
      settledFrames: settledFramesAtDecision,
    };
    return { decision, folderClosingHandoffId: null };
  }

  function consumePostReleaseFrame(folderClosingHandoffId = null) {
    if (!folderClosingHandoffId && postReleaseFrameCount > 0) postReleaseFrameCount -= 1;
  }

  function shouldRun(options = {}) {
    return Boolean(
      options.propFolderClosingHandoffId ||
        retainedFolderId ||
        (options.timelineDebug && postReleaseFrameCount > 0)
    );
  }

  return {
    consumePostReleaseFrame,
    reset,
    resolve,
    shouldRun,
    get decision() {
      return decision;
    },
    get postReleaseFrames() {
      return postReleaseFrameCount;
    },
    get retainedFolderId() {
      return retainedFolderId;
    },
    get settledFrameCount() {
      return settledFrameCount;
    },
  };
}
