import { motionRuntime } from "./motionRuntime.js";
import { createDiagnosticPresentation } from "../../../diagnostics/diagnosticPresentation.js";
import { DiagnosticError } from "../../../diagnostics/diagnosticError.js";
import {
  aggregateMotionTracks,
  collectMotionTrackRecordsFromHistory,
  makeMotionDebugSummary,
  makeTrackKey,
} from "./motionTraceShared.js";

const REPORT_SCHEMA = "pixi-motion-ai-report/v1";
const REPORT_VERSION = 1;
const REPORT_MODES = new Set(["summary", "full", "selectedTarget"]);

function normalizeMode(mode) {
  const normalized = mode == null ? "summary" : String(mode);
  if (REPORT_MODES.has(normalized)) return normalized;
  throw new DiagnosticError("diagnostic-params-invalid", "The Motion report mode is not supported", {
    details: { mode: normalized, supportedModes: [...REPORT_MODES] },
    nextActions: ["Use summary, full, or selectedTarget mode"],
  });
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

function makeCurveSummary(report = {}) {
  const tracks = aggregateMotionTracks(
    collectMotionTrackRecordsFromHistory(report.history),
    report.curveStats,
    { sortMode: "sampleCount" }
  );
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
    includeCurveStats: true,
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
  const filteredSummary = makeMotionDebugSummary(animations);
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

function formatTable(entries, emptyText = "None") {
  if (!entries?.length) return `- ${emptyText}`;
  return entries.map((entry) => `- ${entry.key}: ${entry.count}`).join("\n");
}

function formatWarnings(warnings = []) {
  if (!warnings.length) return "- None";
  return warnings
    .slice(0, 12)
    .map((warning) => `- ${warning.type}: target ${warning.targetId ?? "unknown"} ${warning.prop ?? "?"} ${warning.laneKey ?? ""}`.trim())
    .join("\n");
}

function formatAnimations(animations = []) {
  if (!animations.length) return "- None";
  return animations
    .slice(0, 16)
    .map((animation) => {
      const label = animation.sourceLabel || animation.targetLabel || `target ${animation.targetId ?? "unknown"}`;
      return `- ${label}: ${animation.prop}=${animation.value} → ${animation.to} (${animation.driver}/${animation.lane}/${animation.laneKey})`;
    })
    .join("\n");
}

function formatCurveStats(curveStats = []) {
  if (!curveStats.length) return "- None";
  return curveStats
    .slice(0, 12)
    .map((stats) => {
      const label = stats.sourceLabel || `${stats.targetId}:${stats.prop}:${stats.laneKey}`;
      return `- ${label}: max delta=${stats.maxDelta}, max velocity=${stats.maxVelocity}, overshoots=${stats.overshootCount}, retargets=${stats.retargetCount}`;
    })
    .join("\n");
}

function formatCurveSummary(curveSummary = {}) {
  if (!curveSummary.tracks?.length) return "- None";
  return curveSummary.tracks
    .slice(0, 12)
    .map((track) => {
      const label = track.sourceLabel || `${track.targetId}:${track.prop}:${track.laneKey}`;
      return `- ${label}: samples=${track.sampleCount}, events=${track.eventCount}, value range=${track.valueRange.min}..${track.valueRange.max}, velocity range=${track.velocityRange.min}..${track.velocityRange.max}`;
    })
    .join("\n");
}

export function formatMotionDebugMarkdown(data) {
  const overview = data.overview;
  return [
    "# Pixi Motion AI debug report",
    "",
    `Mode: ${data.mode}`,
    `Generated at: ${data.generatedAt}`,
    data.selection ? `Selection: ${JSON.stringify(data.selection)}` : null,
    "",
    "## Overview",
    `- Active animations: ${overview.activeAnimationCount}`,
    `- Active targets: ${overview.activeTargetCount}`,
    `- Active channels: ${overview.activeChannelCount}`,
    `- Warnings: ${overview.warningCount}`,
    `- Targets with metadata: ${overview.targetMetadataCount}`,
    `- Curve statistics: ${overview.curveStatsCount}`,
    `- History events / samples: ${overview.eventCount}/${overview.sampleCount}`,
    "",
    "## Frequent properties",
    formatTable(overview.topProps),
    "",
    "## Frequent lane keys",
    formatTable(overview.topLaneKeys),
    "",
    "## Top cancellation reasons",
    formatTable(overview.topCancelReasons),
    "",
    "## Warnings",
    formatWarnings(data.report.warnings),
    "",
    "## Active animations",
    formatAnimations(data.report.animations),
    "",
    "## Curve statistics",
    formatCurveStats(data.report.curveStats),
    "",
    "## Curve summary",
    formatCurveSummary(data.curveSummary),
  ].filter((line) => line != null).join("\n");
}

export function createMotionDebugAIReport(runtime = motionRuntime, options = {}) {
  const data = makeReportData(runtime, options);
  return createDiagnosticPresentation(data, {
    formatMarkdown: formatMotionDebugMarkdown,
    presentation: options.presentation,
  });
}
