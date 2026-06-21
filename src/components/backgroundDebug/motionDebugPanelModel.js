export const MOTION_RECORD_WINDOW_CUSTOM = "custom";
export const MOTION_RECORD_WINDOW_PRESETS = [
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "60s", value: "60000" },
  { label: "120s", value: "120000" },
  { label: "Custom", value: MOTION_RECORD_WINDOW_CUSTOM },
];

const DEFAULT_RECORD_WINDOW_MS = 30000;
const MAX_ROW_COUNT = 12;
const MIN_CUSTOM_SECONDS = 1;
const MAX_CUSTOM_SECONDS = 300;

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMotionCustomSeconds(value) {
  return clamp(Math.round(readNumber(value, DEFAULT_RECORD_WINDOW_MS / 1000)), MIN_CUSTOM_SECONDS, MAX_CUSTOM_SECONDS);
}

export function resolveMotionRecordWindowMs(preset, customSeconds) {
  if (preset === MOTION_RECORD_WINDOW_CUSTOM) return normalizeMotionCustomSeconds(customSeconds) * 1000;
  const matchedPreset = MOTION_RECORD_WINDOW_PRESETS.find((entry) => entry.value === String(preset));
  return matchedPreset ? Number(matchedPreset.value) : DEFAULT_RECORD_WINDOW_MS;
}

export function normalizeMotionTimeScale(value) {
  return clamp(readNumber(value, 1), 0, 2);
}

export function buildMotionRuntimeDebugConfig(options = {}) {
  return {
    enabled: true,
    recordHistory: Boolean(options.recordEnabled),
    recordWindowMs: resolveMotionRecordWindowMs(options.windowPreset, options.customSeconds),
    sampleHz: 10,
    timeScale: normalizeMotionTimeScale(options.timeScale),
  };
}

export function formatMotionNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toFixed(digits);
}

function formatCount(value) {
  return String(Math.max(0, Math.floor(readNumber(value, 0))));
}

function formatWindow(ms) {
  return `${formatMotionNumber(readNumber(ms, DEFAULT_RECORD_WINDOW_MS) / 1000, 0)}s`;
}

function makeEmptyRow(label = "none") {
  return { detail: "-", key: label, value: "0" };
}

export function buildMotionOverviewRows(report = {}) {
  const summary = report.summary || {};
  const config = report.config || {};
  const history = report.history || {};
  const eventCount = Array.isArray(history.events) ? history.events.length : 0;
  const sampleCount = Array.isArray(history.samples) ? history.samples.length : 0;
  return [
    { label: "active", value: formatCount(summary.activeAnimationCount) },
    { label: "targets", value: formatCount(summary.activeTargetCount) },
    { label: "channels", value: formatCount(summary.activeChannelCount) },
    { label: "warnings", value: formatCount(summary.warningCount) },
    { label: "record", value: config.recordHistory ? "on" : "off" },
    { label: "window", value: formatWindow(config.recordWindowMs) },
    { label: "timeScale", value: `${formatMotionNumber(config.timeScale ?? 1, 2)}x` },
    { label: "events/samples", value: `${formatCount(eventCount)} / ${formatCount(sampleCount)}`, wide: true },
  ];
}

function resolveTargetLabel(animation = {}) {
  return animation.sourceLabel
    || animation.targetLabel
    || animation.label
    || (animation.targetId != null ? `target ${animation.targetId}` : "unknown");
}

export function buildMotionAnimationRows(report = {}, limit = MAX_ROW_COUNT) {
  const animations = Array.isArray(report.animations) ? report.animations : [];
  return animations.slice(0, limit).map((animation) => ({
    driver: animation.driver || "-",
    lane: [animation.lane, animation.laneKey].filter(Boolean).join("/") || "-",
    prop: animation.prop || "-",
    target: resolveTargetLabel(animation),
    valueTo: `${formatMotionNumber(animation.value)} -> ${formatMotionNumber(animation.to)}`,
    velocity: formatMotionNumber(animation.velocity),
  }));
}

export function buildMotionCancelReasonRows(report = {}, limit = 6) {
  const counts = report.counters?.canceledByReason || {};
  const rows = Object.entries(counts)
    .map(([key, value]) => ({ detail: key, key, value: formatCount(value) }))
    .sort((a, b) => (Number(b.value) - Number(a.value)) || a.key.localeCompare(b.key))
    .slice(0, limit);
  return rows.length ? rows : [makeEmptyRow()];
}

export function buildMotionWarningRows(report = {}, limit = 6) {
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const rows = warnings.slice(0, limit).map((warning) => ({
    detail: [
      warning.type || "warning",
      warning.sourceLabel || warning.targetLabel || (warning.targetId != null ? `target ${warning.targetId}` : null),
      warning.prop,
      warning.laneKey,
    ].filter(Boolean).join(" / "),
    key: warning.type || "warning",
    value: warning.prop || "-",
  }));
  return rows.length ? rows : [makeEmptyRow()];
}
