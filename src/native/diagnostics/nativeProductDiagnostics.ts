import {
  DiagnosticError,
  makeDiagnosticErrorPayload,
} from "../../diagnostics/diagnosticError.js";
import {
  createMotionReplayTraceFromRuntime,
  createMotionRuntimeDebugAdapter,
  installMotionRuntimeDebugAdapterFactory,
  MOTION_REPLAY_TRACE_SCHEMA,
  MOTION_REPLAY_TRACE_VERSION,
  motionRuntime,
  createNoopMotionRuntimeDebugAdapter,
} from "../../rendering/motionPort.js";
import type {
  MotionDebugConfig,
  MotionDebugConfigPatch,
  MotionDebugReport,
  MotionRuntime,
} from "../../rendering/motionPort.js";

type UnknownRecord = Record<string, unknown>;

export const NATIVE_PRODUCT_DIAGNOSTICS_SCHEMA = "lumeria-native-product-diagnostics/v1";
export const NATIVE_PRODUCT_DIAGNOSTICS_ACTIONS = Object.freeze([
  "background-preview",
  "background-restore",
  "background-state",
  "layout-preview",
  "layout-restore",
  "layout-state",
  "motion-clear",
  "motion-config",
  "motion-report",
  "motion-trace",
] as const);

export interface NativeDiagnosticsStatePort {
  getState(): unknown;
}

/**
 * Preview is intentionally a separate operation from persistence. The product
 * adapter must keep it temporary and make restore() return to the prior state.
 */
export interface NativeDiagnosticsPreviewPort extends NativeDiagnosticsStatePort {
  preview(patch: Readonly<UnknownRecord>): unknown | Promise<unknown>;
  restore(): unknown | Promise<unknown>;
}

export interface NativeProductDiagnosticsPorts {
  readonly background?: NativeDiagnosticsPreviewPort;
  readonly layout?: NativeDiagnosticsPreviewPort;
  readonly liveDesktop?: NativeDiagnosticsStatePort;
  readonly motion?: MotionRuntime;
  readonly now?: () => Date;
}

export interface NativeProductDiagnosticsDisposeResult {
  readonly errors: readonly Readonly<{ message: string; source: string }>[];
  readonly restored: readonly string[];
}

export interface NativeProductDiagnostics {
  readonly command: (command: UnknownRecord) => Promise<unknown>;
  dispose(): Promise<NativeProductDiagnosticsDisposeResult>;
  readonly status: () => UnknownRecord;
}

const MOTION_CONFIG_FIELDS = Object.freeze([
  "enabled",
  "maxEvents",
  "maxSamples",
  "overlayEnabled",
  "recordHistory",
  "recordWindowMs",
  "sampleHz",
  "timeScale",
] as const);
const MOTION_REPORT_FIELDS = Object.freeze([
  "includeChannels",
  "includeCurveStats",
  "includeHistory",
  "includeTargets",
  "maxAnimations",
  "maxCurveStats",
  "maxEvents",
  "maxSamples",
  "maxTargets",
  "maxWarnings",
] as const);
const MOTION_TRACE_FIELDS = Object.freeze([
  "durationMs",
  "maxCurveStats",
  "maxEvents",
  "maxFrames",
  "maxTargets",
  "maxTracks",
  "maxValuesPerFrame",
  "maxWarnings",
  "sampleHz",
  "seconds",
] as const);
const BACKGROUND_PREVIEW_FIELDS = Object.freeze([
  "blurStrength",
  "darkenColor",
  "darkenStrength",
  "effect",
  "liveDesktopOpacity",
  "source",
] as const);
const LAYOUT_PREVIEW_FIELDS = Object.freeze([
  "dragHitZonesEnabled",
  "enabled",
  "gridPaddingTopPx",
  "hostHeightOffsetPx",
  "hostMaxHeightPx",
  "mainPaddingYPx",
] as const);

