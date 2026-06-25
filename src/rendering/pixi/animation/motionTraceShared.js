export function readNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function readPositiveNumber(value, fallback = 0) {
  return Math.max(0, readNumber(value, fallback));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function makeTrackKey(record = {}, options = {}) {
  const laneFallback = options.laneFallback ?? "unknown";
  const laneKeyFallback = options.laneKeyFallback ?? "unknown";
  return [
    record.targetId ?? "unknown",
    record.prop ?? "unknown",
    record.lane ?? laneFallback,
    record.laneKey ?? laneKeyFallback,
  ].join(":");
}

function incrementCount(counts, key) {
  const normalized = key == null ? "unknown" : String(key);
  counts[normalized] = (counts[normalized] || 0) + 1;
}

export function makeMotionDebugSummary(animations = []) {
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
    incrementCount(summary.byDriver, animation.driver);
    incrementCount(summary.byLane, animation.lane);
    incrementCount(summary.byLaneKey, animation.laneKey);
    incrementCount(summary.byProp, animation.prop);
    incrementCount(summary.byTargetId, animation.targetId);
    if (animation.targetId != null) targetIds.add(animation.targetId);
    channelKeys.add(`${animation.targetId ?? "unknown"}:${animation.prop ?? "unknown"}`);
  }

  summary.activeTargetCount = targetIds.size;
  summary.activeChannelCount = channelKeys.size;
  return summary;
}

export function expandRange(range, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return;
  range.min = range.min == null ? number : Math.min(range.min, number);
  range.max = range.max == null ? number : Math.max(range.max, number);
}

export function finalizeRange(range) {
  return {
    max: range.max,
    min: range.min,
  };
}

export function collectMotionTrackRecordsFromHistory(history = {}) {
  const records = [];
  for (const sample of history.samples || []) {
    for (const animation of sample.animations || []) {
      records.push({
        ...animation,
        frame: sample.frame,
        timeMs: sample.timeMs,
        type: "sample",
      });
    }
  }
  for (const event of history.events || []) records.push(event);
  return records;
}

export function collectMotionTrackRecordsFromReplay(frames = [], events = []) {
  const records = [];
  for (const frame of frames) {
    for (const value of frame.values || []) {
      records.push({
        ...value,
        frame: frame.frame,
        timeMs: frame.timeMs,
        type: "sample",
      });
    }
  }
  for (const event of events) records.push(event);
  return records;
}

export function aggregateMotionTracks(records = [], curveStats = [], options = {}) {
  const includeLayer = options.includeLayer === true;
  const sortMode = options.sortMode || "sampleCount";
  const statsByKey = new Map((curveStats || []).map((stats) => [makeTrackKey(stats), stats]));
  const tracksByKey = new Map();

  for (const record of records) {
    const key = makeTrackKey(record);
    let track = tracksByKey.get(key);
    if (!track) {
      track = {
        driver: record.driver || "unknown",
        eventCount: 0,
        key,
        lane: record.lane,
        laneKey: record.laneKey,
        prop: record.prop,
        sampleCount: 0,
        sourceLabel: record.sourceLabel,
        targetId: record.targetId,
        timeRangeMs: { max: null, min: null },
        valueRange: { max: null, min: null },
        velocityRange: { max: null, min: null },
      };
      if (includeLayer) track.layer = record.layer;
      tracksByKey.set(key, track);
    }
    if (record.driver) track.driver = record.driver;
    if (includeLayer && record.layer) track.layer = record.layer;
    if (record.sourceLabel) track.sourceLabel = record.sourceLabel;
    if (record.type === "sample") track.sampleCount += 1;
    else track.eventCount += 1;
    expandRange(track.timeRangeMs, record.timeMs);
    expandRange(track.valueRange, record.value);
    expandRange(track.valueRange, record.to);
    expandRange(track.velocityRange, record.velocity);
  }

  const tracks = Array.from(tracksByKey.values()).map((track) => {
    const stats = statsByKey.get(track.key) || {};
    const result = {
      driver: track.driver,
      eventCount: track.eventCount,
      key: track.key,
      lane: track.lane,
      laneKey: track.laneKey,
      maxDelta: stats.maxDelta ?? null,
      maxVelocity: stats.maxVelocity ?? null,
      overshootCount: stats.overshootCount ?? 0,
      prop: track.prop,
      retargetCount: stats.retargetCount ?? 0,
      sampleCount: track.sampleCount,
      sourceLabel: track.sourceLabel,
      targetId: track.targetId,
      timeRangeMs: finalizeRange(track.timeRangeMs),
      valueRange: finalizeRange(track.valueRange),
      velocityRange: finalizeRange(track.velocityRange),
    };
    if (includeLayer) result.layer = track.layer;
    return result;
  });

  if (sortMode === "key") {
    return tracks.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }
  return tracks.sort((a, b) => (b.sampleCount - a.sampleCount) || String(a.key).localeCompare(String(b.key)));
}

export function makeTargetsById(trace = {}) {
  const targets = new Map();
  for (const target of trace.targets || []) {
    if (target?.targetId != null) targets.set(target.targetId, target);
  }
  return targets;
}

export function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

export function resolveRecordLabel(record = {}, targetsById = null, options = {}) {
  const hasTargets = targetsById && typeof targetsById.get === "function";
  const target = record.targetId != null && hasTargets ? targetsById.get(record.targetId) : null;
  const includeRecordLabel = options.includeRecordLabel ?? !hasTargets;
  return record.sourceLabel
    || record.targetLabel
    || (includeRecordLabel ? record.label : null)
    || target?.sourceLabel
    || target?.label
    || (record.targetId != null ? `target ${record.targetId}` : "unknown");
}

export function collectRecordText(record = {}, targetsById = null, options = {}) {
  const hasTargets = targetsById && typeof targetsById.get === "function";
  const target = record.targetId != null && hasTargets ? targetsById.get(record.targetId) : null;
  return [
    record.type,
    record.reason,
    options.includeWarningType ? record.warningType : null,
    record.targetId,
    record.targetKind,
    record.targetLabel,
    record.sourceLabel,
    record.label,
    options.includeLayer ? record.layer : null,
    options.includeRecordKind ? record.kind : null,
    record.prop,
    record.driver,
    record.lane,
    record.laneKey,
    target?.kind,
    target?.label,
    options.includeTargetLayer ? target?.layer : null,
    target?.sourceLabel,
  ].filter((value) => value != null).join(" ").toLowerCase();
}
