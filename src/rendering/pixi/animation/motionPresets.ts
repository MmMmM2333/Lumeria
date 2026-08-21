import { cubicBezier } from "./motionRuntime.js";
import type { MotionEaseInput, MotionSpringConfig } from "./motionRuntime.js";

export interface MotionPreset {
  duration?: number;
  ease?: MotionEaseInput;
  spring?: Readonly<MotionSpringConfig>;
}

export const motionEases = Object.freeze({
  emphasized: cubicBezier(0.22, 1, 0.36, 1),
  material: cubicBezier(0.4, 0, 0.2, 1),
  settle: cubicBezier(0.2, 0.9, 0.24, 1),
});

export const motionSprings = Object.freeze({
  folderPanelOpen: Object.freeze({ damping: 35, mass: 0.78, restDelta: 0.01, restSpeed: 0.01, stiffness: 560 }),
  handoff: Object.freeze({ damping: 31, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 340 }),
  layout: Object.freeze({ damping: 28, mass: 0.9, restDelta: 0.01, restSpeed: 0.01, stiffness: 190 }),
  settle: Object.freeze({ damping: 29, mass: 0.85, restDelta: 0.01, restSpeed: 0.01, stiffness: 260 }),
  snappy: Object.freeze({ damping: 34, mass: 0.82, restDelta: 0.01, restSpeed: 0.01, stiffness: 520 }),
});

export const motionPresets: Readonly<Record<string, Readonly<MotionPreset>>> = Object.freeze({
  fade: Object.freeze({ duration: 0.16, ease: "power2.out" }),
  folderClose: Object.freeze({ duration: 0.34, ease: motionEases.material }),
  folderOpen: Object.freeze({ duration: 0.38, ease: "power3.out" }),
  folderOpenGhost: Object.freeze({ duration: 0.36, ease: motionEases.emphasized }),
  folderPanelClose: Object.freeze({ duration: 0.38, ease: motionEases.material }),
  folderPanelOpen: Object.freeze({ spring: motionSprings.folderPanelOpen }),
  folderPreviewSettle: Object.freeze({ duration: 0.22, ease: motionEases.settle }),
  handoff: Object.freeze({ spring: motionSprings.handoff }),
  layout: Object.freeze({ spring: motionSprings.layout }),
  press: Object.freeze({ duration: 0.06, ease: "power2.out" }),
  release: Object.freeze({ duration: 0.14, ease: "power2.out" }),
  settle: Object.freeze({ spring: motionSprings.settle }),
  snappy: Object.freeze({ spring: motionSprings.snappy }),
});

export function getMotionPreset(name: string, overrides: MotionPreset = {}): MotionPreset {
  return { ...(motionPresets[name] || {}), ...overrides };
}