const MOTION_REPORT_DEFAULTS = Object.freeze({
  includeChannels: true,
  includeCurveStats: true,
  includeHistory: true,
  includeTargets: true,
  maxAnimations: 200,
  maxCurveStats: 200,
  maxEvents: 300,
  maxSamples: 120,
  maxTargets: 200,
  maxWarnings: 200,
});
const MOTION_TRACE_DEFAULTS = Object.freeze({
  durationMs: 30_000,
  maxCurveStats: 200,
  maxEvents: 400,
  maxFrames: 240,
  maxTargets: 200,
  maxTracks: 200,
  maxValuesPerFrame: 200,
  maxWarnings: 200,
  sampleHz: 30,
});
const JSON_SANITIZE_DEPTH = 8;
const JSON_SANITIZE_MAX_ARRAY = 300;
const STATUS_SANITIZE_DEPTH = 5;
const STATUS_SANITIZE_MAX_ARRAY = 80;
const BACKGROUND_SOURCES = new Set([
  "customImage",
  "systemMaterial",
  "windowsLiveDesktop",
  "windowsWallpaper",
]);
const BACKGROUND_EFFECTS = new Set(["acrylic", "blur", "dimmed", "none"]);
const LAYOUT_NUMBER_LIMITS = Object.freeze({
  gridPaddingTopPx: { max: 80, min: 0 },
  hostHeightOffsetPx: { max: 240, min: -160 },
  hostMaxHeightPx: { max: 2200, min: 600 },
  mainPaddingYPx: { max: 40, min: 0 },
});

let installedAdapterLeaseCount = 0;

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function asRecord(value: unknown): UnknownRecord | null {
  return isPlainRecord(value) ? value : null;
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

function sanitizeJsonValue(
  value: unknown,
  depth = JSON_SANITIZE_DEPTH,
  maxArray = JSON_SANITIZE_MAX_ARRAY,
  seen = new Set<object>(),
): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return undefined;
  if (depth <= 0 || seen.has(value)) return undefined;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.slice(0, Math.max(0, maxArray)).map((entry) => (
        sanitizeJsonValue(entry, depth - 1, maxArray, seen)
      ));
    }
    const result: UnknownRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeJsonValue(entry, depth - 1, maxArray, seen);
      if (sanitized !== undefined) result[key] = sanitized;
    }
    return result;
  } finally {
    seen.delete(value);
  }
}

function sanitizeRecord(value: unknown): UnknownRecord | null {
  const sanitized = sanitizeJsonValue(value);
  return asRecord(sanitized);
}

function boundRecordArray(value: unknown, limit: number, fromEnd = false): UnknownRecord[] {
  if (!Array.isArray(value) || limit <= 0) return [];
  const source = fromEnd ? value.slice(-limit) : value.slice(0, limit);
  return source
    .map(sanitizeRecord)
    .filter((record): record is UnknownRecord => record !== null);
}

function requireCommandRecord(command: unknown): UnknownRecord {
  if (!isPlainRecord(command)) {
    throw new DiagnosticError(
      "native-diagnostics-command-invalid",
      "Native product diagnostics requires a command object",
      {
        details: { receivedType: Array.isArray(command) ? "array" : typeof command },
        nextActions: ["Pass an object with an action field"],
      },
    );
  }
  return command;
}

function requireAction(command: UnknownRecord): string {
  if (typeof command.action !== "string" || !command.action.trim()) {
    throw new DiagnosticError(
      "native-diagnostics-action-invalid",
      "Native product diagnostics requires a non-empty action string",
      {
        details: { action: command.action ?? null },
        nextActions: [`Use one of: ${NATIVE_PRODUCT_DIAGNOSTICS_ACTIONS.join(", ")}`],
      },
    );
  }
  return command.action.trim();
}

