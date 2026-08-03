import {
  clamp,
  collectRecordText,
  makeTrackKey,
  normalizeQuery,
  readNumber,
  resolveRecordLabel,
} from "../../rendering/pixi/animation/motionTraceShared.js";

export const MOTION_RECORD_WINDOW_CUSTOM = "custom";
export const MOTION_RECORD_WINDOW_PRESETS = [
  { label: "10s", value: "10000" },
  { label: "30s", value: "30000" },
  { label: "60s", value: "60000" },
  { label: "120s", value: "120000" },
  { label: "Custom", labelKey: "debug.motion.values.custom", value: MOTION_RECORD_WINDOW_CUSTOM },
];
export const MOTION_FILTER_PRESETS = [
  { label: "All", labelKey: "debug.common.all", value: "all" },
  { label: "Active", labelKey: "debug.motion.values.active", value: "active" },
  { label: "Warnings", labelKey: "debug.motion.values.warnings", value: "warnings" },
];

const DEFAULT_RECORD_WINDOW_MS = 30000;
const MAX_ROW_COUNT = 12;
const MAX_CURVE_GROUP_COUNT = 4;
const MAX_LAYER_TREE_ROW_COUNT = 8;
const MAX_TIMELINE_EVENT_COUNT = 60;
const MAX_TIMELINE_GROUP_COUNT = 8;
const MIN_CUSTOM_SECONDS = 1;
const MAX_CUSTOM_SECONDS = 300;

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
  const enabled = Boolean(options.enabled);
  return {
    enabled,
    overlayEnabled: enabled && Boolean(options.overlayEnabled),
    recordHistory: enabled && Boolean(options.recordEnabled),
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

function formatBytes(value) {
  const bytes = Math.max(0, Math.floor(readNumber(value, 0)));
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatWindow(ms) {
  return `${formatMotionNumber(readNumber(ms, DEFAULT_RECORD_WINDOW_MS) / 1000, 0)}s`;
}

function localize(t, key, params, technicalText) {
  return typeof t === "function" ? t(key, params) : technicalText;
}

function makeEmptyRow(t, label = "None") {
  const localizedLabel = localize(t, "debug.common.none", {}, label);
  return { detail: "-", key: localizedLabel, value: "0" };
}

export function normalizeMotionFilterPreset(value) {
  return MOTION_FILTER_PRESETS.some((entry) => entry.value === value) ? value : "all";
}

function makeTargetLaneKey(record = {}) {
  return [
    record.targetId ?? "unknown",
    record.lane ?? "unknown",
    record.laneKey ?? "unknown",
  ].join(":");
}

function makeSeriesRange(values) {
  const finiteValues = values.map((value) => Number(value)).filter(Number.isFinite);
  if (!finiteValues.length) return { max: 1, min: 0 };
  let min = Math.min(...finiteValues);
  let max = Math.max(...finiteValues);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  return { max, min };
}

function makeNormalizedPoint(timeMs, value, timeRange, valueRange) {
  const time = readNumber(timeMs, 0);
  const number = readNumber(value, 0);
  const timeSpan = timeRange.max - timeRange.min;
  const valueSpan = valueRange.max - valueRange.min;
  return {
    raw: number,
    timeMs: time,
    x: timeSpan > 0 ? clamp(((time - timeRange.min) / timeSpan) * 100, 0, 100) : 50,
    y: valueSpan > 0 ? clamp(100 - ((number - valueRange.min) / valueSpan) * 100, 0, 100) : 50,
  };
}

function formatPathNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(2).replace(/\.?0+$/, "");
}

function makeSvgPath(points) {
  if (!points.length) return "";
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`)
    .join(" ");
}

function formatRange(range, digits = 2) {
  return `${formatMotionNumber(range.min, digits)}..${formatMotionNumber(range.max, digits)}`;
}

function formatCompactList(values, limit = 4) {
  const list = Array.from(new Set(values.filter(Boolean)));
  if (!list.length) return "-";
  const visible = list.slice(0, limit).join(", ");
  const hiddenCount = list.length - limit;
  return hiddenCount > 0 ? `${visible}, +${hiddenCount}` : visible;
}

function resolveTargetRecordLabel(target = {}) {
  return target.sourceLabel
    || target.label
    || target.targetLabel
    || (target.targetId != null ? `target ${target.targetId}` : "unknown");
}

function collectTargetTreeEntries(report = {}) {
  const entriesById = new Map();
  const ensureEntry = (targetId) => {
    const key = String(targetId ?? "unknown");
    let entry = entriesById.get(key);
    if (!entry) {
      entry = {
        animations: [],
        events: [],
        id: key,
        target: { targetId },
        warnings: [],
      };
      entriesById.set(key, entry);
    }
    return entry;
  };

  for (const target of report.targets || []) {
    ensureEntry(target.targetId).target = target;
  }
  for (const animation of report.animations || []) {
    ensureEntry(animation.targetId).animations.push(animation);
  }
  for (const warning of report.warnings || []) {
    ensureEntry(warning.targetId).warnings.push(warning);
  }
  for (const event of report.history?.events || []) {
    ensureEntry(event.targetId).events.push(event);
  }

  return Array.from(entriesById.values()).map((entry) => {
    const target = entry.target || {};
    const records = [...entry.animations, ...entry.warnings, ...entry.events];
    const label = resolveTargetRecordLabel(target);
    const layer = target.layer || records.find((record) => record.layer)?.layer || "unknown";
    const kind = target.kind || target.targetKind || records.find((record) => record.targetKind)?.targetKind || "unknown";
    const props = records.map((record) => record.prop);
    const sourceLabels = [
      target.sourceLabel,
      target.label,
      target.targetLabel,
      ...records.map((record) => record.sourceLabel || record.targetLabel || record.label),
    ];
    const displaySource = target.sourceLabel
      || records.find((record) => record.sourceLabel)?.sourceLabel
      || label;
    const searchText = [
      entry.id,
      layer,
      kind,
      label,
      ...props,
      ...sourceLabels,
      ...records.map(collectRecordText),
    ].filter(Boolean).join(" ").toLowerCase();
    return {
      activeCount: entry.animations.length,
      eventCount: entry.events.length,
      id: entry.id,
      kind,
      label,
      layer,
      props: Array.from(new Set(props.filter(Boolean))),
      searchText,
      sourceLabel: displaySource,
      warningCount: entry.warnings.length,
    };
  });
}

function collectPresetKeys(report = {}) {
  const activeTrackKeys = new Set();
  const activeTargetLaneKeys = new Set();
  const warningTrackKeys = new Set();
  const warningTargetLaneKeys = new Set();
  for (const animation of report.animations || []) {
    activeTrackKeys.add(makeTrackKey(animation));
    activeTargetLaneKeys.add(makeTargetLaneKey(animation));
  }
  for (const warning of report.warnings || []) {
    warningTrackKeys.add(makeTrackKey(warning));
    warningTargetLaneKeys.add(makeTargetLaneKey(warning));
  }
  return {
    activeTargetLaneKeys,
    activeTrackKeys,
    warningTargetLaneKeys,
    warningTrackKeys,
  };
}

function makeFilterPredicate(report = {}, filters = {}, keyMode = "track") {
  const preset = normalizeMotionFilterPreset(filters.preset);
  const query = normalizeQuery(filters.query);
  const presetKeys = collectPresetKeys(report);
  const keyGetter = keyMode === "targetLane" ? makeTargetLaneKey : makeTrackKey;
  return (record) => {
    if (preset === "active") {
      const keys = keyMode === "targetLane" ? presetKeys.activeTargetLaneKeys : presetKeys.activeTrackKeys;
      if (!keys.has(keyGetter(record))) return false;
    }
    if (preset === "warnings") {
      const keys = keyMode === "targetLane" ? presetKeys.warningTargetLaneKeys : presetKeys.warningTrackKeys;
      if (!keys.has(keyGetter(record))) return false;
    }
    return !query || collectRecordText(record, null, { includeLayer: true }).includes(query);
  };
}

export function buildMotionOverviewRows(report = {}, t) {
  const summary = report.summary || {};
  const config = report.config || {};
  const history = report.history || {};
  const eventCount = Array.isArray(history.events) ? history.events.length : 0;
  const sampleCount = Array.isArray(history.samples) ? history.samples.length : 0;
  return [
    { label: localize(t, "debug.motion.fields.activeAnimations", {}, "Active animations"), value: formatCount(summary.activeAnimationCount) },
    { label: localize(t, "debug.motion.fields.targets", {}, "Targets"), value: formatCount(summary.activeTargetCount) },
    { label: localize(t, "debug.motion.fields.channels", {}, "Channels"), value: formatCount(summary.activeChannelCount) },
    { label: localize(t, "debug.motion.fields.warnings", {}, "Warnings"), value: formatCount(summary.warningCount) },
    { label: localize(t, "debug.motion.settings.recordHistory", {}, "Record history"), value: localize(t, config.recordHistory ? "debug.common.on" : "debug.common.off", {}, config.recordHistory ? "On" : "Off") },
    { label: localize(t, "debug.motion.fields.overlay", {}, "Overlay"), value: localize(t, config.overlayEnabled ? "debug.common.on" : "debug.common.off", {}, config.overlayEnabled ? "On" : "Off") },
    { label: localize(t, "debug.motion.fields.recordWindow", {}, "Recording window"), value: formatWindow(config.recordWindowMs) },
    { label: localize(t, "debug.motion.fields.timeScale", {}, "Time scale"), value: `${formatMotionNumber(config.timeScale ?? 1, 2)}x` },
    { label: localize(t, "debug.motion.fields.eventsSamples", {}, "Events / samples"), value: `${formatCount(eventCount)} / ${formatCount(sampleCount)}`, wide: true },
  ];
}

export function buildMotionReplayCaptureRows(status = {}, trace = null, options = {}) {
  const t = options.t;
  const summary = trace?.summary || {};
  const capture = trace?.capture || {};
  const profile = status.captureProfile || capture.profile || options.profile || {};
  const estimate = options.estimate || {};
  const actualBytes = options.actualBytes ?? (trace ? JSON.stringify(trace).length : 0);
  const requestedSeconds = status.seconds ?? (capture.requestedDurationMs != null ? capture.requestedDurationMs / 1000 : 30);
  const sampleHz = status.sampleHz ?? capture.sampleHz ?? 60;
  const profileLabel = profile.labelKey
    ? localize(t, profile.labelKey, {}, profile.label || profile.id)
    : (profile.label || profile.id || localize(t, "debug.common.none", {}, "None"));
  const estimateLabel = estimate.jsonSizeLabel
    ? `${formatCount(estimate.frameCount)}f / ${formatCount(estimate.eventCount)}e / ${estimate.jsonSizeLabel}`
    : "-";
  return [
    { label: localize(t, "debug.motion.fields.captureStatus", {}, "Capture status"), value: localize(t, status.active ? "debug.motion.values.capturing" : "debug.motion.values.idle", {}, status.active ? "Capturing" : "Idle") },
    { label: localize(t, "debug.motion.fields.captureProfile", {}, "Capture profile"), value: profileLabel, wide: true },
    { label: localize(t, "debug.motion.fields.captureWindow", {}, "Capture window"), value: `${formatMotionNumber(normalizeMotionCustomSeconds(requestedSeconds), 0)}s` },
    { label: localize(t, "debug.motion.fields.sampleRate", {}, "Sample rate"), value: `${formatMotionNumber(sampleHz, 0)}Hz` },
    { label: localize(t, "debug.motion.fields.estimatedSize", {}, "Estimated size"), value: estimateLabel, wide: true },
    { label: localize(t, "debug.motion.fields.actualJson", {}, "Actual JSON"), value: trace ? formatBytes(actualBytes) : "-", wide: true },
    { label: localize(t, "debug.motion.fields.framesEvents", {}, "Frames / events"), value: `${formatCount(summary.frameCount)} / ${formatCount(summary.eventCount)}`, wide: true },
    { label: localize(t, "debug.motion.fields.tracksTargets", {}, "Tracks / targets"), value: `${formatCount(summary.trackCount)} / ${formatCount(summary.targetCount)}`, wide: true },
    { label: localize(t, "debug.motion.fields.schema", {}, "Schema"), value: trace?.schema || localize(t, "debug.common.none", {}, "None"), wide: true },
  ];
}

function resolveTargetLabel(animation = {}) {
  return resolveRecordLabel(animation);
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

export function buildMotionCancelReasonRows(report = {}, limit = 6, t) {
  const counts = report.counters?.canceledByReason || {};
  const rows = Object.entries(counts)
    .map(([key, value]) => ({ detail: key, key, value: formatCount(value) }))
    .sort((a, b) => (Number(b.value) - Number(a.value)) || a.key.localeCompare(b.key))
    .slice(0, limit);
  return rows.length ? rows : [makeEmptyRow(t)];
}

export function buildMotionWarningRows(report = {}, limit = 6, t) {
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
  return rows.length ? rows : [makeEmptyRow(t)];
}

export function buildMotionPropertyRows(report = {}, filters = {}, limit = MAX_ROW_COUNT) {
  const predicate = makeFilterPredicate(report, filters, "track");
  return (report.animations || [])
    .filter(predicate)
    .slice(0, limit)
    .map((animation) => {
      const delta = readNumber(animation.to, 0) - readNumber(animation.value, 0);
      return {
        delta: formatMotionNumber(delta),
        driver: animation.driver || "-",
        key: makeTrackKey(animation),
        lane: animation.lane || "-",
        laneKey: animation.laneKey || "-",
        prop: animation.prop || "-",
        sourceLabel: animation.sourceLabel || "-",
        targetId: animation.targetId,
        targetProp: `${resolveRecordLabel(animation)}.${animation.prop || "-"}`,
        to: formatMotionNumber(animation.to),
        value: formatMotionNumber(animation.value),
        velocity: formatMotionNumber(animation.velocity),
      };
    });
}

export function buildMotionLayerTreeRows(report = {}, filters = {}, limit = MAX_LAYER_TREE_ROW_COUNT, t) {
  const preset = normalizeMotionFilterPreset(filters.preset);
  const query = normalizeQuery(filters.query);
  const groupsByLayer = new Map();
  for (const entry of collectTargetTreeEntries(report)) {
    if (preset === "active" && entry.activeCount <= 0) continue;
    if (preset === "warnings" && entry.warningCount <= 0) continue;
    if (query && !entry.searchText.includes(query)) continue;
    let group = groupsByLayer.get(entry.layer);
    if (!group) {
      group = {
        activeTargetCount: 0,
        eventCount: 0,
        kinds: [],
        layer: entry.layer,
        props: [],
        sources: [],
        targetCount: 0,
        warningCount: 0,
      };
      groupsByLayer.set(entry.layer, group);
    }
    group.targetCount += 1;
    if (entry.activeCount > 0) group.activeTargetCount += 1;
    group.eventCount += entry.eventCount;
    group.warningCount += entry.warningCount;
    group.kinds.push(entry.kind);
    group.props.push(...entry.props);
    group.sources.push(entry.sourceLabel || entry.label);
  }

  return Array.from(groupsByLayer.values())
    .sort((a, b) => (
      b.activeTargetCount - a.activeTargetCount
      || b.warningCount - a.warningCount
      || b.targetCount - a.targetCount
      || a.layer.localeCompare(b.layer)
    ))
    .slice(0, Math.max(0, Math.floor(readNumber(limit, MAX_LAYER_TREE_ROW_COUNT))))
    .map((group) => ({
      activeCount: formatCount(group.activeTargetCount),
      detail: localize(t, "debug.motion.values.propertiesList", {
        kinds: formatCompactList(group.kinds),
        props: formatCompactList(group.props),
      }, `${formatCompactList(group.kinds)} / properties ${formatCompactList(group.props)}`),
      eventCount: formatCount(group.eventCount),
      key: `layer:${group.layer}`,
      layer: group.layer,
      props: formatCompactList(group.props),
      sources: formatCompactList(group.sources, 5),
      summary: localize(t, "debug.motion.counts.layerSummary", {
        animations: formatCount(group.activeTargetCount),
        targets: formatCount(group.targetCount),
        warnings: formatCount(group.warningCount),
      }, `${formatCount(group.targetCount)} targets / ${formatCount(group.activeTargetCount)} active animations / ${formatCount(group.warningCount)} warnings`),
      targetCount: formatCount(group.targetCount),
      warningCount: formatCount(group.warningCount),
    }));
}

function buildTimelineEventRow(event = {}) {
  return {
    detail: [
      event.prop,
      `${formatMotionNumber(event.value)} -> ${formatMotionNumber(event.to)}`,
      event.driver,
      event.reason ? `reason=${event.reason}` : null,
    ].filter(Boolean).join(" / "),
    frame: formatCount(event.frame),
    key: `${formatMotionNumber(event.timeMs, 0)}:${event.type || "event"}:${makeTrackKey(event)}`,
    lane: event.lane || "-",
    laneKey: event.laneKey || "-",
    prop: event.prop || "-",
    sourceLabel: event.sourceLabel || event.targetLabel || event.label || "-",
    targetId: event.targetId,
    time: `${formatMotionNumber(event.timeMs, 0)}ms`,
    timeMs: readNumber(event.timeMs, 0),
    type: event.type || "event",
  };
}

export function buildMotionTimelineGroups(report = {}, filters = {}, options = {}) {
  const predicate = makeFilterPredicate(report, filters, "targetLane");
  const limit = Math.max(0, Math.floor(readNumber(options.limit, MAX_TIMELINE_EVENT_COUNT)));
  const events = (report.history?.events || [])
    .filter(predicate)
    .slice(-limit)
    .reverse();
  const groupsByKey = new Map();
  for (const event of events) {
    const groupKey = makeTargetLaneKey(event);
    let group = groupsByKey.get(groupKey);
    if (!group) {
      const laneLabel = [event.lane, event.laneKey].filter(Boolean).join("/") || "-";
      group = {
        events: [],
        key: groupKey,
        label: `${resolveRecordLabel(event)} / ${laneLabel}`,
        lane: event.lane || "-",
        laneKey: event.laneKey || "-",
        prop: event.prop || "-",
        sourceLabel: event.sourceLabel || event.targetLabel || event.label || "-",
        targetId: event.targetId,
      };
      groupsByKey.set(groupKey, group);
    }
    group.events.push(buildTimelineEventRow(event));
  }
  return Array.from(groupsByKey.values()).slice(0, MAX_TIMELINE_GROUP_COUNT);
}

function collectMotionCurveTracks(report = {}, filters = {}) {
  const predicate = makeFilterPredicate(report, filters, "track");
  const tracksByKey = new Map();
  for (const sample of report.history?.samples || []) {
    for (const animation of sample.animations || []) {
      if (!predicate(animation)) continue;
      const key = makeTrackKey(animation);
      let track = tracksByKey.get(key);
      if (!track) {
        track = {
          driver: animation.driver || "unknown",
          events: [],
          from: animation.from,
          key,
          lane: animation.lane || "unknown",
          laneKey: animation.laneKey || "unknown",
          points: [],
          prop: animation.prop || "unknown",
          sourceLabel: animation.sourceLabel,
          targetId: animation.targetId,
        };
        tracksByKey.set(key, track);
      }
      track.points.push({
        delta: readNumber(animation.to, 0) - readNumber(animation.value, 0),
        timeMs: sample.timeMs,
        to: animation.to,
        value: animation.value,
        velocity: animation.velocity,
      });
    }
  }
  for (const event of report.history?.events || []) {
    const track = tracksByKey.get(makeTrackKey(event));
    if (!track || !predicate(event)) continue;
    track.events.push(event);
  }
  return Array.from(tracksByKey.values());
}

export function buildMotionCurveChartGroups(report = {}, filters = {}, options = {}) {
  const t = options.t;
  const limit = Math.max(0, Math.floor(readNumber(options.limit, MAX_CURVE_GROUP_COUNT)));
  const statsByKey = new Map((report.curveStats || []).map((stats) => [makeTrackKey(stats), stats]));
  return collectMotionCurveTracks(report, filters)
    .map((track) => {
      const points = track.points
        .filter((point) => Number.isFinite(readNumber(point.timeMs, NaN)))
        .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
      const events = track.events
        .filter((event) => Number.isFinite(readNumber(event.timeMs, NaN)))
        .sort((a, b) => readNumber(a.timeMs, 0) - readNumber(b.timeMs, 0));
      const eventTimes = events.map((event) => readNumber(event.timeMs, 0));
      const pointTimes = points.map((point) => readNumber(point.timeMs, 0));
      const timeRange = makeSeriesRange([...pointTimes, ...eventTimes]);
      const valueRange = makeSeriesRange([
        ...points.map((point) => point.value),
        ...points.map((point) => point.to),
      ]);
      const deltaRange = makeSeriesRange(points.map((point) => point.delta));
      const velocityRange = makeSeriesRange(points.map((point) => point.velocity));
      const value = points.map((point) => makeNormalizedPoint(point.timeMs, point.value, timeRange, valueRange));
      const to = points.map((point) => makeNormalizedPoint(point.timeMs, point.to, timeRange, valueRange));
      const delta = points.map((point) => makeNormalizedPoint(point.timeMs, point.delta, timeRange, deltaRange));
      const velocity = points.map((point) => makeNormalizedPoint(point.timeMs, point.velocity, timeRange, velocityRange));
      const maxDelta = Math.max(0, ...points.map((point) => Math.abs(readNumber(point.delta, 0))));
      const maxVelocity = Math.max(0, ...points.map((point) => Math.abs(readNumber(point.velocity, 0))));
      const eventMarkers = events.map((event) => ({
        detail: [
          event.type || "event",
          event.prop,
          `${formatMotionNumber(event.value)} -> ${formatMotionNumber(event.to)}`,
          event.reason ? `reason=${event.reason}` : null,
        ].filter(Boolean).join(" / "),
        time: `${formatMotionNumber(event.timeMs, 0)}ms`,
        type: event.type || "event",
        x: makeNormalizedPoint(event.timeMs, 0, timeRange, { min: 0, max: 1 }).x,
      }));
      const stats = statsByKey.get(track.key) || {};
      const label = `${resolveRecordLabel(track)}.${track.prop}`;
      return {
        deltaPath: makeSvgPath(delta),
        driver: track.driver,
        eventMarkers,
        key: track.key,
        label,
        lane: track.lane,
        laneKey: track.laneKey,
        laneLabel: [track.lane, track.laneKey].filter(Boolean).join("/") || "-",
        latestTimeMs: timeRange.max,
        normalized: true,
        overlayLabel: `${label} / ${track.laneKey}`,
        prop: track.prop,
        rangeLabels: {
          delta: formatRange(deltaRange),
          value: formatRange(valueRange),
          velocity: formatRange(velocityRange),
        },
        sampleCount: points.length,
        series: { delta, to, value, velocity },
        sourceLabel: track.sourceLabel || "-",
        stats: {
          maxDelta: stats.maxDelta ?? maxDelta,
          maxVelocity: stats.maxVelocity ?? maxVelocity,
          overshootCount: stats.overshootCount ?? 0,
          retargetCount: stats.retargetCount ?? 0,
        },
        summary: localize(t, "debug.motion.values.normalizedSamplesEvents", {
          events: formatCount(events.length),
          samples: formatCount(points.length),
        }, `${formatCount(points.length)} samples / ${formatCount(events.length)} events / normalized`),
        targetId: track.targetId,
        toPath: makeSvgPath(to),
        valuePath: makeSvgPath(value),
        velocityPath: makeSvgPath(velocity),
      };
    })
    .sort((a, b) => (b.sampleCount - a.sampleCount) || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export function buildMotionFilterSummary(report = {}, filters = {}, t) {
  const predicate = makeFilterPredicate(report, filters, "track");
  const timelinePredicate = makeFilterPredicate(report, filters, "targetLane");
  const properties = (report.animations || []).filter(predicate).length;
  const events = (report.history?.events || []).filter(timelinePredicate).length;
  return {
    preset: normalizeMotionFilterPreset(filters.preset),
    query: normalizeQuery(filters.query),
    text: localize(t, "debug.motion.counts.propertiesEvents", {
      events: formatCount(events),
      properties: formatCount(properties),
    }, `${formatCount(properties)} properties / ${formatCount(events)} events`),
  };
}
