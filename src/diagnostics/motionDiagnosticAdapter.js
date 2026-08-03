import { unsupportedDiagnosticOperation, DiagnosticError } from "./diagnosticError.js";
import { createMotionDebugAIReport } from "../rendering/pixi/animation/motionDebugReport.js";
import {
  createMotionReplayCaptureController,
  createMotionReplayTraceFromRuntime,
} from "../rendering/pixi/animation/motionReplayTrace.js";
import { motionRuntime } from "../rendering/pixi/animation/motionRuntime.js";
import { motionDiagnosticSession } from "./motionDiagnosticSession.js";
import {
  MOTION_REPLAY_DOCUMENT_VIEWS,
  MOTION_REPLAY_EXPORT_FORMATS,
} from "./motionReplayDocument.js";

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
  ]),
  titleKey: "diagnostics.tools.motion.title",
  version: 1,
});

function requireRuntime(runtime) {
  for (const method of ["configureDebug", "debugReport", "debugSnapshot", "clearDebugHistory"]) {
    if (typeof runtime?.[method] !== "function") {
      throw new TypeError(`Motion diagnostic adapter requires runtime.${method}()`);
    }
  }
}

export function createMotionDiagnosticAdapter(options = {}) {
  const runtime = options.runtime || motionRuntime;
  const createReport = options.createReport || createMotionDebugAIReport;
  const createReplayTrace = options.createReplayTrace || createMotionReplayTraceFromRuntime;
  const replayCapture = options.replayCapture || createMotionReplayCaptureController(runtime);
  const diagnosticSession = options.diagnosticSession || motionDiagnosticSession;
  const getOverlaySnapshot = options.getOverlaySnapshot || null;
  let disposed = false;
  requireRuntime(runtime);
  for (const method of ["close", "getDocument", "load", "loadJson", "status"]) {
    if (typeof diagnosticSession?.[method] !== "function") {
      throw new TypeError(`Motion diagnostic adapter requires diagnosticSession.${method}()`);
    }
  }

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
    const config = await runtime.configureDebug();
    const capture = await replayCapture.status();
    const snapshot = await runtime.debugSnapshot({
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

  async function invoke(operation, params = {}) {
    ensureActive();
    switch (operation) {
      case "runtime.configure":
        return runtime.configureDebug(params);
      case "runtime.snapshot": {
        const config = await runtime.configureDebug();
        const capture = await replayCapture.status();
        const snapshot = await runtime.debugSnapshot(params);
        return { ...snapshot, capture, config, document: diagnosticSession.status() };
      }
      case "history.clear":
        runtime.clearDebugHistory();
        return getStatus();
      case "report.read":
        return runtime.debugReport(params);
      case "report.generate":
        return createReport(runtime, params);
      case "replay.capture.start":
        return replayCapture.start(params);
      case "replay.capture.stop": {
        const result = await replayCapture.stop(params);
        diagnosticSession.load(result.trace);
        return result.trace;
      }
      case "replay.export": {
        const trace = await createReplayTrace(runtime, params);
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
        return document.getView(String(params.view || ""), params.options || {});
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
      const status = await replayCapture.status();
      if (status.active) {
        if (typeof replayCapture.cancel === "function") await replayCapture.cancel({ restore: true });
        else await replayCapture.stop({ restore: true });
      }
    } finally {
      try {
        diagnosticSession.close();
      } finally {
        await runtime.configureDebug({
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
