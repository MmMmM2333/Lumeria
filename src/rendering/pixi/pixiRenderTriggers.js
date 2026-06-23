const MOTION_RENDER_EVENT_TYPES = new Set([
  "arrive",
  "cancel",
  "complete",
  "debugConfig",
  "release",
  "retarget",
  "settle",
  "snap",
  "start",
]);

function readPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function shouldRequestRenderForMotionEvent(event) {
  if (!event || typeof event !== "object") return false;
  if (event.type === "sample" || event.type === "targetMetadata") return false;
  if (event.type === "frame") {
    return Boolean(
      readPositiveNumber(event.activeAnimationCount) ||
      readPositiveNumber(event.afterFrameFlushes) ||
      readPositiveNumber(event.writesLastFrame)
    );
  }
  return MOTION_RENDER_EVENT_TYPES.has(event.type);
}

export function createMotionRenderObserver(requestRender) {
  return (event) => {
    if (!shouldRequestRenderForMotionEvent(event)) return;
    requestRender(`motion-${event.type || "event"}`);
  };
}

export function makeIconActionRenderReason(action) {
  return `icon-${action || "action"}`;
}

export function makeFolderInternalActivityRenderReason(active) {
  return active ? "folder-internal-active" : "folder-internal-idle";
}
