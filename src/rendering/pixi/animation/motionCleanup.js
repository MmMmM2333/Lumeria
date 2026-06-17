import { gsap } from "gsap";
import { stopTargetSprings } from "./springMotion.js";

export function killAllMotion(node, options = {}) {
  if (!node) return;
  const recursive = options.recursive !== false;
  gsap.killTweensOf(node);
  stopTargetSprings(node);
  if (node.scale) {
    gsap.killTweensOf(node.scale);
    stopTargetSprings(node.scale);
  }
  if (!recursive) return;
  for (const child of node.children || []) killAllMotion(child);
}
