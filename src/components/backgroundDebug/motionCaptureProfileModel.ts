import {
  makeTrackKey as makeMotionTrackKey,
  readNumber,
} from "../../rendering/motionPort.js";
import type { MotionTraceRecord } from "../../rendering/motionPort.js";

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
] as const;

export type MotionCaptureAllowedProp = (typeof MOTION_CAPTURE_ALLOWED_PROPS)[number];

export interface MotionCaptureTargetFiltersInput extends Readonly<Record<string, unknown>> {
  kind?: unknown;
  kinds?: unknown;
  layer?: unknown;
  layers?: unknown;
  query?: unknown;
  sourceLabel?: unknown;
  sourceLabels?: unknown;
  sourceQuery?: unknown;
  sources?: unknown;
}

export interface MotionCaptureTargetFilters extends MotionCaptureTargetFiltersInput {
  kinds: string[];
  layers: string[];
  sourceLabels: string[];
  sourceQuery: string;
}

export interface MotionCaptureProfileInput extends Readonly<Record<string, unknown>> {
  description?: unknown;
  descriptionKey?: unknown;
  eventTypes?: unknown;
  id?: unknown;
  includeEvents?: unknown;
  includeSamples?: unknown;
  label?: unknown;
  labelKey?: unknown;
  propAllowlist?: unknown;
  props?: unknown;
  targetFilters?: MotionCaptureTargetFiltersInput;
  targets?: MotionCaptureTargetFiltersInput;
}

export interface MotionCaptureProfileDefinition {
  description: string;
  descriptionKey: string;
  eventTypes: readonly string[];
  id: string;
  includeEvents: boolean;
  includeSamples: boolean;
  label: string;
  labelKey: string;
  propAllowlist: readonly MotionCaptureAllowedProp[];
  targetFilters: MotionCaptureTargetFiltersInput;
}

export interface MotionCaptureProfile extends MotionCaptureProfileInput {
  description: string;
  descriptionKey: string;
  eventTypes: string[];
  id: string;
  includeEvents: boolean;
  includeSamples: boolean;
  label: string;
  labelKey: string;
  propAllowlist: MotionCaptureAllowedProp[];
  targetFilters: MotionCaptureTargetFilters;
}

export type MotionCaptureProfileLike = string | MotionCaptureProfileInput;

interface MotionCaptureReport extends Readonly<Record<string, unknown>> {
  animations?: readonly MotionTraceRecord[];
  config?: Readonly<{ recordWindowMs?: unknown; sampleHz?: unknown }>;
  history?: Readonly<{
    events?: readonly MotionTraceRecord[];
    samples?: readonly Readonly<{ animations?: readonly MotionTraceRecord[]; frame?: number; timeMs?: number }>[];
  }>;
}

interface MotionCaptureEstimateOptions {
  durationMs?: unknown;
  sampleHz?: unknown;
}

export const MOTION_CAPTURE_DEFAULT_SAMPLE_HZ = 60;
export const MOTION_CAPTURE_DEFAULT_DURATION_MS = 30000;

const TRANSFORM_PROPS = ["x", "y", "scale", "scaleX", "scaleY", "rotation"] as const;
const INTERRUPTION_EVENT_TYPES = ["cancel", "retarget", "release", "snap"];
const ALLOWED_PROP_SET = new Set(MOTION_CAPTURE_ALLOWED_PROPS);
const CAPTURE_TRACK_KEY_OPTIONS = { laneFallback: "base", laneKeyFallback: "default" };

