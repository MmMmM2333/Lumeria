import {
  makeTrackKey as makeMotionTrackKey,
  readNumber,
} from "../../rendering/pixi/animation/motionTraceShared.js";

export const MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL = "default-visual";
export const MOTION_CAPTURE_PROFILE_TRANSFORM_FOCUS = "transform-focus";
export const MOTION_CAPTURE_PROFILE_ALPHA_FOCUS = "alpha-focus";
export const MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS = "interruptions";
export const MOTION_CAPTURE_PROFILE_CUSTOM = "custom";

export const MOTION_CAPTURE_ALLOWED_PROPS = [
  "x",
  "y",
  "alpha",
  "scale",
  "scaleX",
  "scaleY",
  "rotation",
];

export const MOTION_CAPTURE_DEFAULT_SAMPLE_HZ = 60;
export const MOTION_CAPTURE_DEFAULT_DURATION_MS = 30000;

const TRANSFORM_PROPS = ["x", "y", "scale", "scaleX", "scaleY", "rotation"];
const INTERRUPTION_EVENT_TYPES = ["cancel", "retarget", "release", "snap"];
const ALLOWED_PROP_SET = new Set(MOTION_CAPTURE_ALLOWED_PROPS);
const CAPTURE_TRACK_KEY_OPTIONS = { laneFallback: "base", laneKeyFallback: "default" };

export const MOTION_CAPTURE_PROFILE_DEFINITIONS = [
  {
    description: "覆盖常用视觉属性，适合日常动画问题排查。",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL,
    includeEvents: true,
    includeSamples: true,
    label: "默认视觉",
    propAllowlist: MOTION_CAPTURE_ALLOWED_PROPS,
    targetFilters: {},
  },
  {
    description: "仅捕获变换属性，用于布局、翻页和缩放问题。",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_TRANSFORM_FOCUS,
    includeEvents: true,
    includeSamples: true,
    label: "变换聚焦",
    propAllowlist: TRANSFORM_PROPS,
    targetFilters: {},
  },
  {
    description: "仅捕获 alpha，用于透明度、淡入淡出和可见性问题。",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_ALPHA_FOCUS,
    includeEvents: true,
    includeSamples: true,
    label: "透明度聚焦",
    propAllowlist: ["alpha"],
    targetFilters: {},
  },
  {
    description: "仅捕获 cancel、retarget、release 和 snap 等生命周期事件。",
    eventTypes: INTERRUPTION_EVENT_TYPES,
    id: MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS,
    includeEvents: true,
    includeSamples: false,
    label: "生命周期中断",
    propAllowlist: MOTION_CAPTURE_ALLOWED_PROPS,
    targetFilters: {},
  },
  {
    description: "自定义属性、目标与生命周期事件过滤条件。",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_CUSTOM,
    includeEvents: true,
    includeSamples: true,
    label: "自定义",
    propAllowlist: MOTION_CAPTURE_ALLOWED_PROPS,
    targetFilters: {},
  },
];

const PROFILE_BY_ID = new Map(MOTION_CAPTURE_PROFILE_DEFINITIONS.map((profile) => [profile.id, profile]));

function readString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function readBoolean(value, fallback) {
  return value == null ? fallback : Boolean(value);
}

function normalizeStringList(value) {
  const input = Array.isArray(value) ? value : value == null ? [] : [value];
  const list = [];
  const seen = new Set();
  for (const entry of input) {
    const text = readString(entry);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    list.push(text);
  }
  return list;
}

function normalizeEventTypes(value) {
  const list = normalizeStringList(value).map((entry) => entry.toLowerCase());
  return Array.from(new Set(list));
}

export function normalizeMotionCapturePropAllowlist(value, fallback = MOTION_CAPTURE_ALLOWED_PROPS) {
  if (value == null) return [...fallback];
  const input = Array.isArray(value) ? value : [value];
  const props = [];
  const seen = new Set();
  for (const entry of input) {
    const prop = readString(entry);
    if (!ALLOWED_PROP_SET.has(prop) || seen.has(prop)) continue;
    seen.add(prop);
    props.push(prop);
  }
  return props;
}

export function normalizeMotionCaptureTargetFilters(filters = {}) {
  return {
    kinds: normalizeStringList(filters.kinds ?? filters.kind),
    layers: normalizeStringList(filters.layers ?? filters.layer),
    sourceLabels: normalizeStringList(filters.sourceLabels ?? filters.sources ?? filters.sourceLabel),
    sourceQuery: readString(filters.sourceQuery ?? filters.query, ""),
  };
}

function cloneProfileDefinition(profile) {
  return {
    description: profile.description,
    eventTypes: [...profile.eventTypes],
    id: profile.id,
    includeEvents: profile.includeEvents,
    includeSamples: profile.includeSamples,
    label: profile.label,
    propAllowlist: [...profile.propAllowlist],
    targetFilters: normalizeMotionCaptureTargetFilters(profile.targetFilters),
  };
}

export function getMotionCaptureProfiles() {
  return MOTION_CAPTURE_PROFILE_DEFINITIONS.map(cloneProfileDefinition);
}

export function getMotionCaptureProfileDefinition(id = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL) {
  return cloneProfileDefinition(PROFILE_BY_ID.get(id) || PROFILE_BY_ID.get(MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL));
}

