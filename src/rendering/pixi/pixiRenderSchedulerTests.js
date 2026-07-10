import { createPixiRenderScheduler } from "./pixiRenderScheduler.js";

export function runPixiRenderSchedulerTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Pixi render scheduler test failed] ${message}`);
  };

  {
    const callbacks = [];
    let renderCount = 0;
    const scheduler = createPixiRenderScheduler({
      cancelAnimationFrame: () => {},
      render: () => {
        renderCount += 1;
      },
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    assert(scheduler.requestRender("state-change") === true, "first request should schedule a frame");
    assert(scheduler.requestRender("resize") === false, "same-frame request should merge into the pending frame");
    assert(callbacks.length === 1, "merged requests should use one animation frame");
    callbacks[0]();
    assert(renderCount === 1, "merged requests should render once");
    assert(scheduler.isScheduled() === false, "scheduler should be idle after the frame runs");
    assert(callbacks.length === 1, "idle scheduler should not schedule another frame without a new request");
  }

  {
    const callbacks = [];
    let renderCount = 0;
    const scheduler = createPixiRenderScheduler({
      cancelAnimationFrame: () => {},
      render: () => {
        renderCount += 1;
      },
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    scheduler.requestRender("idle-guard");
    callbacks[0]();
    assert(renderCount === 1, "single idle-guard request should render once");
    assert(callbacks.length === 1, "desktop idle should not keep a continuous render loop alive");
  }

  {
    const callbacks = [];
    let renderCount = 0;
    let requestNextFrame = true;
    let scheduler = null;
    scheduler = createPixiRenderScheduler({
      cancelAnimationFrame: () => {},
      render: () => {
        renderCount += 1;
        if (!requestNextFrame) return;
        requestNextFrame = false;
        assert(scheduler.requestRender("folder-handoff-loop") === true, "render callback should be able to request the next frame");
      },
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    assert(scheduler.requestRender("folder-handoff-start") === true, "handoff start should schedule a frame");
    callbacks[0]();
    assert(renderCount === 1, "first handoff frame should render once");
    assert(callbacks.length === 2, "handoff follow-up should schedule the next frame through the scheduler");
    callbacks[1]();
    assert(renderCount === 2, "handoff follow-up frame should render once");
    assert(callbacks.length === 2, "handoff follow-up should stop when no new request is made");
  }

  {
    const callbacks = [];
    const canceled = [];
    let renderCount = 0;
    const scheduler = createPixiRenderScheduler({
      cancelAnimationFrame: (frame) => canceled.push(frame),
      render: () => {
        renderCount += 1;
      },
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return 42;
      },
    });

    scheduler.requestRender("mount");
    scheduler.destroy();
    assert(canceled[0] === 42, "destroy should cancel the pending frame");
    callbacks[0]();
    assert(renderCount === 0, "destroyed scheduler should ignore a stale frame callback");
    assert(scheduler.requestRender("after-destroy") === false, "destroyed scheduler should reject new requests");
  }

  {
    const callbacks = [];
    let ready = false;
    let renderCount = 0;
    const scheduler = createPixiRenderScheduler({
      canRender: () => ready,
      cancelAnimationFrame: () => {},
      render: () => {
        renderCount += 1;
      },
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    assert(scheduler.requestRender("before-init") === false, "request before app readiness should not schedule");
    ready = true;
    assert(scheduler.requestRender("init") === true, "request after app readiness should schedule the first frame");
    assert(callbacks.length === 1, "first ready request should schedule one frame");
    callbacks[0]();
    assert(renderCount === 1, "first ready frame should render");
  }

  {
    let renderCount = 0;
    const scheduler = createPixiRenderScheduler({
      render: () => {
        renderCount += 1;
      },
      requestAnimationFrame: null,
    });

    assert(scheduler.requestRender("no-raf") === true, "scheduler should render immediately without RAF");
    assert(renderCount === 1, "no-RAF fallback should render synchronously");
  }

  {
    const callbacks = [];
    const reasons = [];
    const scheduler = createPixiRenderScheduler({
      cancelAnimationFrame: () => {},
      render: (reason) => reasons.push(reason),
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    assert(scheduler.markRenderPending("motion-frame") === true, "mark should create pending render work without scheduling");
    assert(scheduler.markRenderPending("resize") === false, "second mark should merge with the existing pending reason");
    assert(callbacks.length === 0, "marking pending render should not schedule an animation frame");
    assert(scheduler.hasPendingRender(), "marked render should be observable as pending");
    assert(scheduler.runPendingRender() === true, "pending render should run inline when the frame driver consumes it");
    assert(reasons.flat().join(",") === "motion-frame,resize", "inline render should preserve every merged pending reason");
    assert(!scheduler.hasPendingRender(), "inline render should clear pending work");
    assert(scheduler.runPendingRender() === false, "running without pending work should be a no-op");
  }

  {
    const callbacks = [];
    const reasons = [];
    const scheduler = createPixiRenderScheduler({
      cancelAnimationFrame: () => {},
      render: (frameReasons) => reasons.push(frameReasons),
      requestAnimationFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
    });

    scheduler.requestRender("watch-effect");
    scheduler.requestRender("watch-effect");
    scheduler.requestRender("icon-pointerdown");
    callbacks[0]();
    assert(
      reasons[0].join(",") === "watch-effect,icon-pointerdown",
      "merged render reasons should preserve order without duplicating the same cause"
    );
  }
}