export const MOTION_CAPTURE_PROFILE_DEFINITIONS: readonly MotionCaptureProfileDefinition[] = [
  {
    description: "Covers common visual properties for everyday animation diagnostics.",
    descriptionKey: "debug.motion.profiles.defaultVisualDescription",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL,
    includeEvents: true,
    includeSamples: true,
    label: "Default visual",
    labelKey: "debug.motion.profiles.defaultVisual",
    propAllowlist: MOTION_CAPTURE_ALLOWED_PROPS,
    targetFilters: {},
  },
  {
    description: "Captures only transform properties for layout, paging, and scaling issues.",
    descriptionKey: "debug.motion.profiles.transformFocusDescription",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_TRANSFORM_FOCUS,
    includeEvents: true,
    includeSamples: true,
    label: "Transform focus",
    labelKey: "debug.motion.profiles.transformFocus",
    propAllowlist: TRANSFORM_PROPS,
    targetFilters: {},
  },
  {
    description: "Captures only alpha for opacity, fade, and visibility issues.",
    descriptionKey: "debug.motion.profiles.alphaFocusDescription",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_ALPHA_FOCUS,
    includeEvents: true,
    includeSamples: true,
    label: "Opacity focus",
    labelKey: "debug.motion.profiles.alphaFocus",
    propAllowlist: ["alpha"],
    targetFilters: {},
  },
  {
    description: "Captures lifecycle events such as cancel, retarget, release, and snap.",
    descriptionKey: "debug.motion.profiles.interruptionsDescription",
    eventTypes: INTERRUPTION_EVENT_TYPES,
    id: MOTION_CAPTURE_PROFILE_INTERRUPTION_FOCUS,
    includeEvents: true,
    includeSamples: false,
    label: "Lifecycle interruptions",
    labelKey: "debug.motion.profiles.interruptions",
    propAllowlist: MOTION_CAPTURE_ALLOWED_PROPS,
    targetFilters: {},
  },
  {
    description: "Uses custom property, target, and lifecycle event filters.",
    descriptionKey: "debug.motion.profiles.customDescription",
    eventTypes: [],
    id: MOTION_CAPTURE_PROFILE_CUSTOM,
    includeEvents: true,
    includeSamples: true,
    label: "Custom",
    labelKey: "debug.motion.profiles.custom",
    propAllowlist: MOTION_CAPTURE_ALLOWED_PROPS,
    targetFilters: {},
  },
];

const PROFILE_BY_ID = new Map<string, MotionCaptureProfileDefinition>(MOTION_CAPTURE_PROFILE_DEFINITIONS.map((profile) => [profile.id, profile]));

function readString(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return value == null ? fallback : Boolean(value);
}

function normalizeStringList(value: unknown): string[] {
  const input = Array.isArray(value) ? value : value == null ? [] : [value];
  const list: string[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    const text = readString(entry);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    list.push(text);
  }
  return list;
}

function normalizeEventTypes(value: unknown): string[] {
  const list = normalizeStringList(value).map((entry) => entry.toLowerCase());
  return Array.from(new Set(list));
}

export function normalizeMotionCapturePropAllowlist(value: unknown, fallback: readonly MotionCaptureAllowedProp[] = MOTION_CAPTURE_ALLOWED_PROPS): MotionCaptureAllowedProp[] {
  if (value == null) return [...fallback];
  const input = Array.isArray(value) ? value : [value];
  const props: MotionCaptureAllowedProp[] = [];
  const seen = new Set<MotionCaptureAllowedProp>();
  for (const entry of input) {
    const prop = readString(entry);
    if (!ALLOWED_PROP_SET.has(prop as MotionCaptureAllowedProp)) continue;
    const allowedProp = prop as MotionCaptureAllowedProp;
    if (seen.has(allowedProp)) continue;
    seen.add(allowedProp);
    props.push(allowedProp);
  }
  return props;
}

export function normalizeMotionCaptureTargetFilters(filters: MotionCaptureTargetFiltersInput = {}): MotionCaptureTargetFilters {
  return {
    kinds: normalizeStringList(filters.kinds ?? filters.kind),
    layers: normalizeStringList(filters.layers ?? filters.layer),
    sourceLabels: normalizeStringList(filters.sourceLabels ?? filters.sources ?? filters.sourceLabel),
    sourceQuery: readString(filters.sourceQuery ?? filters.query, ""),
  };
}

function cloneProfileDefinition(profile: MotionCaptureProfileDefinition): MotionCaptureProfile {
  return {
    description: profile.description,
    descriptionKey: profile.descriptionKey,
    eventTypes: [...profile.eventTypes],
    id: profile.id,
    includeEvents: profile.includeEvents,
    includeSamples: profile.includeSamples,
    label: profile.label,
    labelKey: profile.labelKey,
    propAllowlist: [...profile.propAllowlist],
    targetFilters: normalizeMotionCaptureTargetFilters(profile.targetFilters),
  };
}

export function getMotionCaptureProfiles(): MotionCaptureProfile[] {
  return MOTION_CAPTURE_PROFILE_DEFINITIONS.map(cloneProfileDefinition);
}

export function getMotionCaptureProfileDefinition(id: string = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL): MotionCaptureProfile {
  const profile = PROFILE_BY_ID.get(id) || PROFILE_BY_ID.get(MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL);
  return cloneProfileDefinition(profile as MotionCaptureProfileDefinition);
}

