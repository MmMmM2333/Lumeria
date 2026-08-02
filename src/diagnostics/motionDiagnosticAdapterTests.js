import { createMotionDiagnosticAdapter } from "./motionDiagnosticAdapter.js";

export async function runMotionDiagnosticAdapterTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[motion diagnostic adapter test failed] ${message}`);
  };
  const calls = [];
  let config = {
    enabled: false,
    overlayEnabled: false,
    recordHistory: false,
    timeScale: 1,
  };
  const runtime = {
    clearDebugHistory() {
      calls.push("history.clear");
    },
    configureDebug(patch) {
      calls.push(patch == null ? "config.read" : "config.write");
      if (patch) config = { ...config, ...patch };
      return { ...config };
    },
    debugReport(options) {
      calls.push({ operation: "debugReport", options });
      return { options, version: 1 };
    },
    debugSnapshot(options) {
      calls.push({ operation: "debugSnapshot", options });
      return {
        summary: { activeAnimationCount: 2, warningCount: 1 },
      };
    },
  };
  let captureActive = false;
  const replayCapture = {
    cancel() {
      calls.push("capture.cancel");
      captureActive = false;
      return this.status();
    },
    start(options) {
      calls.push({ operation: "capture.start", options });
      captureActive = true;
      return this.status();
    },
    status() {
      return { active: captureActive, seconds: 30 };
    },
    stop(options) {
      calls.push({ operation: "capture.stop", options });
      captureActive = false;
      return { json: "{}", status: this.status(), trace: { schema: "pixi-motion-replay-trace/v1" } };
    },
  };
  let replayDocument = null;
  const diagnosticSession = {
    close() {
      calls.push("document.close");
      replayDocument = null;
      return this.status();
    },
    getDocument() {
      return replayDocument;
    },
    load(trace, options) {
      calls.push({ operation: "document.load", options, trace });
      replayDocument = {
        analyze: (analysisOptions) => ({ analysisOptions, schema: "analysis" }),
        export: (exportOptions) => ({ exportOptions, format: exportOptions.format }),
        getView: (view, viewOptions) => ({ view, viewOptions }),
        id: options?.id || "loaded-document",
      };
      return replayDocument;
    },
    loadJson(json, options) {
      calls.push({ json, operation: "document.loadJson", options });
      return this.load({ schema: "from-json" }, options);
    },
    status() {
      return replayDocument
        ? { document: { id: replayDocument.id }, state: "ready" }
        : { document: null, state: "empty" };
    },
  };
  const adapter = createMotionDiagnosticAdapter({
    diagnosticSession,
    createReport: (_runtime, options) => {
      calls.push({ operation: "report.generate", options });
      return { content: "# report", mode: options.mode, presentation: options.presentation || "structured" };
    },
    createReplayTrace: (_runtime, options) => {
      calls.push({ operation: "replay.export", options });
      return { schema: "pixi-motion-replay-trace/v1" };
    },
    getOverlaySnapshot: () => ({ itemCount: 3 }),
    replayCapture,
    runtime,
  });

  const descriptor = adapter.describe();
  const operationIds = descriptor.operations.map((operation) => operation.id);
  assert(descriptor.id === "motion" && descriptor.version === 1, "the adapter should expose a stable descriptor");
  assert(operationIds.includes("runtime.configure") && operationIds.includes("report.generate"), "the descriptor should expose canonical runtime and report operations");
  assert(operationIds.includes("report.read"), "the descriptor should separate raw report reads from formatted report generation");
  assert(operationIds.includes("replay.capture.start") && operationIds.includes("replay.capture.stop"), "the descriptor should expose capture lifecycle operations");
  assert(operationIds.includes("replay.document.view") && operationIds.includes("replay.document.analyze"), "the descriptor should expose the shared capture document seam");
  const viewDescriptor = descriptor.operations.find((operation) => operation.id === "replay.document.view");
  assert(viewDescriptor.paramsSchema.properties.view.enum.includes("frame-rows"), "the descriptor should publish exact replay view names");
  assert(!viewDescriptor.paramsSchema.properties.view.enum.includes("frame"), "the descriptor must not publish obsolete replay view aliases");
  assert(!operationIds.includes("summary") && !operationIds.includes("full") && !operationIds.includes("copy"), "the descriptor should not retain command aliases or UI concerns");

  const initialStatus = await adapter.getStatus();
  assert(initialStatus.state === "disabled", "a disabled runtime should report a disabled tool state");
  assert(initialStatus.document.state === "empty", "tool status should expose the shared document session state");
  const statusSnapshotCall = calls.find((entry) => entry?.operation === "debugSnapshot");
  assert(statusSnapshotCall.options.includeHistory !== true, "status should never request heavyweight history");

  const configured = await adapter.invoke("runtime.configure", { enabled: true, recordHistory: true });
  assert(configured.enabled === true && configured.recordHistory === true, "configure should return the applied runtime config");
  const recordingStatus = await adapter.getStatus();
  assert(recordingStatus.state === "recording", "recording history should be visible in the tool state");

  const report = await adapter.invoke("report.generate", { mode: "summary", presentation: "markdown" });
  assert(report.mode === "summary" && report.content === "# report" && report.presentation === "markdown", "report generation should delegate one requested presentation through the canonical operation");
  const rawReport = await adapter.invoke("report.read", { includeHistory: true });
  assert(rawReport.options.includeHistory === true, "raw report reads should preserve explicit heavy-data options");
  const replay = await adapter.invoke("replay.export", { seconds: 5 });
  assert(replay.schema === "pixi-motion-replay-trace/v1", "replay export should return the captured trace as the artifact root");
  assert(replay.json == null, "artifact-backed replay export should not duplicate the trace as serialized JSON");
  const overlay = await adapter.invoke("overlay.snapshot");
  assert(overlay.itemCount === 3, "the adapter should absorb the replaced motionOverlay global path");

  await adapter.invoke("replay.capture.start", { seconds: 10 });
  assert((await adapter.getStatus()).state === "capturing", "an active replay capture should dominate the tool state");
  const stopped = await adapter.invoke("replay.capture.stop", { restore: true });
  assert(stopped.schema === "pixi-motion-replay-trace/v1", "capture stop should make the captured trace the artifact root");
  assert(stopped.json == null, "capture stop should not store trace and JSON copies in the same artifact");
  assert(diagnosticSession.status().document.id === "loaded-document", "capture stop should atomically load the shared capture document");
  assert(calls.some((entry) => entry?.operation === "document.load"), "capture stop should not leave raw trace as a second active source");

  const view = await adapter.invoke("replay.document.view", { options: { timeMs: 50 }, view: "frame-rows" });
  assert(view.view === "frame-rows" && view.viewOptions.timeMs === 50, "document views should be callable through the adapter");
  const analysis = await adapter.invoke("replay.document.analyze", { filters: { query: "icon" } });
  assert(analysis.analysisOptions.filters.query === "icon", "document analysis should preserve options");
  const documentExport = await adapter.invoke("replay.document.export", { format: "json" });
  assert(documentExport.format === "json", "document export should use the document seam");
  await adapter.invoke("replay.document.close");
  assert(diagnosticSession.status().state === "empty", "document close should release the shared capture");
  await adapter.invoke("replay.document.load", { id: "from-object", trace: { schema: "test" } });
  assert(diagnosticSession.status().document.id === "from-object", "document load should accept one explicit trace source");

  await adapter.invoke("history.clear");
  assert(calls.includes("history.clear"), "history clear should delegate exactly once");
  const snapshot = await adapter.invoke("runtime.snapshot", { includeTargets: true });
  assert(snapshot.summary.activeAnimationCount === 2, "runtime snapshots should stay available through the adapter");
  assert(snapshot.config.enabled === true, "runtime snapshots should include the matching applied config in one call");
  assert(snapshot.capture.active === false, "runtime snapshots should include capture state for one-call UI polling");
  assert(snapshot.document.state === "ready", "runtime snapshots should include the shared document state for UI/AI synchronization");

  await adapter.invoke("replay.capture.start", { seconds: 3 });
  await adapter.dispose();
  await adapter.dispose();
  assert(calls.filter((entry) => entry === "capture.cancel").length === 1, "dispose should cancel and restore an active capture exactly once");
  assert(config.enabled === false && config.recordHistory === false && config.timeScale === 1, "dispose should leave shared runtime diagnostics disabled");
  assert(calls.filter((entry) => entry === "document.close").length === 2, "dispose should close the remaining shared document once");

  let unsupported = null;
  try {
    await createMotionDiagnosticAdapter({ replayCapture, runtime }).invoke("full");
  } catch (error) {
    unsupported = error;
  }
  assert(unsupported?.code === "diagnostic-operation-not-supported", "direct adapter misuse should fail with the shared operation code");
}
