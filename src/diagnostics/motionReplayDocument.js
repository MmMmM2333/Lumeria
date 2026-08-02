import { DiagnosticError } from "./diagnosticError.js";
import {
  buildMotionReplayCurveGroups,
  buildMotionReplayEventRows,
  buildMotionReplayFilterSummary,
  buildMotionReplayFrameRows,
  buildMotionReplayOverlayRows,
  buildMotionReplayOverviewRows,
  createMotionReplayIntervalExport,
  findMotionReplayEventStep,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
} from "../components/backgroundDebug/motionReplayViewerModel.js";
import { createMotionFocusedDebugExport } from "../components/backgroundDebug/motionFocusedDebugExportModel.js";
import { buildMotionInspectorModel } from "../components/backgroundDebug/motionInspectorModel.js";
import {
  createMotionTrackChartProjector,
  normalizeMotionTrackChartZoomWindow,
} from "../components/backgroundDebug/motionTrackChartModel.js";
import {
  DIAGNOSTIC_FORMATTED_ANALYSIS_SCHEMA,
  formatDiagnosticAnalysis,
} from "./diagnosticAnalysisFormatter.js";
import {
  analyzeMotionReplayTrace,
  MOTION_REPLAY_ANALYSIS_SCHEMA,
} from "./motionReplayAnalyzer.js";

export const MOTION_REPLAY_DOCUMENT_VIEWS = Object.freeze([
  "overview",
  "filter-summary",
  "frame-rows",
  "event-rows",
  "curve-groups",
  "overlay-rows",
  "track-chart.zoom",
  "track-chart",
  "inspector",
  "time.normalize",
  "step.frame",
  "step.event",
]);
export const MOTION_REPLAY_EXPORT_FORMATS = Object.freeze(["json", "trace", "interval", "focused"]);

export const MOTION_REPLAY_DOCUMENT_SCHEMA = "lumeria-motion-replay-document/v1";
export { MOTION_REPLAY_ANALYSIS_SCHEMA } from "./motionReplayAnalyzer.js";

let documentSequence = 0;

function cloneJson(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function makeSummary(trace, range) {
  const frames = trace.timeline?.frames || [];
  const events = trace.timeline?.events || [];
  return {
    durationMs: Math.max(0, Number(range.max) - Number(range.min)),
    eventCount: events.length,
    frameCount: frames.length,
    targetCount: trace.targets?.length || 0,
    trackCount: trace.tracks?.length || 0,
    valueCount: frames.reduce((total, frame) => total + (frame.values?.length || 0), 0),
    warningCount: trace.warnings?.length || 0,
  };
}

function normalizeDirection(direction) {
  return direction === "previous" || direction === "prev" || direction === -1 ? "previous" : "next";
}

function findAdjacentTime(times, currentTime, direction, strict = false) {
  if (!times.length) return strict ? null : currentTime;
  let low = 0;
  let high = times.length;
  const previous = normalizeDirection(direction) === "previous";
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (previous ? times[middle] < currentTime : times[middle] <= currentTime) low = middle + 1;
    else high = middle;
  }
  if (previous) {
    const index = low - 1;
    if (index >= 0) return times[index];
    return strict ? null : times[0];
  }
  if (low < times.length) return times[low];
  return strict ? null : times.at(-1);
}

function normalizeCursorX(range, timeMs) {
  const min = Number(range.min) || 0;
  const max = Number(range.max) || min;
  if (max <= min) return 0;
  const time = Math.max(min, Math.min(max, Number(timeMs) || min));
  return ((time - min) / (max - min)) * 100;
}

function makeDisposedError(id) {
  return new DiagnosticError("motion-replay-document-disposed", `Motion 捕获文档 ${id} 已经释放`, {
    details: { documentId: id },
    nextActions: ["从 MotionDiagnosticSession 获取当前捕获文档"],
  });
}