function assertAllowedFields(
  command: UnknownRecord,
  allowedFields: readonly string[],
  action: string,
): void {
  const unknownFields = Object.keys(command).filter((key) => key !== "action" && !allowedFields.includes(key));
  if (unknownFields.length) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      `${action} contains unsupported parameters`,
      {
        details: { allowedFields, unknownFields },
        nextActions: ["Remove unknown fields; commands never accept arbitrary objects or code"],
      },
    );
  }
}

function readBoolean(command: UnknownRecord, key: string, action: string): boolean {
  const value = command[key];
  if (typeof value !== "boolean") {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      `${action}.${key} must be a boolean`,
      { details: { key, value: value ?? null } },
    );
  }
  return value;
}

function readFiniteNumber(
  command: UnknownRecord,
  key: string,
  action: string,
  min: number,
  max: number,
): number {
  const value = command[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      `${action}.${key} must be a finite number in [${min}, ${max}]`,
      { details: { key, max, min, value: value ?? null } },
    );
  }
  return value;
}

function readInteger(
  command: UnknownRecord,
  key: string,
  action: string,
  min: number,
  max: number,
): number {
  const value = readFiniteNumber(command, key, action, min, max);
  if (!Number.isInteger(value)) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      `${action}.${key} must be an integer`,
      { details: { key, value } },
    );
  }
  return value;
}

function readEnum(
  command: UnknownRecord,
  key: string,
  action: string,
  allowed: ReadonlySet<string>,
): string {
  const value = command[key];
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      `${action}.${key} must use one of ${Array.from(allowed).join(", ")}`,
      { details: { allowed: Array.from(allowed), key, value: value ?? null } },
    );
  }
  return value;
}

function readColor(command: UnknownRecord, key: string, action: string): string {
  const value = command[key];
  if (typeof value !== "string" || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value.trim())) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      `${action}.${key} must be a #rgb or #rrggbb color`,
      { details: { key, value: value ?? null } },
    );
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length === 4
    ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
    : normalized;
}

function ensurePort<Port>(port: Port | undefined, action: string): Port {
  if (!port) {
    throw new DiagnosticError(
      "native-diagnostics-capability-unavailable",
      `${action} is unavailable because its product port was not injected`,
      {
        details: { action },
        nextActions: ["Connect the corresponding background or layout port in nativeProduct"],
      },
    );
  }
  return port;
}

function requirePreviewPort(
  port: NativeDiagnosticsPreviewPort | undefined,
  action: string,
): NativeDiagnosticsPreviewPort {
  const candidate = ensurePort(port, action);
  if (typeof candidate.getState !== "function"
    || typeof candidate.preview !== "function"
    || typeof candidate.restore !== "function") {
    throw new TypeError(`${action} requires a port with getState(), preview(), and restore()`);
  }
  return candidate;
}

function validateMotionConfig(command: UnknownRecord, action: string): MotionDebugConfigPatch {
  assertAllowedFields(command, MOTION_CONFIG_FIELDS, action);
  const patch: MotionDebugConfigPatch = {};
  if (hasOwn(command, "enabled")) patch.enabled = readBoolean(command, "enabled", action);
  if (hasOwn(command, "recordHistory")) patch.recordHistory = readBoolean(command, "recordHistory", action);
  if (hasOwn(command, "overlayEnabled")) patch.overlayEnabled = readBoolean(command, "overlayEnabled", action);
  if (hasOwn(command, "timeScale")) patch.timeScale = readFiniteNumber(command, "timeScale", action, 0, 2);
  if (hasOwn(command, "recordWindowMs")) patch.recordWindowMs = readInteger(command, "recordWindowMs", action, 1000, 300_000);
  if (hasOwn(command, "sampleHz")) patch.sampleHz = readFiniteNumber(command, "sampleHz", action, 0, 120);
  if (hasOwn(command, "maxEvents")) patch.maxEvents = readInteger(command, "maxEvents", action, 1, 60_000);
  if (hasOwn(command, "maxSamples")) patch.maxSamples = readInteger(command, "maxSamples", action, 1, 20_000);
  return patch;
}

