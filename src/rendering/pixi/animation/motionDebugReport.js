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
  throw new DiagnosticError("diagnostic-params-invalid", "Motion 报告模式不受支持", {
    details: { mode: normalized, supportedModes: [...REPORT_MODES] },
    nextActions: ["使用 summary、full 或 selectedTarget 模式"],
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

function formatTable(entries, emptyText = "无") {
  if (!entries?.length) return `- ${emptyText}`;
  return entries.map((entry) => `- ${entry.key}: ${entry.count}`).join("\n");
}

function formatWarnings(warnings = []) {
  if (!warnings.length) return "- 无";
  return warnings
    .slice(0, 12)
    .map((warning) => `- ${warning.type}：目标 ${warning.targetId ?? "未知"} ${warning.prop ?? "?"} ${warning.laneKey ?? ""}`.trim())
    .join("\n");
}

function formatAnimations(animations = []) {
  if (!animations.length) return "- 无";
  return animations
    .slice(0, 16)
    .map((animation) => {
      const label = animation.sourceLabel || animation.targetLabel || `目标 ${animation.targetId ?? "未知"}`;
      return `- ${label}：${animation.prop}=${animation.value} → ${animation.to}（${animation.driver}/${animation.lane}/${animation.laneKey}）`;
    })
    .join("\n");
}

function formatCurveStats(curveStats = []) {
  if (!curveStats.length) return "- 无";
  return curveStats
    .slice(0, 12)
    .map((stats) => {
      const label = stats.sourceLabel || `${stats.targetId}:${stats.prop}:${stats.laneKey}`;
      return `- ${label}：最大差值=${stats.maxDelta}，最大速度=${stats.maxVelocity}，过冲=${stats.overshootCount}，重定向=${stats.retargetCount}`;
    })
    .join("\n");
}

function formatCurveSummary(curveSummary = {}) {
  if (!curveSummary.tracks?.length) return "- 无";
  return curveSummary.tracks
    .slice(0, 12)
    .map((track) => {
      const label = track.sourceLabel || `${track.targetId}:${track.prop}:${track.laneKey}`;
      return `- ${label}：采样=${track.sampleCount}，事件=${track.eventCount}，值域=${track.valueRange.min}..${track.valueRange.max}，速度范围=${track.velocityRange.min}..${track.velocityRange.max}`;
    })
    .join("\n");
}

export function formatMotionDebugMarkdown(data) {
  const overview = data.overview;
  return [
    "# Pixi Motion AI 调试报告",
    "",
    `模式：${data.mode}`,
    `生成时间：${data.generatedAt}`,
    data.selection ? `选择范围：${JSON.stringify(data.selection)}` : null,
    "",
    "## 概览",
    `- 活动动画：${overview.activeAnimationCount}`,
    `- 活动目标：${overview.activeTargetCount}`,
    `- 活动通道：${overview.activeChannelCount}`,
    `- 警告：${overview.warningCount}`,
    `- 有元数据的目标：${overview.targetMetadataCount}`,
    `- 曲线统计：${overview.curveStatsCount}`,
    `- 历史事件 / 采样：${overview.eventCount}/${overview.sampleCount}`,
    "",
    "## 高频属性",
    formatTable(overview.topProps),
    "",
    "## 高频通道键",
    formatTable(overview.topLaneKeys),
    "",
    "## 主要取消原因",
    formatTable(overview.topCancelReasons),
    "",
    "## 警告",
    formatWarnings(data.report.warnings),
    "",
    "## 活动动画",
    formatAnimations(data.report.animations),
    "",
    "## 曲线统计",
    formatCurveStats(data.report.curveStats),
    "",
    "## 曲线摘要",
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
