export function createPixiRenderScheduler({
  cancelAnimationFrame = globalThis.cancelAnimationFrame,
  canRender = () => true,
  render,
  requestAnimationFrame = globalThis.requestAnimationFrame,
} = {}) {
  if (typeof render !== "function") {
    throw new TypeError("createPixiRenderScheduler requires a render function");
  }

  let destroyed = false;
  let frame = null;
  let pendingReason = null;

  const clearFrame = () => {
    frame = null;
    pendingReason = null;
  };

  const run = () => {
    frame = null;
    runPendingRender();
  };

  function requestRender(reason = "update") {
    if (destroyed || !canRender()) return false;
    pendingReason = pendingReason || reason;
    if (frame != null) return false;
    if (typeof requestAnimationFrame === "function") {
      frame = requestAnimationFrame(run);
      return true;
    }
    run();
    return true;
  }

  function markRenderPending(reason = "update") {
    if (destroyed || !canRender()) return false;
    const hadPending = pendingReason != null;
    pendingReason = pendingReason || reason;
    return !hadPending;
  }

  function hasPendingRender() {
    return pendingReason != null;
  }

  function runPendingRender() {
    const reason = pendingReason;
    pendingReason = null;
    if (destroyed || !canRender() || reason == null) return false;
    render(reason);
    return true;
  }

  function cancel() {
    if (frame == null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    clearFrame();
  }

  function destroy() {
    destroyed = true;
    cancel();
  }

  return {
    cancel,
    destroy,
    hasPendingRender,
    isScheduled: () => frame != null,
    markRenderPending,
    requestRender,
    runPendingRender,
  };
}
