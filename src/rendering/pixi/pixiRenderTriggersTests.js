import {
  makeFolderInternalActivityRenderReason,
  makeIconActionRenderReason,
  shouldRequestRenderForMotionEvent,
} from "./pixiRenderTriggers.js";

export function runPixiRenderTriggersTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi render triggers test failed] ${message}`);
  };

  assert(shouldRequestRenderForMotionEvent({ type: "start" }), "motion start should request render");
  assert(shouldRequestRenderForMotionEvent({ type: "complete" }), "motion complete should request render");
  assert(shouldRequestRenderForMotionEvent({ type: "debugConfig" }), "debug config changes should request render");
  assert(!shouldRequestRenderForMotionEvent({ type: "targetMetadata" }), "target metadata should not repaint");
  assert(!shouldRequestRenderForMotionEvent({ type: "sample" }), "heavy samples should not repaint separately");
  assert(!shouldRequestRenderForMotionEvent({ type: "frame", activeAnimationCount: 0, afterFrameFlushes: 0, writesLastFrame: 0 }), "idle frame should not request render");
  assert(shouldRequestRenderForMotionEvent({ type: "frame", activeAnimationCount: 1 }), "active animation frame should request render");
  assert(shouldRequestRenderForMotionEvent({ type: "frame", writesLastFrame: 2 }), "written frame should request render");
  assert(shouldRequestRenderForMotionEvent({ type: "frame", afterFrameFlushes: 1 }), "afterFrame flush should request render");

  assert(makeIconActionRenderReason("pointerdown") === "icon-pointerdown", "pointer press should map to an icon render reason");
  assert(makeIconActionRenderReason("context-menu") === "icon-context-menu", "context menu should map to an icon render reason");
  assert(makeIconActionRenderReason("") === "icon-action", "unknown icon action should keep a stable render reason");
  assert(makeFolderInternalActivityRenderReason(true) === "folder-internal-active", "active folder lifecycle should map to an active render reason");
  assert(makeFolderInternalActivityRenderReason(false) === "folder-internal-idle", "idle folder lifecycle should map to an idle render reason");
}
