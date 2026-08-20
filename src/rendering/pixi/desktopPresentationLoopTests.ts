import {
  createDesktopPresentationLoop,
  type DesktopMotionRenderSignalListener,
} from "./desktopPresentationLoop.js";

type FrameCallback = (timestamp: number) => void;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[Desktop presentation loop test failed] ${message}`);
}

function assertThrows(callback: () => void, message: string): void {
  let threw = false;
  try {
    callback();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

function createFrameClock() {
  let currentTime = 0;
  let nextId = 0;
  const callbacks = new Map<number, FrameCallback>();

  return {
    cancel(id: number) {
      callbacks.delete(id);
    },
    getPendingCount() {
      return callbacks.size;
    },
    now() {
      return currentTime;
    },
    peekNextCallback() {
      const callback = callbacks.values().next().value as FrameCallback | undefined;
      assert(callback, "a frame callback should be pending");
      return callback;
    },
    request(callback: FrameCallback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    runNext(timestamp = currentTime + 16) {
      const entry = callbacks.entries().next().value as [number, FrameCallback] | undefined;
      assert(entry, "a frame should be pending");
      callbacks.delete(entry[0]);
      currentTime = timestamp;
      entry[1](timestamp);
    },
  };
}

function createMotionRuntime({
  active = () => false,
  onStep = () => {},
}: Readonly<{
  active?: () => boolean;
  onStep?: (deltaSeconds: number) => void;
}> = {}) {
  const listeners = new Set<DesktopMotionRenderSignalListener>();
  let resumeCount = 0;
  let suspendCount = 0;
  return {
    emit({
      activeAnimationCount = 0,
      afterFrameFlushes = 0,
      frame = 0,
      reason,
      timeMs = 0,
      writesLastFrame = 0,
    }: Readonly<{
      activeAnimationCount?: number;
      afterFrameFlushes?: number;
      frame?: number;
      reason: string;
      timeMs?: number;
      writesLastFrame?: number;
    }>) {
      for (const listener of listeners) {
        listener(activeAnimationCount, writesLastFrame, afterFrameFlushes, reason, frame, timeMs);
      }
    },
    hasActiveWork: active,
    getListenerCount: () => listeners.size,
    getResumeCount: () => resumeCount,
    getSuspendCount: () => suspendCount,
    onRenderSignal(listener: DesktopMotionRenderSignalListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resumeAutoTicker() {
      resumeCount += 1;
    },
    step: onStep,
    suspendAutoTicker() {
      suspendCount += 1;
    },
  };
}

export function runDesktopPresentationLoopTests() {
  {
    const clock = createFrameClock();
    const commits: unknown[] = [];
    const loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: (frame) => commits.push(frame),
      frameClock: clock,
      motionRuntime: createMotionRuntime(),
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    });

    loop.invalidate({ reason: "desktop-update" });
    assert(clock.getPendingCount() === 1, "one invalidation should schedule one RAF");
    clock.runNext(16);
    assert(commits.length === 1, "the scheduled frame should commit once");
    assert(
      (commits[0] as { reasons: readonly string[] }).reasons.join(",") === "desktop-update",
      "the commit should expose the consumed invalidation reason",
    );
    assert(clock.getPendingCount() === 0, "an idle loop should not keep scheduling frames");
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    const order: string[] = [];
    const frames: Array<{ snapDesktopLayout: boolean; structure: boolean }> = [];
    const loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: (frame) => {
        order.push("commit");
        frames.push({
          snapDesktopLayout: frame.snapDesktopLayout,
          structure: frame.invalidation.requiresStructureUpdate,
        });
      },
      frameClock: clock,
      motionRuntime: createMotionRuntime({ onStep: () => order.push("motion") }),
      onResizeSettleFrame: () => order.push("resize"),
      shouldRunHandoffFrame: () => false,
    });

    loop.requestResizeSettle({ frames: 3, reason: "resize" });
    clock.runNext(16);
    clock.runNext(32);
    clock.runNext(48);
    assert(order.join(",") === "motion,resize,commit,motion,resize,commit,motion,resize,commit", "resize frames should run after motion and before commit");
    assert(frames.length === 3, "a three-frame resize request should produce three commits");
    assert(frames.every((frame) => frame.snapDesktopLayout), "every resize settle frame should snap desktop layout");
    assert(frames.every((frame) => frame.structure), "resize settling should invalidate geometry");
    assert(clock.getPendingCount() === 0, "resize settling should stop after its requested frames");
    loop.invalidate({ reason: "visual-watch" });
    clock.runNext(64);
    assert(frames.at(-1)?.snapDesktopLayout === false, "a successful structural commit should release resize snapping");
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    const resizeReasons: string[] = [];
    let commits = 0;
    const loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: () => { commits += 1; },
      frameClock: clock,
      motionRuntime: createMotionRuntime(),
      onResizeSettleFrame: (reason) => resizeReasons.push(reason),
      shouldRunHandoffFrame: () => false,
    });

    loop.requestResizeSettle({ frames: 3, reason: "resize" });
    clock.runNext(16);
    loop.requestResizeSettle({ frames: 12, reason: "window-state-resize" });
    for (let index = 0; index < 12; index += 1) clock.runNext(32 + index * 16);
    assert(commits === 13, "a longer active resize request should extend the remaining settle window");
    assert(resizeReasons[0] === "resize", "the original resize reason should drive its consumed frame");
    assert(resizeReasons.slice(1).every((reason) => reason === "window-state-resize"), "the latest resize reason should drive the extended frames");
    assert(clock.getPendingCount() === 0, "the extended resize window should still return to idle");
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    const order: string[] = [];
    const handoffStates = [true, true, false];
    let commits = 0;
    const loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: () => {
        commits += 1;
        order.push("commit");
      },
      frameClock: clock,
      motionRuntime: createMotionRuntime({ onStep: () => order.push("motion") }),
      onResizeSettleFrame: () => order.push("resize"),
      shouldRunHandoffFrame: () => {
        order.push("handoff");
        return handoffStates.shift() ?? false;
      },
    });

    loop.invalidate({ reason: "folder-handoff-loop" });
    clock.runNext(16);
    clock.runNext(32);
    clock.runNext(48);
    assert(
      order.join(",") === "motion,handoff,commit,motion,handoff,commit,motion,handoff",
      "handoff activity should be sampled after motion and should keep the loop alive until idle",
    );
    assert(commits === 2, "only active handoff frames should commit");
    assert(clock.getPendingCount() === 0, "an inactive handoff should release the RAF loop");
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    const deltas: number[] = [];
    let active = true;
    let motion!: ReturnType<typeof createMotionRuntime>;
    motion = createMotionRuntime({
      active: () => active,
      onStep: (deltaSeconds) => {
        deltas.push(deltaSeconds);
        motion.emit({ reason: "frame", writesLastFrame: 1 });
      },
    });
    const loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: () => {},
      frameClock: clock,
      motionRuntime: motion,
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    });

    motion.emit({ activeAnimationCount: 1, reason: "start" });
    clock.runNext(100);
    assert(loop.flushBeforeComposite({ reason: "folder-close-commit" }), "urgent commit should coexist with an active motion loop");
    active = false;
    clock.runNext(116);
    assert(deltas.length === 2, "the urgent commit should not add a motion step");
    assert(Math.abs((deltas[1] ?? 0) - 0.016) < 0.000001, "the urgent commit should not change the normal RAF time base");
    assert(clock.getPendingCount() === 0, "the final active-motion frame should return to idle");
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    const commits: Array<{ reasons: readonly string[] }> = [];
    let active = true;
    let motion!: ReturnType<typeof createMotionRuntime>;
    motion = createMotionRuntime({
      active: () => active,
      onStep: () => {
        active = false;
        motion.emit({ reason: "frame", writesLastFrame: 1 });
      },
    });
    const loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: (frame) => commits.push({ reasons: frame.reasons }),
      frameClock: clock,
      motionRuntime: motion,
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    });

    motion.emit({ activeAnimationCount: 1, reason: "start" });
    assert(clock.getPendingCount() === 1, "a motion lifecycle signal should wake the presentation loop");
    clock.runNext(16);
    assert(commits.length === 1, "the final motion write should be committed");
    assert(commits[0]?.reasons.includes("motion-start"), "the lifecycle reason should reach the commit");
    assert(commits[0]?.reasons.includes("motion-frame"), "the final written motion frame should reach the commit");
    assert(clock.getPendingCount() === 0, "the loop should stop immediately after the final motion frame");
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    const commits: Array<{ reasons: readonly string[]; sequence: number }> = [];
    let loop!: ReturnType<typeof createDesktopPresentationLoop>;
    loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: (frame) => {
        commits.push({ reasons: frame.reasons, sequence: frame.sequence });
        if (commits.length === 1) loop.invalidate({ reason: "interaction-ownership" });
      },
      frameClock: clock,
      motionRuntime: createMotionRuntime(),
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    });

    loop.invalidate({ reason: "desktop-update" });
    loop.invalidate({ reason: "visual-watch" });
    loop.invalidate({ reason: "desktop-update" });
    assert(clock.getPendingCount() === 1, "same-frame invalidations should coalesce onto one RAF");
    clock.runNext(16);
    assert(commits.length === 1, "one RAF should perform at most one commit");
    assert(commits[0]?.reasons.length === 2, "duplicate reasons should be coalesced by the invalidation ledger");
    assert(clock.getPendingCount() === 1, "work requested during commit should be deferred to the next RAF");
    clock.runNext(32);
    assert(Number(commits.length) === 2, "deferred work should commit on the following RAF");
    assert(commits[1]?.reasons.join(",") === "interaction-ownership", "the following frame should contain only deferred work");
    assert(commits[1]?.sequence === 2, "commit sequence should increase monotonically");
    assert(clock.getPendingCount() === 0, "the loop should become idle after deferred work commits");
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    const commits: Array<{ deltaSeconds: number; mode: string; reasons: readonly string[] }> = [];
    let motionSteps = 0;
    let nestedFlushRejected = false;
    let loop!: ReturnType<typeof createDesktopPresentationLoop>;
    loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: (frame) => {
        commits.push({
          deltaSeconds: frame.deltaSeconds,
          mode: frame.mode,
          reasons: frame.reasons,
        });
        if (frame.mode === "before-composite") {
          try {
            loop.flushBeforeComposite({ reason: "folder-close-commit" });
          } catch {
            nestedFlushRejected = true;
          }
        }
      },
      frameClock: clock,
      motionRuntime: createMotionRuntime({ onStep: () => { motionSteps += 1; } }),
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    });

    loop.invalidate({ reason: "desktop-update" });
    assert(clock.getPendingCount() === 1, "normal work should be waiting on RAF before an urgent flush");
    const staleNormalFrame = clock.peekNextCallback();
    assert(loop.flushBeforeComposite({ reason: "folder-close-commit" }), "the closed urgent request should commit immediately");
    assert(commits.length === 1, "the urgent flush should commit exactly once");
    assert(commits[0]?.mode === "before-composite", "the urgent commit should identify its presentation mode");
    assert(commits[0]?.deltaSeconds === 0, "the urgent commit should not advance the motion time base");
    assert(motionSteps === 0, "the urgent commit should never step motion");
    assert(commits[0]?.reasons.includes("desktop-update"), "urgent commit should consume already pending work");
    assert(commits[0]?.reasons.includes("folder-close-commit"), "urgent commit should include its closed reason");
    assert(nestedFlushRejected, "nested urgent commits should fail explicitly");
    assert(clock.getPendingCount() === 0, "an urgent commit should cancel a now-stale scheduled RAF");
    staleNormalFrame(16);
    assert(commits.length === 1 && motionSteps === 0, "a canceled normal callback arriving late should not disturb loop ownership");
    loop.invalidate({ reason: "after-urgent-flush" });
    clock.runNext(32);
    assert(Number(commits.length) === 2, "new work should still schedule normally after a stale callback is ignored");
    assertThrows(
      () => (loop.flushBeforeComposite as (request: { reason: string }) => boolean)({ reason: "manual-flush" }),
      "the urgent seam should reject every reason except folder-close-commit",
    );
    loop.dispose();
  }

  {
    const clock = createFrameClock();
    let commits = 0;
    let motionSteps = 0;
    const motion = createMotionRuntime({ onStep: () => { motionSteps += 1; } });
    const loop = createDesktopPresentationLoop({
      canPresent: () => true,
      commit: () => { commits += 1; },
      frameClock: clock,
      motionRuntime: motion,
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    });

    assert(motion.getSuspendCount() === 1, "construction should suspend the motion runtime ticker once");
    assert(motion.getListenerCount() === 1, "construction should subscribe to motion render signals");
    loop.invalidate({ reason: "desktop-update" });
    const staleCallback = clock.peekNextCallback();
    loop.dispose();
    loop.dispose();
    assert(clock.getPendingCount() === 0, "dispose should cancel the owned RAF");
    assert(motion.getListenerCount() === 0, "dispose should unsubscribe the motion signal listener");
    assert(motion.getResumeCount() === 1, "idempotent dispose should resume the motion ticker exactly once");
    staleCallback(16);
    assert(commits === 0 && motionSteps === 0, "a stale callback after dispose should be a no-op");
    loop.invalidate({ reason: "after-dispose" });
    assert(clock.getPendingCount() === 0, "a disposed loop should reject new work");
  }

  {
    const makeLoop = () => createDesktopPresentationLoop({
      canPresent: () => true,
      commit: () => {},
      frameClock: createFrameClock(),
      motionRuntime: createMotionRuntime(),
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    });
    const loop = makeLoop();
    assertThrows(
      () => loop.requestResizeSettle({ frames: 0, reason: "resize" }),
      "invalid resize frame counts should fail instead of silently falling back",
    );
    assertThrows(
      () => (loop.invalidate as (request: { reason: unknown }) => void)({ reason: 42 }),
      "invalidations should reject non-string reasons at the JavaScript boundary",
    );
    assertThrows(
      () => (loop.requestResizeSettle as (request: { frames: number; reason: string }) => void)({ frames: 3, reason: "resize-settle" }),
      "resize settling should accept only the closed reason union",
    );
    loop.dispose();

    const invalidOptions = {
      canPresent: () => true,
      commit: () => {},
      frameClock: { cancel: () => {}, now: () => 0 },
      motionRuntime: createMotionRuntime(),
      onResizeSettleFrame: () => {},
      shouldRunHandoffFrame: () => false,
    } as unknown as Parameters<typeof createDesktopPresentationLoop>[0];
    assertThrows(
      () => createDesktopPresentationLoop(invalidOptions),
      "a missing RAF request function should fail construction explicitly",
    );
  }
}
