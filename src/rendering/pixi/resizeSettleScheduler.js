export function createResizeSettleScheduler({
  defaultFrameCount = 3,
  onFrame,
} = {}) {
  if (typeof onFrame !== "function") {
    throw new TypeError("createResizeSettleScheduler requires an onFrame callback");
  }

  let pendingFrames = 0;
  let pendingReason = null;

  function normalizeFrameCount(frameCount) {
    const count = Math.ceil(Number(frameCount));
    if (Number.isFinite(count) && count > 0) return count;
    return Math.max(1, Math.ceil(Number(defaultFrameCount)) || 1);
  }

  function request(reason = "resize-settle", frameCount = defaultFrameCount) {
    const nextFrameCount = normalizeFrameCount(frameCount);
    const wasIdle = pendingFrames <= 0;
    pendingFrames = Math.max(pendingFrames, nextFrameCount);
    pendingReason = reason || pendingReason || "resize-settle";
    return wasIdle;
  }

  function consumeFrame() {
    if (pendingFrames <= 0) return false;
    const reason = pendingReason || "resize-settle";
    pendingFrames -= 1;
    onFrame(reason, {
      remainingFrames: pendingFrames,
    });
    if (pendingFrames <= 0) pendingReason = null;
    return true;
  }

  function reset() {
    pendingFrames = 0;
    pendingReason = null;
  }

  return {
    consumeFrame,
    getPendingFrameCount: () => pendingFrames,
    hasPending: () => pendingFrames > 0,
    request,
    reset,
  };
}
