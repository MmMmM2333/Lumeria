import { pageTrackSpring, springTo, stopTargetSprings } from "./springMotion.js";

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

  const afterSnap = springTo(track, "x", 10, pageTrackSpring);
  assert(afterSnap !== first, "snap should remove the previous active spring");
  stopTargetSprings(track);
}