export function normalizeMotionCaptureProfile(input: MotionCaptureProfileLike = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL): MotionCaptureProfile {
  const source = typeof input === "string" ? { id: input } : (input && typeof input === "object" ? input : {});
  const requestedId = readString(source.id, MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL);
  const base = (PROFILE_BY_ID.get(requestedId) || PROFILE_BY_ID.get(MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL)) as MotionCaptureProfileDefinition;
  const propSource = Object.prototype.hasOwnProperty.call(source, "propAllowlist")
    ? source.propAllowlist
    : source.props;
  const eventSource = Object.prototype.hasOwnProperty.call(source, "eventTypes")
    ? source.eventTypes
    : base.eventTypes;
  return {
    description: readString(source.description, base.description),
    descriptionKey: readString(source.descriptionKey, base.descriptionKey),
    eventTypes: normalizeEventTypes(eventSource),
    id: base.id,
    includeEvents: readBoolean(source.includeEvents, base.includeEvents),
    includeSamples: readBoolean(source.includeSamples, base.includeSamples),
    label: readString(source.label, base.label),
    labelKey: readString(source.labelKey, base.labelKey),
    propAllowlist: normalizeMotionCapturePropAllowlist(propSource, base.propAllowlist),
    targetFilters: normalizeMotionCaptureTargetFilters(source.targetFilters || source.targets || base.targetFilters),
  };
}

function toLowerSet(values: readonly string[] = []): Set<string> {
  return new Set(values.map((value) => String(value).toLowerCase()));
}

function readRecordKind(record: MotionTraceRecord = {}): string {
  return readString(record.targetKind ?? record.kind, "");
}

function readRecordSourceLabel(record: MotionTraceRecord = {}): string {
  return readString(record.sourceLabel ?? record.targetLabel ?? record.label, "");
}

function matchesTargetFilters(record: MotionTraceRecord = {}, filters: MotionCaptureTargetFilters = { kinds: [], layers: [], sourceLabels: [], sourceQuery: "" }): boolean {
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

function isSampleRecord(record: MotionTraceRecord = {}): boolean {
  return readString(record.type, "sample").toLowerCase() === "sample";
}

export function matchesMotionCaptureProfileRecord(record: MotionTraceRecord = {}, profileInput: MotionCaptureProfileLike = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL): boolean {
  const profile = normalizeMotionCaptureProfile(profileInput);
  const type = readString(record.type, "sample").toLowerCase();
  if (type === "sample" && !profile.includeSamples) return false;
  if (type !== "sample" && !profile.includeEvents) return false;
  if (type !== "sample" && profile.eventTypes.length && !profile.eventTypes.includes(type)) return false;
  if (!profile.propAllowlist.includes(readString(record.prop) as MotionCaptureAllowedProp)) return false;
  return matchesTargetFilters(record, profile.targetFilters);
}

export function filterMotionCaptureRecords(records: readonly MotionTraceRecord[] = [], profileInput: MotionCaptureProfileLike = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL): MotionTraceRecord[] {
  return (Array.isArray(records) ? records : []).filter((record) => matchesMotionCaptureProfileRecord(record, profileInput));
}

function collectReportRecords(report: MotionCaptureReport = {}): { eventRecords: MotionTraceRecord[]; sampleRecords: MotionTraceRecord[] } {
  const sampleRecords: MotionTraceRecord[] = [];
  const eventRecords: MotionTraceRecord[] = [];
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

function collectMatchedTargetIds(records: readonly MotionTraceRecord[] = []): Set<number | string> {
  const targetIds = new Set<number | string>();
  for (const record of records) {
    if (record?.targetId != null) targetIds.add(record.targetId);
  }
  return targetIds;
}

function estimateJsonBytes({ eventCount, frameCount, targetCount, trackCount, valueCount }: Readonly<{ eventCount: number; frameCount: number; targetCount: number; trackCount: number; valueCount: number }>): number {
  return Math.max(0, Math.round(
    512
    + frameCount * 80
    + valueCount * 128
    + eventCount * 220
    + targetCount * 180
    + trackCount * 160,
  ));
}

export function formatMotionCaptureEstimateBytes(bytes: unknown = 0): string {
  const value = Math.max(0, readNumber(bytes, 0));
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

export function estimateMotionCaptureProfileSize(report: MotionCaptureReport = {}, profileInput: MotionCaptureProfileLike = MOTION_CAPTURE_PROFILE_DEFAULT_VISUAL, options: MotionCaptureEstimateOptions = {}) {
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
