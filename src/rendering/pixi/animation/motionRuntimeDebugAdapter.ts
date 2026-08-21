import {
  makeMotionDebugSummary,
  readNumber,
} from "./motionTraceShared.js";
import type {
  MotionDebugConfig,
  MotionDebugConfigPatch,
  MotionDebugCounters,
  MotionDebugEvent,
  MotionDebugMetadata,
  MotionDebugRecord,
  MotionDebugReport,
  MotionDebugReportOptions,
  MotionDebugSnapshot,
  MotionDebugSnapshotOptions,
  MotionRuntimeDebugAdapter,
  MotionRuntimeDebugState,
} from "./motionRuntime.js";

const DEFAULT_DEBUG_CONFIG: Readonly<MotionDebugConfig> = Object.freeze({
  enabled: false,
  maxEvents: 1000,
  maxSamples: 1000,
  overlayEnabled: false,
  recordFilter: null,
  recordHistory: false,
  recordWindowMs: 30000,
  sampleHz: 10,
  timeScale: 1,
});
const LIVE_DEBUG_METADATA_KEYS = new Set([
  "boundsTarget",
  "debugOverlayTarget",
  "overlayTarget",
]);

function makeDebugCounters(): MotionDebugCounters {
  return {
    activeChannels: 0,
    activeTargets: 0,
    afterFrameFlushes: 0,
    canceled: 0,
    canceledByReason: {},
    completed: 0,
    frames: 0,
    released: 0,
    started: 0,
    writes: 0,
    writesLastFrame: 0,
  };
}

function sanitizeDebugValue(value: unknown, depth = 2, seen = new Set<object>()): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "object") return undefined;
  if (depth <= 0 || seen.has(value)) return undefined;
  seen.add(value);
  if (Array.isArray(value)) {
    const array = value
      .map((entry) => sanitizeDebugValue(entry, depth - 1, seen))
      .filter((entry) => entry !== undefined);
    seen.delete(value);
    return array;
  }
  const object: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const sanitized = sanitizeDebugValue(entry, depth - 1, seen);
    if (sanitized !== undefined) object[key] = sanitized;
  }
  seen.delete(value);
  return object;
}

export function sanitizeDebugMetadata(metadata: MotionDebugMetadata | null | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (LIVE_DEBUG_METADATA_KEYS.has(key)) continue;
    filtered[key] = value;
  }
  const sanitized = sanitizeDebugValue(filtered);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {};
}

export function createMotionRuntimeDebugAdapter(): MotionRuntimeDebugAdapter {
  let config: MotionDebugConfig = { ...DEFAULT_DEBUG_CONFIG };
  const debug = makeDebugCounters();

  function cloneConfig(): MotionDebugConfig {
    return {
      ...config,
      recordFilter: config.recordFilter ? {
        ...config.recordFilter,
        eventTypes: [...config.recordFilter.eventTypes],
        kinds: [...config.recordFilter.kinds],
        layers: [...config.recordFilter.layers],
        props: [...config.recordFilter.props],
        sourceLabels: [...config.recordFilter.sourceLabels],
      } : null,
    };
  }

  function configureDebug(patch: MotionDebugConfigPatch = {}): MotionDebugConfig {
    if (patch && typeof patch === "object") {
      if (Object.hasOwn(patch, "timeScale")) config.timeScale = Math.max(0, readNumber(patch.timeScale, config.timeScale));
      if (Object.hasOwn(patch, "enabled")) config.enabled = Boolean(patch.enabled);
      if (Object.hasOwn(patch, "overlayEnabled")) config.overlayEnabled = Boolean(patch.overlayEnabled);
      if (Object.hasOwn(patch, "recordHistory")) config.recordHistory = Boolean(patch.recordHistory);
      if (Object.hasOwn(patch, "recordWindowMs")) config.recordWindowMs = Math.max(0, readNumber(patch.recordWindowMs, config.recordWindowMs));
      if (Object.hasOwn(patch, "sampleHz")) config.sampleHz = Math.max(0, readNumber(patch.sampleHz, config.sampleHz));
      if (Object.hasOwn(patch, "maxEvents")) config.maxEvents = Math.max(0, Math.floor(readNumber(patch.maxEvents, config.maxEvents)));
      if (Object.hasOwn(patch, "maxSamples")) config.maxSamples = Math.max(0, Math.floor(readNumber(patch.maxSamples, config.maxSamples)));
    }
    return cloneConfig();
  }

  function makeSnapshot(
    _snapshotOptions: MotionDebugSnapshotOptions = {},
    currentState: MotionRuntimeDebugState = {
      animations: [],
      runtime: { activeAnimationCount: 0, frames: 0, timeMs: 0 },
    },
  ): MotionDebugSnapshot {
    const animations = currentState.animations || [];
    const summary = makeMotionDebugSummary(animations);
    return {
      animations,
      counters: makeDebugCounters(),
      summary,
      warnings: [],
    };
  }

  function makeReport(
    reportOptions: MotionDebugReportOptions = {},
    currentState: MotionRuntimeDebugState = {
      animations: [],
      runtime: { activeAnimationCount: 0, frames: 0, timeMs: 0 },
    },
  ): MotionDebugReport {
    const snapshot = makeSnapshot(reportOptions, currentState);
    return {
      animations: snapshot.animations,
      config: cloneConfig(),
      counters: snapshot.counters,
      runtime: {
        activeAnimationCount: snapshot.summary.activeAnimationCount,
        frames: currentState.runtime.frames || 0,
        timeMs: currentState.runtime.timeMs || 0,
      },
      summary: snapshot.summary,
      version: 1,
      warnings: snapshot.warnings,
    };
  }

  return {
    clearHistory(): void {},
    configureDebug,
    debug,
    getConfig: cloneConfig,
    isEnabled: () => false,
    makeReport,
    makeSnapshot,
    makeTargetMetadataRecord: (targetId: number, metadata: MotionDebugMetadata | null = {}) => ({ targetId, ...sanitizeDebugMetadata(metadata) }),
    observe(_event: MotionDebugEvent): void {},
    reset() {
      config = { ...DEFAULT_DEBUG_CONFIG };
      Object.assign(debug, makeDebugCounters());
    },
    resolveTarget: (_targetId: number, _options: { bounds?: boolean } = {}) => null,
    shouldBuildSample: (_timeMs?: number) => false,
    shouldObserveSamples: () => false,
  };
}
