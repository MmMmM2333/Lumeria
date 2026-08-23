import { createMotionDiagnosticSession } from "./motionDiagnosticSession.js";
import { DiagnosticError } from "./diagnosticError.js";
import { makeMotionReplayDocumentTestTrace } from "./motionReplayDocumentTests.js";

export function runMotionDiagnosticSessionTests(): void {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[motion diagnostic session test failed] ${message}`);
  }
  const session = createMotionDiagnosticSession({
    now: () => "2026-08-02T02:00:00.000Z",
  });
  assert(session.status().state === "empty", "new sessions should be explicitly empty");
  assert(session.getDocument() == null, "new sessions should not expose a document");

  const first = session.load(makeMotionReplayDocumentTestTrace(), { id: "first" });
  assert(first === session.getDocument(), "load should make one document authoritative for the session");
  const readyStatus = session.status();
  assert(readyStatus.state === "ready" && readyStatus.document?.id === "first", "session status should summarize the active document");
  assert(readyStatus.document.sourceSchema === "pixi-motion-replay-trace/v1", "session status should expose source schema without exporting the document");

  const second = session.load(makeMotionReplayDocumentTestTrace({ generatedAt: "2026-08-02T03:00:00.000Z" }), { id: "second" });
  assert(second.id === "second" && session.getDocument() === second, "a replacement load should atomically replace the active document");
  let firstDisposed: unknown = null;
  try {
    first.summary();
  } catch (error) {
    firstDisposed = error;
  }
  assert(firstDisposed instanceof DiagnosticError && firstDisposed.code === "motion-replay-document-disposed", "replacement should dispose the superseded document");

  session.close();
  assert(session.status().state === "empty" && session.getDocument() == null, "close should release the active document");
  const imported = session.loadJson(JSON.stringify(makeMotionReplayDocumentTestTrace()), { id: "imported" });
  assert(imported.id === "imported" && session.getDocument() === imported, "loadJson should make imported text authoritative without a second state source");
  session.close();
  session.dispose();
  session.dispose();
  assert(session.status().state === "disposed", "dispose should be idempotent and visible in status");
  let disposedLoad: unknown = null;
  try {
    session.load(makeMotionReplayDocumentTestTrace());
  } catch (error) {
    disposedLoad = error;
  }
  assert(disposedLoad instanceof DiagnosticError && disposedLoad.code === "motion-diagnostic-session-disposed", "disposed sessions should reject new captures explicitly");
}
