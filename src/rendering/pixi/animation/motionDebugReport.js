import { motionRuntime } from "./motionRuntime.js";
import {
  createMotionReplayCaptureController,
  createMotionReplayTraceFromRuntime,
} from "./motionReplayTrace.js";

export const MOTION_DEBUG_GLOBAL_KEY = "__LP_MOTION_DEBUG__";
const REPORT_SCHEMA = "pixi-motion-ai-report/v1";
const REPORT_VERSION = 1;
const REPORT_MODES = new Set(["summary", "full", "selectedTarget"]);

function normalizeMode(mode) {
  return REPORT_MODES.has(mode) ? mode : "summary";
}

function countMapToTopEntries(counts = {}, limit = 8) {
  return Object.entries(counts)
    .map(([key, count]) => ({ count, key }))
    .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function makeTopCancelReasons(counters = {}, limit = 8) {
  return countMapToTopEntries(counters.canceledByReason || {}, limit);
}

function makeSummary(animations = []) {
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
  const add = (bucket, key) => {
    const normalized = key == null ? "unknown" : String(key);
    bucket[normalized] = (bucket[normalized] || 0) + 1;
  };
  for (const animation of animations) {
    add(summary.byDriver, animation.driver);
    add(summary.byLane, animation.lane);
    add(summary.byLaneKey, animation.laneKey);
    add(summary.byProp, animation.prop);
    add(summary.byTargetId, animation.targetId);
    if (animation.targetId != null) targetIds.add(animation.targetId);
    channelKeys.add(`${animation.targetId ?? "unknown"}:${animation.prop ?? "unknown"}`);
  }
  summary.activeTargetCount = targetIds.size;
  summary.activeChannelCount = channelKeys.size;
  return summary;
}

function makeOverview(report) {
  return {
    activeAnimationCount: report.summary?.activeAnimationCount || 0,
    activeChannelCount: report.summary?.activeChannelCount || 0,
    activeTargetCount: report.summary?.activeTargetCount || 0,
    curveStatsCount: report.curveStats?.length || 0,
    eventCount: report.history?.events?.length || 0,
    sampleCount: report.history?.samples?.length || 0,
    targetMetadataCount: report.targets?.length || 0,
    topCancelReasons: makeTopCancelReasons(report.counters),
    topDrivers: countMapToTopEntries(report.summary?.byDriver),
    topLaneKeys: countMapToTopEntries(report.summary?.byLaneKey),
    topProps: countMapToTopEntries(report.summary?.byProp),
    warningCount: report.warnings?.length || 0,
  };
}

function makeTrackKey(record = {}) {
  return [
    record.targetId ?? "unknown",
    record.prop ?? "unknown",
    record.lane ?? "unknown",
    record.laneKey ?? "unknown",
  ].join(":");
}

function readFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function expandRange(range, value) {
  const number = readFiniteNumber(value);
  if (number == null) return;
  range.min = range.min == null ? number : Math.min(range.min, number);
  range.max = range.max == null ? number : Math.max(range.max, number);
}

function finalizeRange(range) {
  return {
    max: range.max,
    min: range.min,
  };
}

function makeCurveSummary(report = {}) {
  const tracksByKey = new Map();
  const ensureTrack = (record = {}) => {
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
      tracksByKey.set(key, track);
    }
    if (record.driver) track.driver = record.driver;
    if (record.sourceLabel) track.sourceLabel = record.sourceLabel;
    return track;
  };
  for (const sample of report.history?.samples || []) {
    for (const animation of sample.animations || []) {
      const track = ensureTrack(animation);
      track.sampleCount += 1;
      expandRange(track.timeRangeMs, sample.timeMs);
      expandRange(track.valueRange, animation.value);
      expandRange(track.valueRange, animation.to);
      expandRange(track.velocityRange, animation.velocity);
    }
  }
  for (const event of report.history?.events || []) {
    const track = ensureTrack(event);
    track.eventCount += 1;
    expandRange(track.timeRangeMs, event.timeMs);
    expandRange(track.valueRange, event.value);
    expandRange(track.valueRange, event.to);
    expandRange(track.velocityRange, event.velocity);
  }
  const statsByKey = new Map((report.curveStats || []).map((stats) => [makeTrackKey(stats), stats]));
  const tracks = Array.from(tracksByKey.values())
    .map((track) => {
      const stats = statsByKey.get(track.key) || {};
      return {
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
    })
    .sort((a, b) => (b.sampleCount - a.sampleCount) || String(a.key).localeCompare(String(b.key)));
  return {
    eventCount: tracks.reduce((total, track) => total + track.eventCount, 0),
    sampleCount: tracks.reduce((total, track) => total + track.sampleCount, 0),
    trackCount: tracks.length,
    tracks,
  };
}

function getReportOptions(mode) {
  if (mode === "summary") {
    return {
      includeChannels: true,
      includeHistory: false,
      includeTargets: true,
    };
  }
  return {
    includeChannels: true,
    includeHistory: true,
    includeTargets: true,
  };
}

function normalizeSelection(options = {}) {
  const input = options.selection && typeof options.selection === "object"
    ? options.selection
    : options.selection != null
      ? { targetId: options.selection }
      : {};
  return {
    itemId: input.itemId ?? options.itemId ?? null,
    label: input.label ?? options.label ?? null,
    sourceLabel: input.sourceLabel ?? options.sourceLabel ?? null,
    targetId: input.targetId ?? options.targetId ?? null,
  };
}

function matchesSelection(record, selection) {
  if (!record || !selection) return false;
  if (selection.targetId != null && String(record.targetId) === String(selection.targetId)) return true;
  if (selection.sourceLabel != null && record.sourceLabel === selection.sourceLabel) return true;
  if (selection.itemId != null && record.itemId === selection.itemId) return true;
  if (selection.label != null && (record.label === selection.label || record.targetLabel === selection.label)) return true;
  return false;
}

function resolveSelectedTargetIds(report, selection) {
  const ids = new Set();
  const collect = (records = []) => {
    for (const record of records) {
      if (matchesSelection(record, selection) && record.targetId != null) ids.add(record.targetId);
    }
  };
  collect(report.targets);
  collect(report.animations);
  collect(report.channels);
  collect(report.curveStats);
  collect(report.warnings);
  collect(report.history?.events);
  for (const sample of report.history?.samples || []) collect(sample.animations);
  return ids;
}

function filterByTargetIds(records = [], ids) {
  return records.filter((record) => ids.has(record.targetId));
}

function filterHistoryByTargetIds(history, ids) {
  if (!history) return undefined;
  const events = filterByTargetIds(history.events || [], ids);
  const samples = [];
  for (const sample of history.samples || []) {
    const animations = filterByTargetIds(sample.animations || [], ids);
    if (!animations.length) continue;
    samples.push({
      ...sample,
      activeAnimationCount: animations.length,
      animations,
    });
  }
  return { events, samples };
}

function filterReportForSelectedTarget(report, selection) {
  const selectedTargetIds = resolveSelectedTargetIds(report, selection);
  const animations = filterByTargetIds(report.animations || [], selectedTargetIds);
  const filteredSummary = makeSummary(animations);
  filteredSummary.warningCount = filterByTargetIds(report.warnings || [], selectedTargetIds).length;
  return {
    ...report,
    animations,
    channels: filterByTargetIds(report.channels || [], selectedTargetIds),
    curveStats: filterByTargetIds(report.curveStats || [], selectedTargetIds),
    history: filterHistoryByTargetIds(report.history, selectedTargetIds),
    selectedTargetIds: Array.from(selectedTargetIds),
    summary: filteredSummary,
    targets: filterByTargetIds(report.targets || [], selectedTargetIds),
    warnings: filterByTargetIds(report.warnings || [], selectedTargetIds),
  };
}

function makeReportData(runtime, options = {}) {
  const mode = normalizeMode(options.mode);
  const rawReport = runtime.debugReport(getReportOptions(mode));
  const selection = mode === "selectedTarget" ? normalizeSelection(options) : null;
  const report = mode === "selectedTarget"
    ? filterReportForSelectedTarget(rawReport, selection)
    : rawReport;
  return {
    curveSummary: makeCurveSummary(report),
    generatedAt: new Date().toISOString(),
    mode,
    overview: makeOverview(report),
    report,
    schema: REPORT_SCHEMA,
    selection,
    version: REPORT_VERSION,
  };
}

function formatTable(entries, emptyText = "none") {
  if (!entries?.length) return `- ${emptyText}`;
  return entries.map((entry) => `- ${entry.key}: ${entry.count}`).join("\n");
}

function formatWarnings(warnings = []) {
  if (!warnings.length) return "- none";
  return warnings
    .slice(0, 12)
    .map((warning) => `- ${warning.type}: target ${warning.targetId ?? "unknown"} ${warning.prop ?? "?"} ${warning.laneKey ?? ""}`.trim())
    .join("\n");
}

function formatAnimations(animations = []) {
  if (!animations.length) return "- none";
  return animations
    .slice(0, 16)
    .map((animation) => {
      const label = animation.sourceLabel || animation.targetLabel || `target ${animation.targetId ?? "unknown"}`;
      return `- ${label}: ${animation.prop}=${animation.value} -> ${animation.to} (${animation.driver}/${animation.lane}/${animation.laneKey})`;
    })
    .join("\n");
}

function formatCurveStats(curveStats = []) {
  if (!curveStats.length) return "- none";
  return curveStats
    .slice(0, 12)
    .map((stats) => {
      const label = stats.sourceLabel || `${stats.targetId}:${stats.prop}:${stats.laneKey}`;
      return `- ${label}: maxDelta=${stats.maxDelta}, maxVelocity=${stats.maxVelocity}, overshoot=${stats.overshootCount}, retarget=${stats.retargetCount}`;
    })
    .join("\n");
}

function formatCurveSummary(curveSummary = {}) {
  if (!curveSummary.tracks?.length) return "- none";
  return curveSummary.tracks
    .slice(0, 12)
    .map((track) => {
      const label = track.sourceLabel || `${track.targetId}:${track.prop}:${track.laneKey}`;
      return `- ${label}: samples=${track.sampleCount}, events=${track.eventCount}, value=${track.valueRange.min}..${track.valueRange.max}, velocity=${track.velocityRange.min}..${track.velocityRange.max}`;
    })
    .join("\n");
}

export function formatMotionDebugMarkdown(data) {
  const overview = data.overview;
  return [
    "# Pixi Motion Debug AI Report",
    "",
    `Mode: ${data.mode}`,
    `Generated: ${data.generatedAt}`,
    data.selection ? `Selection: ${JSON.stringify(data.selection)}` : null,
    "",
    "## Overview",
    `- active animations: ${overview.activeAnimationCount}`,
    `- active targets: ${overview.activeTargetCount}`,
    `- active channels: ${overview.activeChannelCount}`,
    `- warnings: ${overview.warningCount}`,
    `- targets with metadata: ${overview.targetMetadataCount}`,
    `- curve stats: ${overview.curveStatsCount}`,
    `- history events/samples: ${overview.eventCount}/${overview.sampleCount}`,
    "",
    "## Top Props",
    formatTable(overview.topProps),
    "",
    "## Top Lane Keys",
    formatTable(overview.topLaneKeys),
    "",
    "## Top Cancel Reasons",
    formatTable(overview.topCancelReasons),
    "",
    "## Warnings",
    formatWarnings(data.report.warnings),
    "",
    "## Active Animations",
    formatAnimations(data.report.animations),
    "",
    "## Curve Stats",
    formatCurveStats(data.report.curveStats),
    "",
    "## Curve Summary",
    formatCurveSummary(data.curveSummary),
  ].filter((line) => line != null).join("\n");
}

export function createMotionDebugAIReport(runtime = motionRuntime, options = {}) {
  const data = makeReportData(runtime, options);
  const json = JSON.stringify(data, null, 2);
  const markdown = formatMotionDebugMarkdown(data);
  return {
    copyText: `${markdown}\n\n## JSON\n\n\`\`\`json\n${json}\n\`\`\``,
    data,
    json,
    markdown,
  };
}

export function createMotionDebugCommands(runtime = motionRuntime, options = {}) {
  const target = options.target || globalThis;
  const commandOptions = { target };
  const replayCapture = createMotionReplayCaptureController(runtime);
  const commands = {
    aiReport(reportOptions = {}) {
      return createMotionDebugAIReport(runtime, reportOptions);
    },
    clear() {
      runtime.clearDebugHistory();
      return runtime.debugReport({ includeChannels: true, includeTargets: true });
    },
    configure(config = {}) {
      return runtime.configureDebug(config);
    },
    copy(reportOptions = {}) {
      const report = createMotionDebugAIReport(runtime, reportOptions);
      target?.navigator?.clipboard?.writeText?.(report.copyText);
      return report;
    },
    copyReplayTrace(traceOptions = {}) {
      const trace = createMotionReplayTraceFromRuntime(runtime, traceOptions);
      const json = JSON.stringify(trace, null, 2);
      target?.navigator?.clipboard?.writeText?.(json);
      return { json, trace };
    },
    full(reportOptions = {}) {
      return createMotionDebugAIReport(runtime, { ...reportOptions, mode: "full" });
    },
    report(reportOptions = {}) {
      return runtime.debugReport(reportOptions);
    },
    replayTrace(traceOptions = {}) {
      const trace = createMotionReplayTraceFromRuntime(runtime, traceOptions);
      return { json: JSON.stringify(trace, null, 2), trace };
    },
    selectedTarget(selection, reportOptions = {}) {
      return createMotionDebugAIReport(runtime, {
        ...reportOptions,
        mode: "selectedTarget",
        selection,
      });
    },
    snapshot(snapshotOptions = {}) {
      return runtime.debugSnapshot(snapshotOptions);
    },
    startReplayCapture(captureOptions = {}) {
      return replayCapture.start(captureOptions);
    },
    stopReplayCapture(captureOptions = {}) {
      return replayCapture.stop(captureOptions);
    },
    summary(reportOptions = {}) {
      return createMotionDebugAIReport(runtime, { ...reportOptions, mode: "summary" });
    },
    uninstall() {
      uninstallMotionDebugGlobal(commandOptions);
    },
  };
  return commands;
}

export function installMotionDebugGlobal(options = {}) {
  const {
    dev = Boolean(import.meta.env?.DEV),
    key = MOTION_DEBUG_GLOBAL_KEY,
    runtime = motionRuntime,
    target = globalThis,
  } = options;
  if (!dev || !target) return null;
  const hadPrevious = Object.prototype.hasOwnProperty.call(target, key);
  const previous = target[key];
  const commands = createMotionDebugCommands(runtime, { target });
  commands.uninstall = () => {
    if (target[key] !== commands) return;
    if (hadPrevious) target[key] = previous;
    else delete target[key];
  };
  target[key] = commands;
  return commands;
}

export function uninstallMotionDebugGlobal(options = {}) {
  const {
    key = MOTION_DEBUG_GLOBAL_KEY,
    target = globalThis,
  } = options;
  if (!target) return;
  delete target[key];
}
