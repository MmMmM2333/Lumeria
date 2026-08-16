import {
  appendGroupTrailPoint,
  getGroupTrailSettleDurationMs,
  makeGroupFollowerTarget,
  makeGroupReleaseDelayMs,
  makeGroupStackTarget,
  sampleGroupTrailPoint,
} from "./groupDragPresentation.js";

export function runGroupDragPresentationTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Group drag presentation test failed] ${message}`);
  };
  let trail = [];
  for (let index = 0; index < 30; index += 1) {
    trail = appendGroupTrailPoint(trail, { x: index * 8, y: index * 2 }, { timeMs: index * 16 });
  }
  assert(trail.length === 14, "the pointer trail should remain bounded");
  const unchanged = appendGroupTrailPoint(trail, { x: trail.at(-1).x + 1, y: trail.at(-1).y });
  assert(unchanged.length === trail.length, "sub-threshold pointer noise should not add a trail point");
  assert(
    unchanged.at(-1).x === trail.at(-1).x + 1,
    "sub-threshold samples should still refresh the authoritative trail endpoint"
  );

  const lead = makeGroupStackTarget({ x: 100, y: 80 }, 0, 12);
  const follower = makeGroupStackTarget({ x: 100, y: 80 }, 4, 12);
  assert(lead.x === 100 && lead.y === 80, "the lead should stay under the pointer center");
  assert(follower.y > lead.y, "followers should form a readable stack below the lead");
  assert(makeGroupReleaseDelayMs(9, 10) > makeGroupReleaseDelayMs(1, 10), "accepted icons should land in order");
  assert(makeGroupReleaseDelayMs(30, 40) <= 260, "large groups should cap the release cascade");
  assert(makeGroupReleaseDelayMs(30, 40, { reducedMotion: true }) === 0, "reduced motion should remove release staggering");

  const sampled = sampleGroupTrailPoint([
    { time: 0, x: 0, y: 0 },
    { time: 100, x: 100, y: 0 },
  ], 25);
  assert(sampled.x === 75, "trail sampling should interpolate by elapsed milliseconds");
  const settledSample = sampleGroupTrailPoint([
    { time: 0, x: 0, y: 0 },
    { time: 100, x: 100, y: 0 },
  ], 25, { timeMs: 125 });
  assert(settledSample.x === 100, "an advancing presentation clock should consume the trail after pointer input stops");
  assert(
    getGroupTrailSettleDurationMs(12) === 130,
    "the follower clock should cover the capped visible follower delay"
  );
  const delayedFollower = makeGroupFollowerTarget(
    { x: 120, y: 0 },
    [
      { time: 0, x: 0, y: 0 },
      { time: 120, x: 120, y: 0 },
    ],
    3,
    6,
    { delayStepMs: 20, maxDistance: 72 }
  );
  assert(delayedFollower.x < 120, "followers should consume an older point on the pointer trail");
  assert(Math.hypot(delayedFollower.x - 120, delayedFollower.y) <= 72.001, "followers should stay within the maximum lead distance");
  const settledFollower = makeGroupFollowerTarget(
    { x: 120, y: 0 },
    [
      { time: 0, x: 0, y: 0 },
      { time: 120, x: 120, y: 0 },
    ],
    3,
    6,
    { delayStepMs: 20, maxDistance: 72, timeMs: 180 }
  );
  assert(
    settledFollower.x > delayedFollower.x,
    "followers should keep advancing toward the final stack while the physical pointer is stationary"
  );
  const reducedFollower = makeGroupFollowerTarget(
    { x: 120, y: 0 },
    trail,
    3,
    6,
    { reducedMotion: true }
  );
  assert(reducedFollower.y > 0, "reduced motion should use a compact static stack instead of delayed path following");
}