interface MotionReportBounds {
  includeChannels: boolean;
  includeCurveStats: boolean;
  includeHistory: boolean;
  includeTargets: boolean;
  maxAnimations: number;
  maxCurveStats: number;
  maxEvents: number;
  maxSamples: number;
  maxTargets: number;
  maxWarnings: number;
}

function validateMotionReport(command: UnknownRecord, action: string): MotionReportBounds {
  assertAllowedFields(command, MOTION_REPORT_FIELDS, action);
  const result: MotionReportBounds = { ...MOTION_REPORT_DEFAULTS };
  for (const key of ["includeChannels", "includeCurveStats", "includeHistory", "includeTargets"] as const) {
    if (hasOwn(command, key)) result[key] = readBoolean(command, key, action);
  }
  for (const key of ["maxAnimations", "maxCurveStats", "maxTargets", "maxWarnings"] as const) {
    if (hasOwn(command, key)) result[key] = readInteger(command, key, action, 0, 2000);
  }
  for (const key of ["maxEvents", "maxSamples"] as const) {
    if (hasOwn(command, key)) result[key] = readInteger(command, key, action, 0, 4000);
  }
  return result;
}

interface MotionTraceBounds {
  durationMs: number;
  maxCurveStats: number;
  maxEvents: number;
  maxFrames: number;
  maxTargets: number;
  maxTracks: number;
  maxValuesPerFrame: number;
  maxWarnings: number;
  sampleHz: number;
}

function validateMotionTrace(command: UnknownRecord, action: string): MotionTraceBounds {
  assertAllowedFields(command, MOTION_TRACE_FIELDS, action);
  if (hasOwn(command, "seconds") && hasOwn(command, "durationMs")) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      "motion-trace accepts either seconds or durationMs, not both",
      { details: { durationMs: command.durationMs, seconds: command.seconds } },
    );
  }
  const result: MotionTraceBounds = { ...MOTION_TRACE_DEFAULTS };
  if (hasOwn(command, "seconds")) result.durationMs = readInteger(command, "seconds", action, 1, 300) * 1000;
  if (hasOwn(command, "durationMs")) result.durationMs = readInteger(command, "durationMs", action, 1000, 300_000);
  if (hasOwn(command, "sampleHz")) result.sampleHz = readFiniteNumber(command, "sampleHz", action, 1, 120);
  if (hasOwn(command, "maxFrames")) result.maxFrames = readInteger(command, "maxFrames", action, 1, 2000);
  if (hasOwn(command, "maxEvents")) result.maxEvents = readInteger(command, "maxEvents", action, 0, 4000);
  if (hasOwn(command, "maxTracks")) result.maxTracks = readInteger(command, "maxTracks", action, 0, 2000);
  if (hasOwn(command, "maxTargets")) result.maxTargets = readInteger(command, "maxTargets", action, 0, 2000);
  if (hasOwn(command, "maxWarnings")) result.maxWarnings = readInteger(command, "maxWarnings", action, 0, 2000);
  if (hasOwn(command, "maxValuesPerFrame")) result.maxValuesPerFrame = readInteger(command, "maxValuesPerFrame", action, 0, 2000);
  if (hasOwn(command, "maxCurveStats")) result.maxCurveStats = readInteger(command, "maxCurveStats", action, 0, 2000);
  return result;
}

