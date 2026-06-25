import {
  makeMotionDebugSummary,
  readNumber,
} from "./motionTraceShared.js";

const DEFAULT_DEBUG_CONFIG = Object.freeze({
  enabled: false,
  timeScale: 1,
});
const LIVE_DEBUG_METADATA_KEYS = new Set([
  "boundsTarget",
  "debugOverlayTarget",
  "overlayTarget",
]);

function sanitizeDebugValue(value, depth = 2, seen = new Set()) {
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
  const object = {};
  for (const [key, entry] of Object.entries(value)) {
    const sanitized = sanitizeDebugValue(entry, depth - 1, seen);
    if (sanitized !== undefined) object[key] = sanitized;
  }
  seen.delete(value);
  return object;
}

export function sanitizeDebugMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return {};
  const filtered = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (LIVE_DEBUG_METADATA_KEYS.has(key)) continue;
    filtered[key] = value;
  }
  const sanitized = sanitizeDebugValue(filtered);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : {};
}

export function createMotionRuntimeDebugAdapter() {
  let config = { ...DEFAULT_DEBUG_CONFIG };

  function cloneConfig() {
    return { ...config };
  }

  function configureDebug(patch = {}) {
    if (patch && typeof patch === "object") {
      if (Object.hasOwn(patch, "timeScale")) config.timeScale = Math.max(0, readNumber(patch.timeScale, config.timeScale));
      if (Object.hasOwn(patch, "enabled")) config.enabled = Boolean(patch.enabled);
    }
    return cloneConfig();
  }

  function makeSnapshot(_snapshotOptions = {}, currentState = {}) {
    const animations = currentState.animations || [];
    const summary = makeMotionDebugSummary(animations);
    return {
      animations,
      counters: {},
      summary,
      warnings: [],
    };
  }

  function makeReport(reportOptions = {}, currentState = {}) {
    const snapshot = makeSnapshot(reportOptions, currentState);
    return {
      animations: snapshot.animations,
      config: cloneConfig(),
      counters: snapshot.counters,
      runtime: {
        activeAnimationCount: snapshot.summary.activeAnimationCount,
        frames: currentState.runtime?.frames || 0,
        timeMs: currentState.runtime?.timeMs || 0,
      },
      summary: snapshot.summary,
      version: 1,
      warnings: snapshot.warnings,
    };
  }

  return {
    clearHistory() {},
    configureDebug,
    debug: {},
    getConfig: cloneConfig,
    isEnabled: () => false,
    makeReport,
    makeSnapshot,
    makeTargetMetadataRecord: (targetId, metadata = {}) => ({ targetId, ...sanitizeDebugMetadata(metadata) }),
    observe() {},
    reset() {
      config = { ...DEFAULT_DEBUG_CONFIG };
    },
    resolveTarget: () => null,
    shouldBuildSample: () => false,
    shouldObserveSamples: () => false,
  };
}
