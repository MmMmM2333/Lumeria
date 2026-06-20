import { killAllMotion } from "./motionCleanup.js";
import { motionRuntime } from "./motionRuntime.js";
import { motionTo } from "./motionTween.js";
import { pageTrackSpring, springTo } from "./springMotion.js";

export function runMotionCleanupTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion cleanup test failed] ${message}`);
  };

  motionRuntime.reset();
  const child = { children: [], scale: { x: 1, y: 1 }, x: 0 };
  const node = { children: [child], scale: { x: 1, y: 1 }, x: 0 };
  const reasons = [];
  const nodeTween = motionTo(node, { duration: 1, onCancel: (reason) => reasons.push(`node:${reason}`), x: 10 });
  const scaleTween = motionTo(node.scale, { duration: 1, onCancel: (reason) => reasons.push(`scale:${reason}`), x: 2 });
  const childTween = motionTo(child, { duration: 1, onCancel: (reason) => reasons.push(`child:${reason}`), x: 10 });
  springTo(node, "x", 20, pageTrackSpring);

  killAllMotion(node);

  assert(nodeTween.completed, "node tween should be killed");
  assert(scaleTween.completed, "node scale tween should be killed");
  assert(childTween.completed, "child tween should be killed recursively");
  const cleanupCount = motionRuntime.debugSnapshot().counters.canceledByReason.cleanup || 0;
  assert(cleanupCount >= 2, `killAllMotion should mark active recursive cancellations as cleanup, got ${cleanupCount}`);
  assert(reasons.includes("scale:cleanup"), "killAllMotion should pass cleanup to scale motion");
  assert(reasons.includes("child:cleanup"), "killAllMotion should pass cleanup to child motion");
  motionRuntime.reset();
}