export function normalizeMotionCaptureProfile(input = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL) {
  const source = typeof input === "string" ? { id: input } : (input && typeof input === "object" ? input : {});
  const requestedId = readString(source.id, MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL);
  const base = PROFILE_BY_ID.get(requestedId) || PROFILE_BY_ID.get(MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL);
  const propSource = Object.prototype.hasOwnProperty.call(source, "propAllowlist")
    ? source.propAllowlist
    : source.props;
  const eventSource = Object.prototype.hasOwnProperty.call(source, "eventTypes")
    ? source.eventTypes
    : base.eventTypes;
  return {
    description: readString(source.description, base.description),
    eventTypes: normalizeEventTypes(eventSource),
    id: base.id,
    includeEvents: readBoolean(source.includeEvents, base.includeEvents),
    includeSamples: readBoolean(source.includeSamples, base.includeSamples),
    label: readString(source.label, base.label),
    propAllowlist: normalizeMotionCapturePropAllowlist(propSource, base.propAllowlist),
    targetFilters: normalizeMotionCaptureTargetFilters(source.targetFilters || source.targets || base.targetFilters),
  };
}

function toLowerSet(values = []) {
  return new Set(values.map((value) => String(value).toLowerCase()));
}

function readRecordKind(record = {}) {
  return readString(record.targetKind ?? record.kind, "");
}

function readRecordSourceLabel(record = {}) {
  return readString(record.sourceLabel ?? record.targetLabel ?? record.label, "");
}

function matchesTargetFilters(record = {}, filters = {}) {
  const layers = toLowerSet(filters.layers);
  const kinds = toLowerSet(filters.kinds);
  const sourceLabels = toLowerSet(filters.sourceLabels);
  const layer = readString(record.layer, "").toLowerCase();
  const kind = readRecordKind(record).toLowerCase();
  const sourceLabel = readRecordSourceLabel(record).toLowerCase();
  if (layers.size && !layers.has(layer)) return false;
  if (kinds.size && !kinds.has(kind)) return false;
  if (sourceLabels.size && !sourceLabels.has(sourceLabel)) return false;
  if (filters.sourceQuery && !sourceLabel.includes(String(filters.sourceQuery).toLowerCase())) return false;
  return true;
}

function isSampleRecord(record = {}) {
  return readString(record.type, "sample").toLowerCase() === "sample";
}

export function matchesMotionCaptureProfileRecord(record = {}, profileInput = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL) {
  const profile = normalizeMotionCaptureProfile(profileInput);
  const type = readString(record.type, "sample").toLowerCase();
  if (type === "sample" && !profile.includeSamples) return false;
  if (type !== "sample" && !profile.includeEvents) return false;
  if (type !== "sample" && profile.eventTypes.length && !profile.eventTypes.includes(type)) return false;
  if (!profile.propAllowlist.includes(readString(record.prop))) return false;
  return matchesTargetFilters(record, profile.targetFilters);
}

export function filterMotionCaptureRecords(records = [], profileInput = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL) {
  return (Array.isArray(records) ? records : []).filter((record) => matchesMotionCaptureProfileRecord(record, profileInput));
}

function collectReportRecords(report = {}) {
  const sampleRecords = [];
  const eventRecords = [];
  for (const animation of report.animations || []) {
    sampleRecords.push({ type: "sample", ...animation });
  }
  for (const sample of report.history?.samples || []) {
    for (const animation of sample.animations || []) {
      sampleRecords.push({
        frame: sample.frame,
        timeMs: sample.timeMs,
        type: "sample",
        ...animation,
      });
    }
  }
  for (const event of report.history?.events || []) {
    eventRecords.push(event);
  }
  return { eventRecords, sampleRecords };
}

function collectMatchedTargetIds(records = []) {
  const targetIds = new Set();
  for (const record of records) {
    if (record?.targetId != null) targetIds.add(record.targetId);
  }
  return targetIds;
}

function estimateJsonBytes({ eventCount, frameCount, targetCount, trackCount, valueCount }) {
  return Math.max(0, Math.round(
    512
    + frameCount * 80
    + valueCount * 128
    + eventCount * 220
    + targetCount * 180
    + trackCount * 160,
  ));
}

export function formatMotionCaptureEstimateBytes(bytes = 0) {
  const value = Math.max(0, readNumber(bytes, 0));
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

export function estimateMotionCaptureProfileSize(report = {}, profileInput = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL, options = {}) {
  const profile = normalizeMotionCaptureProfile(profileInput);
  const durationMs = Math.max(0, readNumber(options.durationMs, readNumber(report.config?.recordWindowMs, MOTION_CAPTURE_DEFAULT_DURATION_MS)));
  const sampleHz = Math.max(1, readNumber(options.sampleHz, readNumber(report.config?.sampleHz, MOTION_CAPTURE_DEFAULT_SAMPLE_HZ)));
  const expectedFrameCount = profile.includeSamples ? Math.ceil((durationMs / 1000) * sampleHz) : 0;
  const { eventRecords, sampleRecords } = collectReportRecords(report);
  const matchingSampleRecords = sampleRecords.filter((record) => matchesMotionCaptureProfileRecord(record, profile));
  const matchingEventRecords = eventRecords.filter((record) => matchesMotionCaptureProfileRecord(record, profile));
  const trackKeys = new Set(
    [...matchingSampleRecords, ...matchingEventRecords].map((record) => makeMotionTrackKey(record, CAPTURE_TRACK_KEY_OPTIONS))
  );
  const targetIds = collectMatchedTargetIds([...matchingSampleRecords, ...matchingEventRecords]);
  const trackCount = trackKeys.size;
  const targetCount = targetIds.size;
  const valueCount = expectedFrameCount * trackCount;
  const eventCount = matchingEventRecords.length;
  const jsonBytes = estimateJsonBytes({
    eventCount,
    frameCount: expectedFrameCount,
    targetCount,
    trackCount,
    valueCount,
  });
  return {
    durationMs,
    eventCount,
    frameCount: expectedFrameCount,
    jsonBytes,
    jsonSizeLabel: formatMotionCaptureEstimateBytes(jsonBytes),
    profileId: profile.id,
    sampleHz,
    targetCount,
    trackCount,
    valueCount,
  };
}
