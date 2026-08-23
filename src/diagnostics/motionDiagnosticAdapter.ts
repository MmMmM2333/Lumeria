import { unsupportedDiagnosticOperation, DiagnosticError } from "./diagnosticError.js";
import { createMotionDebugAIReport } from "../rendering/motionPort.js";
import {
  createMotionReplayCaptureController,
  createMotionReplayTraceFromRuntime,
} from "../rendering/motionPort.js";
import { motionRuntime } from "../rendering/motionPort.js";
import { motionDiagnosticSession } from "./motionDiagnosticSession.js";
import {
  MOTION_REPLAY_DOCUMENT_VIEWS,
  MOTION_REPLAY_EXPORT_FORMATS,
} from "./motionReplayDocument.js";
import type { DiagnosticAdapter, DiagnosticParams, DiagnosticToolDescriptor } from "./diagnosticProtocol.js";

type UnknownRecord = Record<string, unknown>;
type MotionRuntimeContract = typeof motionRuntime;

interface MotionReplayCapturePort {
  cancel?: (options?: DiagnosticParams) => unknown | Promise<unknown>;
  start(options?: DiagnosticParams): unknown | Promise<unknown>;
  status(): Readonly<{ active: boolean }> | Promise<Readonly<{ active: boolean }>>;
  stop(options?: DiagnosticParams): Readonly<{ trace: unknown }> | Promise<Readonly<{ trace: unknown }>>;
}

interface MotionReplayDocumentPort {
  analyze(options: DiagnosticParams): unknown;
  export(options: DiagnosticParams): unknown;
  getView(view: string, options: DiagnosticParams): unknown;
  readonly id: string;
}

interface MotionDiagnosticSessionPort {
  close(): unknown;
  getDocument(): MotionReplayDocumentPort | null;
  load(trace: unknown, options?: DiagnosticParams): MotionReplayDocumentPort;
  loadJson(json: unknown, options?: DiagnosticParams): MotionReplayDocumentPort;
  status(): unknown;
}

type MotionReportFactory = (runtime: MotionRuntimeContract, params: DiagnosticParams) => unknown | Promise<unknown>;
type MotionReplayTraceFactory = (runtime: MotionRuntimeContract, params: DiagnosticParams) => unknown | Promise<unknown>;

interface MotionDiagnosticAdapterOptions {
  readonly createReplayTrace?: MotionReplayTraceFactory;
  readonly createReport?: MotionReportFactory;
  readonly diagnosticSession?: MotionDiagnosticSessionPort;
  readonly getOverlaySnapshot?: (() => unknown | Promise<unknown>) | null;
  readonly replayCapture?: unknown;
  readonly runtime?: unknown;
}

export type MotionDiagnosticAdapter = DiagnosticAdapter;

