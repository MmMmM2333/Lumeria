import { killMotionOf } from "./motionTween.js";

export function killAllMotion(node, options = {}) {
  if (!node) return;
  const recursive = options.recursive !== false;
  const reason = options.reason || "cleanup";
  killMotionOf(node, null, { reason });
  if (node.scale) {
    killMotionOf(node.scale, null, { reason });
  }
  if (!recursive) return;
  for (const child of node.children || []) killAllMotion(child, options);
}
