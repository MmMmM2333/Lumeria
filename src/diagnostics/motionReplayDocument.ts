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
import type {
  DiagnosticTranslate,
  MotionReplayFilters,
  MotionReplayIntervalExportOptions,
  MotionReplayOverlayOptions,
  MotionReplaySelectionRef,
  MotionReplayStepDirection,
  MotionReplayTimeRange,
  MotionReplayTrace,
} from "../components/backgroundDebug/motionReplayViewerModel.js";
import type { MotionTraceRecord } from "../rendering/motionPort.js";
import { createMotionFocusedDebugExport } from "../components/backgroundDebug/motionFocusedDebugExportModel.js";
import { buildMotionInspectorModel } from "../components/backgroundDebug/motionInspectorModel.js";
import type { MotionInspectorModel } from "../components/backgroundDebug/motionInspectorModel.js";
import {
  createMotionTrackChartProjector,
  normalizeMotionTrackChartZoomWindow,
} from "../components/backgroundDebug/motionTrackChartModel.js";
import type {
  MotionTrackChartModel,
  MotionTrackChartWindow,
} from "../components/backgroundDebug/motionTrackChartModel.js";
import {
  DIAGNOSTIC_FORMATTED_ANALYSIS_SCHEMA,
  formatDiagnosticAnalysis,
} from "./diagnosticAnalysisFormatter.js";
import {
  analyzeMotionReplayTrace,
  MOTION_REPLAY_ANALYSIS_SCHEMA,
} from "./motionReplayAnalyzer.js";
import type {
  MotionReplayAnalysis,
  MotionReplayAnalysisOptions,
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
] as const);
export const MOTION_REPLAY_EXPORT_FORMATS = Object.freeze(["json", "trace", "interval", "focused"] as const);

export const MOTION_REPLAY_DOCUMENT_SCHEMA = "lumeria-motion-replay-document/v1" as const;
export { MOTION_REPLAY_ANALYSIS_SCHEMA } from "./motionReplayAnalyzer.js";

let documentSequence = 0;

type UnknownRecord = Record<string, unknown>;
export type MotionReplayDocumentView = (typeof MOTION_REPLAY_DOCUMENT_VIEWS)[number];
export type MotionReplayDocumentExportFormat = (typeof MOTION_REPLAY_EXPORT_FORMATS)[number];
export type MotionReplayOverviewView = ReturnType<typeof buildMotionReplayOverviewRows>;
export type MotionReplayFilterSummaryView = ReturnType<typeof buildMotionReplayFilterSummary>;
export type MotionReplayFrameRowsView = ReturnType<typeof buildMotionReplayFrameRows>;
export type MotionReplayEventRowsView = ReturnType<typeof buildMotionReplayEventRows>;
export type MotionReplayCurveGroupsView = ReturnType<typeof buildMotionReplayCurveGroups>;
export type MotionReplayOverlayRowsView = ReturnType<typeof buildMotionReplayOverlayRows>;
export type MotionReplayIntervalExport = ReturnType<typeof createMotionReplayIntervalExport>;
export type MotionReplayFocusedExport = ReturnType<typeof createMotionFocusedDebugExport>;

export interface MotionReplayJsonExport {
  readonly content: string;
  readonly filename: unknown;
  readonly format: "json";
  readonly mediaType: "application/json";
}

export interface MotionReplayDocumentSummary {
  readonly durationMs: number;
  readonly eventCount: number;
  readonly frameCount: number;
  readonly targetCount: number;
  readonly trackCount: number;
  readonly valueCount: number;
  readonly warningCount: number;
}

export interface MotionReplayDocumentOptions {
  readonly id?: unknown;
  readonly now?: () => unknown;
}

export interface MotionReplayDocumentViewOptions extends UnknownRecord {
  readonly cursorTimeMs?: unknown;
  readonly direction?: MotionReplayStepDirection;
  readonly filters?: MotionReplayFilters;
  readonly limit?: unknown;
  readonly selectedTarget?: MotionReplaySelectionRef | null;
  readonly selectedTrack?: MotionReplaySelectionRef | null;
  readonly t?: DiagnosticTranslate;
  readonly timeMs?: unknown;
  readonly window?: unknown;
}