function validateBackgroundPreview(command: UnknownRecord, action: string): UnknownRecord {
  assertAllowedFields(command, BACKGROUND_PREVIEW_FIELDS, action);
  const patch: UnknownRecord = {};
  if (hasOwn(command, "source")) patch.source = readEnum(command, "source", action, BACKGROUND_SOURCES);
  if (hasOwn(command, "effect")) patch.effect = readEnum(command, "effect", action, BACKGROUND_EFFECTS);
  if (hasOwn(command, "blurStrength")) patch.blurStrength = readInteger(command, "blurStrength", action, 1, 100);
  if (hasOwn(command, "darkenStrength")) patch.darkenStrength = readInteger(command, "darkenStrength", action, 0, 100);
  if (hasOwn(command, "darkenColor")) patch.darkenColor = readColor(command, "darkenColor", action);
  if (hasOwn(command, "liveDesktopOpacity")) {
    patch.liveDesktopOpacity = readInteger(command, "liveDesktopOpacity", action, 0, 100);
  }
  if (!Object.keys(patch).length) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      "background-preview requires at least one supported tuning value",
      { details: { allowedFields: BACKGROUND_PREVIEW_FIELDS } },
    );
  }
  return patch;
}

function validateLayoutPreview(command: UnknownRecord, action: string): UnknownRecord {
  assertAllowedFields(command, LAYOUT_PREVIEW_FIELDS, action);
  const patch: UnknownRecord = {};
  if (hasOwn(command, "enabled")) patch.enabled = readBoolean(command, "enabled", action);
  if (hasOwn(command, "dragHitZonesEnabled")) {
    patch.dragHitZonesEnabled = readBoolean(command, "dragHitZonesEnabled", action);
  }
  for (const [key, limits] of Object.entries(LAYOUT_NUMBER_LIMITS)) {
    if (hasOwn(command, key)) {
      patch[key] = readFiniteNumber(command, key, action, limits.min, limits.max);
    }
  }
  if (!Object.keys(patch).length) {
    throw new DiagnosticError(
      "native-diagnostics-params-invalid",
      "layout-preview requires at least one supported tuning value",
      { details: { allowedFields: LAYOUT_PREVIEW_FIELDS } },
    );
  }
  return patch;
}

function boundMotionReport(
  report: MotionDebugReport,
  bounds: MotionReportBounds,
): UnknownRecord {
  const source = report as unknown as UnknownRecord;
  const result: UnknownRecord = {
    animations: boundRecordArray(source.animations, bounds.maxAnimations),
    config: sanitizeJsonValue(source.config),
    counters: sanitizeJsonValue(source.counters),
    runtime: sanitizeJsonValue(source.runtime),
    summary: sanitizeJsonValue(source.summary),
    version: 1,
    warnings: boundRecordArray(source.warnings, bounds.maxWarnings),
  };
  if (bounds.includeChannels) {
    result.channels = boundRecordArray(source.channels, bounds.maxAnimations);
  }
  if (bounds.includeCurveStats) {
    result.curveStats = boundRecordArray(source.curveStats, bounds.maxCurveStats);
  }
  if (bounds.includeTargets) {
    result.targets = boundRecordArray(source.targets, bounds.maxTargets);
  }
  if (bounds.includeHistory) {
    const history = asRecord(source.history) ?? {};
    const samples = boundRecordArray(history.samples, bounds.maxSamples, true).map((sample) => ({
      ...sample,
      animations: boundRecordArray(sample.animations, bounds.maxAnimations),
    }));
    result.history = {
      events: boundRecordArray(history.events, bounds.maxEvents, true),
      samples,
    };
  }
  result.bounds = {
    includeChannels: bounds.includeChannels,
    includeCurveStats: bounds.includeCurveStats,
    includeHistory: bounds.includeHistory,
    includeTargets: bounds.includeTargets,
    maxAnimations: bounds.maxAnimations,
    maxCurveStats: bounds.maxCurveStats,
    maxEvents: bounds.maxEvents,
    maxSamples: bounds.maxSamples,
    maxTargets: bounds.maxTargets,
    maxWarnings: bounds.maxWarnings,
  };
  return result;
}

