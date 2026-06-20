import { createMotionRuntime, spring as springDriver, tween as tweenDriver } from "./motionRuntime.js";
import { clearMotionPreferencesForTests, setReducedMotionForTests } from "./motionPreferences.js";
import {
  lanePreset,
  motion,
  motionAdd,
  motionLanes,
  motionSequence,
  motionTo,
  killMotionOf,
  parallel,
  scrub,
  sequence,
  stagger,
  transition,
} from "./motionTween.js";

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

export function runMotionTweenTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion tween test failed] ${message}`);
  };

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 1 };
    const calls = [];
    transition(target)
      .from({ alpha: 0 })
      .to({ alpha: 1, duration: 1, ease: "linear", onComplete: () => calls.push("step") })
      .start({ runtime, onComplete: () => calls.push("transition") });

    runtime.step(0.5);
    assert(nearlyEqual(target.alpha, 0.5), `transition builder should honor from/to, got ${target.alpha}`);
    runtime.step(0.5);
    assert(nearlyEqual(target.alpha, 1), "transition builder should complete at the target value");
    assert(calls.join(",") === "step,transition", "transition builder should run step and group completions");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    setReducedMotionForTests(true);
    let completed = 0;
    try {
      transition(target)
        .preset("folderOpen")
        .to({ alpha: 1 })
        .start({ runtime, onComplete: () => { completed += 1; } });

      assert(nearlyEqual(target.alpha, 1), "reduced-motion transition should snap to the final value");
      assert(completed === 1, "reduced-motion transition should still complete");
      assert(runtime.debugSnapshot().animations.length === 0, "reduced-motion transition should not leave active animations");
    } finally {
      clearMotionPreferencesForTests();
    }
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    transition(target)
      .preset("fade")
      .to({ alpha: 1 })
      .start({ runtime });

    runtime.step(0.08);
    assert(nearlyEqual(target.alpha, 0.875), `fade preset should apply duration and ease, got ${target.alpha}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    const calls = [];
    transition(target)
      .from({ alpha: 0 })
      .to({ alpha: 1, duration: 1, ease: "linear" })
      .at(0.5, (value, event) => calls.push(`half:${Math.round(value * 10)}:${event.prop}`))
      .start({ runtime });

    runtime.step(0.49);
    assert(calls.length === 0, "builder milestone should wait for its progress threshold");
    runtime.step(0.01);
    assert(calls.join(",") === "half:5:alpha", "builder at() should fire when the active step crosses the threshold");
    runtime.step(0.5);
    assert(calls.join(",") === "half:5:alpha", "builder at() should fire only once");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const calls = [];
    transition(target)
      .at(0.25, () => calls.push("default-threshold"))
      .to({ duration: 1, ease: "linear", x: 10 })
      .start({ runtime });

    runtime.step(0.25);
    assert(calls.join(",") === "default-threshold", "builder at() before to() should apply to the next step");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    transition(target)
      .preset("folderOpen", { duration: 0.24 })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 1 })
      .start({ runtime });

    runtime.step(0.12);
    const snapshot = runtime.debugSnapshot();
    assert(snapshot.animations[0].lane === "base", "overlay shortcut should use the base lane");
    assert(snapshot.animations[0].laneKey === "overlay", "overlay shortcut should use its named base lane");
    assert(target.alpha > 0.5 && target.alpha < 1, "preset overrides should preserve easing while overriding duration");

    const valueBeforeRetarget = target.alpha;
    transition(target)
      .preset("fade", { duration: 0.24 })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 0 })
      .start({ runtime });

    assert(runtime.debugSnapshot().animations.length === 1, "overlay retarget should reuse the base lane animation");
    runtime.step(0.12);
    assert(target.alpha < valueBeforeRetarget, "overlay retarget should continue from the in-flight value toward the new target");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    transition(target)
      .layout()
      .to({ duration: 1, ease: "linear", x: 10 })
      .start({ runtime });
    runtime.step(0.25);
    const layoutValue = target.x;
    transition(target)
      .drag()
      .to({ duration: 1, ease: "linear", x: 100 })
      .start({ runtime });
    runtime.step(0.25);
    const snapshot = runtime.debugSnapshot();

    assert(snapshot.animations.length === 2, "named base lanes should keep independent active animations");
    assert(snapshot.animations.some((animation) => animation.laneKey === "layout"), "layout base lane should stay active");
    assert(snapshot.animations.some((animation) => animation.laneKey === "drag"), "drag base lane should stay active");
    assert(target.x > layoutValue, "most recent named base lane should drive the composed value");
    killMotionOf(target, "x", { lane: "base", laneKey: "drag", runtime });
    assert(target.x === runtime.getChannel(target, "x").baseValue, "canceling the active base lane should recompute the composed base value");
    assert(target.x < 10, "canceling drag should fall back to the still-active layout lane value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const targets = [{ alpha: 1 }, { alpha: 1 }];
    transition(targets)
      .preset("fade", { duration: 0.12 })
      .overlay()
      .interrupt("retarget")
      .to({ alpha: 0.48 })
      .start({ runtime });

    runtime.step(0.06);
    assert(targets[0].alpha < 1 && targets[1].alpha < 1, "transition builder should animate array targets");
    runtime.step(0.06);
    assert(nearlyEqual(targets[0].alpha, 0.48), "transition builder should complete first array target");
    assert(nearlyEqual(targets[1].alpha, 0.48), "transition builder should complete second array target");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const control = transition(target)
      .preset("snappy")
      .to({ x: 10 })
      .start({ runtime });

    assert(control.state.driver.type === "spring", "spring preset should configure a spring driver");
    assert(control.state.driver.config.stiffness === 520, "spring preset should use preset stiffness");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const first = { x: 0 };
    const second = { y: 0 };
    let completed = 0;
    parallel([
      motion(first).to({ duration: 1, ease: "linear", x: 10 }),
      motion(second).to({ duration: 0.5, ease: "linear", y: 20 }),
    ], { runtime, onComplete: () => { completed += 1; } });

    runtime.step(0.5);
    assert(nearlyEqual(first.x, 5), "parallel should advance the longer child");
    assert(nearlyEqual(second.y, 20), "parallel should complete the shorter child");
    assert(completed === 0, "parallel should wait for all children");
    runtime.step(0.5);
    assert(nearlyEqual(first.x, 10), "parallel should complete all children");
    assert(completed === 1, "parallel should fire onComplete once");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const first = { x: 0 };
    const second = { y: 0 };
    const calls = [];
    parallel([
      motion(first).spring({ arriveDelta: 2, damping: 31, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 340 }).to({ x: 10 }),
      motion(second).spring({ arriveDelta: 0.5, damping: 31, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 340 }).to({ y: 80 }),
    ], { runtime, onArrive: () => calls.push("arrive") });

    runtime.step(1 / 60);
    assert(calls.length === 0, "parallel onArrive should wait for every child to arrive");
    assert(runUntil(runtime, () => calls.length === 1), "parallel onArrive should fire once after all children arrive");
    runtime.step(1);
    assert(calls.join(",") === "arrive", "parallel onArrive should only fire once");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    let completed = 0;
    sequence([
      motion(target).to({ duration: 0.5, ease: "linear", x: 10 }),
      motion(target).to({ duration: 0.5, ease: "linear", x: 20 }),
    ], { runtime, onComplete: () => { completed += 1; } });

    runtime.step(0.5);
    assert(nearlyEqual(target.x, 10), "sequence should complete the first item before starting the next");
    assert(completed === 0, "sequence should not complete until all items finish");
    runtime.step(0.25);
    assert(nearlyEqual(target.x, 15), `sequence should advance the second item from the first target, got ${target.x}`);
    runtime.step(0.25);
    assert(nearlyEqual(target.x, 20), "sequence should complete at the final item target");
    assert(completed === 1, "sequence should fire onComplete once");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const calls = [];
    const control = sequence([
      motion(target).to({ duration: 0.25, ease: "linear", x: 10 }),
      motion(target).to({ duration: 0.25, ease: "linear", x: 20 }),
    ], { runtime, onArrive: () => calls.push("arrive") });

    runtime.step(0.25);
    assert(calls.length === 0, "sequence onArrive should not fire after an intermediate item arrives");
    runtime.step(0.25);
    assert(calls.join(",") === "arrive", "sequence onArrive should fire after the final item arrives");
    assert(control.arrived === true, "sequence control should expose final arrival state");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    const control = motionSequence(target, [
      { alpha: 1, duration: 0.25, ease: "linear" },
      { alpha: 0, duration: 0.25, ease: "linear" },
    ], { runtime });

    runtime.step(0.25);
    assert(nearlyEqual(target.alpha, 1), "motionSequence should keep existing flash style semantics");
    runtime.step(0.25);
    assert(nearlyEqual(target.alpha, 0), "motionSequence should complete the final step");
    assert(control.completed, "motionSequence control should report completion");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const targets = [{ alpha: 0 }, { alpha: 0 }, { alpha: 0 }];
    stagger(targets, { alpha: 1, duration: 1, ease: "linear" }, { runtime, stagger: 0.25 });

    runtime.step(0.25);
    assert(nearlyEqual(targets[0].alpha, 0.25), "stagger should start the first target immediately");
    assert(nearlyEqual(targets[1].alpha, 0), "stagger should delay the second target");
    runtime.step(0.25);
    assert(nearlyEqual(targets[1].alpha, 0.25), "stagger should start subsequent targets with spacing");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const reasons = [];
    const control = motion(target)
      .to({ duration: 1, ease: "linear", onCancel: (reason) => reasons.push(reason), x: 10 })
      .start({ runtime });

    runtime.step(0.25);
    control.cancel("user-interrupt");
    runtime.step(1);
    assert(target.x < 10, "cancel should interrupt an active animation");
    assert(reasons.join(",") === "user-interrupt", "cancel should pass through the interrupt reason");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const first = motion(target)
      .to({ duration: 1, ease: "linear", interrupt: "ignore", x: 10 })
      .start({ runtime });
    const second = motion(target)
      .to({ duration: 1, ease: "linear", interrupt: "ignore", x: 20 })
      .start({ runtime });

    assert(first.state === second.state, "interrupt ignore should keep the existing lane animation");
    runtime.step(1);
    assert(nearlyEqual(target.x, 10), "interrupt ignore should not retarget the active animation");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const first = motion(target)
      .to({ duration: 1, ease: "linear", interrupt: "retarget", x: 10 })
      .start({ runtime });

    runtime.step(0.4);
    const valueBeforeRetarget = target.x;
    const second = motion(target)
      .to({ duration: 1, ease: "linear", interrupt: "retarget", x: 20 })
      .start({ runtime });

    assert(first.state === second.state, "interrupt retarget should reuse the existing lane animation");
    runtime.step(0.3);
    assert(target.x > valueBeforeRetarget && target.x < 20, "interrupt retarget should continue from the in-flight value");
    runtime.step(0.7);
    assert(nearlyEqual(target.x, 20), "interrupt retarget should settle on the new target");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const first = motion(target)
      .interrupt("replace")
      .to({ duration: 1, ease: "linear", x: 10 })
      .start({ runtime });
    runtime.step(0.25);
    const second = motion(target)
      .interrupt("replace")
      .to({ duration: 1, ease: "linear", x: 20 })
      .start({ runtime });

    assert(first.state !== second.state, "builder interrupt replace should start a replacement animation");
    assert(runtime.debug.canceledByReason.replace === 1, "builder interrupt replace should record a replace cancellation");
    runtime.step(1);
    assert(nearlyEqual(target.x, 20), "builder interrupt replace should complete at the replacement target");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    motion(target)
      .to({ duration: 1, ease: "linear", x: 10 })
      .start({ runtime });

    runtime.step(0.4);
    const valueBeforeBlend = target.x;
    motion(target)
      .to({ duration: 1, ease: "linear", interrupt: "blend", x: 20 })
      .start({ runtime });

    assert(nearlyEqual(target.x, valueBeforeBlend), "interrupt blend should take over without an immediate jump");
    runtime.step(0.25);
    assert(target.x > valueBeforeBlend && target.x < 20, "interrupt blend should continue from the composed value");
    assert(runtime.debug.canceledByReason.blend === 1, "interrupt blend should record a blend cancellation reason");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    motion(target)
      .to({ duration: 1, ease: "linear", x: 100 })
      .start({ runtime });

    runtime.step(0.4);
    const valueBeforeBlend = target.x;
    motion(target)
      .from({ x: 0 })
      .blend(0.2, "linear")
      .to({ duration: 1, ease: "linear", x: 20 })
      .start({ runtime });

    assert(nearlyEqual(target.x, valueBeforeBlend), "builder blend should keep the current visual value on takeover");
    assert(runtime.debugSnapshot().animations[0].blendDuration === 0.2, "debug snapshot should expose active blend duration");
    runtime.step(0.1);
    assert(nearlyEqual(target.x, 21), `builder blend should cross-blend from the old visual value to the new explicit-from path, got ${target.x}`);
    runtime.step(0.1);
    assert(nearlyEqual(target.x, 4), "builder blend should hand fully to the replacement path after the blend window");
    runtime.step(0.8);
    assert(nearlyEqual(target.x, 20), "builder blend replacement should still complete at the target value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    setReducedMotionForTests(true);
    try {
      const control = scrub(target, { x: 100, from: { x: 0 }, ease: "linear" }, { runtime });

      control.setProgress(0.25);
      assert(nearlyEqual(target.x, 25), "reduced-motion should not snap externally controlled scrub progress");
      assert(!control.completed, "reduced-motion scrub should remain externally controllable");
    } finally {
      clearMotionPreferencesForTests();
    }
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const control = scrub(target, { x: 100, from: { x: 0 }, ease: "linear" }, { runtime });

    control.setProgress(0.25);
    assert(nearlyEqual(target.x, 25), `scrub should set progress-driven values, got ${target.x}`);
    control.setProgress(0.75);
    assert(nearlyEqual(target.x, 75), "scrub should be externally controllable");
    assert(!control.completed, "scrub should remain active at progress below one");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    const control = transition(target)
      .from({ alpha: 0 })
      .to({ alpha: 1 })
      .scrub(0)
      .start({ runtime });

    control.setProgress(0.4);
    assert(nearlyEqual(target.alpha, 0.4), "builder scrub should expose setProgress on the returned control");
    control.reverse();
    assert(nearlyEqual(target.alpha, 0.6), "scrub reverse should mirror progress around one");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { alpha: 0 };
    const control = transition(target)
      .from({ alpha: 0 })
      .to({ alpha: 1 })
      .scrub(0)
      .start({ runtime });

    control.setProgress(0.35);
    control.settle({ velocity: 0.8 });
    assert(control.state.driver.type === "spring", "builder scrub settle should hand off to a spring driver");
    assert(control.state.to === 1, "builder scrub settle should choose the end value for positive velocity");
    assert(runUntil(runtime, () => control.completed), "builder scrub settle should complete");
    assert(nearlyEqual(target.alpha, 1), "builder scrub settle should land at the end value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const control = motion(target)
      .to({ duration: 1, ease: "linear", x: 10 })
      .start({ runtime });

    runtime.step(0.4);
    assert(nearlyEqual(target.x, 4), "tween reverse setup should start from an in-flight value");
    control.reverse();
    runtime.step(0.2);
    assert(target.x < 4, "tween reverse should retarget back toward the original from value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    const driver = springDriver({ damping: 28, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 190 });
    const calls = [];
    const first = transition(target)
      .spring(driver.config)
      .interrupt("retarget")
      .to({ onComplete: () => calls.push("old-complete"), velocity: 30, x: 100 })
      .start({ runtime });

    runtime.step(1 / 60);
    first.release();
    runtime.step(1 / 60);
    const velocityBeforeReleaseRetarget = first.velocity;
    const second = transition(target)
      .spring(driver.config)
      .interrupt("retarget")
      .to({ onComplete: () => calls.push("new-complete"), x: 200 })
      .start({ runtime });

    first.cancel("old-owner");
    assert(first.released === true, "transition control should expose release state");
    assert(second.state === first.state, "released transition spring should be retargetable by the next owner");
    assert(second.velocity === velocityBeforeReleaseRetarget, "released transition retarget should preserve velocity");
    assert(runtime.debug.canceledByReason["old-owner"] == null, "released transition control should not cancel the retargeted owner");
    assert(runUntil(runtime, () => calls.includes("new-complete")), "retargeted transition should complete under the new owner");
    assert(!calls.includes("old-complete"), "released transition should detach old completion callbacks");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const first = { x: 0 };
    const second = { y: 0 };
    const group = parallel([
      motion(first).to({ duration: 1, ease: "linear", interrupt: "retarget", x: 10 }),
      motion(second).to({ duration: 1, ease: "linear", interrupt: "retarget", y: 20 }),
    ], { runtime });

    runtime.step(0.25);
    group.release();
    group.cancel("released-group");
    assert(group.released === true, "parallel control should expose release state");
    assert(runtime.debug.canceledByReason["released-group"] == null, "released parallel control should not cancel children");
    assert(runtime.debugSnapshot().animations.length === 2, "released parallel children should remain active");

    transition(first).interrupt("retarget").to({ duration: 1, ease: "linear", x: 30 }).start({ runtime });
    transition(second).interrupt("retarget").to({ duration: 1, ease: "linear", y: 40 }).start({ runtime });
    assert(runtime.debugSnapshot().animations.length === 2, "retargeting released parallel children should reuse active lane animations");
    runtime.step(1);
    assert(nearlyEqual(first.x, 30), "released parallel first child should retarget to the new value");
    assert(nearlyEqual(second.y, 40), "released parallel second child should retarget to the new value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { scale: { x: 1, y: 1 } };
    motionTo(target, { duration: 1, ease: "linear", scale: 2 }, { runtime });

    runtime.step(0.5);
    assert(nearlyEqual(target.scale.x, 1.5), "scale adapter should animate scale.x");
    assert(nearlyEqual(target.scale.y, 1.5), "scale adapter should animate scale.y");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0, y: 0 };
    const control = motionTo(target, {
      driver: springDriver({ damping: 28, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 190 }),
      velocity: { x: 12, y: -8 },
      x: 100,
      y: 50,
    }, { runtime });
    const velocities = runtime.debugSnapshot().animations
      .sort((a, b) => a.prop.localeCompare(b.prop))
      .map((animation) => `${animation.prop}:${animation.velocity}`);

    assert(control.completed === false, "spring motion with velocity should return an active group control");
    assert(velocities.join(",") === "x:12,y:-8", "motionTo should pass per-property velocity into runtime animations");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0, y: 0 };
    const calls = [];
    const control = motionTo(target, {
      driver: springDriver({
        arriveDelta: { x: 10, y: 0.5 },
        damping: 31,
        mass: 0.9,
        restDelta: 0.01,
        restSpeed: 0.01,
        stiffness: 340,
      }),
      onArrive: () => calls.push("arrive"),
      x: 10,
      y: 80,
    }, { runtime });

    runtime.step(1 / 60);
    assert(calls.length === 0, "motionTo group onArrive should wait for every property to arrive");
    assert(runUntil(runtime, () => calls.length === 1), "motionTo group onArrive should fire once after all properties arrive");
    assert(control.arrived === true, "motionTo group control should expose arrived state after all children arrive");
    runtime.step(1);
    assert(calls.join(",") === "arrive", "motionTo group onArrive should only fire once");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { scale: { x: 1, y: 1 } };
    motionTo(target, { duration: 1, ease: "linear", scaleX: 2 }, { runtime });

    runtime.step(0.5);
    assert(nearlyEqual(target.scale.x, 1.5), "scaleX adapter should animate scale.x");
    assert(nearlyEqual(target.scale.y, 1), "scaleX adapter should not animate scale.y");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { scale: { x: 1, y: 1 } };
    motionTo(target, { duration: 1, ease: "linear", scale: 2 }, { runtime });

    runtime.step(0.25);
    killMotionOf(target, "scale", { runtime });
    runtime.step(1);
    assert(target.scale.x < 2 && target.scale.y < 2, "killMotionOf scale should stop scale.x and scale.y");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    motionTo(target, { duration: 1, ease: "linear", x: 10 }, { runtime });
    motionTo(target, { duration: 1, ease: "linear", lane: "additive", laneKey: "jiggle", x: 4 }, { runtime });

    runtime.step(0.5);
    assert(nearlyEqual(target.x, 7), `base and additive motionTo lanes should compose, got ${target.x}`);
    killMotionOf(target, "x", { lane: "additive", runtime });
    assert(target.x < 7, "killing additive lane should leave base lane active");
  }

  {
    assert(motionLanes.jiggle.lane === "additive", "jiggle lane should be additive");
    assert(lanePreset("hover").laneKey === "hover", "lanePreset should expose named lane keys");

    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    motion(target)
      .jiggle()
      .to({ duration: 1, ease: "linear", x: 4 })
      .start({ runtime });

    runtime.step(0.5);
    const snapshot = runtime.debugSnapshot();
    assert(snapshot.animations[0].lane === "additive", "builder jiggle should use additive lane");
    assert(snapshot.animations[0].laneKey === "jiggle", "builder jiggle should use jiggle lane key");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 5 };
    transition(target)
      .additive("pulse")
      .to({ duration: 1, ease: "linear", x: 4 })
      .start({ runtime });

    runtime.step(0.5);
    const snapshot = runtime.debugSnapshot();
    assert(nearlyEqual(target.x, 7), `builder additive should compose over the base value while active, got ${target.x}`);
    assert(snapshot.animations[0].lane === "additive", "builder additive should use additive lane");
    assert(snapshot.animations[0].laneKey === "pulse", "builder additive should use the requested lane key");
    runtime.step(0.5);
    assert(nearlyEqual(target.x, 5), "completed additive helper motion should release back to the base value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 10, y: 0 };
    motionAdd(target, { x: 4, y: -2 }, { driver: tweenDriver({ duration: 1, ease: "linear" }), runtime });

    runtime.step(0.5);
    assert(nearlyEqual(target.x, 12), `motionAdd should apply an additive x impulse over the base value, got ${target.x}`);
    assert(nearlyEqual(target.y, -1), `motionAdd should apply a multi-property additive impulse, got ${target.y}`);
    runtime.step(0.5);
    assert(nearlyEqual(target.x, 10) && nearlyEqual(target.y, 0), "motionAdd impulses should decay back to the base values");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 10 };
    motionAdd(target, { x: 4 }, { driver: tweenDriver({ duration: 1, ease: "linear" }), runtime });
    motionAdd(target, { x: 6 }, { driver: tweenDriver({ duration: 1, ease: "linear" }), runtime });

    const laneKeys = runtime.debugSnapshot().animations.map((animation) => animation.laneKey);
    assert(laneKeys.length === 2 && laneKeys[0] !== laneKeys[1], "motionAdd should allocate unique additive lanes by default");
    runtime.step(0.5);
    assert(nearlyEqual(target.x, 15), `separate motionAdd impulses should stack on the same property, got ${target.x}`);
    runtime.step(0.5);
    assert(nearlyEqual(target.x, 10), "stacked motionAdd impulses should cleanly return to the base value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { opacity: 2 };
    transition(target)
      .factor("press-opacity")
      .to({ duration: 1, ease: "linear", opacity: 0.5 })
      .start({ runtime });

    runtime.step(0.5);
    const snapshot = runtime.debugSnapshot();
    assert(nearlyEqual(target.opacity, 1.5), `builder factor should multiply the base value while active, got ${target.opacity}`);
    assert(snapshot.animations[0].lane === "factor", "builder factor should use factor lane");
    assert(snapshot.animations[0].laneKey === "press-opacity", "builder factor should use the requested lane key");
    runtime.step(0.5);
    assert(nearlyEqual(target.opacity, 2), "completed factor helper motion should release back to the base value");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    motionTo(target, { duration: 1, ease: "linear", lanePreset: "jiggle", x: 4 }, { runtime });

    runtime.step(0.5);
    const snapshot = runtime.debugSnapshot();
    assert(snapshot.animations[0].lane === "additive", "motionTo lanePreset should use the named lane");
    assert(snapshot.animations[0].laneKey === "jiggle", "motionTo lanePreset should use the named lane key");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = { x: 0 };
    motionTo(target, { duration: 1, ease: "linear", x: 10 }, { runtime });

    killMotionOf(target, "x", { reason: "route-change", runtime });

    assert(runtime.debugSnapshot().counters.canceledByReason["route-change"] === 1, "killMotionOf should pass custom cancel reasons through to the runtime");
  }
}
