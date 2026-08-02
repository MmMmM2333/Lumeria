import { DiagnosticError } from "./diagnosticError.js";
import { createMotionReplayDocument } from "./motionReplayDocument.js";
import { parseMotionReplayTraceJson } from "../components/backgroundDebug/motionReplayViewerModel.js";

export function createMotionDiagnosticSession(options = {}) {
  const createDocument = options.createDocument || createMotionReplayDocument;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  let currentDocument = null;
  let disposed = false;

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("motion-diagnostic-session-disposed", "Motion 诊断会话已经释放", {
        nextActions: ["创建新的 MotionDiagnosticSession"],
      });
    }
  }

  function getDocument() {
    return disposed ? null : currentDocument;
  }

  function status() {
    if (disposed) return { document: null, state: "disposed" };
    if (!currentDocument) return { document: null, state: "empty" };
    return {
      document: {
        createdAt: currentDocument.createdAt,
        id: currentDocument.id,
        schema: currentDocument.schema,
        sourceSchema: currentDocument.sourceSchema,
        summary: currentDocument.summary(),
        timeRange: currentDocument.timeRange(),
      },
      state: "ready",
    };
  }

  function load(trace, loadOptions = {}) {
    ensureActive();
    const nextDocument = createDocument(trace, {
      ...loadOptions,
      now: loadOptions.now || now,
    });
    const previous = currentDocument;
    currentDocument = nextDocument;
    previous?.dispose();
    return nextDocument;
  }

  function loadJson(json, loadOptions = {}) {
    ensureActive();
    const trace = parseMotionReplayTraceJson(json, { maxBytes: loadOptions.maxBytes });
    return load(trace, loadOptions);
  }

  function close() {
    if (disposed || !currentDocument) return status();
    const previous = currentDocument;
    currentDocument = null;
    previous.dispose();
    return status();
  }

  function dispose() {
    if (disposed) return;
    currentDocument?.dispose();
    currentDocument = null;
    disposed = true;
  }

  return Object.freeze({ close, dispose, getDocument, load, loadJson, status });
}

export const motionDiagnosticSession = createMotionDiagnosticSession();
