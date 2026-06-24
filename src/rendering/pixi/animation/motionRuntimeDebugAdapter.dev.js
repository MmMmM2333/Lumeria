// DEV-only heavy motion telemetry adapter.
import {
  clamp,
  makeMotionDebugSummary,
  makeTrackKey,
  readNumber,
} from "./motionTraceShared.js";

const DEBUG_RECORD_WINDOW_MIN_MS = 1000;
const DEBUG_RECORD_WINDOW_MAX_MS = 300000;
const DEFAULT_DEBUG_CONFIG = Object.freeze({
  enabled: false,
  maxEvents: 1000,
  maxSamples: 1000,
  overlayEnabled: false,
  recordHistory: false,
  recordFilter: null,
  recordWindowMs: 30000,
  sampleHz: 10,
  timeScale: 1,
});
const LIVE_DEBUG_METADATA_KEYS = new Set([
  "boundsTarget",
  "debugOverlayTarget",
  "overlayTarget",
]);
const CAN_STORE_DEBUG_TARGET_REFS = import.meta.env?.DEV !== false;

function makeDebugCounters() {
  return {
    activeChannels: 0,
    activeTargets: 0,
    afterFrameFlushes: 0,
    canceled: 0,
    canceledByReason: {},
    completed: 0,
    frames: 0,
    released: 0,
    writes: 0,
    writesLastFrame: 0,
    started: 0,
  };
}

function incrementDebugCount(counts, key) {
  const normalizedKey = key == null ? "unknown" : String(key);
  counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
}

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

function readDebugString(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeDebugStringList(value, options = {}) {
  const input = Array.isArray(value) ? value : value == null ? [] : [value];
  const list = [];
  const seen = new Set();
  for (const entry of input) {
    const text = readDebugString(entry);
    if (!text) continue;
    const normalized = options.lowercase ? text.toLowerCase() : text;
    const key = options.caseInsensitive !== false ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(normalized);
  }
  return list;
}

function readDebugFilterValue(input, targetFilters, keys) {
  for (const key of keys) {
    if (Object.hasOwn(input, key)) return input[key];
  }
  for (const key of keys) {
    if (Object.hasOwn(targetFilters, key)) return targetFilters[key];
  }
  return undefined;
}

function normalizeDebugRecordFilter(input) {
  if (input == null || input === false) return null;
  if (typeof input !== "object") return null;
  const targetFilters = input.targetFilters && typeof input.targetFilters === "object" ? input.targetFilters : {};
  const filter = {
    eventTypes: normalizeDebugStringList(readDebugFilterValue(input, targetFilters, ["eventTypes", "eventType", "events"]), { lowercase: true }),
    includeEvents: input.includeEvents == null ? true : Boolean(input.includeEvents),
    includeSamples: input.includeSamples == null ? true : Boolean(input.includeSamples),
    kinds: normalizeDebugStringList(readDebugFilterValue(input, targetFilters, ["kinds", "kind", "targetKinds", "targetKind"])),
    layers: normalizeDebugStringList(readDebugFilterValue(input, targetFilters, ["layers", "layer"])),
    props: normalizeDebugStringList(readDebugFilterValue(input, targetFilters, ["props", "prop", "propAllowlist"]), { caseInsensitive: false }),
    sourceLabels: normalizeDebugStringList(readDebugFilterValue(input, targetFilters, ["sourceLabels", "sourceLabel", "sources"])),
    sourceQuery: readDebugString(readDebugFilterValue(input, targetFilters, ["sourceQuery", "query"])),
  };
  const hasCriteria = filter.eventTypes.length
    || filter.kinds.length
    || filter.layers.length
    || filter.props.length
    || filter.sourceLabels.length
    || filter.sourceQuery
    || !filter.includeEvents
    || !filter.includeSamples;
  return hasCriteria ? filter : null;
}

function cloneDebugRecordFilter(filter) {
  if (!filter) return null;
  return {
    eventTypes: [...filter.eventTypes],
    includeEvents: Boolean(filter.includeEvents),
    includeSamples: Boolean(filter.includeSamples),
    kinds: [...filter.kinds],
    layers: [...filter.layers],
    props: [...filter.props],
    sourceLabels: [...filter.sourceLabels],
    sourceQuery: filter.sourceQuery,
  };
}

function hasCaseInsensitiveMatch(allowed, value) {
  if (!allowed.length) return true;
  const text = readDebugString(value).toLowerCase();
  if (!text) return false;
  return allowed.some((entry) => entry.toLowerCase() === text);
}

function readDebugRecordKind(record = {}) {
  return record.targetKind ?? record.kind;
}

function readDebugRecordSourceLabel(record = {}) {
  return record.sourceLabel ?? record.targetLabel ?? record.label;
}

function matchesDebugRecordFilter(record = {}, type = "sample", filter = null) {
  if (!filter) return true;
  const recordType = readDebugString(record.type ?? type, "sample").toLowerCase();
  const isSample = recordType === "sample";
  if (isSample && !filter.includeSamples) return false;
  if (!isSample && !filter.includeEvents) return false;
  if (!isSample && filter.eventTypes.length && !filter.eventTypes.includes(recordType)) return false;
  if (filter.props.length && !filter.props.includes(readDebugString(record.prop))) return false;
  if (!hasCaseInsensitiveMatch(filter.layers, record.layer)) return false;
  if (!hasCaseInsensitiveMatch(filter.kinds, readDebugRecordKind(record))) return false;
  if (!hasCaseInsensitiveMatch(filter.sourceLabels, readDebugRecordSourceLabel(record))) return false;
  if (filter.sourceQuery) {
    const sourceLabel = readDebugString(readDebugRecordSourceLabel(record)).toLowerCase();
    if (!sourceLabel.includes(filter.sourceQuery.toLowerCase())) return false;
  }
  return true;
}

function hasReadableDebugMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return false;
  return Object.entries(metadata).some(([key, value]) => key !== "targetId" && value != null && value !== "");
}

