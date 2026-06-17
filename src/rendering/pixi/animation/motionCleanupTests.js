import { gsap } from "gsap";
import { killAllMotion } from "./motionCleanup.js";
import { pageTrackSpring, springTo } from "./springMotion.js";

export function runMotionCleanupTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion cleanup test failed] ${message}`);
  };

  const child = { children: [], scale: { x: 1, y: 1 }, x: 0 };
  const node = { children: [child], scale: { x: 1, y: 1 }, x: 0 };
  gsap.to(node, { duration: 1, x: 10 });
  gsap.to(node.scale, { duration: 1, x: 2 });
  gsap.to(child, { duration: 1, x: 10 });
  springTo(node, "x", 20, pageTrackSpring);

  killAllMotion(node);

  assert(gsap.getTweensOf(node).length === 0, "node tweens should be killed");
  assert(gsap.getTweensOf(node.scale).length === 0, "node scale tweens should be killed");
  assert(gsap.getTweensOf(child).length === 0, "child tweens should be killed recursively");
}