function countRecordValues(records: readonly UnknownRecord[], key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const value = typeof record[key] === "string" ? record[key] as string : "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function collectUsedTargetIds(
  frames: readonly UnknownRecord[],
  events: readonly UnknownRecord[],
): Set<number | string> {
  const ids = new Set<number | string>();
  for (const frame of frames) {
    const values = Array.isArray(frame.values) ? frame.values : [];
    for (const value of values) {
      const record = asRecord(value);
      if (record && (typeof record.targetId === "number" || typeof record.targetId === "string")) {
        ids.add(record.targetId);
      }
    }
  }
  for (const event of events) {
    if (typeof event.targetId === "number" || typeof event.targetId === "string") ids.add(event.targetId);
  }
  return ids;
}

function makeBoundTimeRange(
  frames: readonly UnknownRecord[],
  events: readonly UnknownRecord[],
): Readonly<{ max: number; min: number }> {
  const times: number[] = [];
  for (const frame of frames) {
    if (typeof frame.timeMs === "number" && Number.isFinite(frame.timeMs)) times.push(frame.timeMs);
  }
  for (const event of events) {
    if (typeof event.timeMs === "number" && Number.isFinite(event.timeMs)) times.push(event.timeMs);
  }
  return times.length
    ? { max: Math.max(...times), min: Math.min(...times) }
    : { max: 0, min: 0 };
}

function boundMotionTrace(
  trace: unknown,
  bounds: MotionTraceBounds,
): UnknownRecord {
  const source = asRecord(trace) ?? {};
  const timeline = asRecord(source.timeline) ?? {};
  const frames = boundRecordArray(timeline.frames, bounds.maxFrames, true).map((frame) => ({
    ...frame,
    values: boundRecordArray(frame.values, bounds.maxValuesPerFrame),
  }));
  const events = boundRecordArray(timeline.events, bounds.maxEvents, true);
  const allValues = frames.flatMap((frame) => (
    Array.isArray(frame.values) ? frame.values.map(asRecord).filter((value): value is UnknownRecord => value !== null) : []
  ));
  const usedTargetIds = collectUsedTargetIds(frames, events);
  const targetIds = (records: UnknownRecord[]) => records.filter((record) => (
    typeof record.targetId === "number" || typeof record.targetId === "string"
      ? usedTargetIds.has(record.targetId)
      : false
  ));
  const targets = targetIds(boundRecordArray(source.targets, bounds.maxTargets));
  const warnings = targetIds(boundRecordArray(source.warnings, bounds.maxWarnings));
  const tracks = boundRecordArray(source.tracks, bounds.maxTracks);
  const curveStats = boundRecordArray(source.curveStats, bounds.maxCurveStats);
  const capture = sanitizeRecord(source.capture) ?? {};
  const timeRangeMs = makeBoundTimeRange(frames, events);
  capture.durationMs = Math.max(0, timeRangeMs.max - timeRangeMs.min);
  return {
    capture,
    curveStats,
    generatedAt: typeof source.generatedAt === "string" ? source.generatedAt : null,
    mode: source.mode === "property-accurate-visual-replay" ? source.mode : "property-accurate-visual-replay",
    schema: MOTION_REPLAY_TRACE_SCHEMA,
    source: sanitizeRecord(source.source) ?? {},
    summary: {
      byDriver: countRecordValues(allValues, "driver"),
      byProp: countRecordValues(allValues, "prop"),
      eventCount: events.length,
      frameCount: frames.length,
      targetCount: targets.length,
      trackCount: tracks.length,
      valueCount: allValues.length,
      warningCount: warnings.length,
    },
    targets,
    timeline: {
      events,
      frames,
      timeRangeMs,
    },
    tracks,
    version: MOTION_REPLAY_TRACE_VERSION,
    warnings,
  };
}

function errorMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error);
}

function makeLastError(action: string, error: unknown, at: string): UnknownRecord {
  const payload = makeDiagnosticErrorPayload(error, {
    code: "native-diagnostics-command-failed",
    message: errorMessage(error),
  });
  return {
    action,
    at,
    code: payload.code,
    details: sanitizeJsonValue(payload.details),
    message: payload.message,
    nextActions: payload.nextActions,
  };
}