export interface MotionReplayDocumentAnalyzeOptions extends UnknownRecord {
  readonly filters?: MotionReplayFilters;
  readonly format?: unknown;
  readonly locale?: unknown;
}

export interface MotionReplayDocumentExportOptions extends MotionReplayIntervalExportOptions, UnknownRecord {
  readonly filename?: unknown;
  readonly format?: unknown;
  readonly space?: unknown;
}

export interface MotionReplayFormattedAnalysis {
  readonly content: string;
  readonly documentId: string;
  readonly format: string;
  readonly generatedAt: string;
  readonly locale: string;
  readonly schema: typeof DIAGNOSTIC_FORMATTED_ANALYSIS_SCHEMA;
  readonly sourceSchema: typeof MOTION_REPLAY_ANALYSIS_SCHEMA;
}

export interface MotionReplayDocument {
  analyze(options?: MotionReplayDocumentAnalyzeOptions & Readonly<{ format?: "structured" | undefined }>): MotionReplayAnalysis;
  analyze(options: MotionReplayDocumentAnalyzeOptions): MotionReplayAnalysis | MotionReplayFormattedAnalysis;
  readonly createdAt: string;
  dispose(): void;
  export(options?: MotionReplayDocumentExportOptions & Readonly<{ format?: "json" | undefined }>): MotionReplayJsonExport;
  export(options: MotionReplayDocumentExportOptions & Readonly<{ format: "trace" }>): MotionReplayTrace;
  export(options: MotionReplayDocumentExportOptions & Readonly<{ format: "interval" }>): MotionReplayIntervalExport;
  export(options: MotionReplayDocumentExportOptions & Readonly<{ format: "focused" }>): MotionReplayFocusedExport;
  export(options: MotionReplayDocumentExportOptions): unknown;
  getView(view: "overview", options?: MotionReplayDocumentViewOptions): MotionReplayOverviewView;
  getView(view: "filter-summary", options?: MotionReplayDocumentViewOptions): MotionReplayFilterSummaryView;
  getView(view: "frame-rows", options?: MotionReplayDocumentViewOptions): MotionReplayFrameRowsView;
  getView(view: "event-rows", options?: MotionReplayDocumentViewOptions): MotionReplayEventRowsView;
  getView(view: "curve-groups", options?: MotionReplayDocumentViewOptions): MotionReplayCurveGroupsView;
  getView(view: "overlay-rows", options?: MotionReplayDocumentViewOptions): MotionReplayOverlayRowsView;
  getView(view: "track-chart.zoom", options?: MotionReplayDocumentViewOptions): MotionTrackChartWindow;
  getView(view: "track-chart", options?: MotionReplayDocumentViewOptions): MotionTrackChartModel;
  getView(view: "inspector", options?: MotionReplayDocumentViewOptions): MotionInspectorModel;
  getView(view: "time.normalize", options?: MotionReplayDocumentViewOptions): number;
  getView(view: "step.frame", options?: MotionReplayDocumentViewOptions): number;
  getView(view: "step.event", options?: MotionReplayDocumentViewOptions): MotionTraceRecord | null;
  getView(view: MotionReplayDocumentView, options?: MotionReplayDocumentViewOptions): unknown;
  readonly id: string;
  readonly schema: typeof MOTION_REPLAY_DOCUMENT_SCHEMA;
  readonly sourceSchema: string;
  summary(): MotionReplayDocumentSummary;
  timeRange(): MotionReplayTimeRange;
}

