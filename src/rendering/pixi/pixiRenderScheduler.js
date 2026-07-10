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
  let pendingReasons = [];

  const addPendingReason = (reason) => {
    const normalized = String(reason || "update");
    const wasEmpty = pendingReasons.length === 0;
    if (!pendingReasons.includes(normalized)) pendingReasons.push(normalized);
    return wasEmpty;
  };

  const clearFrame = () => {
    frame = null;
    pendingReasons = [];
  };

  const run = () => {
    frame = null;
    runPendingRender();
  };

  function requestRender(reason = "update") {
    if (destroyed || !canRender()) return false;
    addPendingReason(reason);
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
    return addPendingReason(reason);
  }

  function hasPendingRender() {
    return pendingReasons.length > 0;
  }

  function runPendingRender() {
    const reasons = pendingReasons;
    pendingReasons = [];
    if (destroyed || !canRender() || reasons.length === 0) return false;
    render(reasons);
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