const MOTION_DIAGNOSTIC_DESCRIPTOR = Object.freeze({
  descriptionKey: "diagnostics.tools.motion.description",
  id: "motion",
  operations: Object.freeze([
    { id: "runtime.configure", mutatesState: true, resultSize: "small" },
    { id: "runtime.snapshot", mutatesState: false, resultSize: "medium" },
    { id: "history.clear", mutatesState: true, resultSize: "small" },
    { id: "report.read", mutatesState: false, resultSize: "large" },
    {
      id: "report.generate",
      mutatesState: false,
      paramsSchema: {
        properties: {
          mode: { enum: ["summary", "full", "selectedTarget"] },
          presentation: { enum: ["structured", "json", "markdown"] },
        },
        type: "object",
      },
      resultSize: "large",
    },
    { id: "replay.capture.start", mutatesState: true, resultSize: "small" },
    { id: "replay.capture.stop", mutatesState: true, resultSize: "large" },
    { id: "replay.export", mutatesState: false, resultSize: "large" },
    { id: "replay.document.status", mutatesState: false, resultSize: "small" },
    { id: "replay.document.load", mutatesState: true, resultSize: "small" },
    {
      id: "replay.document.view",
      mutatesState: false,
      paramsSchema: {
        properties: {
          options: { type: "object" },
          view: { enum: MOTION_REPLAY_DOCUMENT_VIEWS },
        },
        required: ["view"],
        type: "object",
      },
      resultSize: "large",
    },
    {
      id: "replay.document.analyze",
      mutatesState: false,
      paramsSchema: {
        properties: { format: { enum: ["structured", "markdown", "text"] } },
        type: "object",
      },
      resultSize: "large",
    },
    {
      id: "replay.document.export",
      mutatesState: false,
      paramsSchema: {
        properties: {
          format: { enum: MOTION_REPLAY_EXPORT_FORMATS },
          presentation: { enum: ["structured", "json", "markdown"] },
        },
        type: "object",
      },
      resultSize: "large",
    },
    { id: "replay.document.close", mutatesState: true, resultSize: "small" },
    { id: "overlay.snapshot", mutatesState: false, resultSize: "medium" },
  ] as const),
  titleKey: "diagnostics.tools.motion.title",
  version: 1,
} as const) satisfies DiagnosticToolDescriptor;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function requireParams(value: unknown, operation: string): DiagnosticParams {
  const record = asRecord(value);
  if (record) return record;
  throw new DiagnosticError("diagnostic-params-invalid", `${operation} params must be an object`, {
    details: { receivedType: Array.isArray(value) ? "array" : typeof value },
    nextActions: ["Call describe(toolId) to inspect the operation paramsSchema"],
  });
}

function requireRuntime(runtime: unknown): asserts runtime is MotionRuntimeContract {
  const record = asRecord(runtime);
  for (const method of ["configureDebug", "debugReport", "debugSnapshot", "clearDebugHistory"]) {
    if (!record || typeof record[method] !== "function") {
      throw new TypeError(`Motion diagnostic adapter requires runtime.${method}()`);
    }
  }
}

function requireReplayCapture(value: unknown): asserts value is MotionReplayCapturePort {
  const record = asRecord(value);
  for (const method of ["start", "status", "stop"]) {
    if (!record || typeof record[method] !== "function") {
      throw new TypeError(`Motion diagnostic adapter requires replayCapture.${method}()`);
    }
  }
}

function requireDiagnosticSession(value: unknown): asserts value is MotionDiagnosticSessionPort {
  const record = asRecord(value);
  for (const method of ["close", "getDocument", "load", "loadJson", "status"]) {
    if (!record || typeof record[method] !== "function") {
      throw new TypeError(`Motion diagnostic adapter requires diagnosticSession.${method}()`);
    }
  }
}