function cloneRecord(record) {
  return record ? { ...record } : record;
}

function cloneHistory(history) {
  return {
    events: history.events.map(cloneRecord),
    samples: history.samples.map((sample) => ({
      ...sample,
      animations: sample.animations.map(cloneRecord),
    })),
  };
}

function makeCurveStatsSeed(record) {
  const key = makeTrackKey(record);
  return {
    arriveCompleteGapMs: null,
    arriveTimeMs: null,
    completeTimeMs: null,
    driver: record.driver || "unknown",
    eventCount: 0,
    key,
    lane: record.lane,
    laneKey: record.laneKey,
    maxDelta: 0,
    maxVelocity: 0,
    overshootCount: 0,
    prop: record.prop,
    retargetCount: 0,
    sampleCount: 0,
    settleDurationMs: null,
    sourceLabel: record.sourceLabel,
    startTimeMs: null,
    targetId: record.targetId,
    _from: null,
    _lastTimeMs: null,
    _lastValue: null,
    _overshooting: false,
    _settleTimeMs: null,
    _to: null,
  };
}

function readFiniteNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function updateCurveStats(stats, point) {
  const timeMs = readFiniteNumber(point.timeMs) ?? 0;
  const value = readFiniteNumber(point.value);
  const from = readFiniteNumber(point.from);
  const to = readFiniteNumber(point.to);
  const velocity = readFiniteNumber(point.velocity);
  const isSample = point.type === "sample";

  if (isSample) stats.sampleCount += 1;
  else stats.eventCount += 1;
  if (stats.startTimeMs == null || point.type === "start") stats.startTimeMs = timeMs;
  if (point.driver) stats.driver = point.driver;
  if (point.sourceLabel) stats.sourceLabel = point.sourceLabel;

  if (point.type === "retarget") {
    stats.retargetCount += 1;
    stats._overshooting = false;
  }
  if (point.type === "settle") {
    stats._settleTimeMs = timeMs;
    stats._overshooting = false;
  }
  if (from != null) stats._from = from;
  if (to != null) stats._to = to;

  if (value != null && stats._to != null) {
    stats.maxDelta = Math.max(stats.maxDelta, Math.abs(stats._to - value));
  }
  if (velocity != null) stats.maxVelocity = Math.max(stats.maxVelocity, Math.abs(velocity));
  if (value != null && stats._lastValue != null && stats._lastTimeMs != null && timeMs > stats._lastTimeMs) {
    const derivedVelocity = Math.abs((value - stats._lastValue) / ((timeMs - stats._lastTimeMs) / 1000));
    stats.maxVelocity = Math.max(stats.maxVelocity, derivedVelocity);
  }

  if (value != null && stats._from != null && stats._to != null) {
    const direction = Math.sign(stats._to - stats._from);
    const overshooting = direction > 0
      ? value > stats._to
      : direction < 0
        ? value < stats._to
        : false;
    if (overshooting && !stats._overshooting) stats.overshootCount += 1;
    stats._overshooting = overshooting;
  }

  if (point.type === "arrive" && stats.arriveTimeMs == null) stats.arriveTimeMs = timeMs - stats.startTimeMs;
  if ((point.type === "complete" || point.type === "snap") && stats.completeTimeMs == null) {
    stats.completeTimeMs = timeMs - stats.startTimeMs;
    if (stats._settleTimeMs != null) stats.settleDurationMs = timeMs - stats._settleTimeMs;
  }

  if (value != null) {
    stats._lastValue = value;
    stats._lastTimeMs = timeMs;
  }
}

