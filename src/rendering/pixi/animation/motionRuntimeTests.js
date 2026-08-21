import {
  createMotionRuntime,
  progressDriver,
  spring,
  tween,
} from "./motionRuntime.js";
import { createMotionRuntimeDebugAdapter } from "./motionRuntimeDebugAdapter.dev.js";

function nearlyEqual(actual, expected, epsilon = 0.001) {
  return Math.abs(actual - expected) <= epsilon;
}

function runUntil(runtime, condition, maxSteps = 600) {
  for (let index = 0; index < maxSteps; index += 1) {
    runtime.step(1 / 60);
    if (condition()) return true;
  }
  return false;
}

function containsReference(value, reference, seen = new Set()) {
  if (value === reference) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((entry) => containsReference(entry, reference, seen));
}

function createFakeFrameScheduler() {
  const callbacks = new Map();
  let cancelCount = 0;
  let nextHandle = 1;
  let requestCount = 0;

  return {
    cancelAnimationFrame(handle) {
      cancelCount += 1;
      callbacks.delete(handle);
    },
    flush(timeMs) {
      const entry = callbacks.entries().next().value;
      if (!entry) return false;
      const [handle, callback] = entry;
      callbacks.delete(handle);
      callback(timeMs);
      return true;
    },
    get cancelCount() {
      return cancelCount;
    },
    get pendingCount() {
      return callbacks.size;
    },
    get requestCount() {
      return requestCount;
    },
    requestAnimationFrame(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      requestCount += 1;
      callbacks.set(handle, callback);
      return handle;
    },
  };
}

