import { killMotionOf } from "./motionTween.js";

export interface MotionCleanupNode {
  children?: readonly MotionCleanupNode[];
  scale?: object | null;
}

export interface KillAllMotionOptions {
  reason?: string;
  recursive?: boolean;
}

export function killAllMotion(
  node: (object & MotionCleanupNode) | null | undefined,
  options: KillAllMotionOptions = {},
): void {
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
