import { reloadOnPixiHotUpdate } from "../devHmr.js";

const DEFAULT_MAX_DELTA_SECONDS = 0.05;
const DEFAULT_STEP_SECONDS = 1 / 120;
const DEFAULT_REST_DELTA = 0.01;
const DEFAULT_REST_SPEED = 0.01;
const DEFAULT_ARRIVE_DELTA = 0.5;
const DEFAULT_BLEND_DURATION = 0.08;
const DEFAULT_SETTLE_SPRING = Object.freeze({
  damping: 31,
  mass: 0.9,
  restDelta: DEFAULT_REST_DELTA,
  restSpeed: DEFAULT_REST_SPEED,
  stiffness: 340,
});
const NEUTRAL_EPSILON = 0.0001;
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

let nextLaneId = 1;

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  return Date.now();
}

function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(readNumber(value), 0, 1);
}

function linear(t) {
  return t;
}

function normalizeInterrupt(policy) {
  if (policy === "blend" || policy === "ignore" || policy === "replace" || policy === "retarget") return policy;
  return "auto";
}

function normalizeMilestones(milestones) {
  if (!Array.isArray(milestones)) return [];
  return milestones
    .filter((milestone) => typeof milestone?.callback === "function")
    .map((milestone) => ({
      callback: milestone.callback,
      fired: false,
      progress: clamp01(milestone.progress),
    }))
    .sort((a, b) => a.progress - b.progress);
}