export function createMotionReplayDocument(traceInput, options = {}) {
  let trace = normalizeMotionReplayTrace(traceInput);
  const sourceSchema = String(trace.schema || "unknown");
  const id = String(options.id || `motion-replay-${++documentSequence}`);
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const createdAt = String(now());
  let range = { ...trace.timeline.timeRangeMs };
  let captureSummary = makeSummary(trace, range);
  let disposed = false;
  let frameTimes = Array.from(new Set(trace.timeline.frames.map((frame) => Number(frame.timeMs))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let eventTimes = Array.from(new Set(trace.timeline.events.map((event) => Number(event.timeMs))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let curveCache = null;
  let trackChartCache = null;
  let inspectorCache = null;
  let analysisCache = null;

  function ensureActive() {
    if (disposed || !trace) throw makeDisposedError(id);
  }

  function summary() {
    ensureActive();
    return { ...captureSummary };
  }

  function timeRange() {
    ensureActive();
    return { ...range };
  }

  function getCurveGroups(viewOptions) {
    const filters = viewOptions.filters || {};
    const limit = viewOptions.limit;
    const key = stableStringify({ filters, limit: limit ?? null });
    if (!curveCache || curveCache.key !== key) {
      curveCache = {
        groups: buildMotionReplayCurveGroups(trace, range.min, filters, limit),
        key,
      };
    }
    const cursorX = normalizeCursorX(range, viewOptions.timeMs);
    return curveCache.groups.map((group) => (group.cursorX === cursorX ? group : { ...group, cursorX }));
  }

  function getTrackChart(viewOptions) {
    const { cursorTimeMs, selectedTrack, ...structureOptions } = viewOptions;
    const key = stableStringify(structureOptions);
    if (!trackChartCache || trackChartCache.key !== key) {
      trackChartCache = {
        key,
        projector: createMotionTrackChartProjector(trace, structureOptions),
      };
    }
    return trackChartCache.projector.project({ cursorTimeMs, selectedTrack });
  }

  function getInspector(viewOptions) {
    const key = stableStringify(viewOptions);
    if (!inspectorCache || inspectorCache.key !== key) {
      inspectorCache = { key, value: buildMotionInspectorModel(trace, viewOptions) };
    }
    return inspectorCache.value;
  }

  function getFrameStep(viewOptions) {
    const currentTime = normalizeMotionReplayTime(trace, viewOptions.timeMs);
    const adjacent = findAdjacentTime(frameTimes, currentTime, viewOptions.direction);
    return normalizeMotionReplayTime(trace, adjacent);
  }

  function getEventStep(viewOptions) {
    const filters = viewOptions.filters || {};
    if (Object.keys(filters).length) {
      return findMotionReplayEventStep(trace, viewOptions.timeMs, viewOptions.direction, filters);
    }
    const currentTime = normalizeMotionReplayTime(trace, viewOptions.timeMs);
    const adjacent = findAdjacentTime(eventTimes, currentTime, viewOptions.direction, true);
    if (adjacent == null) return null;
    return trace.timeline.events
      .filter((event) => Math.abs(Number(event.timeMs) - adjacent) <= 0.5)
      .sort((left, right) => (Number(left.frame) - Number(right.frame)) || String(left.prop).localeCompare(String(right.prop)))[0] || null;
  }

  function getView(view, viewOptions = {}) {
    ensureActive();
    switch (view) {
      case "overview":
        return buildMotionReplayOverviewRows(trace, viewOptions.timeMs);
      case "filter-summary":
        return buildMotionReplayFilterSummary(trace, viewOptions.timeMs, viewOptions.filters);
      case "frame-rows":
        return buildMotionReplayFrameRows(trace, viewOptions.timeMs, viewOptions.filters, viewOptions.limit);
      case "event-rows":
        return buildMotionReplayEventRows(trace, viewOptions.timeMs, viewOptions.filters, viewOptions.limit);
      case "curve-groups":
        return getCurveGroups(viewOptions);
      case "overlay-rows":
        return buildMotionReplayOverlayRows(trace, viewOptions.timeMs, viewOptions.filters, {
          limit: viewOptions.limit,
          selectedTarget: viewOptions.selectedTarget,
          selectedTrack: viewOptions.selectedTrack,
        });
      case "track-chart.zoom":
        return normalizeMotionTrackChartZoomWindow(trace, viewOptions.window || viewOptions);
      case "track-chart":
        return getTrackChart(viewOptions);
      case "inspector":
        return getInspector(viewOptions);
      case "time.normalize":
        return normalizeMotionReplayTime(trace, viewOptions.timeMs);
      case "step.frame":
        return getFrameStep(viewOptions);
      case "step.event":
        return getEventStep(viewOptions);
      default:
        throw new DiagnosticError("motion-replay-view-not-found", `未知 Motion 捕获视图 ${view || "(empty)"}`, {
          details: { supportedViews: MOTION_REPLAY_DOCUMENT_VIEWS, view: view || null },
          nextActions: [`使用 ${MOTION_REPLAY_DOCUMENT_VIEWS.join("、")} 之一`],
        });
    }
  }

  function analyze(analysisOptions = {}) {
    ensureActive();
    const { format = "structured", ...structuredOptions } = analysisOptions;
    const key = stableStringify(structuredOptions);
    if (!analysisCache || analysisCache.key !== key) {
      analysisCache = {
        key,
        value: analyzeMotionReplayTrace(trace, {
          ...structuredOptions,
          documentId: id,
          generatedAt: String(now()),
        }),
      };
    }
    if (format === "structured") return analysisCache.value;
    const normalizedFormat = String(format);
    return {
      content: formatDiagnosticAnalysis(analysisCache.value, {
        format: normalizedFormat,
        locale: structuredOptions.locale,
      }),
      documentId: id,
      format: normalizedFormat,
      generatedAt: analysisCache.value.generatedAt,
      locale: analysisCache.value.locale,
      schema: DIAGNOSTIC_FORMATTED_ANALYSIS_SCHEMA,
      sourceSchema: MOTION_REPLAY_ANALYSIS_SCHEMA,
    };
  }

  function exportDocument(exportOptions = {}) {
    ensureActive();
    const format = String(exportOptions.format || "json");
    if (format === "json") {
      return {
        content: JSON.stringify(trace, null, Number.isFinite(Number(exportOptions.space)) ? Number(exportOptions.space) : 2),
        filename: exportOptions.filename || `lumeria-motion-replay-${id}.json`,
        format,
        mediaType: "application/json",
      };
    }
    if (format === "trace") return cloneJson(trace);
    if (format === "interval") return createMotionReplayIntervalExport(trace, exportOptions);
    if (format === "focused") return createMotionFocusedDebugExport(trace, exportOptions);
    throw new DiagnosticError("motion-replay-export-not-supported", `不支持 Motion 捕获导出格式 ${format}`, {
      details: { format, supportedFormats: MOTION_REPLAY_EXPORT_FORMATS },
      nextActions: [`使用 ${MOTION_REPLAY_EXPORT_FORMATS.join("、")} 之一`],
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    trace = null;
    range = null;
    captureSummary = null;
    frameTimes = null;
    eventTimes = null;
    curveCache = null;
    trackChartCache = null;
    inspectorCache = null;
    analysisCache = null;
  }

  return Object.freeze({
    analyze,
    createdAt,
    dispose,
    export: exportDocument,
    getView,
    id,
    schema: MOTION_REPLAY_DOCUMENT_SCHEMA,
    sourceSchema,
    summary,
    timeRange,
  });
}
