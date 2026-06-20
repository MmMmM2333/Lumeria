import { pageTrackSpring, springTo, stopTargetSprings } from "./springMotion.js";
import { clearMotionPreferencesForTests, setReducedMotionForTests } from "./motionPreferences.js";
import { motionRuntime } from "./motionRuntime.js";

export function runSpringMotionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Spring motion test failed] ${message}`);
  };

  const track = { x: 0 };
  const first = springTo(track, "x", 100, pageTrackSpring, { velocity: 12 });
  const velocityBeforeRetarget = first.velocity;
  const retargeted = springTo(track, "x", 200, pageTrackSpring);
  assert(retargeted === first, "retargeting the same prop should reuse the active spring");
  assert(retargeted.velocity === velocityBeforeRetarget, "retargeting should preserve current velocity");
  assert(retargeted.to === 200, "retargeting should update the destination");

  springTo(track, "x", "-40", pageTrackSpring, { snap: true });
  assert(track.x === -40, "snap should set the numeric destination immediately");

  setReducedMotionForTests(true);
  try {
    let completed = 0;
    const reducedMotionSpring = springTo(track, "x", 32, pageTrackSpring, {
      onComplete: () => {
        completed += 1;
      },
    });
    assert(reducedMotionSpring === null, "reduced-motion spring should snap without returning an active spring");
    assert(track.x === 32, "reduced-motion spring should set the numeric destination immediately");
    assert(completed === 1, "reduced-motion spring should still complete");
  } finally {
    clearMotionPreferencesForTests();
  }

  const afterSnap = springTo(track, "x", 10, pageTrackSpring);
  assert(afterSnap !== first, "snap should remove the previous active spring");
  stopTargetSprings(track, { reason: "route-change" });
  assert(motionRuntime.debugSnapshot().counters.canceledByReason["route-change"] === 1, "stopTargetSprings should pass cancel reasons through to the runtime");

  const snapTrack = { x: 0 };
  const snapCountBefore = motionRuntime.debugSnapshot().counters.canceledByReason.snap || 0;
  springTo(snapTrack, "x", 20, pageTrackSpring);
  springTo(snapTrack, "x", 4, pageTrackSpring, { snap: true });
  assert(motionRuntime.debugSnapshot().counters.canceledByReason.snap === snapCountBefore + 1, "snap spring should cancel in-flight spring with a snap reason");
  motionRuntime.reset();
}
