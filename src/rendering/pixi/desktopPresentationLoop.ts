import {
  collectRenderInvalidationReasons,
  createRenderInvalidationLedger,
  type RenderInvalidationOptions,
  type RenderInvalidationSnapshot,
} from "./renderInvalidation.js";
import type {
  MotionRenderSignal,
  MotionRenderSignalListener,
  MotionRuntime,
} from "./animation/motionRuntime.js";

export type RenderInvalidationRequest = Readonly<{
  reason: string;
  invalidateGeometry?: boolean;
}>;

export type ResizeSettleReason = "resize" | "window-state-resize";

export type ResizeSettleRequest = Readonly<{
  reason: ResizeSettleReason;
  frames: number;
}>;

export type FolderCloseCommitRequest = Readonly<{
  reason: "folder-close-commit";
}>;

export type DesktopPresentationCommitMode = "animation-frame" | "before-composite";

export type DesktopPresentationCommit = Readonly<{
  deltaSeconds: number;
  frameIntervalMs: number;
  invalidation: RenderInvalidationSnapshot;
  mode: DesktopPresentationCommitMode;
  reasons: readonly string[];
  sequence: number;
  snapDesktopLayout: boolean;
  timestamp: number;
}>;

export type DesktopPresentationLoop = Readonly<{
  dispose(): void;
  flushBeforeComposite(request: FolderCloseCommitRequest): boolean;
  invalidate(request: RenderInvalidationRequest): void;
  requestResizeSettle(request: ResizeSettleRequest): void;
}>;

export type DesktopPresentationFrameClock = Readonly<{
  cancel(frameId: number): void;
  now(): number;
  request(callback: (timestamp: number) => void): number;
}>;

export type DesktopMotionRenderSignalListener = MotionRenderSignalListener;

export type DesktopPresentationMotionRuntime = Pick<
  MotionRuntime,
  | "hasActiveWork"
  | "onRenderSignal"
  | "resumeAutoTicker"
  | "step"
  | "suspendAutoTicker"
>;

export type DesktopPresentationLoopOptions = Readonly<{
  canPresent(): boolean;
  commit(frame: DesktopPresentationCommit): void;
  frameClock: DesktopPresentationFrameClock;
  motionRuntime: DesktopPresentationMotionRuntime;
  onResizeSettleFrame(
    reason: ResizeSettleReason,
    state: Readonly<{ remainingFrames: number }>,
  ): void;
  shouldRunHandoffFrame(): boolean;
}>;

function requireFunction(value: unknown, name: string): asserts value is (...args: never[]) => unknown {
  if (typeof value !== "function") {
    throw new TypeError(`createDesktopPresentationLoop requires ${name}`);
  }
}