export const easing = Object.freeze({
  linear,
  "power1.out": (t) => 1 - (1 - t) ** 2,
  "power2.in": (t) => t * t * t,
  "power2.out": (t) => 1 - (1 - t) ** 3,
  "power2.inOut": (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  "power3.out": (t) => 1 - (1 - t) ** 4,
  "sine.inOut": (t) => -(Math.cos(Math.PI * t) - 1) / 2,
});

export function cubicBezier(x1, y1, x2, y2) {
  // Newton iteration against x(t), with a bisection fallback for flat curves.
  const sample = (a, b, c, t) => ((a * t + b) * t + c) * t;
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  return (x) => {
    const target = clamp(readNumber(x), 0, 1);
    let t = target;
    for (let i = 0; i < 6; i += 1) {
      const current = sample(ax, bx, cx, t) - target;
      const derivative = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(current) < 0.000001) break;
      if (Math.abs(derivative) < 0.000001) break;
      t = clamp(t - current / derivative, 0, 1);
    }
    let low = 0;
    let high = 1;
    for (let i = 0; i < 8; i += 1) {
      const current = sample(ax, bx, cx, t);
      if (Math.abs(current - target) < 0.000001) break;
      if (current < target) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sample(ay, by, cy, t);
  };
}

export function resolveEase(ease) {
  if (typeof ease === "function") return ease;
  if (typeof ease === "string" && easing[ease]) return easing[ease];
  return linear;
}

export function spring(config = {}) {
  return Object.freeze({ config, type: "spring" });
}

export function tween(options = {}) {
  return Object.freeze({ options, type: "tween" });
}

export function decay(options = {}) {
  return Object.freeze({ options, type: "decay" });
}

export function progressDriver(options = {}) {
  return { options: { progress: 0, ...options }, type: "progress" };
}

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

function makeDebugSummary(animations) {
  const targetIds = new Set();
  const channelKeys = new Set();
  const summary = {
    activeAnimationCount: animations.length,
    activeChannelCount: 0,
    activeTargetCount: 0,
    byDriver: {},
    byLane: {},
    byLaneKey: {},
    byProp: {},
    byTargetId: {},
  };

  for (const animation of animations) {
    incrementDebugCount(summary.byDriver, animation.driver);
    incrementDebugCount(summary.byLane, animation.lane);
    incrementDebugCount(summary.byLaneKey, animation.laneKey);
    incrementDebugCount(summary.byProp, animation.prop);
    incrementDebugCount(summary.byTargetId, animation.targetId);
    if (animation.targetId != null) targetIds.add(animation.targetId);
    channelKeys.add(`${animation.targetId ?? "unknown"}:${animation.prop}`);
  }

  summary.activeTargetCount = targetIds.size;
  summary.activeChannelCount = channelKeys.size;
  return summary;
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

function sanitizeDebugMetadata(metadata) {
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

export function createMotionRuntime(options = {}) {
  const scheduler = options.scheduler || globalThis;
  const autoStart = options.autoStart !== false;
  const maxDeltaSeconds = Math.max(0.001, readNumber(options.maxDeltaSeconds, DEFAULT_MAX_DELTA_SECONDS));
  const stepSeconds = Math.max(0.001, readNumber(options.stepSeconds, DEFAULT_STEP_SECONDS));

  const targetChannels = new WeakMap();
  const activeAnimations = new Set();
  const activeTargets = new Set();
  const afterFrameCallbacks = new Set();
  const dirtyChannels = new Set();
  const pendingUpdateAnimations = new Set();
  const targetIds = new WeakMap();
  const debugTargetMetaByTarget = new WeakMap();
  const debugTargetMetaById = new Map();
  const debugTargetRefsById = CAN_STORE_DEBUG_TARGET_REFS ? new Map() : null;
  const debugHistory = { events: [], samples: [] };
  const debug = makeDebugCounters();
  const activeAnimationScratch = [];
  const afterFrameScratch = [];
  const dirtyChannelScratch = [];
  const pendingUpdateScratch = [];
  let debugConfig = { ...DEFAULT_DEBUG_CONFIG };
  let frameHandle = null;
  let lastFrameTime = 0;
  let lastSampleTimeMs = Number.NEGATIVE_INFINITY;
  let nextTargetId = 1;
  let runtimeTimeMs = 0;

  function getTargetId(target) {
    if (!target) return null;
    let id = targetIds.get(target);
    if (!id) {
      id = nextTargetId;
      nextTargetId += 1;
      targetIds.set(target, id);
    }
    return id;
  }

  function rememberDebugTargetRef(targetId, target, metadata = null) {
    if (!debugTargetRefsById || targetId == null || !target) return;
    const liveTarget = metadata?.overlayTarget || metadata?.boundsTarget || metadata?.debugOverlayTarget || null;
    const previous = debugTargetRefsById.get(targetId) || {};
    debugTargetRefsById.set(targetId, {
      overlayTarget: liveTarget || previous.overlayTarget || target,
      target,
    });
  }

  function rememberTarget(target) {
    const targetId = getTargetId(target);
    if (targetId == null) return null;
    rememberDebugTargetRef(targetId, target);
    const described = debugTargetMetaByTarget.get(target);
    if (described) debugTargetMetaById.set(targetId, described);
    else if (!debugTargetMetaById.has(targetId)) debugTargetMetaById.set(targetId, { targetId });
    return targetId;
  }

  function cloneDebugConfig() {
    return {
      ...debugConfig,
      recordFilter: cloneDebugRecordFilter(debugConfig.recordFilter),
    };
  }

  function trimDebugHistory() {
    const minTimeMs = runtimeTimeMs - debugConfig.recordWindowMs;
    while (debugHistory.events.length && debugHistory.events[0].timeMs < minTimeMs) debugHistory.events.shift();
    while (debugHistory.samples.length && debugHistory.samples[0].timeMs < minTimeMs) debugHistory.samples.shift();
    while (debugHistory.events.length > debugConfig.maxEvents) debugHistory.events.shift();
    while (debugHistory.samples.length > debugConfig.maxSamples) debugHistory.samples.shift();
  }

  function shouldRecordDebugHistory() {
    return debugConfig.enabled && debugConfig.recordHistory;
  }

  function makeDebugAnimationRecord(animation) {
    const targetId = rememberTarget(animation.target);
    const metadata = targetId == null ? null : debugTargetMetaById.get(targetId);
    const record = {
      delay: animation.delay,
      blendDuration: animation.blendFrom == null ? 0 : animation.blendDuration,
      blendProgress: animation.blendFrom == null || animation.blendDuration <= 0
        ? 1
        : clamp(readNumber(animation.blendElapsed) / animation.blendDuration, 0, 1),
      driver: animation.driver?.type || "spring",
      from: animation.from,
      interrupt: animation.interrupt,
      lane: animation.lane,
      laneKey: animation.laneKey,
      milestones: animation.milestones.filter((milestone) => !milestone.fired).map((milestone) => milestone.progress),
      prop: animation.prop,
      released: animation.released,
      targetId,
      to: animation.to,
      value: animation.value,
      velocity: animation.velocity,
    };
    if (metadata?.layer != null) record.layer = metadata.layer;
    if (metadata?.kind != null) record.targetKind = metadata.kind;
    if (metadata?.label != null) record.targetLabel = metadata.label;
    if (metadata?.sourceLabel != null) record.sourceLabel = metadata.sourceLabel;
    return record;
  }

  function makeDebugEvent(type, animation, extra = {}) {
    const record = makeDebugAnimationRecord(animation);
    const event = {
      frame: debug.frames,
      timeMs: runtimeTimeMs,
      type,
      ...record,
    };
    if (extra.reason != null) event.reason = String(extra.reason);
    if (extra.value != null) event.value = readNumber(extra.value);
    return event;
  }

  function recordDebugEvent(type, animation, extra) {
    if (!shouldRecordDebugHistory()) return;
    const event = makeDebugEvent(type, animation, extra);
    if (!matchesDebugRecordFilter(event, type, debugConfig.recordFilter)) return;
    debugHistory.events.push(event);
    trimDebugHistory();
  }

  function makeDebugLaneRecord(animation) {
    const record = {
      driver: animation.driver?.type || "spring",
      from: animation.from,
      interrupt: animation.interrupt,
      lane: animation.lane,
      laneKey: animation.laneKey,
      output: getAnimationOutputValue(animation),
      released: animation.released,
      to: animation.to,
      value: animation.value,
      velocity: animation.velocity,
    };
    const targetId = rememberTarget(animation.target);
    const metadata = targetId == null ? null : debugTargetMetaById.get(targetId);
    if (metadata?.sourceLabel != null) record.sourceLabel = metadata.sourceLabel;
    return record;
  }

  function makeChannelBreakdown(channel) {
    const baseLanes = Array.from(channel.base.values()).map((animation) => makeDebugLaneRecord(animation));
    const additiveLanes = Array.from(channel.additive.values()).map((animation) => makeDebugLaneRecord(animation));
    const factorLanes = Array.from(channel.factor.values()).map((animation) => makeDebugLaneRecord(animation));
    const additiveValue = additiveLanes.reduce((total, lane) => total + lane.output, 0);
    const factorValue = factorLanes.reduce((total, lane) => total * lane.output, 1);
    const unclampedValue = (channel.baseValue + additiveValue) * factorValue;
    const breakdown = {
      additive: {
        lanes: additiveLanes,
        value: additiveValue,
      },
      base: {
        activeKey: channel.activeBaseKey,
        lanes: baseLanes,
        value: channel.baseValue,
      },
      composed: {
        formula: "(base + additive) * factor",
        unclampedValue,
        value: channel.value,
      },
      factor: {
        lanes: factorLanes,
        value: factorValue,
      },
    };
    if (channel.clamp) breakdown.composed.clamp = { ...channel.clamp };
    return breakdown;
  }

  function makeDebugChannelRecords() {
    const channels = new Map();
    for (const animation of activeAnimations) {
      const targetId = rememberTarget(animation.target);
      const key = `${targetId ?? "unknown"}:${animation.prop}`;
      let record = channels.get(key);
      if (!record) {
        const breakdown = makeChannelBreakdown(animation.channel);
        record = {
          activeBaseKey: animation.channel.activeBaseKey,
          ...breakdown,
          baseValue: animation.channel.baseValue,
          lanes: { additive: [], base: [], factor: [] },
          prop: animation.prop,
          targetId,
          value: animation.channel.value,
        };
        channels.set(key, record);
      }
      record.lanes[animation.lane].push(animation.laneKey);
    }
    return Array.from(channels.values());
  }

  function makeDebugTargetRecords() {
    return Array.from(debugTargetMetaById.values())
      .map((metadata) => ({ ...metadata }))
      .sort((a, b) => (a.targetId || 0) - (b.targetId || 0));
  }

  function makeDebugWarnings(animations) {
    const warnings = [];
    const seen = new Set();
    for (const animation of animations) {
      const metadata = animation.targetId == null ? null : debugTargetMetaById.get(animation.targetId);
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

  function cloneDebugHistory() {
    return {
      events: debugHistory.events.map((event) => ({ ...event })),
      samples: debugHistory.samples.map((sample) => ({
        ...sample,
        animations: sample.animations.map((animation) => ({ ...animation })),
      })),
    };
  }

  function makeCurveStatsKey(record) {
    return `${record.targetId ?? "unknown"}:${record.prop ?? "unknown"}:${record.lane ?? "unknown"}:${record.laneKey ?? "unknown"}`;
  }

  function readFiniteNumber(value) {
    if (value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function makeCurveStatsSeed(record) {
    const key = makeCurveStatsKey(record);
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

  function makeCurveStats() {
    const statsByKey = new Map();
    const points = [];
    for (const event of debugHistory.events) points.push(event);
    for (const sample of debugHistory.samples) {
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
      const key = makeCurveStatsKey(point);
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

  function recordDebugSample() {
    if (!shouldRecordDebugHistory()) return;
    const intervalMs = debugConfig.sampleHz > 0 ? 1000 / debugConfig.sampleHz : 0;
    if (intervalMs > 0 && runtimeTimeMs - lastSampleTimeMs < intervalMs) return;
    const animations = Array.from(activeAnimations)
      .map((animation) => makeDebugAnimationRecord(animation))
      .filter((record) => matchesDebugRecordFilter(record, "sample", debugConfig.recordFilter));
    if (debugConfig.recordFilter && animations.length === 0) {
      lastSampleTimeMs = runtimeTimeMs;
      return;
    }
    debugHistory.samples.push({
      activeAnimationCount: animations.length,
      animations,
      frame: debug.frames,
      timeMs: runtimeTimeMs,
    });
    lastSampleTimeMs = runtimeTimeMs;
    trimDebugHistory();
  }

  function clearDebugHistory() {
    debugHistory.events.length = 0;
    debugHistory.samples.length = 0;
    lastSampleTimeMs = Number.NEGATIVE_INFINITY;
  }

  function configureDebug(config = {}) {
    if (config && typeof config === "object") {
      if (Object.hasOwn(config, "enabled")) debugConfig.enabled = Boolean(config.enabled);
      if (Object.hasOwn(config, "overlayEnabled")) debugConfig.overlayEnabled = Boolean(config.overlayEnabled);
      if (Object.hasOwn(config, "recordHistory")) debugConfig.recordHistory = Boolean(config.recordHistory);
      if (Object.hasOwn(config, "recordWindowMs")) {
        debugConfig.recordWindowMs = clamp(readNumber(config.recordWindowMs, debugConfig.recordWindowMs), DEBUG_RECORD_WINDOW_MIN_MS, DEBUG_RECORD_WINDOW_MAX_MS);
      }
      if (Object.hasOwn(config, "sampleHz")) debugConfig.sampleHz = Math.max(0, readNumber(config.sampleHz, debugConfig.sampleHz));
      if (Object.hasOwn(config, "maxEvents")) debugConfig.maxEvents = Math.max(0, Math.floor(readNumber(config.maxEvents, debugConfig.maxEvents)));
      if (Object.hasOwn(config, "maxSamples")) debugConfig.maxSamples = Math.max(0, Math.floor(readNumber(config.maxSamples, debugConfig.maxSamples)));
      if (Object.hasOwn(config, "recordFilter")) debugConfig.recordFilter = normalizeDebugRecordFilter(config.recordFilter);
      if (Object.hasOwn(config, "timeScale")) debugConfig.timeScale = Math.max(0, readNumber(config.timeScale, debugConfig.timeScale));
      trimDebugHistory();
    }
    return cloneDebugConfig();
  }

  function describeTarget(target, metadata = {}) {
    if (!target) return null;
    const targetId = getTargetId(target);
    const record = { targetId, ...sanitizeDebugMetadata(metadata) };
    debugTargetMetaByTarget.set(target, record);
    debugTargetMetaById.set(targetId, record);
    rememberDebugTargetRef(targetId, target, metadata);
    return { ...record };
  }

  function resolveDebugTarget(targetId, options = {}) {
    const numericId = Number(targetId);
    if (!Number.isFinite(numericId)) return null;
    const entry = debugTargetRefsById?.get(numericId);
    if (!entry) return null;
    return options.bounds === false ? entry.target : (entry.overlayTarget || entry.target);
  }

  function getTargetMap(target, create = false) {
    let targetMap = targetChannels.get(target);
    if (!targetMap && create) {
      targetMap = new Map();
      targetChannels.set(target, targetMap);
    }
    return targetMap;
  }

  function getChannel(target, prop, create = false) {
    const targetMap = getTargetMap(target, create);
    if (!targetMap) return null;
    let channel = targetMap.get(prop);
    if (!channel && create) {
      channel = {
        additive: new Map(),
        activeBaseKey: null,
        base: new Map(),
        baseValue: readNumber(target[prop]),
        factor: new Map(),
        prop,
        target,
        value: readNumber(target[prop]),
      };
      targetMap.set(prop, channel);
    }
    return channel;
  }

  function cleanupChannel(channel) {
    if (!channel || channel.base.size || channel.additive.size || channel.factor.size) return;
    const targetMap = targetChannels.get(channel.target);
    if (targetMap?.get(channel.prop) === channel) {
      targetMap.delete(channel.prop);
      if (!targetMap.size) targetChannels.delete(channel.target);
    }
  }

  function getAnimationOutputValue(animation) {
    if (!animation) return 0;
    const duration = Math.max(0, readNumber(animation.blendDuration));
    if (animation.blendFrom == null || duration <= 0) return animation.value;
    const progress = clamp(readNumber(animation.blendElapsed) / duration, 0, 1);
    if (progress >= 1) return animation.value;
    const eased = resolveEase(animation.blendEase)(progress);
    return animation.blendFrom + (animation.value - animation.blendFrom) * eased;
  }

  function advanceBlend(animation, deltaSeconds) {
    if (animation?.blendFrom == null) return;
    animation.blendElapsed = Math.min(animation.blendDuration, readNumber(animation.blendElapsed) + deltaSeconds);
  }

  function composeChannel(channel) {
    if (channel.target?.destroyed) {
      cleanupChannel(channel);
      return channel.value;
    }
    let value = channel.baseValue;
    for (const animation of channel.additive.values()) value += getAnimationOutputValue(animation);
    for (const animation of channel.factor.values()) value *= getAnimationOutputValue(animation);
    if (channel.clamp) value = clamp(value, channel.clamp.min, channel.clamp.max);
    channel.value = value;
    channel.target[channel.prop] = value;
    debug.writes += 1;
    debug.writesLastFrame += 1;
    return value;
  }

  function markChannelDirty(channel) {
    if (channel) dirtyChannels.add(channel);
  }

  function queueAnimationUpdate(animation) {
    if (animation?.onUpdate) pendingUpdateAnimations.add(animation);
  }

  function setChannelLane(channel, animation) {
    if (animation.lane === "base") {
      channel.base.set(animation.laneKey, animation);
      channel.activeBaseKey = animation.laneKey;
      return;
    }
    const collection = animation.lane === "factor" ? channel.factor : channel.additive;
    collection.set(animation.laneKey, animation);
  }

  function chooseFallbackBase(channel) {
    let fallback = null;
    for (const animation of channel.base.values()) fallback = animation;
    return fallback;
  }

  function clearChannelLane(animation) {
    const channel = animation.channel;
    if (!channel) return;
    if (animation.lane === "base") {
      if (channel.base.get(animation.laneKey) === animation) channel.base.delete(animation.laneKey);
      if (channel.activeBaseKey === animation.laneKey) {
        const fallback = chooseFallbackBase(channel);
        channel.activeBaseKey = fallback?.laneKey || null;
        channel.baseValue = fallback ? getAnimationOutputValue(fallback) : getAnimationOutputValue(animation);
      }
    } else if (animation.lane === "factor") {
      if (channel.factor.get(animation.laneKey) === animation) channel.factor.delete(animation.laneKey);
    } else if (channel.additive.get(animation.laneKey) === animation) {
      channel.additive.delete(animation.laneKey);
    }
    composeChannel(channel);
    cleanupChannel(channel);
  }

  function addActiveAnimation(animation) {
    activeAnimations.add(animation);
    activeTargets.add(animation.target);
    rememberTarget(animation.target);
    debug.started += 1;
    recordDebugEvent("start", animation);
    ensureTicker();
  }

  function removeActiveAnimation(animation) {
    activeAnimations.delete(animation);
    if (!animation?.target) return;
    for (const activeAnimation of activeAnimations) {
      if (activeAnimation.target === animation.target) return;
    }
    activeTargets.delete(animation.target);
  }

  function cancelAnimation(animation, reason = "cancel") {
    if (!animation || animation.done) return;
    animation.done = true;
    removeActiveAnimation(animation);
    pendingUpdateAnimations.delete(animation);
    clearChannelLane(animation);
    debug.canceled += 1;
    debug.canceledByReason[reason] = (debug.canceledByReason[reason] || 0) + 1;
    recordDebugEvent("cancel", animation, { reason });
    animation.onCancel?.(reason);
  }

  function completeAnimation(animation, finalValue = animation.to) {
    if (!animation || animation.done) return;
    animation.done = true;
    pendingUpdateAnimations.delete(animation);
    animation.value = finalValue;
    animation.blendElapsed = animation.blendDuration;
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    composeChannel(animation.channel);
    fireMilestones(animation, 1);
    removeActiveAnimation(animation);
    clearChannelLane(animation);
    debug.completed += 1;
    const shouldFireArrive = !animation.arrived;
    if (shouldFireArrive) recordDebugEvent("arrive", animation, { value: finalValue });
    recordDebugEvent("complete", animation, { value: finalValue });
    animation.onUpdate?.(finalValue);
    if (shouldFireArrive) {
      animation.arrived = true;
      animation.onArrive?.(finalValue);
    }
    animation.onComplete?.();
  }

  function scheduleFrame() {
    if (!autoStart || frameHandle != null || typeof scheduler.requestAnimationFrame !== "function") return;
    frameHandle = scheduler.requestAnimationFrame((time) => {
      frameHandle = null;
      const nextTime = Number.isFinite(Number(time)) ? Number(time) : nowMs();
      if (!lastFrameTime) lastFrameTime = nextTime;
      const deltaSeconds = Math.min(maxDeltaSeconds, Math.max(0, (nextTime - lastFrameTime) / 1000));
      lastFrameTime = nextTime;
      step(deltaSeconds);
      if (activeAnimations.size || afterFrameCallbacks.size) scheduleFrame();
      else lastFrameTime = 0;
    });
  }

  function ensureTicker() {
    if (activeAnimations.size || afterFrameCallbacks.size) scheduleFrame();
  }

  function stopTicker() {
    if (frameHandle == null || typeof scheduler.cancelAnimationFrame !== "function") return;
    scheduler.cancelAnimationFrame(frameHandle);
    frameHandle = null;
    lastFrameTime = 0;
  }

  function makeAnimation(target, prop, to, animationOptions = {}) {
    const lane = animationOptions.lane || "base";
    const channel = getChannel(target, prop, true);
    const current = lane === "base"
      ? readNumber(target[prop], channel.baseValue)
      : lane === "factor"
        ? 1
        : 0;
    const from = readNumber(animationOptions.from, current);
    const driver = animationOptions.driver || spring();
    const animation = {
      arrived: false,
      channel,
      delay: Math.max(0, readNumber(animationOptions.delay)),
      done: false,
      driver,
      elapsed: 0,
      blendDuration: Math.max(0, readNumber(animationOptions.blendDuration, DEFAULT_BLEND_DURATION)),
      blendEase: animationOptions.blendEase,
      blendElapsed: 0,
      blendFrom: null,
      from,
      hasExplicitFrom: animationOptions.from != null,
      interrupt: normalizeInterrupt(animationOptions.interrupt),
      lane,
      laneKey: animationOptions.laneKey || (lane === "base" ? "base" : `${lane}-${nextLaneId++}`),
      onArrive: animationOptions.onArrive,
      onCancel: animationOptions.onCancel,
      onComplete: animationOptions.onComplete,
      onUpdate: animationOptions.onUpdate,
      milestones: normalizeMilestones(animationOptions.milestones),
      prop,
      released: false,
      started: Math.max(0, readNumber(animationOptions.delay)) <= 0,
      target,
      to: readNumber(to, from),
      value: from,
      velocity: readNumber(animationOptions.velocity),
    };
    if (animationOptions.clamp) {
      channel.clamp = {
        max: readNumber(animationOptions.clamp.max, Number.POSITIVE_INFINITY),
        min: readNumber(animationOptions.clamp.min, Number.NEGATIVE_INFINITY),
      };
    }
    return animation;
  }

  function replaceExistingLane(channel, animation) {
    const existing = animation.lane === "base"
      ? channel.base.get(animation.laneKey)
      : animation.lane === "factor"
        ? channel.factor.get(animation.laneKey)
        : channel.additive.get(animation.laneKey);
    if (!existing || existing.done) return null;
    if (animation.interrupt === "auto" &&
      animation.lane === "base" &&
      existing.driver?.type === "spring" &&
      animation.driver?.type === "spring") {
      existing.from = existing.value;
      existing.to = animation.to;
      existing.driver = animation.driver;
      existing.onArrive = animation.onArrive;
      existing.onCancel = animation.onCancel;
      existing.onComplete = animation.onComplete;
      existing.onUpdate = animation.onUpdate;
      existing.milestones = animation.milestones;
      existing.arrived = false;
      existing.released = false;
      if (animation.lane === "base") channel.activeBaseKey = existing.laneKey;
      recordDebugEvent("retarget", existing, { value: existing.value });
      return existing;
    }
    if (animation.interrupt === "retarget") {
      existing.from = existing.value;
      existing.to = animation.to;
      existing.driver = animation.driver;
      existing.elapsed = 0;
      existing.delay = animation.delay;
      existing.onArrive = animation.onArrive;
      existing.onCancel = animation.onCancel;
      existing.onComplete = animation.onComplete;
      existing.onUpdate = animation.onUpdate;
      existing.milestones = animation.milestones;
      existing.arrived = false;
      existing.released = false;
      if (existing.driver?.type === "progress") existing.driver.options.progress = 0;
      if (animation.lane === "base") channel.activeBaseKey = existing.laneKey;
      recordDebugEvent("retarget", existing, { value: existing.value });
      return existing;
    }
    if (animation.interrupt === "blend") {
      const previousOutput = getAnimationOutputValue(existing);
      if (!animation.hasExplicitFrom) {
        animation.from = previousOutput;
        animation.value = previousOutput;
      }
      animation.blendFrom = previousOutput;
      animation.blendElapsed = 0;
      cancelAnimation(existing, "blend");
      return null;
    }
    cancelAnimation(existing, "replace");
    return null;
  }

  function animate(target, prop, to, animationOptions = {}) {
    if (!target || !prop) return null;
    const animation = makeAnimation(target, prop, to, animationOptions);
    const existingLaneAnimation = getLaneAnimation(animation.channel, animation);
    if (animation.interrupt === "ignore" && existingLaneAnimation) {
      return makeControl(existingLaneAnimation);
    }
    if (animationOptions.snap) {
      stop(target, prop, { lane: animation.lane, laneKey: animation.laneKey });
      animation.value = animation.to;
      if (animation.lane === "base") {
        setChannelLane(animation.channel, animation);
        animation.channel.baseValue = animation.to;
      } else setChannelLane(animation.channel, animation);
      composeChannel(animation.channel);
      fireMilestones(animation, 1);
      clearChannelLane(animation);
      recordDebugEvent("snap", animation, { value: animation.to });
      animation.onUpdate?.(animation.to);
      animation.onArrive?.(animation.to);
      animation.onComplete?.();
      return null;
    }

    const retargeted = replaceExistingLane(animation.channel, animation);
    if (retargeted) return makeControl(retargeted);

    setChannelLane(animation.channel, animation);
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    composeChannel(animation.channel);
    addActiveAnimation(animation);
    return makeControl(animation);
  }

  function set(target, prop, value, setOptions = {}) {
    if (!target || !prop) return;
    stop(target, prop, setOptions);
    const channel = getChannel(target, prop);
    if (channel) {
      if (!setOptions.lane || setOptions.lane === "base") {
        const laneKey = setOptions.laneKey || "base";
        if (!setOptions.laneKey || channel.activeBaseKey === laneKey || !channel.base.size) channel.baseValue = readNumber(value, channel.baseValue);
      }
      composeChannel(channel);
      return;
    }
    target[prop] = readNumber(value, target[prop]);
  }

  function getLaneAnimation(channel, animation) {
    if (!channel || !animation) return null;
    if (animation.lane === "base") return channel.base.get(animation.laneKey);
    if (animation.lane === "factor") return channel.factor.get(animation.laneKey);
    return channel.additive.get(animation.laneKey);
  }

  function stepSpring(animation, dt) {
    const config = animation.driver.config || {};
    const stiffness = Math.max(0, readNumber(config.stiffness, 0));
    const damping = Math.max(0, readNumber(config.damping, 0));
    const mass = Math.max(0.0001, readNumber(config.mass, 1));
    const force = -stiffness * (animation.value - animation.to);
    const dampingForce = -damping * animation.velocity;
    const acceleration = (force + dampingForce) / mass;
    animation.velocity += acceleration * dt;
    animation.value += animation.velocity * dt;
  }

  function tickSpring(animation, deltaSeconds) {
    const config = animation.driver.config || {};
    let remaining = deltaSeconds;
    while (remaining > 0) {
      const dt = Math.min(stepSeconds, remaining);
      stepSpring(animation, dt);
      remaining -= dt;
    }

    const delta = Math.abs(animation.to - animation.value);
    const speed = Math.abs(animation.velocity);
    fireMilestones(animation, getDistanceProgress(animation));
    const arriveDelta = Math.max(0, readNumber(config.arriveDelta, animation.arriveDelta ?? DEFAULT_ARRIVE_DELTA));
    if (!animation.arrived && delta <= arriveDelta) {
      animation.arrived = true;
      recordDebugEvent("arrive", animation, { value: animation.value });
      animation.onArrive?.(animation.value);
    }
    const restDelta = Math.max(0, readNumber(config.restDelta, DEFAULT_REST_DELTA));
    const restSpeed = Math.max(0, readNumber(config.restSpeed, DEFAULT_REST_SPEED));
    if (delta <= restDelta && speed <= restSpeed) {
      completeAnimation(animation);
      return;
    }
    writeAnimation(animation);
  }

  function tickTween(animation, deltaSeconds) {
    const options = animation.driver.options || {};
    const duration = Math.max(0, readNumber(options.duration, 0));
    if (duration <= 0) {
      completeAnimation(animation);
      return;
    }
    animation.elapsed += deltaSeconds;
    const repeatsForever = options.loop === true || readNumber(options.repeat, 0) < 0;
    const repeat = repeatsForever ? Infinity : Math.max(0, Math.floor(readNumber(options.repeat, 0)));
    const totalCycles = repeatsForever ? Infinity : repeat + 1;
    const totalDuration = duration * totalCycles;
    const clampedElapsed = repeatsForever ? animation.elapsed : Math.min(animation.elapsed, totalDuration);
    const cycle = repeatsForever ? Math.floor(clampedElapsed / duration) : Math.min(totalCycles - 1, Math.floor(clampedElapsed / duration));
    const localElapsed = clampedElapsed - cycle * duration;
    let progress = clamp(localElapsed / duration, 0, 1);
    if (options.yoyo && cycle % 2 === 1) progress = 1 - progress;
    const eased = resolveEase(options.ease)(progress);
    animation.value = animation.from + (animation.to - animation.from) * eased;
    fireMilestones(animation, progress);
    if (!animation.arrived && Math.abs(animation.to - animation.value) <= readNumber(options.arriveDelta, DEFAULT_REST_DELTA)) {
      animation.arrived = true;
      recordDebugEvent("arrive", animation, { value: animation.value });
      animation.onArrive?.(animation.value);
    }
    writeAnimation(animation);
    if (!repeatsForever && animation.elapsed >= totalDuration) completeAnimation(animation, animation.value);
  }

  function tickDecay(animation, deltaSeconds) {
    const options = animation.driver.options || {};
    const friction = clamp(readNumber(options.friction, 0.92), 0, 1);
    const restSpeed = Math.max(0, readNumber(options.restSpeed, DEFAULT_REST_SPEED));
    animation.velocity *= friction ** (deltaSeconds * 60);
    animation.value += animation.velocity * deltaSeconds;
    if (Math.abs(animation.velocity) <= restSpeed) {
      completeAnimation(animation);
      return;
    }
    writeAnimation(animation);
  }

  function tickAnimation(animation, deltaSeconds) {
    if (animation.done) return;
    if (animation.target?.destroyed) {
      cancelAnimation(animation, "destroyed");
      return;
    }
    if (animation.delay > 0) {
      const consumed = Math.min(animation.delay, deltaSeconds);
      animation.delay -= consumed;
      deltaSeconds -= consumed;
      if (animation.delay > 0 || deltaSeconds <= 0) return;
    }
    if (animation.from == null) animation.from = animation.value;
    animation.started = true;
    advanceBlend(animation, deltaSeconds);
    if (animation.driver.type === "tween") tickTween(animation, deltaSeconds);
    else if (animation.driver.type === "decay") tickDecay(animation, deltaSeconds);
    else if (animation.driver.type === "progress") tickProgress(animation);
    else tickSpring(animation, deltaSeconds);
  }

  function tickProgress(animation) {
    const options = animation.driver.options || {};
    const progress = clamp(readNumber(options.progress, animation.progress ?? 0), 0, 1);
    animation.progress = progress;
    animation.value = animation.from + (animation.to - animation.from) * resolveEase(options.ease)(progress);
    fireMilestones(animation, progress);
    if (!animation.arrived && progress >= 1) {
      animation.arrived = true;
      recordDebugEvent("arrive", animation, { value: animation.value });
      animation.onArrive?.(animation.value);
    }
    writeAnimation(animation);
    if (options.completeAtEnd !== false && progress >= 1) completeAnimation(animation, animation.value);
  }

  function writeAnimation(animation) {
    if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
    markChannelDirty(animation.channel);
    queueAnimationUpdate(animation);
  }

  function getDistanceProgress(animation) {
    const distance = animation.to - animation.from;
    if (Math.abs(distance) <= NEUTRAL_EPSILON) return 1;
    return clamp((animation.value - animation.from) / distance, 0, 1);
  }

  function fireMilestones(animation, progress) {
    if (!animation?.milestones?.length) return;
    const currentProgress = clamp01(progress);
    for (const milestone of animation.milestones) {
      if (milestone.fired || currentProgress < milestone.progress) continue;
      milestone.fired = true;
      milestone.callback(animation.value, {
        progress: currentProgress,
        prop: animation.prop,
        target: animation.target,
      });
    }
  }

  function flushDirtyChannels() {
    if (!dirtyChannels.size) return;
    dirtyChannelScratch.length = 0;
    for (const channel of dirtyChannels) dirtyChannelScratch.push(channel);
    dirtyChannels.clear();
    for (const channel of dirtyChannelScratch) composeChannel(channel);
    dirtyChannelScratch.length = 0;
  }

  function flushPendingUpdates() {
    if (!pendingUpdateAnimations.size) return;
    pendingUpdateScratch.length = 0;
    for (const animation of pendingUpdateAnimations) pendingUpdateScratch.push(animation);
    pendingUpdateAnimations.clear();
    for (const animation of pendingUpdateScratch) {
      if (!animation.done) animation.onUpdate?.(animation.value);
    }
    pendingUpdateScratch.length = 0;
  }

  function flushAfterFrame() {
    if (!afterFrameCallbacks.size) return;
    debug.afterFrameFlushes += 1;
    afterFrameScratch.length = 0;
    for (const callback of afterFrameCallbacks) afterFrameScratch.push(callback);
    afterFrameCallbacks.clear();
    for (const callback of afterFrameScratch) callback();
    afterFrameScratch.length = 0;
  }

  function step(deltaSeconds = 0) {
    const elapsed = Math.min(maxDeltaSeconds, Math.max(0, readNumber(deltaSeconds))) * debugConfig.timeScale;
    debug.frames += 1;
    debug.writesLastFrame = 0;
    runtimeTimeMs += elapsed * 1000;
    if (elapsed > 0) {
      activeAnimationScratch.length = 0;
      for (const animation of activeAnimations) activeAnimationScratch.push(animation);
      for (const animation of activeAnimationScratch) tickAnimation(animation, elapsed);
      activeAnimationScratch.length = 0;
    }
    flushDirtyChannels();
    flushPendingUpdates();
    flushAfterFrame();
    recordDebugSample();
    debug.activeChannels = activeAnimations.size;
    debug.activeTargets = activeTargets.size;
    if (!activeAnimations.size && !afterFrameCallbacks.size) stopTicker();
  }

  function releaseAnimation(animation) {
    if (!animation || animation.done || animation.released) return;
    animation.released = true;
    animation.onArrive = null;
    animation.onCancel = null;
    animation.onComplete = null;
    animation.onUpdate = null;
    animation.milestones = [];
    pendingUpdateAnimations.delete(animation);
    debug.released += 1;
    recordDebugEvent("release", animation);
    if (animation.started || animation.delay <= 0) return;
    animation.done = true;
    removeActiveAnimation(animation);
    clearChannelLane(animation);
  }

  function afterFrame(callback) {
    if (typeof callback !== "function") return;
    afterFrameCallbacks.add(callback);
    ensureTicker();
  }

  function stop(target, prop, stopOptions = {}) {
    const channel = getChannel(target, prop);
    if (!channel) return false;
    const reason = stopOptions.reason || "cancel";
    let stopped = false;
    if (!stopOptions.lane || stopOptions.lane === "base") {
      for (const animation of channel.base.values()) {
        if (!stopOptions.laneKey || animation.laneKey === stopOptions.laneKey) {
          stopped = true;
          cancelAnimation(animation, reason);
        }
      }
    }
    if (!stopOptions.lane || stopOptions.lane === "additive") {
      for (const animation of channel.additive.values()) {
        if (!stopOptions.laneKey || animation.laneKey === stopOptions.laneKey) {
          stopped = true;
          cancelAnimation(animation, reason);
        }
      }
    }
    if (!stopOptions.lane || stopOptions.lane === "factor") {
      for (const animation of channel.factor.values()) {
        if (!stopOptions.laneKey || animation.laneKey === stopOptions.laneKey) {
          stopped = true;
          cancelAnimation(animation, reason);
        }
      }
    }
    cleanupChannel(channel);
    return stopped;
  }

  function cancelTarget(target, cancelOptions = {}) {
    const targetMap = getTargetMap(target);
    let stopped = false;
    if (targetMap) {
      for (const prop of Array.from(targetMap.keys())) stopped = stop(target, prop, cancelOptions) || stopped;
    }
    if (!cancelOptions.recursive) return stopped;
    for (const child of target?.children || []) stopped = cancelTarget(child, cancelOptions) || stopped;
    return stopped;
  }

  function makeControl(animation) {
    let controlReleased = false;
    const flushImmediateProgressWrite = () => {
      if (dirtyChannels.has(animation.channel)) {
        dirtyChannels.delete(animation.channel);
        composeChannel(animation.channel);
      }
      if (pendingUpdateAnimations.has(animation)) {
        pendingUpdateAnimations.delete(animation);
        animation.onUpdate?.(animation.value);
      }
    };

    const control = {
      cancel: (reason) => {
        if (controlReleased) return;
        cancelAnimation(animation, reason);
      },
      get arrived() {
        return animation.arrived;
      },
      get completed() {
        return !controlReleased && animation.done && !activeAnimations.has(animation);
      },
      get laneKey() {
        return animation.laneKey;
      },
      get progress() {
        return animation.driver?.type === "progress"
          ? clamp(readNumber(animation.driver.options?.progress, animation.progress ?? 0), 0, 1)
          : animation.progress;
      },
      release: () => {
        if (controlReleased) return;
        controlReleased = true;
        releaseAnimation(animation);
      },
      get released() {
        return controlReleased;
      },
      settle(settleOptions = {}) {
        if (controlReleased || animation.done || animation.driver?.type !== "progress") return;
        const options = settleOptions || {};
        const currentProgress = clamp(readNumber(animation.driver.options?.progress, animation.progress ?? 0), 0, 1);
        animation.driver.options.progress = currentProgress;
        tickProgress(animation);
        flushImmediateProgressWrite();

        const progressVelocity = readNumber(options.velocity, 0);
        const velocityThreshold = Math.max(0, readNumber(options.velocityThreshold, 0.05));
        const targetProgress = options.progress != null
          ? clamp(readNumber(options.progress, currentProgress), 0, 1)
          : progressVelocity > velocityThreshold
            ? 1
            : progressVelocity < -velocityThreshold
              ? 0
              : currentProgress >= readNumber(options.midpoint, 0.5)
                ? 1
                : 0;
        const ease = resolveEase(animation.driver.options?.ease);
        const distance = animation.to - animation.from;
        const finalValue = animation.from + distance * ease(targetProgress);
        animation.from = animation.value;
        animation.to = finalValue;
        animation.elapsed = 0;
        animation.delay = Math.max(0, readNumber(options.delay));
        animation.driver = options.driver || spring(options.spring || options.config || DEFAULT_SETTLE_SPRING);
        animation.velocity = readNumber(options.valueVelocity, progressVelocity * distance);
        animation.arrived = false;
        animation.progress = targetProgress;
        if (animation.lane === "base" && animation.channel.activeBaseKey === animation.laneKey) animation.channel.baseValue = getAnimationOutputValue(animation);
        recordDebugEvent("settle", animation, { value: animation.value });
      },
      get state() {
        return animation;
      },
      setProgress(progress) {
        if (controlReleased) return;
        if (animation.driver?.type !== "progress" || animation.done) return;
        animation.driver.options.progress = clamp(readNumber(progress), 0, 1);
        tickProgress(animation);
        flushImmediateProgressWrite();
      },
      reverse() {
        if (controlReleased) return;
        if (animation.done) return;
        if (animation.driver?.type === "progress") {
          this.setProgress(1 - readNumber(animation.driver.options?.progress, animation.progress ?? 0));
          return;
        }
        const nextTo = animation.from;
        animation.from = animation.value;
        animation.to = nextTo;
        animation.elapsed = 0;
        animation.arrived = false;
      },
      get value() {
        return animation.value;
      },
      get velocity() {
        return animation.velocity;
      },
    };
    return control;
  }

  function reset() {
    for (const animation of activeAnimations) cancelAnimation(animation, "reset");
    afterFrameCallbacks.clear();
    dirtyChannels.clear();
    pendingUpdateAnimations.clear();
    stopTicker();
    Object.assign(debug, makeDebugCounters());
    clearDebugHistory();
    debugTargetRefsById?.clear();
    runtimeTimeMs = 0;
  }

  function debugSnapshot(snapshotOptions = {}) {
    const animations = Array.from(activeAnimations).map((animation) => makeDebugAnimationRecord(animation));
    const warnings = makeDebugWarnings(animations);
    const summary = makeDebugSummary(animations);
    summary.warningCount = warnings.length;
    const snapshot = {
      counters: {
        ...debug,
        canceledByReason: { ...debug.canceledByReason },
      },
      summary,
      animations,
      warnings,
    };
    if (snapshotOptions.includeChannels) snapshot.channels = makeDebugChannelRecords();
    if (snapshotOptions.includeTargets) snapshot.targets = makeDebugTargetRecords();
    if (snapshotOptions.includeHistory) snapshot.history = cloneDebugHistory();
    return snapshot;
  }

  function debugReport(reportOptions = {}) {
    const snapshot = debugSnapshot({
      includeChannels: reportOptions.includeChannels,
      includeTargets: reportOptions.includeTargets,
    });
    const report = {
      animations: snapshot.animations,
      config: cloneDebugConfig(),
      counters: snapshot.counters,
      curveStats: makeCurveStats(),
      runtime: {
        activeAnimationCount: snapshot.summary.activeAnimationCount,
        frames: debug.frames,
        timeMs: runtimeTimeMs,
      },
      summary: snapshot.summary,
      version: 1,
      warnings: snapshot.warnings,
    };
    if (reportOptions.includeChannels) report.channels = snapshot.channels;
    if (reportOptions.includeHistory) report.history = cloneDebugHistory();
    if (reportOptions.includeTargets) report.targets = snapshot.targets;
    return report;
  }

  return {
    afterFrame,
    animate,
    cancelTarget,
    clearDebugHistory,
    configureDebug,
    debugReport,
    debugSnapshot,
    describeTarget,
    flushAfterFrameForTests: flushAfterFrame,
    getChannel: (target, prop) => getChannel(target, prop),
    debug,
    reset,
    resolveDebugTarget,
    set,
    step,
    stop,
  };
}

export const motionRuntime = createMotionRuntime();

export function track(target, prop, from, to, options = {}) {
  return { ...options, from, lane: "base", prop, target, to };
}

export function additiveTrack(target, prop, from, to, options = {}) {
  return { ...options, from, lane: "additive", prop, target, to };
}

export function factorTrack(target, prop, from, to, options = {}) {
  return { ...options, from, lane: "factor", prop, target, to };
}

export function alphaFactor(target, from, to, options = {}) {
  return factorTrack(target, "alpha", from, to, { clamp: { min: 0, max: 1 }, ...options });
}

export function playTrack(spec, options = {}) {
  const runtime = options.runtime || motionRuntime;
  return runtime.animate(spec.target, spec.prop, spec.to, {
    clamp: spec.clamp,
    delay: spec.delay,
    driver: spec.driver || options.driver,
    from: spec.from,
    interrupt: spec.interrupt,
    blendDuration: spec.blendDuration,
    blendEase: spec.blendEase,
    lane: spec.lane,
    laneKey: spec.laneKey,
    onArrive: spec.onArrive,
    onCancel: spec.onCancel,
    onComplete: spec.onComplete,
    onUpdate: spec.onUpdate,
    milestones: spec.milestones,
    snap: spec.snap,
    velocity: spec.velocity,
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => motionRuntime.reset());
  reloadOnPixiHotUpdate(import.meta.hot);
}
