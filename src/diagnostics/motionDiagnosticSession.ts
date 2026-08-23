import { DiagnosticError } from "./diagnosticError.js";
import { createMotionReplayDocument } from "./motionReplayDocument.js";
import type {
  MotionReplayDocument,
  MotionReplayDocumentOptions,
  MotionReplayDocumentSummary,
} from "./motionReplayDocument.js";
import { parseMotionReplayTraceJson } from "../components/backgroundDebug/motionReplayViewerModel.js";

export interface MotionDiagnosticLoadOptions extends MotionReplayDocumentOptions {
  readonly maxBytes?: unknown;
}

export type MotionDiagnosticSessionState = "disposed" | "empty" | "ready";

export interface MotionDiagnosticSessionStatus {
  readonly document: Readonly<{
    createdAt: string;
    id: string;
    schema: string;
    sourceSchema: string;
    summary: MotionReplayDocumentSummary;
    timeRange: Readonly<{ max: number; min: number }>;
  }> | null;
  readonly state: MotionDiagnosticSessionState;
}

export interface MotionDiagnosticSession {
  close(): MotionDiagnosticSessionStatus;
  dispose(): void;
  getDocument(): MotionReplayDocument | null;
  load(trace: unknown, options?: MotionDiagnosticLoadOptions): MotionReplayDocument;
  loadJson(json: unknown, options?: MotionDiagnosticLoadOptions): MotionReplayDocument;
  status(): MotionDiagnosticSessionStatus;
}

interface MotionDiagnosticSessionOptions {
  readonly createDocument?: (
    trace: unknown,
    options?: MotionReplayDocumentOptions,
  ) => MotionReplayDocument;
  readonly now?: () => unknown;
}

export function createMotionDiagnosticSession(
  options: MotionDiagnosticSessionOptions = {},
): MotionDiagnosticSession {
  const createDocument = options.createDocument || createMotionReplayDocument;
  const now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
  let currentDocument: MotionReplayDocument | null = null;
  let disposed = false;

  function ensureActive() {
    if (disposed) {
      throw new DiagnosticError("motion-diagnostic-session-disposed", "The Motion diagnostic session has been disposed", {
        nextActions: ["Create a new MotionDiagnosticSession"],
      });
    }
  }

  function getDocument(): MotionReplayDocument | null {
    return disposed ? null : currentDocument;
  }

  function status(): MotionDiagnosticSessionStatus {
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

  function load(trace: unknown, loadOptions: MotionDiagnosticLoadOptions = {}): MotionReplayDocument {
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

  function loadJson(json: unknown, loadOptions: MotionDiagnosticLoadOptions = {}): MotionReplayDocument {
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