export function createDesktopPresentationLoop(
  options: DesktopPresentationLoopOptions,
): DesktopPresentationLoop {
  if (!options || typeof options !== "object") {
    throw new TypeError("createDesktopPresentationLoop requires options");
  }
  requireFunction(options.canPresent, "canPresent");
  requireFunction(options.commit, "commit");
  requireFunction(options.frameClock?.cancel, "frameClock.cancel");
  requireFunction(options.frameClock?.now, "frameClock.now");
  requireFunction(options.frameClock?.request, "frameClock.request");
  requireFunction(options.motionRuntime?.hasActiveWork, "motionRuntime.hasActiveWork");
  requireFunction(options.motionRuntime?.onRenderSignal, "motionRuntime.onRenderSignal");
  requireFunction(options.motionRuntime?.resumeAutoTicker, "motionRuntime.resumeAutoTicker");
  requireFunction(options.motionRuntime?.step, "motionRuntime.step");
  requireFunction(options.motionRuntime?.suspendAutoTicker, "motionRuntime.suspendAutoTicker");
  requireFunction(options.onResizeSettleFrame, "onResizeSettleFrame");
  requireFunction(options.shouldRunHandoffFrame, "shouldRunHandoffFrame");

  const invalidations = createRenderInvalidationLedger();
  let disposed = false;
  let frameEpoch = 0;
  let frameHandle: number | null = null;
  let handoffActive = false;
  let lastFrameTime: number | null = null;
  let pendingResizeFrames = 0;
  let pendingResizeReason: ResizeSettleReason | null = null;
  let presenting = false;
  let resizeSnapPending = false;
  let runningFrame = false;
  let sequence = 0;
  let unsubscribeMotionSignal: (() => void) | null = null;

  function canSchedule(): boolean {
    return !disposed && options.canPresent();
  }

  function shouldSchedule(): boolean {
    return invalidations.hasPending()
      || handoffActive
      || pendingResizeFrames > 0
      || options.motionRuntime.hasActiveWork();
  }

  function scheduleIfNeeded(): void {
    if (!canSchedule() || presenting || runningFrame || frameHandle !== null || !shouldSchedule()) return;
    const epoch = ++frameEpoch;
    frameHandle = options.frameClock.request((timestamp) => runAnimationFrame(epoch, timestamp));
  }

  function cancelScheduledFrame(): void {
    if (frameHandle === null) return;
    const handle = frameHandle;
    frameHandle = null;
    frameEpoch += 1;
    options.frameClock.cancel(handle);
  }

  function commitPendingPresentation(
    mode: DesktopPresentationCommitMode,
    timestamp: number,
    deltaSeconds: number,
    frameIntervalMs: number,
  ): boolean {
    if (!invalidations.hasPending()) return false;
    const invalidation = invalidations.consume();
    presenting = true;
    try {
      options.commit(Object.freeze({
        deltaSeconds,
        frameIntervalMs,
        invalidation,
        mode,
        reasons: collectRenderInvalidationReasons(invalidation),
        sequence: ++sequence,
        snapDesktopLayout: resizeSnapPending,
        timestamp,
      }));
    } finally {
      presenting = false;
    }
    if (invalidation.requiresStructureUpdate) resizeSnapPending = false;
    return true;
  }

  function runAnimationFrame(epoch: number, timestamp: number): void {
    if (disposed || epoch !== frameEpoch) return;
    frameHandle = null;
    if (!options.canPresent()) {
      lastFrameTime = null;
      return;
    }

    runningFrame = true;
    let frameCompleted = false;
    try {
      const frameIntervalMs = lastFrameTime === null ? 0 : Math.max(0, timestamp - lastFrameTime);
      const deltaSeconds = frameIntervalMs / 1000;
      lastFrameTime = timestamp;
      options.motionRuntime.step(deltaSeconds);

      if (pendingResizeFrames > 0 && pendingResizeReason !== null) {
        const reason = pendingResizeReason;
        pendingResizeFrames -= 1;
        options.onResizeSettleFrame(reason, Object.freeze({ remainingFrames: pendingResizeFrames }));
        invalidations.mark(reason, { invalidateGeometry: true });
        resizeSnapPending = true;
        if (pendingResizeFrames === 0) pendingResizeReason = null;
      }

      handoffActive = options.shouldRunHandoffFrame();
      if (handoffActive) invalidations.mark("folder-handoff-loop");

      commitPendingPresentation("animation-frame", timestamp, deltaSeconds, frameIntervalMs);
      frameCompleted = true;
    } finally {
      runningFrame = false;
      if (!frameCompleted) lastFrameTime = null;
      else if (shouldSchedule()) scheduleIfNeeded();
      else lastFrameTime = null;
    }
  }

  function handleMotionRenderSignal(signal: MotionRenderSignal): void {
    if (disposed || !options.canPresent()) return;
    const {
      activeAnimationCount,
      afterFrameFlushes,
      reason,
      writesLastFrame,
    } = signal;
    const normalizedReason = String(reason || "signal").trim() || "signal";
    if (normalizedReason === "frame") {
      if (activeAnimationCount <= 0 && writesLastFrame <= 0 && afterFrameFlushes <= 0) return;
      invalidations.mark("motion-frame");
    } else {
      invalidations.mark(`motion-${normalizedReason}`);
    }
    scheduleIfNeeded();
  }

  function invalidate(request: RenderInvalidationRequest): void {
    if (!request || typeof request.reason !== "string" || !request.reason.trim()) {
      throw new TypeError("Desktop presentation invalidation reason must be a non-empty string");
    }
    if (request.invalidateGeometry !== undefined && typeof request.invalidateGeometry !== "boolean") {
      throw new TypeError("Desktop presentation invalidateGeometry must be boolean when provided");
    }
    if (disposed || !options.canPresent()) return;
    const markOptions: RenderInvalidationOptions = request.invalidateGeometry === true
      ? { invalidateGeometry: true }
      : {};
    invalidations.mark(request.reason, markOptions);
    scheduleIfNeeded();
  }

  function requestResizeSettle(request: ResizeSettleRequest): void {
    if (request?.reason !== "resize" && request?.reason !== "window-state-resize") {
      throw new TypeError("Desktop presentation resize reason must be resize or window-state-resize");
    }
    if (!Number.isInteger(request.frames) || request.frames <= 0) {
      throw new TypeError("Desktop presentation resize frames must be a positive integer");
    }
    if (disposed || !options.canPresent()) return;
    pendingResizeFrames = Math.max(pendingResizeFrames, request.frames);
    pendingResizeReason = request.reason;
    scheduleIfNeeded();
  }

  function flushBeforeComposite(request: FolderCloseCommitRequest): boolean {
    if (request?.reason !== "folder-close-commit") {
      throw new TypeError("Desktop presentation pre-composite reason must be folder-close-commit");
    }
    if (presenting || runningFrame) {
      throw new Error("Desktop presentation pre-composite commits cannot be nested");
    }
    if (disposed || !options.canPresent()) return false;

    invalidations.mark(request.reason);
    const committed = commitPendingPresentation("before-composite", options.frameClock.now(), 0, 0);
    if (shouldSchedule()) {
      scheduleIfNeeded();
    } else {
      cancelScheduledFrame();
      lastFrameTime = null;
    }
    return committed;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    cancelScheduledFrame();
    invalidations.clear();
    handoffActive = false;
    pendingResizeFrames = 0;
    pendingResizeReason = null;
    resizeSnapPending = false;
    unsubscribeMotionSignal?.();
    unsubscribeMotionSignal = null;
    options.motionRuntime.resumeAutoTicker();
  }

  options.motionRuntime.suspendAutoTicker();
  try {
    unsubscribeMotionSignal = options.motionRuntime.onRenderSignal(handleMotionRenderSignal);
    requireFunction(unsubscribeMotionSignal, "motionRuntime render-signal unsubscribe");
    scheduleIfNeeded();
  } catch (error) {
    options.motionRuntime.resumeAutoTicker();
    throw error;
  }

  return Object.freeze({
    dispose,
    flushBeforeComposite,
    invalidate,
    requestResizeSettle,
  });
}