function readPortState(port: NativeDiagnosticsStatePort | undefined): UnknownRecord {
  if (!port) return { available: false };
  try {
    return {
      available: true,
      state: sanitizeJsonValue(port.getState(), STATUS_SANITIZE_DEPTH, STATUS_SANITIZE_MAX_ARRAY),
    };
  } catch (error) {
    return {
      available: true,
      error: errorMessage(error),
      state: null,
    };
  }
}

function installDevAdapter(): void {
  if (installedAdapterLeaseCount === 0 && !installMotionRuntimeDebugAdapterFactory(createMotionRuntimeDebugAdapter)) {
    throw new Error("Failed to install the Motion runtime diagnostics adapter");
  }
  installedAdapterLeaseCount += 1;
}

function releaseDevAdapter(): void {
  installedAdapterLeaseCount = Math.max(0, installedAdapterLeaseCount - 1);
  if (installedAdapterLeaseCount === 0) {
    installMotionRuntimeDebugAdapterFactory(createNoopMotionRuntimeDebugAdapter);
  }
}

function requireMotionRuntime(runtime: MotionRuntime): void {
  for (const method of [
    "clearDebugHistory",
    "configureDebug",
    "debugReport",
    "debugSnapshot",
  ] as const) {
    if (typeof runtime?.[method] !== "function") {
      throw new TypeError(`Native product diagnostics requires motion runtime.${method}()`);
    }
  }
}