type MotionTrackChartProjector = ReturnType<typeof createMotionTrackChartProjector>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requireOptions<Options extends UnknownRecord>(
  value: unknown,
  label: string,
): Options {
  const record = asRecord(value);
  if (record) return record as Options;
  throw new DiagnosticError("diagnostic-params-invalid", `${label} must be an object`, {
    details: { receivedType: Array.isArray(value) ? "array" : typeof value },
    nextActions: ["Pass a plain options object"],
  });
}

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (value == null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = asRecord(value) || {};
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function makeSummary(trace: MotionReplayTrace, range: MotionReplayTimeRange): MotionReplayDocumentSummary {
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

function normalizeDirection(direction: unknown): "next" | "previous" {
  return direction === "previous" || direction === "prev" || direction === -1 ? "previous" : "next";
}

function findAdjacentTime(
  times: readonly number[],
  currentTime: number,
  direction: unknown,
  strict = false,
): number | null {
  if (!times.length) return strict ? null : currentTime;
  let low = 0;
  let high = times.length;
  const previous = normalizeDirection(direction) === "previous";
  while (low < high) {
    const middle = (low + high) >>> 1;
    const middleTime = times[middle] ?? currentTime;
    if (previous ? middleTime < currentTime : middleTime <= currentTime) low = middle + 1;
    else high = middle;
  }
  if (previous) {
    const index = low - 1;
    if (index >= 0) return times[index] ?? currentTime;
    return strict ? null : times[0] ?? currentTime;
  }
  if (low < times.length) return times[low] ?? currentTime;
  return strict ? null : times.at(-1) ?? currentTime;
}

function normalizeCursorX(range: MotionReplayTimeRange, timeMs: unknown): number {
  const min = Number(range.min) || 0;
  const max = Number(range.max) || min;
  if (max <= min) return 0;
  const time = Math.max(min, Math.min(max, Number(timeMs) || min));
  return ((time - min) / (max - min)) * 100;
}

function makeDisposedError(id: string): DiagnosticError {
  return new DiagnosticError("motion-replay-document-disposed", `Motion capture document ${id} has been disposed`, {
    details: { documentId: id },
    nextActions: ["Get the current capture document from MotionDiagnosticSession"],
  });
}

export function createMotionReplayDocument(
  traceInput: unknown,
  options: MotionReplayDocumentOptions = {},
): MotionReplayDocument {
  let trace: MotionReplayTrace | null = normalizeMotionReplayTrace(traceInput);
  const sourceSchema = String(trace.schema || "unknown");
  const id = String(options.id || `motion-replay-${++documentSequence}`);
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  const createdAt = String(now());
  let range: MotionReplayTimeRange | null = { ...trace.timeline.timeRangeMs };
  let captureSummary: MotionReplayDocumentSummary | null = makeSummary(trace, range);
  let disposed = false;
  let frameTimes: number[] | null = Array.from(new Set(trace.timeline.frames.map((frame) => Number(frame.timeMs))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let eventTimes: number[] | null = Array.from(new Set(trace.timeline.events.map((event) => Number(event.timeMs))))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let curveCache: { groups: ReturnType<typeof buildMotionReplayCurveGroups>; key: string } | null = null;
  let trackChartCache: { key: string; projector: MotionTrackChartProjector } | null = null;
  let inspectorCache: { key: string; value: MotionInspectorModel } | null = null;
  let analysisCache: { key: string; value: MotionReplayAnalysis } | null = null;

  function ensureActive() {
    if (disposed || !trace) throw makeDisposedError(id);
  }

  function activeTrace(): MotionReplayTrace {
    ensureActive();
    if (!trace) throw makeDisposedError(id);
    return trace;
  }

  function activeRange(): MotionReplayTimeRange {
    ensureActive();
    if (!range) throw makeDisposedError(id);
    return range;
  }

  function summary(): MotionReplayDocumentSummary {
    ensureActive();
    if (!captureSummary) throw makeDisposedError(id);
    return { ...captureSummary };
  }

  function timeRange(): MotionReplayTimeRange {
    return { ...activeRange() };
  }

  function getCurveGroups(viewOptions: MotionReplayDocumentViewOptions) {
    const currentTrace = activeTrace();
    const currentRange = activeRange();
    const filters = viewOptions.filters || {};
    const limit = viewOptions.limit;
    const key = stableStringify({ filters, limit: limit ?? null });
    if (!curveCache || curveCache.key !== key) {
      curveCache = {
        groups: buildMotionReplayCurveGroups(currentTrace, currentRange.min, filters, limit, viewOptions.t),
        key,
      };
    }
    const cursorX = normalizeCursorX(currentRange, viewOptions.timeMs);
    return curveCache.groups.map((group) => (group.cursorX === cursorX ? group : { ...group, cursorX }));
  }

  function getTrackChart(viewOptions: MotionReplayDocumentViewOptions): MotionTrackChartModel {
    const { cursorTimeMs, selectedTrack, ...structureOptions } = viewOptions;
    const key = stableStringify(structureOptions);
    if (!trackChartCache || trackChartCache.key !== key) {
      trackChartCache = {
        key,
        projector: createMotionTrackChartProjector(activeTrace(), structureOptions),
      };
    }
    return trackChartCache.projector.project({
      ...(cursorTimeMs !== undefined ? { cursorTimeMs } : {}),
      ...(selectedTrack !== undefined ? { selectedTrack } : {}),
    });
  }

  function getInspector(viewOptions: MotionReplayDocumentViewOptions): MotionInspectorModel {
    const key = stableStringify(viewOptions);
    if (!inspectorCache || inspectorCache.key !== key) {
      inspectorCache = { key, value: buildMotionInspectorModel(activeTrace(), viewOptions) };
    }
    return inspectorCache.value;
  }

  function getFrameStep(viewOptions: MotionReplayDocumentViewOptions): number {
    const currentTrace = activeTrace();
    const currentTime = normalizeMotionReplayTime(currentTrace, viewOptions.timeMs);
    const adjacent = findAdjacentTime(frameTimes || [], currentTime, viewOptions.direction);
    return normalizeMotionReplayTime(currentTrace, adjacent);
  }

  function getEventStep(viewOptions: MotionReplayDocumentViewOptions): MotionTraceRecord | null {
    const currentTrace = activeTrace();
    const filters = viewOptions.filters || {};
    if (Object.keys(filters).length) {
      return findMotionReplayEventStep(currentTrace, viewOptions.timeMs, viewOptions.direction, filters);
    }
    const currentTime = normalizeMotionReplayTime(currentTrace, viewOptions.timeMs);
    const adjacent = findAdjacentTime(eventTimes || [], currentTime, viewOptions.direction, true);
    if (adjacent == null) return null;
    return currentTrace.timeline.events
      .filter((event) => Math.abs(Number(event.timeMs) - adjacent) <= 0.5)
      .sort((left, right) => (Number(left.frame) - Number(right.frame)) || String(left.prop).localeCompare(String(right.prop)))[0] || null;
  }

  function getView(view: "overview", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionReplayOverviewView;
  function getView(view: "filter-summary", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionReplayFilterSummaryView;
  function getView(view: "frame-rows", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionReplayFrameRowsView;
  function getView(view: "event-rows", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionReplayEventRowsView;
  function getView(view: "curve-groups", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionReplayCurveGroupsView;
  function getView(view: "overlay-rows", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionReplayOverlayRowsView;
  function getView(view: "track-chart.zoom", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionTrackChartWindow;
  function getView(view: "track-chart", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionTrackChartModel;
  function getView(view: "inspector", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionInspectorModel;
  function getView(view: "time.normalize", viewOptionsInput?: MotionReplayDocumentViewOptions): number;
  function getView(view: "step.frame", viewOptionsInput?: MotionReplayDocumentViewOptions): number;
  function getView(view: "step.event", viewOptionsInput?: MotionReplayDocumentViewOptions): MotionTraceRecord | null;
  function getView(view: MotionReplayDocumentView, viewOptionsInput?: MotionReplayDocumentViewOptions): unknown;
  function getView(view: unknown, viewOptionsInput: unknown = {}): unknown {
    const currentTrace = activeTrace();
    const viewOptions = requireOptions<MotionReplayDocumentViewOptions>(viewOptionsInput, "Motion capture view options");
    switch (view) {
      case "overview":
        return buildMotionReplayOverviewRows(currentTrace, viewOptions.timeMs, viewOptions.t);
      case "filter-summary":
        return buildMotionReplayFilterSummary(currentTrace, viewOptions.timeMs, viewOptions.filters, viewOptions.t);
      case "frame-rows":
        return buildMotionReplayFrameRows(currentTrace, viewOptions.timeMs, viewOptions.filters, viewOptions.limit);
      case "event-rows":
        return buildMotionReplayEventRows(currentTrace, viewOptions.timeMs, viewOptions.filters, viewOptions.limit);
      case "curve-groups":
        return getCurveGroups(viewOptions);
      case "overlay-rows":
        return buildMotionReplayOverlayRows(currentTrace, viewOptions.timeMs, viewOptions.filters, {
          ...(typeof viewOptions.limit === "number" ? { limit: viewOptions.limit } : {}),
          ...(viewOptions.selectedTarget !== undefined ? { selectedTarget: viewOptions.selectedTarget } : {}),
          ...(viewOptions.selectedTrack !== undefined ? { selectedTrack: viewOptions.selectedTrack } : {}),
        });
      case "track-chart.zoom":
        return normalizeMotionTrackChartZoomWindow(currentTrace, viewOptions.window || viewOptions);
      case "track-chart":
        return getTrackChart(viewOptions);
      case "inspector":
        return getInspector(viewOptions);
      case "time.normalize":
        return normalizeMotionReplayTime(currentTrace, viewOptions.timeMs);
      case "step.frame":
        return getFrameStep(viewOptions);
      case "step.event":
        return getEventStep(viewOptions);
      default:
        throw new DiagnosticError("motion-replay-view-not-found", `Unknown Motion capture view: ${view || "(empty)"}`, {
          details: { supportedViews: MOTION_REPLAY_DOCUMENT_VIEWS, view: view || null },
          nextActions: [`Use one of: ${MOTION_REPLAY_DOCUMENT_VIEWS.join(", ")}`],
        });
    }
  }

  function analyze(analysisOptionsInput?: MotionReplayDocumentAnalyzeOptions & Readonly<{ format?: "structured" | undefined }>): MotionReplayAnalysis;
  function analyze(analysisOptionsInput: MotionReplayDocumentAnalyzeOptions): MotionReplayAnalysis | MotionReplayFormattedAnalysis;
  function analyze(analysisOptionsInput: unknown = {}): MotionReplayAnalysis | MotionReplayFormattedAnalysis {
    const currentTrace = activeTrace();
    const analysisOptions = requireOptions<MotionReplayDocumentAnalyzeOptions>(analysisOptionsInput, "Motion capture analysis options");
    const { format = "structured", ...structuredOptions } = analysisOptions;
    const key = stableStringify(structuredOptions);
    if (!analysisCache || analysisCache.key !== key) {
      analysisCache = {
        key,
        value: analyzeMotionReplayTrace(currentTrace, {
          documentId: id,
          ...(asRecord(structuredOptions.filters) ? { filters: structuredOptions.filters } : {}),
          generatedAt: String(now()),
          ...(structuredOptions.locale != null ? { locale: structuredOptions.locale } : {}),
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

  function exportDocument(exportOptionsInput?: MotionReplayDocumentExportOptions & Readonly<{ format?: "json" | undefined }>): MotionReplayJsonExport;
  function exportDocument(exportOptionsInput: MotionReplayDocumentExportOptions & Readonly<{ format: "trace" }>): MotionReplayTrace;
  function exportDocument(exportOptionsInput: MotionReplayDocumentExportOptions & Readonly<{ format: "interval" }>): MotionReplayIntervalExport;
  function exportDocument(exportOptionsInput: MotionReplayDocumentExportOptions & Readonly<{ format: "focused" }>): MotionReplayFocusedExport;
  function exportDocument(exportOptionsInput: MotionReplayDocumentExportOptions): unknown;
  function exportDocument(exportOptionsInput: unknown = {}): unknown {
    const currentTrace = activeTrace();
    const exportOptions = requireOptions<MotionReplayDocumentExportOptions>(exportOptionsInput, "Motion capture export options");
    const format = String(exportOptions.format || "json");
    if (format === "json") {
      return {
        content: JSON.stringify(currentTrace, null, Number.isFinite(Number(exportOptions.space)) ? Number(exportOptions.space) : 2),
        filename: exportOptions.filename || `lumeria-motion-replay-${id}.json`,
        format,
        mediaType: "application/json",
      };
    }
    if (format === "trace") return cloneJson(currentTrace);
    if (format === "interval") return createMotionReplayIntervalExport(currentTrace, exportOptions);
    if (format === "focused") return createMotionFocusedDebugExport(currentTrace, exportOptions);
    throw new DiagnosticError("motion-replay-export-not-supported", `Unsupported Motion capture export format: ${format}`, {
      details: { format, supportedFormats: MOTION_REPLAY_EXPORT_FORMATS },
      nextActions: [`Use one of: ${MOTION_REPLAY_EXPORT_FORMATS.join(", ")}`],
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