export function runMotionRuntimeTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion runtime test failed] ${message}`);
  };

  {
    const adapter = createMotionRuntimeDebugAdapter();
    adapter.configureDebug({ enabled: true });
    const record = {
      driver: "tween",
      lane: "base",
      laneKey: "adapter-default-state",
      prop: "x",
      targetId: 1,
      to: 10,
      value: 2,
    };
    adapter.observe({ frame: 7, record, timeMs: 125, type: "start" });
    adapter.observe({ activeAnimationCount: 1, frame: 7, timeMs: 125, type: "frame" });

    const snapshot = adapter.makeSnapshot();
    const report = adapter.makeReport();
    assert(snapshot.animations.length === 1, "adapter snapshots without explicit runtime state should retain observed active animations");
    assert(report.runtime.frames === 7 && report.runtime.timeMs === 125, "adapter reports without explicit runtime state should retain observed frame metadata");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const driver = spring({ damping: 28, mass: 0.9, stiffness: 190, restDelta: 0.01, restSpeed: 0.01 });
    const first = runtime.animate(target, "x", 100, { driver, velocity: 12 });
    runtime.step(1 / 60);
    const velocityBeforeRetarget = first.velocity;
    const retargeted = runtime.animate(target, "x", 200, { driver });

    assert(retargeted.state === first.state, "spring retarget should reuse the active base lane");
    assert(retargeted.velocity === velocityBeforeRetarget, "spring retarget should preserve velocity");
    assert(retargeted.state.to === 200, "spring retarget should update the destination");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const driver = spring({ damping: 28, mass: 0.9, stiffness: 190, restDelta: 0.01, restSpeed: 0.01 });
    const calls = [];
    const first = runtime.animate(target, "x", 100, {
      driver,
      onCancel: () => calls.push("cancel"),
      onComplete: () => calls.push("complete"),
      onUpdate: () => calls.push("update"),
      velocity: 30,
    });
    runtime.step(1 / 60);
    first.release();
    runtime.step(1 / 60);
    const velocityBeforeReleaseRetarget = first.velocity;
    const retargeted = runtime.animate(target, "x", 200, {
      driver,
      onComplete: () => calls.push("retarget-complete"),
    });

    assert(first.released === true, "released owner control should remain released after retarget");
    assert(retargeted.released === false, "retargeting a released animation should return a fresh owner control");
    assert(retargeted.state === first.state, "released spring should remain available for retargeting");
    assert(retargeted.velocity === velocityBeforeReleaseRetarget, "released spring retarget should preserve velocity");
    assert(!calls.includes("cancel"), "release should not call the old cancel callback");
    assert(!calls.includes("complete"), "release should detach the old complete callback");
    assert(runUntil(runtime, () => calls.includes("retarget-complete")), "retargeted released spring should still complete");
    assert(nearlyEqual(target.x, 200), "retargeted released spring should land on the new target");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const calls = [];
    const control = runtime.animate(target, "x", 10, {
      delay: 1,
      driver: tween({ duration: 1, ease: "linear" }),
      onCancel: () => calls.push("cancel"),
      onComplete: () => calls.push("complete"),
    });

    control.release();
    runtime.step(2);

    assert(control.released === true, "delayed release should expose released state");
    assert(target.x === 0, "releasing before delay should not start the animation");
    assert(calls.length === 0, "releasing before delay should not fire cancel or complete callbacks");
    assert(runtime.debugSnapshot().animations.length === 0, "releasing before delay should remove the pending animation");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const driver = spring({ damping: 28, mass: 0.9, stiffness: 190, restDelta: 0.01, restSpeed: 0.01 });
    runtime.animate(target, "x", 100, { driver });
    runtime.step(0.1);
    const valueBeforeRetarget = target.x;
    const calls = [];
    const retargeted = runtime.animate(target, "x", 200, {
      driver,
      milestones: [{ progress: 0.5, callback: () => calls.push(target.x) }],
    });

    assert(nearlyEqual(retargeted.state.from, valueBeforeRetarget), "spring retarget should restart progress milestones from the in-flight value");
    assert(runUntil(runtime, () => calls.length > 0), "retargeted spring milestone should fire");
    assert(calls[0] > valueBeforeRetarget && calls[0] < 200, "retargeted spring milestone should use the new travel distance");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const driver = spring({ damping: 28, mass: 0.9, stiffness: 190, restDelta: 0.01, restSpeed: 0.01 });
    const canceled = [];
    runtime.configureDebug({ enabled: true });
    const first = runtime.animate(target, "x", 100, {
      driver,
      onCancel: (reason) => canceled.push(reason),
    });
    runtime.step(1 / 60);
    const second = runtime.animate(target, "x", 200, { driver, interrupt: "replace" });

    assert(second.state !== first.state, "explicit replace should create a new animation instead of auto-retargeting");
    assert(canceled.join(",") === "replace", "explicit replace should cancel the previous lane with a replace reason");
    assert(runtime.debug.canceledByReason.replace === 1, "replace cancellations should be counted by reason");
    assert(runtime.debugSnapshot().animations[0].interrupt === "replace", "debug snapshot should expose explicit replace policy");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const calls = [];
    runtime.animate(target, "x", 20, {
      driver: spring({ arriveDelta: 0.5, damping: 31, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 340 }),
      onArrive: () => calls.push("arrive"),
      onComplete: () => calls.push("complete"),
    });

    assert(runUntil(runtime, () => calls.includes("arrive")), "spring should eventually fire onArrive");
    assert(calls.join(",") === "arrive", "onArrive should fire before onComplete");
    assert(runUntil(runtime, () => calls.includes("complete")), "spring should eventually complete");
    assert(calls.join(",") === "arrive,complete", "spring should fire arrive and complete once");
    assert(target.x === 20, "completed spring should land exactly on the target");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const calls = [];
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      milestones: [
        { progress: 0.5, callback: (value, event) => calls.push(`half:${Math.round(value)}:${event.prop}`) },
        { progress: 0.75, callback: (value) => calls.push(`late:${Math.round(value)}`) },
      ],
    });

    runtime.step(0.49);
    assert(calls.length === 0, "milestone should wait until progress reaches the threshold");
    runtime.step(0.01);
    assert(calls.join(",") === "half:5:x", "milestone should fire once at the first crossed threshold");
    runtime.step(0.25);
    assert(calls.join(",") === "half:5:x,late:8", "milestones should fire in threshold order");
    runtime.step(0.25);
    assert(calls.join(",") === "half:5:x,late:8", "completed animation should not refire fired milestones");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const calls = [];
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      milestones: [{ progress: 0.5, callback: () => calls.push("snap-half") }],
      snap: true,
    });

    assert(target.x === 10, "snap should still apply the final value immediately");
    assert(calls.join(",") === "snap-half", "snap should fire crossed milestones");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const control = runtime.animate(target, "x", 100, {
      driver: progressDriver({ completeAtEnd: false, ease: "linear", progress: 0 }),
      from: 0,
    });

    control.setProgress(0.35);
    assert(nearlyEqual(target.x, 35), "progress control should seek to the scrubbed value before settle");
    control.settle({ velocity: 1.2 });
    assert(control.state.driver.type === "spring", "settle should convert a progress driver into a spring driver");
    assert(control.velocity === 120, "settle should convert progress velocity into value velocity");
    assert(control.state.to === 100, "positive settle velocity should target the end value");
    assert(runUntil(runtime, () => control.completed), "settled progress spring should complete");
    assert(nearlyEqual(target.x, 100), "settled progress should land at the end value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 100 };
    const control = runtime.animate(target, "x", 0, {
      driver: progressDriver({ completeAtEnd: false, ease: "linear", progress: 0 }),
      from: 100,
    });

    control.setProgress(0.35);
    control.settle({ velocity: -0.2 });

    assert(control.state.to === 100, "negative settle velocity should target the start value");
    assert(runUntil(runtime, () => control.completed), "reverse settled progress spring should complete");
    assert(nearlyEqual(target.x, 100), "reverse settled progress should land at the start value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
    });
    runtime.animate(target, "x", 0, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 5,
      lane: "additive",
    });

    runtime.step(0.5);
    assert(nearlyEqual(target.x, 7.5), `base and additive lanes should compose additively, got ${target.x}`);
    runtime.step(0.5);
    assert(nearlyEqual(target.x, 10), "additive lane should clean up at its neutral endpoint");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.animate(target, "x", 100, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
    });
    runtime.step(0.4);
    const valueBeforeBlend = target.x;
    runtime.animate(target, "x", 20, {
      blendDuration: 0.2,
      blendEase: "linear",
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      interrupt: "blend",
    });

    assert(nearlyEqual(target.x, valueBeforeBlend), "runtime blend should keep the current visual value on takeover");
    runtime.step(0.1);
    assert(nearlyEqual(target.x, 21), `runtime blend should cross-blend explicit from tracks, got ${target.x}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
    });
    runtime.animate(target, "x", 0, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 4,
      lane: "additive",
      laneKey: "pulse-a",
    });
    runtime.animate(target, "x", 0, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: -2,
      lane: "additive",
      laneKey: "pulse-b",
    });

    runtime.step(0.5);
    assert(nearlyEqual(target.x, 6), `multiple additive lanes should sum on the same property, got ${target.x}`);
    runtime.stop(target, "x", { lane: "additive", laneKey: "pulse-a" });
    assert(nearlyEqual(target.x, 4), "stopping one additive lane should leave the other additive lane composed with the active base");
    runtime.step(0.5);
    assert(nearlyEqual(target.x, 10), "remaining additive lanes should still clean up to the base value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      lane: "base",
      laneKey: "layout",
    });
    runtime.step(0.25);
    const layoutValue = target.x;
    runtime.animate(target, "x", 100, {
      driver: tween({ duration: 1, ease: "linear" }),
      lane: "base",
      laneKey: "drag",
    });
    runtime.step(0.25);

    assert(runtime.debugSnapshot().animations.length === 2, "named base lanes should coexist on one property");
    assert(target.x > layoutValue, "latest named base lane should drive the composed base value");
    runtime.stop(target, "x", { lane: "base", laneKey: "drag" });
    assert(nearlyEqual(target.x, runtime.getChannel(target, "x").baseValue), "stopping active base lane should compose fallback base value");
    assert(target.x < 10, "stopping drag base lane should fall back to in-flight layout lane value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { scale: 1 };
    runtime.animate(target, "scale", 2, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 1,
    });
    runtime.animate(target, "scale", 1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0.5,
      lane: "factor",
    });

    runtime.step(0.5);
    assert(nearlyEqual(target.scale, 1.125), `base and factor lanes should compose multiplicatively, got ${target.scale}`);
    runtime.step(0.5);
    assert(nearlyEqual(target.scale, 2), "factor lane should clean up at its neutral endpoint");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { scale: 1, x: 0 };
    runtime.animate(target, "scale", 0.9, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 1,
      laneKey: "press-scale",
    });
    runtime.animate(target, "scale", 1.1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 1,
      lane: "factor",
      laneKey: "hover-scale",
    });
    runtime.animate(target, "x", 6, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      lane: "additive",
      laneKey: "jiggle-x",
    });

    runtime.step(0.5);
    const report = runtime.debugReport({ includeChannels: true });
    const snapshot = runtime.debugSnapshot({ includeChannels: true });
    const scaleChannel = report.channels.find((channel) => channel.prop === "scale");
    const jiggleChannel = report.channels.find((channel) => channel.prop === "x");

    assert(!Object.hasOwn(report, "curveStats"), "debug report should not include curve stats unless requested");
    assert(!Object.hasOwn(snapshot, "curveStats"), "debug snapshot should not expose curve stats");
    assert(scaleChannel, "channel breakdown should include the press/hover scale channel");
    assert(jiggleChannel, "channel breakdown should include the jiggle additive channel");
    assert(snapshot.channels.find((channel) => channel.prop === "scale")?.composed, "debug snapshot should expose channel breakdown too");
    assert(scaleChannel.base.lanes[0].laneKey === "press-scale", "base breakdown should name the press lane");
    assert(scaleChannel.factor.lanes[0].laneKey === "hover-scale", "factor breakdown should name the hover lane");
    assert(jiggleChannel.additive.lanes[0].laneKey === "jiggle-x", "additive breakdown should name the jiggle lane");
    assert(nearlyEqual(scaleChannel.base.value, 0.95), `base breakdown should expose press output, got ${scaleChannel.base.value}`);
    assert(nearlyEqual(scaleChannel.additive.value, 0), "scale channel should expose neutral additive contribution");
    assert(nearlyEqual(scaleChannel.factor.value, 1.05), `factor breakdown should expose hover multiplier, got ${scaleChannel.factor.value}`);
    assert(nearlyEqual(scaleChannel.composed.value, target.scale), "composed scale value should match the target property");
    assert(nearlyEqual(scaleChannel.composed.value, (scaleChannel.base.value + scaleChannel.additive.value) * scaleChannel.factor.value), "composed scale should equal (base + additive) * factor");
    assert(nearlyEqual(jiggleChannel.base.value, 0), "additive-only jiggle channel should expose its neutral base");
    assert(nearlyEqual(jiggleChannel.additive.value, 3), `jiggle additive contribution should be visible, got ${jiggleChannel.additive.value}`);
    assert(nearlyEqual(jiggleChannel.factor.value, 1), "jiggle factor contribution should stay neutral");
    assert(nearlyEqual(jiggleChannel.composed.value, target.x), "composed jiggle value should match the target property");
    assert(typeof JSON.stringify(report.channels) === "string", "channel breakdown should remain JSON serializable");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    runtime.animate(target, "alpha", 1, {
      driver: tween({ duration: 1, ease: "linear", repeat: 1, yoyo: true }),
      from: 0,
    });

    runtime.step(1);
    assert(nearlyEqual(target.alpha, 1), "yoyo tween should reach the forward endpoint after the first cycle");
    runtime.step(1);
    assert(nearlyEqual(target.alpha, 0), "completed finite yoyo tween should settle to its final yoyo value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const order = [];
    const callback = () => order.push("flush");
    runtime.configureDebug({ enabled: true });
    runtime.afterFrame(callback);
    runtime.afterFrame(callback);
    runtime.step(0);

    assert(order.join(",") === "flush", "afterFrame should coalesce duplicate callbacks per frame");
    assert(runtime.debug.afterFrameFlushes === 1, "afterFrame debug counter should track flushes");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    assert(!runtime.hasActiveWork(), "idle runtime should report no active work");
    runtime.animate(target, "x", 1, { driver: tween({ duration: 1 }) });
    assert(runtime.hasActiveWork(), "active animation should report runtime work");
    runtime.step(1);
    assert(!runtime.hasActiveWork(), "completed animation should clear active runtime work");
    runtime.afterFrame(() => {});
    assert(runtime.hasActiveWork(), "pending afterFrame callback should report runtime work");
    runtime.step(0);
    assert(!runtime.hasActiveWork(), "flushed afterFrame callback should clear runtime work");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const target = { x: 10 };
    let arrived = 0;
    let completed = 0;
    const control = runtime.animate(target, "x", 10, {
      driver: spring({ damping: 28, mass: 0.9, stiffness: 190 }),
      onArrive: () => { arrived += 1; },
      onComplete: () => { completed += 1; },
    });

    assert(control === null, "empty spring without per-frame callbacks should not create a control");
    assert(!runtime.hasActiveWork(), "empty spring without per-frame callbacks should not enter the active set");
    assert(arrived === 1 && completed === 1, "empty spring should still finish lifecycle callbacks");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const target = { x: 10 };
    const control = runtime.animate(target, "x", 10, {
      driver: spring({ damping: 28, mass: 0.9, stiffness: 190 }),
      onUpdate: () => {},
    });

    assert(control, "empty spring with an update callback should remain caller-visible");
    assert(runtime.hasActiveWork(), "empty spring with an update callback should preserve active work for callback delivery");
    runtime.step(1 / 60);
    assert(!runtime.hasActiveWork(), "empty spring with an update callback should still settle on the next frame");
  }

  {
    const scheduler = createFakeFrameScheduler();
    const runtime = createMotionRuntime({ maxDeltaSeconds: 1, scheduler });
    const target = { x: 0, y: 0 };
    runtime.animate(target, "x", 10, { driver: tween({ duration: 0.1, ease: "linear" }) });
    runtime.animate(target, "y", 20, { driver: tween({ duration: 0.1, ease: "linear" }) });

    assert(scheduler.pendingCount === 1, "multiple animations should share one pending runtime RAF");
    assert(scheduler.requestCount === 1, "runtime should request only one RAF while a frame is pending");
    assert(scheduler.flush(100), "fake scheduler should flush the first runtime frame");
    assert(scheduler.pendingCount === 1, "active work should demand exactly one subsequent RAF");
    assert(scheduler.flush(200), "fake scheduler should flush the completing runtime frame");
    assert(scheduler.pendingCount === 0, "completed work should leave no queued RAF");
    assert(!runtime.hasActiveWork(), "completed scheduler-driven animations should return runtime to idle");

    let afterFrameCalls = 0;
    const afterFrame = () => {
      afterFrameCalls += 1;
    };
    runtime.afterFrame(afterFrame);
    runtime.afterFrame(afterFrame);
    assert(scheduler.pendingCount === 1, "coalesced afterFrame work should request one RAF");
    scheduler.flush(300);
    assert(afterFrameCalls === 1, "coalesced afterFrame work should flush once");
    assert(scheduler.pendingCount === 0, "flushed afterFrame-only work should not keep RAF alive");

    runtime.animate(target, "x", 30, { driver: tween({ duration: 1, ease: "linear" }) });
    assert(scheduler.pendingCount === 1, "new work should wake an idle runtime");
    runtime.suspendAutoTicker();
    assert(scheduler.pendingCount === 0 && scheduler.cancelCount === 1, "suspending should cancel the sole pending RAF");
    runtime.resumeAutoTicker();
    assert(scheduler.pendingCount === 1, "resuming should restore one RAF for pending work");
    runtime.reset();
  }

  {
    const runtime = createMotionRuntime({ autoStart: true });
    const signals = [];
    const objectSignals = [];
    const signalArgumentCounts = [];
    const unsubscribe = runtime.onRenderSignal((...args) => {
      signalArgumentCounts.push(args.length);
      signals.push(args[0]);
    });
    const unsubscribeObject = runtime.onRenderSignal({
      handleRenderSignal(signal) {
        objectSignals.push(signal);
      },
    });
    runtime.suspendAutoTicker();
    runtime.afterFrame(() => {});
    assert(signals.some((signal) => signal.reason === "frame-request"), "suspended runtime should emit a render signal for external frame drivers");
    assert(signalArgumentCounts.every((count) => count === 1), "render listeners should receive exactly one event argument");
    assert(objectSignals[0] === signals[0], "function and object listeners should receive the same render event object");
    assert(Object.isFrozen(signals[0]), "render signals should be immutable event objects");
    runtime.step(0);
    runtime.resumeAutoTicker();
    unsubscribe();
    unsubscribeObject();
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const rejectedInputs = [];
    for (const registerInvalidInput of [
      () => runtime.addObserver(null),
      () => runtime.onRenderSignal({}),
      () => runtime.afterFrame(null),
    ]) {
      try {
        registerInvalidInput();
      } catch (error) {
        rejectedInputs.push(error instanceof TypeError);
      }
    }
    assert(
      rejectedInputs.length === 3 && rejectedInputs.every(Boolean),
      "motion callback seams should reject invalid registrations instead of silently dropping them",
    );
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const target = Object.freeze({ x: 0 });
    let writeFailure = null;
    try {
      runtime.animate(target, "x", 10, { driver: tween({ duration: 1 }) });
    } catch (error) {
      writeFailure = error;
    }
    assert(writeFailure instanceof TypeError, "non-writable dynamic target properties should fail explicitly");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const target = { destroyed: false, x: 0 };
    let canceled = 0;
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1 }),
      onCancel: () => {
        canceled += 1;
      },
    });
    target.destroyed = true;
    runtime.step(1 / 60);

    assert(canceled === 1, "destroyed targets should cancel active animation");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = {
      destroyed: false,
      value: 0,
      get x() {
        return this.value;
      },
      set x(value) {
        if (this.destroyed) throw new Error("write-after-destroy");
        this.value = value;
      },
    };
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      onComplete: () => {
        target.destroyed = true;
      },
    });

    runtime.step(1);

    assert(target.value === 10, "dirty channel flush should not write to a target destroyed by completion callbacks");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0, y: 0 };
    runtime.configureDebug({ enabled: true });
    runtime.animate(target, "x", 10, { driver: tween({ duration: 1, ease: "linear" }) });
    runtime.animate(target, "y", 20, { driver: tween({ duration: 1, ease: "linear" }) });

    runtime.step(0.25);
    assert(runtime.debug.activeTargets === 1, "debug counters should track active target count");
    assert(runtime.debug.activeChannels === 2, "debug counters should track active channel count");
    assert(runtime.debug.writesLastFrame >= 2, "debug counters should track writes per frame");
    assert(runtime.debug.writes >= runtime.debug.writesLastFrame, "debug counters should track cumulative writes");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const targetA = { x: 0, y: 0 };
    const targetB = { x: 0 };
    runtime.configureDebug({ enabled: true });
    const baseA = runtime.animate(targetA, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      laneKey: "layout",
    });
    const additiveA = runtime.animate(targetA, "x", 2, {
      driver: tween({ duration: 1, ease: "linear" }),
      lane: "additive",
      laneKey: "nudge",
    });
    const yA = runtime.animate(targetA, "y", 20, {
      driver: tween({ duration: 1, ease: "linear" }),
      laneKey: "vertical",
    });
    const baseB = runtime.animate(targetB, "x", 5, {
      driver: tween({ duration: 1, ease: "linear" }),
      laneKey: "layout",
    });

    assert(runtime.debug.activeTargets === 2, "incremental counters should count active targets after starts");
    assert(runtime.debug.activeChannels === 3, "incremental counters should count unique target/property channels after starts");
    const startedCounters = {
      activeChannels: runtime.debug.activeChannels,
      activeTargets: runtime.debug.activeTargets,
    };
    const startedSummary = runtime.debugSnapshot().summary;
    assert(startedCounters.activeTargets === startedSummary.activeTargetCount, "incremental target count should match full summary after starts");
    assert(startedCounters.activeChannels === startedSummary.activeChannelCount, "incremental channel count should match full summary after starts");

    additiveA.cancel("test");
    assert(runtime.debug.activeTargets === 2, "canceling one lane should keep target count while another lane remains");
    assert(runtime.debug.activeChannels === 3, "canceling one lane should keep channel count while the same channel has a base lane");
    yA.cancel("test");
    assert(runtime.debug.activeTargets === 2, "canceling one channel should keep target count while another channel remains on the target");
    assert(runtime.debug.activeChannels === 2, "canceling one channel should decrement active channel count");
    baseA.cancel("test");
    assert(runtime.debug.activeTargets === 1, "canceling the last lane on a target should decrement active target count");
    assert(runtime.debug.activeChannels === 1, "canceling the last lane on a target should decrement channel count");
    baseB.cancel("test");
    assert(runtime.debug.activeTargets === 0, "canceling all lanes should clear active target count");
    assert(runtime.debug.activeChannels === 0, "canceling all lanes should clear active channel count");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "midflight-enable",
    });
    runtime.step(0.5);
    runtime.configureDebug({ enabled: true });
    const snapshot = runtime.debugSnapshot();

    assert(snapshot.summary.activeAnimationCount === 1, "debug snapshot should see animations that started before debug was enabled");
    assert(runtime.debug.activeTargets === 1, "snapshot should seed incremental active target counters");
    assert(runtime.debug.activeChannels === 1, "snapshot should seed incremental active channel counters");

    runtime.step(0.5);
    assert(runtime.debug.activeTargets === 0, "pre-enabled animation completion should decrement seeded active target counters");
    assert(runtime.debug.activeChannels === 0, "pre-enabled animation completion should decrement seeded active channel counters");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const targetA = { x: 0, y: 0 };
    const targetB = { alpha: 0, scale: 1 };
    runtime.animate(targetA, "x", 10, {
      driver: spring({ damping: 28, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 190 }),
      laneKey: "layout",
    });
    runtime.animate(targetA, "y", 20, {
      driver: tween({ duration: 1, ease: "linear" }),
      laneKey: "fade",
    });
    runtime.animate(targetA, "x", 6, {
      driver: spring({ damping: 30, mass: 0.8, restDelta: 0.01, restSpeed: 0.01, stiffness: 240 }),
      from: 0,
      lane: "additive",
      laneKey: "impulse",
    });
    runtime.animate(targetB, "alpha", 1, {
      driver: progressDriver({ completeAtEnd: false, progress: 0 }),
      from: 0,
      laneKey: "scrub",
    });
    runtime.animate(targetB, "scale", 1.2, {
      driver: spring({ damping: 28, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 190 }),
      from: 1,
      lane: "factor",
      laneKey: "hover-factor",
    });

    const snapshot = runtime.debugSnapshot();
    const targetAId = snapshot.animations.find((animation) => animation.laneKey === "layout").targetId;
    const targetBId = snapshot.animations.find((animation) => animation.laneKey === "scrub").targetId;

    assert(snapshot.summary.activeAnimationCount === 5, "debug summary should count active animations");
    assert(snapshot.summary.activeTargetCount === 2, "debug summary should count active targets");
    assert(snapshot.summary.activeChannelCount === 4, "debug summary should count active target/property channels");
    assert(snapshot.summary.byDriver.spring === 3, "debug summary should count spring drivers");
    assert(snapshot.summary.byDriver.tween === 1, "debug summary should count tween drivers");
    assert(snapshot.summary.byDriver.progress === 1, "debug summary should count progress drivers");
    assert(snapshot.summary.byLane.base === 3, "debug summary should count base lanes");
    assert(snapshot.summary.byLane.additive === 1, "debug summary should count additive lanes");
    assert(snapshot.summary.byLane.factor === 1, "debug summary should count factor lanes");
    assert(snapshot.summary.byLaneKey.impulse === 1, "debug summary should count lane keys");
    assert(snapshot.summary.byProp.x === 2, "debug summary should count same-property composed animations");
    assert(snapshot.summary.byTargetId[targetAId] === 3, "debug summary should count animations per target");
    assert(snapshot.summary.byTargetId[targetBId] === 2, "debug summary should count animations for each target id");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const observed = [];
    runtime.configureDebug({ enabled: true });
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      onUpdate: () => observed.push(target.x),
    });
    runtime.animate(target, "x", 4, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      lane: "additive",
      onUpdate: () => observed.push(target.x),
    });

    runtime.step(0.5);
    assert(nearlyEqual(target.x, 7), `coalesced writes should still compose lanes, got ${target.x}`);
    assert(runtime.debug.writesLastFrame === 1, `same-property lane writes should coalesce, got ${runtime.debug.writesLastFrame}`);
    assert(observed.every((value) => nearlyEqual(value, 7)), "onUpdate should observe the flushed composed value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.configureDebug({ enabled: true });
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
    });

    runtime.step(1);

    assert(nearlyEqual(target.x, 10), "completed tween should still land on the final value");
    assert(runtime.debug.writesLastFrame === 1, `complete path should compose the final channel once, got ${runtime.debug.writesLastFrame}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.configureDebug({ enabled: true });
    const control = runtime.animate(target, "x", 10, { driver: tween({ duration: 1, ease: "linear" }) });
    const snapshot = runtime.debugSnapshot();

    assert(snapshot.animations.length === 1, "debug snapshot should list active animations");
    assert(snapshot.animations[0].prop === "x", "debug snapshot should include property names");
    assert(snapshot.animations[0].targetId > 0, "debug snapshot should assign stable target ids");

    control.cancel("user-interrupt");
    const afterCancel = runtime.debugSnapshot();
    assert(afterCancel.counters.canceledByReason["user-interrupt"] === 1, "debug counters should track cancel reasons");
    assert(afterCancel.animations.length === 0, "debug snapshot should omit canceled animations");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0, y: 0 };
    runtime.configureDebug({ enabled: true });
    runtime.animate(target, "x", 10, { driver: tween({ duration: 1, ease: "linear" }) });
    runtime.animate(target, "y", 20, { driver: tween({ duration: 1, ease: "linear" }) });

    runtime.stop(target, "x", { reason: "route-change" });
    runtime.cancelTarget(target, { reason: "cleanup" });
    const snapshot = runtime.debugSnapshot();

    assert(snapshot.counters.canceledByReason["route-change"] === 1, "runtime.stop should count custom cancel reasons");
    assert(snapshot.counters.canceledByReason.cleanup === 1, "runtime.cancelTarget should pass custom cancel reasons to stopped channels");
    assert(snapshot.animations.length === 0, "custom-reason cancellations should remove all active animations");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });

    assert(typeof runtime.addObserver === "function", "runtime should expose addObserver");
    assert(typeof runtime.configureDebug === "function", "runtime should expose configureDebug");
    assert(typeof runtime.clearDebugHistory === "function", "runtime should expose clearDebugHistory");
    assert(typeof runtime.describeTarget === "function", "runtime should expose describeTarget");
    assert(typeof runtime.debugReport === "function", "runtime should expose debugReport");
    assert(typeof runtime.onRenderSignal === "function", "runtime should expose an independent render signal channel");
    assert(typeof runtime.resolveDebugTarget === "function", "runtime should expose resolveDebugTarget for dev overlay lookup");

    const defaults = runtime.configureDebug();
    assert(defaults.enabled === false, "debug config should default to disabled high-cost history");
    assert(defaults.overlayEnabled === false, "debug config should default motion overlay to disabled");
    assert(defaults.recordHistory === false, "debug config should default to no history recording");
    assert(defaults.recordFilter === null, "debug config should default to no record filter");
    assert(defaults.recordWindowMs === 30000, "debug config should default to a 30s recording window");
    assert(defaults.sampleHz === 10, "debug config should default to 10Hz regular recording");
    assert(defaults.timeScale === 1, "debug config should default to normal runtime speed");

    const configured = runtime.configureDebug({
      enabled: true,
      maxEvents: 2,
      maxSamples: 3,
      overlayEnabled: true,
      recordHistory: true,
      recordWindowMs: 60000,
      sampleHz: 20,
      timeScale: 0.5,
    });
    assert(configured.enabled === true, "configureDebug should apply enabled patches");
    assert(configured.overlayEnabled === true, "configureDebug should apply overlay patches");
    assert(configured.recordHistory === true, "configureDebug should apply history recording patches");
    assert(configured.recordWindowMs === 60000, "configureDebug should apply recording window patches");
    assert(configured.sampleHz === 20, "configureDebug should apply sample rate patches");
    assert(configured.timeScale === 0.5, "configureDebug should apply timeScale patches");

    const patched = runtime.configureDebug({ maxEvents: 4 });
    assert(patched.maxEvents === 4, "configureDebug should patch individual fields");
    assert(patched.recordWindowMs === 60000, "configureDebug should preserve omitted fields on patch");
    assert(patched.timeScale === 0.5, "configureDebug should preserve timeScale on patch");

    const lowerClamp = runtime.configureDebug({ recordWindowMs: 0 });
    assert(lowerClamp.recordWindowMs === 1000, "custom recording window should clamp to at least 1s");
    const upperClamp = runtime.configureDebug({ recordWindowMs: 600000 });
    assert(upperClamp.recordWindowMs === 300000, "custom recording window should clamp to at most 300s");

    const filtered = runtime.configureDebug({
      recordFilter: {
        eventTypes: [" cancel ", "RETARGET", "cancel"],
        includeSamples: false,
        propAllowlist: ["alpha", "x", "alpha"],
        targetFilters: {
          kind: "IconNode",
          layer: "desktop",
          sourceLabel: "desktop.icon.node",
          sourceQuery: " icon ",
        },
      },
    });
    assert(filtered.recordFilter.includeSamples === false, "recordFilter should preserve includeSamples");
    assert(filtered.recordFilter.includeEvents === true, "recordFilter should default to including events");
    assert(filtered.recordFilter.props.join(",") === "alpha,x", "recordFilter should normalize prop allowlists");
    assert(filtered.recordFilter.eventTypes.join(",") === "cancel,retarget", "recordFilter should normalize event types");
    assert(filtered.recordFilter.layers[0] === "desktop", "recordFilter should normalize target layer filters");
    assert(filtered.recordFilter.kinds[0] === "IconNode", "recordFilter should normalize target kind filters");
    assert(filtered.recordFilter.sourceLabels[0] === "desktop.icon.node", "recordFilter should normalize source labels");
    assert(filtered.recordFilter.sourceQuery === "icon", "recordFilter should trim source queries");
    filtered.recordFilter.props[0] = "mutated";
    assert(runtime.configureDebug().recordFilter.props[0] === "alpha", "configureDebug should return a cloned recordFilter");
    const cleared = runtime.configureDebug({ recordFilter: null });
    assert(cleared.recordFilter === null, "recordFilter should be clearable");
    assert(runtime.configureDebug({ recordFilter: {} }).recordFilter === null, "empty recordFilter should behave like no filter");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const debugEvents = [];
    const renderSignals = [];
    runtime.addObserver((event) => debugEvents.push(event));
    runtime.onRenderSignal((signal) => renderSignals.push(signal));

    runtime.configureDebug();
    assert(debugEvents.length === 0, "reading debug config should not emit debugConfig events");
    assert(renderSignals.length === 0, "reading debug config should not emit render signals");

    runtime.configureDebug({ overlayEnabled: true });
    assert(debugEvents.length === 0, "disabled debug config patches should not emit debug observer events");
    assert(renderSignals.length === 1, "debug config patches should request a render through the render signal channel");
    assert(renderSignals[0].reason === "debug-config", "debug config render signal should be typed by reason");

    runtime.configureDebug({ enabled: true });
    assert(debugEvents.length === 1, "enabling debug should emit one debugConfig observer event");
    assert(debugEvents[0].type === "debugConfig", "debug config observer event should be typed");
    assert(debugEvents[0].config?.enabled === true, "debug config observer event should include the next config");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const events = [];
    const objectEvents = [];
    const renderSignals = [];
    const unsubscribe = runtime.addObserver((event) => events.push(event));
    const unsubscribeObject = runtime.addObserver({
      handleEvent(event) {
        objectEvents.push(event.type);
      },
    });
    const unsubscribeRenderSignal = runtime.onRenderSignal((signal) => renderSignals.push(signal));

    runtime.describeTarget(target, {
      kind: "ObserverTarget",
      label: "Observer target",
      sourceLabel: "motion-runtime-tests.observer",
    });
    const control = runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "observer-x",
    });
    runtime.step(0.25);
    control.cancel("observer-test");

    const eventTypes = events.map((event) => event.type);
    assert(eventTypes.length === 0, "disabled debug observer should not receive motion debug events");
    assert(renderSignals.some((signal) => signal.reason === "start"), "render signal should receive motion start without using debug events");
    assert(renderSignals.some((signal) => signal.reason === "frame" && signal.activeAnimationCount === 1 && signal.writesLastFrame > 0), "render signal should receive frame writes without sampled animations");
    assert(renderSignals.some((signal) => signal.reason === "cancel"), "render signal should receive cancellation without using debug events");
    assert(runtime.debug.started === 0, "disabled debug should not count lifecycle start events");
    assert(runtime.debug.activeTargets === 0, "disabled debug should not maintain active target counters");
    assert(objectEvents.length === 0, "disabled debug object observer should not receive runtime debug events");

    const countBeforeUnsubscribe = events.length;
    const objectCountBeforeUnsubscribe = objectEvents.length;
    const signalCountBeforeUnsubscribe = renderSignals.length;
    unsubscribe();
    unsubscribeObject();
    unsubscribeRenderSignal();
    runtime.animate(target, "x", 20, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: target.x,
      laneKey: "observer-after-unsubscribe",
    });
    runtime.step(0.1);

    assert(events.length === countBeforeUnsubscribe, "unsubscribe should stop function observer events");
    assert(objectEvents.length === objectCountBeforeUnsubscribe, "unsubscribe should stop object observer events");
    assert(renderSignals.length === signalCountBeforeUnsubscribe, "unsubscribe should stop render signal callbacks");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const events = [];
    runtime.configureDebug({ enabled: true });
    runtime.addObserver((event) => events.push(event));
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "observer-enabled-x",
    });

    assert(
      events.some((event) => event.type === "start" && event.record?.laneKey === "observer-enabled-x"),
      "enabled debug observer start event should expose animation record data",
    );
    assert(runtime.debug.started === 1, "enabled debug should count lifecycle start events");
    assert(runtime.debug.activeTargets === 1, "enabled debug should maintain active target counters");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const events = [];
    runtime.configureDebug({
      enabled: true,
      maxSamples: 10,
      recordHistory: true,
      sampleHz: 60,
    });
    runtime.addObserver((event) => events.push(event));
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "sample-enabled",
    });
    runtime.step(1 / 60);

    const sample = events.find((event) => event.type === "sample");
    const report = runtime.debugReport({ includeHistory: true });
    assert(sample && Array.isArray(sample.animations), "enabled history recording should emit heavy sample events");
    assert(sample.animations.some((animation) => animation.laneKey === "sample-enabled"), "sample event should include active animation records");
    assert(report.history.samples.length === 1, "enabled history recording should keep sampled frames");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const events = [];
    runtime.configureDebug({
      enabled: true,
      maxEvents: 200,
      maxSamples: 200,
      recordHistory: true,
      sampleHz: 10,
    });
    runtime.describeTarget(target, {
      kind: "SampleTarget",
      label: "Sample target",
      sourceLabel: "motion-runtime-tests.sample-gating",
    });
    runtime.animate(target, "x", 100, {
      driver: tween({ duration: 2, ease: "linear" }),
      from: 0,
      laneKey: "sample-gated",
    });
    runtime.addObserver((event) => events.push(event));

    for (let frame = 0; frame < 60; frame += 1) runtime.step(1 / 60);

    const sampleEvents = events.filter((event) => event.type === "sample");
    const targetMetadataEvents = events.filter((event) => event.type === "targetMetadata");
    const report = runtime.debugReport({ includeHistory: true });
    assert(sampleEvents.length >= 9 && sampleEvents.length <= 11, `sample construction should follow sampleHz, got ${sampleEvents.length}`);
    assert(sampleEvents.length < 20, "sample construction should not run at frameHz");
    assert(targetMetadataEvents.length === 0, "sample construction should not re-emit target metadata");
    assert(report.history.samples.length === sampleEvents.length, "history should only keep sampled frames that passed sampleHz gating");
    assert(
      report.history.samples.every((sample) => sample.animations.some((animation) => animation.laneKey === "sample-gated")),
      "sampled frames should still include active animations",
    );
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });
    const target = { scale: { x: 1, y: 1 }, x: 0 };
    const overlayTarget = { getGlobalTransform: () => null };
    runtime.configureDebug({ enabled: true, overlayEnabled: true });
    runtime.describeTarget(target.scale, {
      kind: "Icon",
      label: "Scale target",
      overlayTarget,
      sourceLabel: "motion-runtime-tests.overlay",
      targetPart: "node.scale",
    });
    runtime.animate(target.scale, "x", 1.1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 1,
      laneKey: "scale",
    });

    const report = runtime.debugReport({ includeTargets: true });
    const activeTargetId = report.animations[0]?.targetId;
    const serialized = JSON.stringify(report);
    const targetRecord = report.targets.find((entry) => entry.targetId === activeTargetId);

    assert(runtime.resolveDebugTarget(activeTargetId, { bounds: true }) === overlayTarget, "dev overlay lookup should resolve the live bounds target");
    assert(runtime.resolveDebugTarget(activeTargetId, { bounds: false }) === target.scale, "dev raw lookup should resolve the animated target");
    assert(targetRecord?.sourceLabel === "motion-runtime-tests.overlay", "debug metadata should keep serializable labels");
    assert(!containsReference(report, overlayTarget), "debug report should not retain overlay target references");
    assert(!serialized.includes("overlayTarget"), "debug report should not serialize live overlay target fields");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });
    const target = { alpha: 0, scale: 1, x: 0, y: 0 };
    runtime.configureDebug({
      enabled: true,
      maxEvents: 20,
      maxSamples: 20,
      recordHistory: true,
      recordWindowMs: 30000,
      sampleHz: 60,
      timeScale: 1,
    });
    runtime.describeTarget(target, {
      id: "app.calendar",
      kind: "IconNode",
      label: "Calendar",
      layer: "desktop",
      sourceLabel: "motion-runtime-tests",
    });

    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 0.2, ease: "linear" }),
      from: 0,
      laneKey: "layout",
    });
    runtime.step(0.1);
    runtime.step(0.1);

    const cancelControl = runtime.animate(target, "alpha", 1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "fade",
    });
    runtime.step(0.1);
    cancelControl.cancel("manual-test");

    const releaseControl = runtime.animate(target, "scale", 1.1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 1,
      laneKey: "hover",
    });
    releaseControl.release();

    runtime.animate(target, "y", 8, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      snap: true,
    });

    const snapshot = runtime.debugSnapshot({ includeChannels: true, includeTargets: true });
    const report = runtime.debugReport({ includeChannels: true, includeHistory: true, includeTargets: true });
    const activeTargetId = snapshot.animations.find((animation) => animation.prop === "scale")?.targetId;
    const snapshotTarget = snapshot.targets.find((entry) => entry.targetId === activeTargetId);
    const reportTarget = report.targets.find((entry) => entry.targetId === activeTargetId);
    const eventTypes = report.history.events.map((event) => event.type);

    assert(snapshotTarget?.label === "Calendar", "debug snapshot should include described target labels");
    assert(snapshotTarget?.sourceLabel === "motion-runtime-tests", "debug snapshot should include target source labels");
    assert(reportTarget?.kind === "IconNode", "debug report should include described target metadata");
    assert(eventTypes.includes("start"), "debug history should record animation start events");
    assert(eventTypes.includes("complete"), "debug history should record animation complete events");
    assert(eventTypes.includes("cancel"), "debug history should record animation cancel events");
    assert(eventTypes.includes("release"), "debug history should record animation release events");
    assert(eventTypes.includes("snap"), "debug history should record snap events");
    assert(report.history.samples.length > 0, "debug history should record timeline samples");
    assert(!containsReference(report, target), "debug report should not retain raw target object references");
    assert(!containsReference(snapshot, target), "debug snapshot should not retain raw target object references");
    assert(typeof JSON.stringify(report) === "string", "debug report should be JSON serializable");

    runtime.clearDebugHistory();
    const emptyReport = runtime.debugReport({ includeHistory: true });
    assert(emptyReport.history.events.length === 0, "clearDebugHistory should clear recorded events");
    assert(emptyReport.history.samples.length === 0, "clearDebugHistory should clear recorded samples");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });
    const icon = { alpha: 0, x: 0 };
    const panel = { alpha: 0 };
    runtime.configureDebug({
      enabled: true,
      maxEvents: 50,
      maxSamples: 50,
      recordFilter: {
        eventTypes: ["start", "cancel"],
        propAllowlist: ["alpha"],
        targetFilters: {
          kind: "IconNode",
          layer: "desktop",
          sourceQuery: "icon",
        },
      },
      recordHistory: true,
      sampleHz: 60,
    });
    runtime.describeTarget(icon, {
      kind: "IconNode",
      label: "Calendar",
      layer: "desktop",
      sourceLabel: "desktop.icon.node",
    });
    runtime.describeTarget(panel, {
      kind: "FolderPanel",
      label: "Folder Panel",
      layer: "folder",
      sourceLabel: "folder.panel",
    });

    runtime.animate(icon, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "layout-x",
    });
    const alphaControl = runtime.animate(icon, "alpha", 1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "icon-alpha",
    });
    runtime.animate(panel, "alpha", 1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "panel-alpha",
    });
    runtime.step(1 / 60);
    alphaControl.cancel("filtered-test");
    runtime.step(1 / 60);

    const report = runtime.debugReport({ includeHistory: true, includeTargets: true });
    const events = report.history.events;
    const sampleAnimations = report.history.samples.flatMap((sample) => sample.animations);

    assert(events.length > 0, "recordFilter should keep matching lifecycle events");
    assert(events.some((event) => event.type === "start"), "recordFilter should keep allowed start events");
    assert(events.some((event) => event.type === "cancel"), "recordFilter should keep allowed cancel events");
    assert(events.every((event) => event.prop === "alpha"), "recordFilter should filter events by prop");
    assert(events.every((event) => event.layer === "desktop"), "recordFilter should filter events by layer");
    assert(events.every((event) => event.targetKind === "IconNode"), "recordFilter should filter events by target kind");
    assert(events.every((event) => event.sourceLabel === "desktop.icon.node"), "recordFilter should filter events by source label query");
    assert(events.every((event) => event.type === "start" || event.type === "cancel"), "recordFilter should filter events by type");
    assert(sampleAnimations.length > 0, "recordFilter should keep matching sampled animations");
    assert(sampleAnimations.every((animation) => animation.prop === "alpha"), "recordFilter should filter samples by prop");
    assert(sampleAnimations.every((animation) => animation.layer === "desktop"), "recordFilter should filter samples by layer");
    assert(sampleAnimations.every((animation) => animation.targetKind === "IconNode"), "recordFilter should filter samples by target kind");
    assert(sampleAnimations.every((animation) => animation.sourceLabel === "desktop.icon.node"), "recordFilter should filter samples by source label query");
    assert(report.config.recordFilter.props.join(",") === "alpha", "debug report should expose the serializable recordFilter");
    assert(!containsReference(report, icon), "filtered debug report should not retain raw target references");
    assert(!containsReference(report, panel), "filtered debug report should not retain filtered-out target references");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });
    const target = { alpha: 0 };
    runtime.configureDebug({
      enabled: true,
      maxEvents: 20,
      maxSamples: 20,
      recordFilter: {
        eventTypes: ["cancel"],
        includeSamples: false,
        props: ["alpha"],
      },
      recordHistory: true,
      sampleHz: 60,
    });
    const control = runtime.animate(target, "alpha", 1, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "events-only-alpha",
    });
    runtime.step(1 / 60);
    control.cancel("events-only-test");

    const report = runtime.debugReport({ includeHistory: true });
    assert(report.history.samples.length === 0, "recordFilter should support event-only capture");
    assert(report.history.events.length === 1, "recordFilter should only keep allowed event types");
    assert(report.history.events[0].type === "cancel", "event-only recordFilter should keep the cancel event");
    assert(report.history.events[0].prop === "alpha", "event-only recordFilter should still filter by prop");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.configureDebug({ enabled: true });
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      laneKey: "missing-meta",
    });

    const missingSnapshot = runtime.debugSnapshot();
    const animation = missingSnapshot.animations[0];
    const warning = missingSnapshot.warnings.find((entry) => entry.type === "missing-target-metadata");
    assert(warning, "debug snapshot should warn about active targets without readable metadata");
    assert(warning.targetId === animation.targetId, "missing metadata warning should identify the target id");
    assert(warning.prop === "x", "missing metadata warning should identify the active property");
    assert(warning.laneKey === "missing-meta", "missing metadata warning should identify the active lane key");

    runtime.describeTarget(target, {
      kind: "TestTarget",
      label: "Registered Target",
      sourceLabel: "motion-runtime-tests.warning",
    });
    const describedReport = runtime.debugReport({ includeTargets: true });
    assert(describedReport.warnings.length === 0, "describing an active target should clear missing metadata warnings");
    assert(
      describedReport.targets.some((entry) => entry.label === "Registered Target"),
      "debug report should include described metadata after warning clears",
    );
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.configureDebug({ enabled: true });
    runtime.describeTarget(target, {
      kind: "ResetTarget",
      label: "Reset Target",
      sourceLabel: "motion-runtime-tests.reset",
    });

    const describedReport = runtime.debugReport({ includeTargets: true });
    assert(describedReport.targets.some((entry) => entry.label === "Reset Target"), "debug report should include metadata before reset");

    runtime.reset();
    const resetReport = runtime.debugReport({ includeTargets: true });
    assert(resetReport.targets.length === 0, "runtime reset should clear described target metadata");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });
    const target = { x: 0 };
    runtime.configureDebug({
      enabled: true,
      maxEvents: 3,
      maxSamples: 2,
      recordHistory: true,
      recordWindowMs: 300000,
      sampleHz: 60,
    });

    for (let index = 0; index < 6; index += 1) {
      runtime.animate(target, "x", index + 1, {
        driver: tween({ duration: 0.05, ease: "linear" }),
        from: target.x,
        interrupt: "replace",
      });
      runtime.step(0.05);
    }

    const trimmedByCount = runtime.debugReport({ includeHistory: true });
    assert(trimmedByCount.history.events.length <= 3, "debug history should trim events by maxEvents");
    assert(trimmedByCount.history.samples.length <= 2, "debug history should trim samples by maxSamples");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });
    const target = { x: 0, y: 0 };
    runtime.configureDebug({
      enabled: true,
      maxEvents: 100,
      maxSamples: 100,
      recordHistory: true,
      recordWindowMs: 1000,
      sampleHz: 60,
    });
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
    });
    runtime.step(0.25);
    runtime.step(1.5);
    runtime.animate(target, "y", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
      snap: true,
    });

    const trimmedByWindow = runtime.debugReport({ includeHistory: true });
    const oldestAllowed = trimmedByWindow.runtime.timeMs - trimmedByWindow.config.recordWindowMs;
    assert(trimmedByWindow.history.events.length > 0, "window trimming test should keep recent events");
    assert(trimmedByWindow.history.samples.length > 0, "window trimming test should keep recent samples");
    assert(
      trimmedByWindow.history.events.every((event) => event.timeMs >= oldestAllowed),
      "debug history should trim events outside recordWindowMs",
    );
    assert(
      trimmedByWindow.history.samples.every((sample) => sample.timeMs >= oldestAllowed),
      "debug history should trim samples outside recordWindowMs",
    );
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 10 });
    const target = { x: 0 };
    runtime.configureDebug({ enabled: true, timeScale: 0.5 });
    runtime.animate(target, "x", 10, {
      driver: tween({ duration: 1, ease: "linear" }),
      from: 0,
    });

    runtime.step(1);
    assert(nearlyEqual(target.x, 5), `timeScale should scale runtime delta, got ${target.x}`);
    const restored = runtime.configureDebug({ timeScale: 1 });
    assert(restored.timeScale === 1, "configureDebug should restore timeScale to 1");
    runtime.step(0.5);
    assert(nearlyEqual(target.x, 10), `restored timeScale should resume normal runtime delta, got ${target.x}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const driver = spring({
      arriveDelta: 1,
      damping: 4,
      mass: 1,
      restDelta: 0.05,
      restSpeed: 0.05,
      stiffness: 90,
    });
    runtime.configureDebug({
      enabled: true,
      maxEvents: 200,
      maxSamples: 400,
      recordHistory: true,
      sampleHz: 120,
    });
    const control = runtime.animate(target, "x", 100, {
      driver,
      from: 0,
      laneKey: "curve-spring",
    });

    runtime.step(0.12);
    runtime.animate(target, "x", 60, {
      driver,
      laneKey: "curve-spring",
    });

    assert(runUntil(runtime, () => control.completed, 900), "curve stats spring should complete after retarget");
    const defaultReport = runtime.debugReport({ includeHistory: true });
    const report = runtime.debugReport({ includeCurveStats: true, includeHistory: true });
    const stats = report.curveStats.find((entry) => entry.laneKey === "curve-spring");

    assert(!Object.hasOwn(defaultReport, "curveStats"), "debug report should omit curve stats by default");
    assert(stats, "debug report should include curve stats for a completed spring");
    assert(stats.prop === "x", "curve stats should include the animated property");
    assert(stats.retargetCount === 1, `curve stats should count one retarget, got ${stats.retargetCount}`);
    assert(stats.overshootCount > 0, "curve stats should count spring overshoot");
    assert(stats.maxDelta >= 60, `curve stats should expose max distance to target, got ${stats.maxDelta}`);
    assert(stats.maxVelocity > 0, "curve stats should expose max velocity");
    assert(stats.arriveTimeMs != null && stats.arriveTimeMs > 0, "curve stats should expose arrive time");
    assert(stats.completeTimeMs != null && stats.completeTimeMs >= stats.arriveTimeMs, "curve stats should expose complete time after arrival");
    assert(stats.arriveCompleteGapMs === stats.completeTimeMs - stats.arriveTimeMs, "curve stats should expose arrive-complete gap");
    assert(stats.sampleCount > 0, "curve stats should count samples");
    assert(stats.eventCount > 0, "curve stats should count lifecycle events");
    assert(!Object.keys(stats).some((key) => key.startsWith("_")), "curve stats should not leak private accumulator fields");
    assert(typeof JSON.stringify(report.curveStats) === "string", "curve stats should remain JSON serializable");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    runtime.configureDebug({
      enabled: true,
      maxEvents: 100,
      maxSamples: 200,
      recordHistory: true,
      sampleHz: 120,
    });
    const control = runtime.animate(target, "x", 100, {
      driver: progressDriver({ completeAtEnd: false, ease: "linear", progress: 0 }),
      from: 0,
      laneKey: "curve-settle",
    });

    control.setProgress(0.4);
    control.settle({ velocity: 0.8 });

    assert(runUntil(runtime, () => control.completed, 900), "curve stats settled progress should complete");
    const report = runtime.debugReport({ includeCurveStats: true, includeHistory: true });
    const stats = report.curveStats.find((entry) => entry.laneKey === "curve-settle");

    assert(stats, "debug report should include curve stats for settled progress");
    assert(stats.settleDurationMs != null && stats.settleDurationMs > 0, "curve stats should expose settle duration");
    assert(stats.completeTimeMs >= stats.settleDurationMs, "settle duration should be bounded by complete time");
    assert(stats.maxVelocity > 0, "settled curve stats should expose velocity");
  }
}