export function createNativeProductDiagnostics(
  ports: NativeProductDiagnosticsPorts = {},
): NativeProductDiagnostics {
  const runtime = ports.motion ?? motionRuntime;
  requireMotionRuntime(runtime);
  const background = ports.background;
  const layout = ports.layout;
  const liveDesktop = ports.liveDesktop;
  const now = ports.now ?? (() => new Date());
  const initialMotionConfig: MotionDebugConfig = runtime.configureDebug();
  let lastError: UnknownRecord | null = null;
  let backgroundPreviewActive = false;
  let layoutPreviewActive = false;
  let disposed = false;
  let disposePromise: Promise<NativeProductDiagnosticsDisposeResult> | null = null;

  installDevAdapter();
  // Metadata is emitted when scene targets are created, so enable observation
  // before product assembly. History recording remains explicitly opt-in.
  runtime.configureDebug({enabled:true});

  function ensureActive(action: string): void {
    if (disposed) {
      throw new DiagnosticError(
        "native-diagnostics-disposed",
        `${action} is unavailable because Native product diagnostics is disposed`,
        { nextActions: ["Create a new diagnostics instance during application startup"] },
      );
    }
  }

  function readMotionConfig(): MotionDebugConfig {
    return runtime.configureDebug();
  }

  function status(): UnknownRecord {
    if (disposed) {
      return {
        schema: NATIVE_PRODUCT_DIAGNOSTICS_SCHEMA,
        disposed: true,
        lastError,
      };
    }
    let motion: UnknownRecord;
    try {
      motion = {
        config: sanitizeJsonValue(readMotionConfig()),
        counters: sanitizeJsonValue(runtime.debug),
        hasActiveWork: runtime.hasActiveWork(),
      };
    } catch (error) {
      motion = { error: errorMessage(error) };
    }
    return {
      schema: NATIVE_PRODUCT_DIAGNOSTICS_SCHEMA,
      actions: NATIVE_PRODUCT_DIAGNOSTICS_ACTIONS,
      background: readPortState(background),
      disposed: false,
      lastError,
      layout: readPortState(layout),
      liveDesktop: readPortState(liveDesktop),
      motion,
    };
  }

  async function dispatch(action: string, command: UnknownRecord): Promise<unknown> {
    switch (action) {
      case "motion-config": {
        const patch = validateMotionConfig(command, action);
        return sanitizeJsonValue(runtime.configureDebug(patch));
      }
      case "motion-report": {
        const bounds = validateMotionReport(command, action);
        return boundMotionReport(runtime.debugReport({
          includeChannels: bounds.includeChannels,
          includeCurveStats: bounds.includeCurveStats,
          includeHistory: bounds.includeHistory,
          includeTargets: bounds.includeTargets,
        }), bounds);
      }
      case "motion-clear":
        assertAllowedFields(command, [], action);
        runtime.clearDebugHistory();
        return {
          cleared: true,
          config: sanitizeJsonValue(readMotionConfig()),
        };
      case "motion-trace": {
        const bounds = validateMotionTrace(command, action);
        const trace = createMotionReplayTraceFromRuntime(runtime, {
          durationMs: bounds.durationMs,
          sampleHz: bounds.sampleHz,
        });
        return boundMotionTrace(trace, bounds);
      }
      case "background-state": {
        assertAllowedFields(command, [], action);
        const port = requirePreviewPort(background, action);
        return { state: sanitizeJsonValue(port.getState()) };
      }
      case "background-preview": {
        const port = requirePreviewPort(background, action);
        const patch = validateBackgroundPreview(command, action);
        backgroundPreviewActive = true;
        const result = await port.preview(patch);
        return { patch, result: sanitizeJsonValue(result) };
      }
      case "background-restore": {
        assertAllowedFields(command, [], action);
        const port = requirePreviewPort(background, action);
        const result = await port.restore();
        backgroundPreviewActive = false;
        return { restored: true, result: sanitizeJsonValue(result) };
      }
      case "layout-state": {
        assertAllowedFields(command, [], action);
        const port = requirePreviewPort(layout, action);
        return { state: sanitizeJsonValue(port.getState()) };
      }
      case "layout-preview": {
        const port = requirePreviewPort(layout, action);
        const patch = validateLayoutPreview(command, action);
        layoutPreviewActive = true;
        const result = await port.preview(patch);
        return { patch, result: sanitizeJsonValue(result) };
      }
      case "layout-restore": {
        assertAllowedFields(command, [], action);
        const port = requirePreviewPort(layout, action);
        const result = await port.restore();
        layoutPreviewActive = false;
        return { restored: true, result: sanitizeJsonValue(result) };
      }
      default:
        throw new DiagnosticError(
          "native-diagnostics-action-unknown",
          `Unsupported Native product diagnostics action: ${action}`,
          {
            details: { action, supportedActions: NATIVE_PRODUCT_DIAGNOSTICS_ACTIONS },
            nextActions: ["Use a named action from NATIVE_PRODUCT_DIAGNOSTICS_ACTIONS"],
          },
        );
    }
  }

  async function command(commandValue: UnknownRecord): Promise<unknown> {
    const commandRecord = requireCommandRecord(commandValue);
    const action = requireAction(commandRecord);
    ensureActive(action);
    try {
      return await dispatch(action, commandRecord);
    } catch (error) {
      lastError = makeLastError(action, error, now().toISOString());
      throw error;
    }
  }

  function dispose(): Promise<NativeProductDiagnosticsDisposeResult> {
    if (disposePromise) return disposePromise;
    disposed = true;
    disposePromise = (async () => {
      const restored: string[] = [];
      const errors: Array<Readonly<{ message: string; source: string }>> = [];
      const attempt = async (source: string, operation: () => unknown | Promise<unknown>) => {
        try {
          await operation();
          restored.push(source);
        } catch (error) {
          errors.push({ message: errorMessage(error), source });
        }
      };

      if (backgroundPreviewActive && background) {
        await attempt("background", () => background.restore());
      }
      if (layoutPreviewActive && layout) {
        await attempt("layout", () => layout.restore());
      }
      await attempt("motion-config", () => runtime.configureDebug(initialMotionConfig));
      await attempt("motion-history", () => runtime.clearDebugHistory());
      await attempt("motion-adapter", releaseDevAdapter);
      return { errors, restored };
    })();
    return disposePromise;
  }

  return Object.freeze({ command, dispose, status });
}
