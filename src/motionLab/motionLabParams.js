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

const MOTION_LAB_PARAM_KEYS = Object.freeze(Object.keys(DEFAULT_MOTION_LAB_PARAMS));

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

function makeMotionLabParamPreset(id, label, description, patch) {
  const params = normalizeMotionLabParams({
    ...DEFAULT_MOTION_LAB_PARAMS,
    ...patch,
  });
  return Object.freeze({
    description,
    id,
    label,
    params: Object.freeze(params),
  });
}

export const MOTION_LAB_PARAM_PRESETS = Object.freeze([
  makeMotionLabParamPreset("snappy", "Snappy", "fast settle / short tweens", {
    blendDurationMs: 40,
    durationMs: 220,
    ease: "power3.out",
    folderTravelPx: 32,
    interruptDelayMs: 32,
    springDamping: 30,
    springMass: 0.72,
    springStiffness: 620,
  }),
  makeMotionLabParamPreset("soft", "Soft", "gentle spring / relaxed hover", {
    blendDurationMs: 120,
    durationMs: 460,
    ease: "sine.inOut",
    folderHoverScale: 1.05,
    iconHoverScale: 1.05,
    iconPressScale: 0.9,
    interruptDelayMs: 80,
    springDamping: 44,
    springMass: 1.15,
    springStiffness: 240,
  }),
  makeMotionLabParamPreset("slow", "Slow", "long tween / heavy settle", {
    blendDurationMs: 180,
    durationMs: 760,
    ease: "power2.inOut",
    folderTravelPx: 56,
    interruptDelayMs: 140,
    jiggleRotationDeg: 2.8,
    springDamping: 58,
    springMass: 1.55,
    springStiffness: 170,
  }),
  makeMotionLabParamPreset("interrupt-heavy", "Interrupt Heavy", "short delay / replacement stress", {
    blendDurationMs: 20,
    durationMs: 260,
    ease: "power2.out",
    interruptDelayMs: 20,
    interruptPolicy: "replace",
    pageDistancePx: 260,
    springDamping: 26,
    springMass: 0.82,
    springStiffness: 560,
  }),
]);

export const MOTION_LAB_PARAM_PRESET_IDS = Object.freeze(MOTION_LAB_PARAM_PRESETS.map((preset) => preset.id));

function areMotionLabParamsEqual(left = {}, right = {}) {
  return MOTION_LAB_PARAM_KEYS.every((key) => left[key] === right[key]);
}

function summarizeMotionLabParamPreset(params = {}) {
  return `${params.durationMs}ms / k${params.springStiffness} / ${params.interruptPolicy}`;
}

export function getMotionLabParamPreset(id = "") {
  const normalizedId = String(id || "").trim().toLowerCase();
  return MOTION_LAB_PARAM_PRESETS.find((preset) => preset.id === normalizedId) || null;
}

export function applyMotionLabParamPreset(params = {}, presetId = "") {
  const preset = getMotionLabParamPreset(presetId);
  if (!preset) return normalizeMotionLabParams(params);
  return { ...preset.params };
}

export function resolveMotionLabParamPresetId(params = {}) {
  const normalized = normalizeMotionLabParams(params);
  const preset = MOTION_LAB_PARAM_PRESETS.find((candidate) => areMotionLabParamsEqual(normalized, candidate.params));
  return preset?.id || "custom";
}

export function buildMotionLabParamPresetRows(params = {}) {
  const selectedId = resolveMotionLabParamPresetId(params);
  return MOTION_LAB_PARAM_PRESETS.map((preset) => ({
    description: preset.description,
    id: preset.id,
    label: preset.label,
    selected: preset.id === selectedId,
    summary: summarizeMotionLabParamPreset(preset.params),
  }));
}
