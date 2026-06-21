export const MOTION_LAB_EASE_OPTIONS = Object.freeze([
  "linear",
  "power1.out",
  "power2.out",
  "power2.inOut",
  "power3.out",
  "sine.inOut",
]);

export const MOTION_LAB_INTERRUPT_OPTIONS = Object.freeze([
  "auto",
  "replace",
  "retarget",
  "blend",
  "ignore",
]);

export const DEFAULT_MOTION_LAB_PARAMS = Object.freeze({
  blendDurationMs: 80,
  dragDistancePx: 220,
  dragReleaseYPx: 248,
  durationMs: 360,
  ease: "power2.out",
  folderClosedScale: 0.86,
  folderHoverScale: 1.08,
  folderOpenScale: 1,
  folderTravelPx: 40,
  iconHoverScale: 1.08,
  iconPressScale: 0.86,
  interruptDelayMs: 60,
  interruptPolicy: "auto",
  jiggleRotationDeg: 4.3,
  pageDistancePx: 220,
  springDamping: 34,
  springMass: 0.9,
  springStiffness: 360,
});

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, min, max, fallback) {
  return Math.min(max, Math.max(min, readNumber(value, fallback)));
}

function readOption(value, options, fallback) {
  const text = String(value ?? "").trim();
  return options.includes(text) ? text : fallback;
}

export function normalizeMotionLabParams(params = {}) {
  const source = params && typeof params === "object" ? params : {};
  return {
    blendDurationMs: clampNumber(source.blendDurationMs, 0, 500, DEFAULT_MOTION_LAB_PARAMS.blendDurationMs),
    dragDistancePx: clampNumber(source.dragDistancePx ?? source.distancePx, 40, 480, DEFAULT_MOTION_LAB_PARAMS.dragDistancePx),
    dragReleaseYPx: clampNumber(source.dragReleaseYPx, 120, 340, DEFAULT_MOTION_LAB_PARAMS.dragReleaseYPx),
    durationMs: clampNumber(source.durationMs, 80, 1200, DEFAULT_MOTION_LAB_PARAMS.durationMs),
    ease: readOption(source.ease, MOTION_LAB_EASE_OPTIONS, DEFAULT_MOTION_LAB_PARAMS.ease),
    folderClosedScale: clampNumber(source.folderClosedScale, 0.58, 1, DEFAULT_MOTION_LAB_PARAMS.folderClosedScale),
    folderHoverScale: clampNumber(source.folderHoverScale, 0.92, 1.3, DEFAULT_MOTION_LAB_PARAMS.folderHoverScale),
    folderOpenScale: clampNumber(source.folderOpenScale, 0.8, 1.22, DEFAULT_MOTION_LAB_PARAMS.folderOpenScale),
    folderTravelPx: clampNumber(source.folderTravelPx, 0, 120, DEFAULT_MOTION_LAB_PARAMS.folderTravelPx),
    iconHoverScale: clampNumber(source.iconHoverScale, 0.92, 1.28, DEFAULT_MOTION_LAB_PARAMS.iconHoverScale),
    iconPressScale: clampNumber(source.iconPressScale, 0.62, 1, DEFAULT_MOTION_LAB_PARAMS.iconPressScale),
    interruptDelayMs: clampNumber(source.interruptDelayMs, 0, 400, DEFAULT_MOTION_LAB_PARAMS.interruptDelayMs),
    interruptPolicy: readOption(source.interruptPolicy, MOTION_LAB_INTERRUPT_OPTIONS, DEFAULT_MOTION_LAB_PARAMS.interruptPolicy),
    jiggleRotationDeg: clampNumber(source.jiggleRotationDeg, 0, 12, DEFAULT_MOTION_LAB_PARAMS.jiggleRotationDeg),
    pageDistancePx: clampNumber(source.pageDistancePx ?? source.distancePx, 40, 480, DEFAULT_MOTION_LAB_PARAMS.pageDistancePx),
    springDamping: clampNumber(source.springDamping ?? source.damping, 4, 120, DEFAULT_MOTION_LAB_PARAMS.springDamping),
    springMass: clampNumber(source.springMass, 0.2, 3, DEFAULT_MOTION_LAB_PARAMS.springMass),
    springStiffness: clampNumber(source.springStiffness ?? source.stiffness, 40, 1200, DEFAULT_MOTION_LAB_PARAMS.springStiffness),
  };
}
