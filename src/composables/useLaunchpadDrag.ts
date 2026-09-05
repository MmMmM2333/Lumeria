import { nextTick, type Ref } from "vue";
import { createLaunchpadDrag, type LaunchpadDragOptions } from "../application/launchpadDrag.js";
import type { StateCell } from "../application/stateHost.js";
import { vueStateHost } from "./vueStateHost.js";
export { isPrimaryPointerStartEvent, isPrimaryPointerMoveEvent, isSamePointerEvent, isPrimaryPointerReleaseEvent, shouldFinishDragForPointerEvent, samplePointerVelocity } from "../application/launchpadDrag.js";
export type { LaunchpadDragPoint, LaunchpadDragRect, LaunchpadDragVisualState, LaunchpadDragEventTarget, LaunchpadDragPointerEvent, LaunchpadDragBatchPayload, LaunchpadDragPayload, LaunchpadDragIntent, LaunchpadDragAcceptedPlan, LaunchpadDragRejectedPlan, LaunchpadDragPlan, LaunchpadDragPlannerAcceptedResult, LaunchpadDragPlannerRejectedResult, LaunchpadDragPlannerResult, LaunchpadDragPlanRequest, LaunchpadDragOperation, LaunchpadDragSource, StartCommittedGroupTransferRequest, CompleteGroupReleaseResult, LaunchpadDragOptions, LaunchpadDragGroup, LaunchpadDragMeta, LaunchpadDragFolderHoverState, LaunchpadDragHitDebugState, LaunchpadGroupDragState } from "../application/launchpadDrag.js";
export function useLaunchpadDrag(options: LaunchpadDragOptions) {
  const drag = createLaunchpadDrag(options, vueStateHost, {
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: handle => window.clearTimeout(handle),
    requestAnimationFrame: callback => window.requestAnimationFrame(callback),
    cancelAnimationFrame: handle => window.cancelAnimationFrame(handle),
    addEventListener: (type, listener, capture) => window.addEventListener(type, listener, capture),
    removeEventListener: (type, listener, capture) => window.removeEventListener(type, listener, capture),
    afterCommit: callback => { void nextTick(callback); },
  });
  return drag as unknown as {
    [Key in keyof typeof drag]: (typeof drag)[Key] extends StateCell<infer Value> ? Ref<Value> : (typeof drag)[Key];
  };
}
export type LaunchpadDragControls = ReturnType<typeof useLaunchpadDrag>;