function makeCurveStats(history) {
  const statsByKey = new Map();
  const points = [];
  for (const event of history.events) points.push(event);
  for (const sample of history.samples) {
    for (const animation of sample.animations) {
      points.push({
        ...animation,
        frame: sample.frame,
        timeMs: sample.timeMs,
        type: "sample",
      });
    }
  }
  points.sort((a, b) => (a.timeMs - b.timeMs) || (a.frame - b.frame));

  for (const point of points) {
    if (point.prop == null || point.lane == null || point.laneKey == null) continue;
    const key = makeTrackKey(point);
    let stats = statsByKey.get(key);
    if (!stats) {
      stats = makeCurveStatsSeed(point);
      statsByKey.set(key, stats);
    }
    updateCurveStats(stats, point);
  }

  return Array.from(statsByKey.values()).map((stats) => {
    const result = { ...stats };
    if (result.arriveTimeMs != null && result.completeTimeMs != null) result.arriveCompleteGapMs = result.completeTimeMs - result.arriveTimeMs;
    delete result._from;
    delete result._lastTimeMs;
    delete result._lastValue;
    delete result._overshooting;
    delete result._settleTimeMs;
    return result;
  });
}

function makeDebugWarnings(animations, targetMetaById) {
  const warnings = [];
  const seen = new Set();
  for (const animation of animations) {
    const metadata = animation.targetId == null ? null : targetMetaById.get(animation.targetId);
    if (hasReadableDebugMetadata(metadata)) continue;
    const key = `${animation.targetId ?? "unknown"}:${animation.prop ?? "unknown"}:${animation.lane ?? "unknown"}:${animation.laneKey ?? "unknown"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warnings.push({
      lane: animation.lane,
      laneKey: animation.laneKey,
      message: "Active animation target is missing readable debug metadata.",
      prop: animation.prop,
      targetId: animation.targetId,
      type: "missing-target-metadata",
    });
  }
  return warnings;
}

export function createMotionRuntimeDebugAdapter() {
  const targetMetaById = new Map();
  const targetRefsById = CAN_STORE_DEBUG_TARGET_REFS ? new Map() : null;
  const activeAnimations = new Map();
  const activeTargetRefs = new Map();
  const activeChannelRefs = new Map();
  const history = { events: [], samples: [] };
  const debug = makeDebugCounters();
  let latestChannels = [];
  let runtimeState = { activeAnimationCount: 0, frames: 0, timeMs: 0 };
  let config = { ...DEFAULT_DEBUG_CONFIG };
  let lastSampleTimeMs = Number.NEGATIVE_INFINITY;

  function cloneConfig() {
    return {
      ...config,
      recordFilter: cloneDebugRecordFilter(config.recordFilter),
    };
  }

  function makeTargetMetadataRecord(targetId, metadata = {}) {
    return { targetId, ...sanitizeDebugMetadata(metadata) };
  }

  function rememberTargetRef(targetId, target, metadata = null) {
    if (!targetRefsById || targetId == null || !target) return;
    const liveTarget = metadata?.overlayTarget || metadata?.boundsTarget || metadata?.debugOverlayTarget || null;
    const previous = targetRefsById.get(targetId) || {};
    targetRefsById.set(targetId, {
      overlayTarget: liveTarget || previous.overlayTarget || target,
      target,
    });
  }

  function rememberTargetMetadata(event = {}) {
    const targetId = event.targetId ?? event.record?.targetId;
    if (targetId == null) return null;
    const record = event.record || makeTargetMetadataRecord(targetId, event.metadata);
    const previous = targetMetaById.get(targetId);
    const next = hasReadableDebugMetadata(record) || !previous
      ? { ...previous, ...record, targetId }
      : previous;
    targetMetaById.set(targetId, { ...next });
    rememberTargetRef(targetId, event.target, event.metadata);
    return { ...next };
  }

  function enrichRecord(record = {}) {
    const result = { ...record };
    const metadata = result.targetId == null ? null : targetMetaById.get(result.targetId);
    if (metadata?.layer != null && result.layer == null) result.layer = metadata.layer;
    if (metadata?.kind != null && result.targetKind == null) result.targetKind = metadata.kind;
    if (metadata?.label != null && result.targetLabel == null) result.targetLabel = metadata.label;
    if (metadata?.sourceLabel != null && result.sourceLabel == null) result.sourceLabel = metadata.sourceLabel;
    return result;
  }

  function enrichRecords(records = []) {
    return records.map((record) => enrichRecord(record));
  }

  function animationKey(record = {}) {
    return makeTrackKey(record);
  }

  function activeChannelKey(record = {}) {
    return `${record.targetId ?? "unknown"}:${record.prop ?? "unknown"}`;
  }

  function incrementRefCount(counts, key) {
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  function decrementRefCount(counts, key) {
    const current = counts.get(key) || 0;
    if (current <= 1) counts.delete(key);
    else counts.set(key, current - 1);
  }

  function syncActiveCounterValues() {
    debug.activeTargets = activeTargetRefs.size;
    debug.activeChannels = activeChannelRefs.size;
    runtimeState.activeAnimationCount = activeAnimations.size;
  }

  function addActiveCounterRecord(record = {}) {
    if (record.targetId != null) incrementRefCount(activeTargetRefs, record.targetId);
    incrementRefCount(activeChannelRefs, activeChannelKey(record));
  }

  function removeActiveCounterRecord(record = {}) {
    if (record.targetId != null) decrementRefCount(activeTargetRefs, record.targetId);
    decrementRefCount(activeChannelRefs, activeChannelKey(record));
  }

  function setActiveCountersFromSummary(summary = {}) {
    debug.activeTargets = Math.max(0, Math.floor(readNumber(summary.activeTargetCount)));
    debug.activeChannels = Math.max(0, Math.floor(readNumber(summary.activeChannelCount)));
    runtimeState.activeAnimationCount = Math.max(0, Math.floor(readNumber(summary.activeAnimationCount)));
  }

  function clearActiveAnimationRecords() {
    activeAnimations.clear();
    activeTargetRefs.clear();
    activeChannelRefs.clear();
    syncActiveCounterValues();
  }

  function setActiveAnimation(record = {}) {
    if (record.targetId == null || record.prop == null || record.lane == null || record.laneKey == null) return;
    const enriched = enrichRecord(record);
    const key = animationKey(enriched);
    const previous = activeAnimations.get(key);
    if (previous) removeActiveCounterRecord(previous);
    activeAnimations.set(key, enriched);
    addActiveCounterRecord(enriched);
    syncActiveCounterValues();
  }

  function deleteActiveAnimation(record = {}) {
    const key = animationKey(record);
    const previous = activeAnimations.get(key);
    if (!previous) return;
    activeAnimations.delete(key);
    removeActiveCounterRecord(previous);
    syncActiveCounterValues();
  }

  function replaceActiveAnimationRecords(records = []) {
    clearActiveAnimationRecords();
    for (const record of records) setActiveAnimation(record);
  }

  function trimHistory() {
    const minTimeMs = runtimeState.timeMs - config.recordWindowMs;
    while (history.events.length && history.events[0].timeMs < minTimeMs) history.events.shift();
    while (history.samples.length && history.samples[0].timeMs < minTimeMs) history.samples.shift();
    while (history.events.length > config.maxEvents) history.events.shift();
    while (history.samples.length > config.maxSamples) history.samples.shift();
  }

  function shouldRecordHistory() {
    return config.enabled && config.recordHistory;
  }

  function shouldObserveSamples() {
    if (!shouldRecordHistory()) return false;
    return !config.recordFilter || config.recordFilter.includeSamples !== false;
  }

  function shouldBuildSample(timeMs = runtimeState.timeMs) {
    if (!shouldObserveSamples()) return false;
    const sampleTimeMs = readNumber(timeMs, runtimeState.timeMs);
    const intervalMs = config.sampleHz > 0 ? 1000 / config.sampleHz : 0;
    return intervalMs <= 0 || sampleTimeMs - lastSampleTimeMs >= intervalMs;
  }

  function recordEvent(record, type) {
    if (!shouldRecordHistory()) return;
    if (!matchesDebugRecordFilter(record, type, config.recordFilter)) return;
    history.events.push(record);
    trimHistory();
  }

  function observeLifecycleEvent(event) {
    const type = event.type;
    const record = enrichRecord({ ...event.record, type });
    runtimeState.frames = event.frame ?? record.frame ?? runtimeState.frames;
    runtimeState.timeMs = event.timeMs ?? record.timeMs ?? runtimeState.timeMs;

    if (type === "start") {
      debug.started += 1;
      setActiveAnimation(record);
    } else if (type === "cancel") {
      debug.canceled += 1;
      incrementDebugCount(debug.canceledByReason, record.reason);
      deleteActiveAnimation(record);
    } else if (type === "complete") {
      debug.completed += 1;
      deleteActiveAnimation(record);
    } else if (type === "snap") {
      deleteActiveAnimation(record);
    } else if (type === "release") {
      debug.released += 1;
      if (event.active === false) deleteActiveAnimation(record);
      else setActiveAnimation(record);
    } else if (type === "retarget" || type === "settle" || type === "arrive") {
      setActiveAnimation(record);
    }

    recordEvent(record, type);
  }

  function observeFrame(event = {}) {
    runtimeState = {
      ...runtimeState,
      activeAnimationCount: Math.max(0, Math.floor(readNumber(event.activeAnimationCount, runtimeState.activeAnimationCount))),
      frames: event.frame ?? runtimeState.frames,
      timeMs: event.timeMs ?? runtimeState.timeMs,
    };
    debug.frames = runtimeState.frames;
    debug.writes += Math.max(0, Math.floor(readNumber(event.writesLastFrame, 0)));
    debug.writesLastFrame = Math.max(0, Math.floor(readNumber(event.writesLastFrame, 0)));
    debug.afterFrameFlushes += Math.max(0, Math.floor(readNumber(event.afterFrameFlushes, 0)));
  }

  function observeSample(event = {}) {
    if (!shouldBuildSample(event.timeMs)) return;
    const animations = enrichRecords(event.animations || []);
    latestChannels = enrichRecords(event.channels || []);
    runtimeState = {
      activeAnimationCount: animations.length,
      frames: event.frame ?? runtimeState.frames,
      timeMs: event.timeMs ?? runtimeState.timeMs,
    };
    replaceActiveAnimationRecords(animations);
    debug.frames = runtimeState.frames;
    const filteredAnimations = animations.filter((record) => matchesDebugRecordFilter(record, "sample", config.recordFilter));
    if (config.recordFilter && filteredAnimations.length === 0) {
      lastSampleTimeMs = runtimeState.timeMs;
      return;
    }
    history.samples.push({
      activeAnimationCount: filteredAnimations.length,
      animations: filteredAnimations,
      frame: runtimeState.frames,
      timeMs: runtimeState.timeMs,
    });
    lastSampleTimeMs = runtimeState.timeMs;
    trimHistory();
  }

  function observe(event = {}) {
    if (!event || typeof event !== "object") return;
    if (!config.enabled) return;
    if (event.type === "frame") {
      observeFrame(event);
      return;
    }
    if (event.type === "debugConfig") return;
    if (event.type === "targetMetadata") {
      rememberTargetMetadata(event);
      return;
    }
    if (event.type === "sample") {
      observeSample(event);
      return;
    }
    observeLifecycleEvent(event);
  }

  function isEnabled() {
    return config.enabled === true;
  }

  function configureDebug(patch = {}) {
    if (patch && typeof patch === "object") {
      if (Object.hasOwn(patch, "enabled")) config.enabled = Boolean(patch.enabled);
      if (Object.hasOwn(patch, "overlayEnabled")) config.overlayEnabled = Boolean(patch.overlayEnabled);
      if (Object.hasOwn(patch, "recordHistory")) config.recordHistory = Boolean(patch.recordHistory);
      if (Object.hasOwn(patch, "recordWindowMs")) {
        config.recordWindowMs = clamp(readNumber(patch.recordWindowMs, config.recordWindowMs), DEBUG_RECORD_WINDOW_MIN_MS, DEBUG_RECORD_WINDOW_MAX_MS);
      }
      if (Object.hasOwn(patch, "sampleHz")) config.sampleHz = Math.max(0, readNumber(patch.sampleHz, config.sampleHz));
      if (Object.hasOwn(patch, "maxEvents")) config.maxEvents = Math.max(0, Math.floor(readNumber(patch.maxEvents, config.maxEvents)));
      if (Object.hasOwn(patch, "maxSamples")) config.maxSamples = Math.max(0, Math.floor(readNumber(patch.maxSamples, config.maxSamples)));
      if (Object.hasOwn(patch, "recordFilter")) config.recordFilter = normalizeDebugRecordFilter(patch.recordFilter);
      if (Object.hasOwn(patch, "timeScale")) config.timeScale = Math.max(0, readNumber(patch.timeScale, config.timeScale));
      trimHistory();
    }
    return cloneConfig();
  }

  function clearHistory() {
    history.events.length = 0;
    history.samples.length = 0;
    lastSampleTimeMs = Number.NEGATIVE_INFINITY;
  }

  function reset() {
    Object.assign(debug, makeDebugCounters());
    debug.canceledByReason = {};
    clearActiveAnimationRecords();
    latestChannels = [];
    runtimeState = { activeAnimationCount: 0, frames: 0, timeMs: 0 };
    clearHistory();
    targetMetaById.clear();
    targetRefsById?.clear();
  }

  function resolveTarget(targetId, options = {}) {
    const numericId = Number(targetId);
    if (!Number.isFinite(numericId)) return null;
    const entry = targetRefsById?.get(numericId);
    if (!entry) return null;
    return options.bounds === false ? entry.target : (entry.overlayTarget || entry.target);
  }

  function getTargetRecords() {
    return Array.from(targetMetaById.values())
      .map((metadata) => ({ ...metadata }))
      .sort((a, b) => (a.targetId || 0) - (b.targetId || 0));
  }

  function makeSnapshot(snapshotOptions = {}, currentState = {}) {
    const animations = enrichRecords(currentState.animations || Array.from(activeAnimations.values()));
    const channels = enrichRecords(currentState.channels || latestChannels);
    if (currentState.runtime) runtimeState = { ...runtimeState, ...currentState.runtime };
    replaceActiveAnimationRecords(animations);
    const warnings = makeDebugWarnings(animations, targetMetaById);
    const summary = makeMotionDebugSummary(animations);
    summary.warningCount = warnings.length;
    setActiveCountersFromSummary(summary);
    const snapshot = {
      animations,
      counters: {
        ...debug,
        canceledByReason: { ...debug.canceledByReason },
      },
      summary,
      warnings,
    };
    if (snapshotOptions.includeChannels) snapshot.channels = channels;
    if (snapshotOptions.includeTargets) snapshot.targets = getTargetRecords();
    if (snapshotOptions.includeHistory) snapshot.history = cloneHistory(history);
    return snapshot;
  }

  function makeReport(reportOptions = {}, currentState = {}) {
    const snapshot = makeSnapshot({
      includeChannels: reportOptions.includeChannels,
      includeTargets: reportOptions.includeTargets,
    }, currentState);
    const report = {
      animations: snapshot.animations,
      config: cloneConfig(),
      counters: snapshot.counters,
      runtime: {
        activeAnimationCount: snapshot.summary.activeAnimationCount,
        frames: runtimeState.frames,
        timeMs: runtimeState.timeMs,
      },
      summary: snapshot.summary,
      version: 1,
      warnings: snapshot.warnings,
    };
    if (reportOptions.includeCurveStats) report.curveStats = makeCurveStats(history);
    if (reportOptions.includeChannels) report.channels = snapshot.channels;
    if (reportOptions.includeHistory) report.history = cloneHistory(history);
    if (reportOptions.includeTargets) report.targets = snapshot.targets;
    return report;
  }

  return {
    clearHistory,
    configureDebug,
    debug,
    getConfig: cloneConfig,
    isEnabled,
    makeReport,
    makeSnapshot,
    makeTargetMetadataRecord,
    observe,
    reset,
    resolveTarget,
    shouldBuildSample,
    shouldObserveSamples,
  };
}