export function createMotionDiagnosticAdapter(
  options: MotionDiagnosticAdapterOptions = {},
): MotionDiagnosticAdapter {
  const runtime = options.runtime || motionRuntime;
  const createReport = options.createReport || createMotionDebugAIReport;
  const createReplayTrace = options.createReplayTrace || createMotionReplayTraceFromRuntime;
  const diagnosticSession: MotionDiagnosticSessionPort = options.diagnosticSession || motionDiagnosticSession;
  const getOverlaySnapshot = options.getOverlaySnapshot || null;
  let disposed = false;
  requireRuntime(runtime);
  const checkedRuntime: MotionRuntimeContract = runtime;
  const replayCapture = options.replayCapture || createMotionReplayCaptureController(checkedRuntime);
  requireReplayCapture(replayCapture);
  const checkedReplayCapture: MotionReplayCapturePort = replayCapture;
  requireDiagnosticSession(diagnosticSession);

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("diagnostic-tool-disposed", "The Motion diagnostic tool has been disposed", {
        nextActions: ["Wait for the runtime to reinstall the diagnostic entry point"],
      });
    }
  }

  function describe() {
    return MOTION_DIAGNOSTIC_DESCRIPTOR;
  }

  async function getStatus() {
    ensureActive();
    const config = await checkedRuntime.configureDebug();
    const capture = await checkedReplayCapture.status();
    const snapshot = await checkedRuntime.debugSnapshot({
      includeChannels: false,
      includeTargets: false,
    });
    const state = capture.active
      ? "capturing"
      : !config.enabled
        ? "disabled"
        : config.recordHistory
          ? "recording"
          : "ready";
    return {
      capture,
      config,
      document: diagnosticSession.status(),
      state,
      summary: snapshot?.summary || {},
    };
  }

  async function invoke(operation: string, paramsValue: unknown = {}) {
    ensureActive();
    const params = requireParams(paramsValue, operation);
    switch (operation) {
      case "runtime.configure":
        return checkedRuntime.configureDebug(params);
      case "runtime.snapshot": {
        const config = await checkedRuntime.configureDebug();
        const capture = await checkedReplayCapture.status();
        const snapshot = await checkedRuntime.debugSnapshot(params);
        return { ...snapshot, capture, config, document: diagnosticSession.status() };
      }
      case "history.clear":
        checkedRuntime.clearDebugHistory();
        return getStatus();
      case "report.read":
        return checkedRuntime.debugReport(params);
      case "report.generate":
        return createReport(checkedRuntime, params);
      case "replay.capture.start":
        return checkedReplayCapture.start(params);
      case "replay.capture.stop": {
        const result = await checkedReplayCapture.stop(params);
        diagnosticSession.load(result.trace);
        return result.trace;
      }
      case "replay.export": {
        const trace = await createReplayTrace(checkedRuntime, params);
        return trace;
      }
      case "replay.document.status":
        return diagnosticSession.status();
      case "replay.document.load": {
        const hasTrace = params.trace != null;
        const hasJson = params.json != null;
        if (hasTrace === hasJson) {
          throw new DiagnosticError("diagnostic-params-invalid", "Loading a Motion capture document requires exactly one of trace or json", {
            details: { hasJson, hasTrace },
            nextActions: ["Pass either trace or json, but not both"],
          });
        }
        const { json, trace, ...loadOptions } = params;
        const document = hasJson
          ? diagnosticSession.loadJson(json, loadOptions)
          : diagnosticSession.load(trace, loadOptions);
        return {
          id: document.id,
          status: diagnosticSession.status(),
        };
      }
      case "replay.document.view": {
        const document = diagnosticSession.getDocument();
        if (!document) {
          throw new DiagnosticError("motion-replay-document-missing", "No Motion capture document is currently loaded", {
            nextActions: ["Call replay.document.load or complete replay.capture.stop first"],
          });
        }
        const viewOptions = params.options == null
          ? {}
          : requireParams(params.options, operation);
        return document.getView(String(params.view || ""), viewOptions);
      }
      case "replay.document.analyze": {
        const document = diagnosticSession.getDocument();
        if (!document) {
          throw new DiagnosticError("motion-replay-document-missing", "No Motion capture document is currently loaded", {
            nextActions: ["Call replay.document.load or complete replay.capture.stop first"],
          });
        }
        return document.analyze(params);
      }
      case "replay.document.export": {
        const document = diagnosticSession.getDocument();
        if (!document) {
          throw new DiagnosticError("motion-replay-document-missing", "No Motion capture document is currently loaded", {
            nextActions: ["Call replay.document.load or complete replay.capture.stop first"],
          });
        }
        return document.export(params);
      }
      case "replay.document.close":
        return diagnosticSession.close();
      case "overlay.snapshot":
        if (typeof getOverlaySnapshot !== "function") {
          throw new DiagnosticError("diagnostic-capability-unavailable", "The Motion overlay snapshot is currently unavailable", {
            nextActions: ["Confirm the Pixi desktop surface is mounted"],
          });
        }
        return getOverlaySnapshot();
      default:
        throw unsupportedDiagnosticOperation("motion", operation);
    }
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    try {
      const status = await checkedReplayCapture.status();
      if (status.active) {
        if (typeof checkedReplayCapture.cancel === "function") await checkedReplayCapture.cancel({ restore: true });
        else await checkedReplayCapture.stop({ restore: true });
      }
    } finally {
      try {
        diagnosticSession.close();
      } finally {
        await checkedRuntime.configureDebug({
          enabled: false,
          overlayEnabled: false,
          recordHistory: false,
          timeScale: 1,
        });
      }
    }
  }

  return Object.freeze({ describe, dispose, getStatus, invoke });
}
