import { createMotionReplayDocument, MOTION_REPLAY_DOCUMENT_SCHEMA } from "./motionReplayDocument.js";

export function makeMotionReplayDocumentTestTrace(overrides = {}) {
  const trace = {
    capture: { requestedDurationMs: 100, sampleHz: 60 },
    generatedAt: "2026-08-02T00:00:00.000Z",
    mode: "property-accurate-visual-replay",
    schema: "pixi-motion-replay-trace/v1",
    summary: {
      eventCount: 2,
      frameCount: 3,
      targetCount: 1,
      trackCount: 1,
      valueCount: 3,
      warningCount: 1,
    },
    targets: [{
      kind: "Icon",
      label: "Test Icon",
      layer: "desktop",
      sourceLabel: "desktop.icon.test",
      targetId: 1,
    }],
    timeline: {
      events: [{
        driver: "spring",
        frame: 0,
        lane: "base",
        laneKey: "layout",
        layer: "desktop",
        prop: "x",
        sourceLabel: "desktop.icon.test",
        targetId: 1,
        timeMs: 0,
        to: 100,
        type: "start",
        value: 0,
        velocity: 0,
      }, {
        driver: "spring",
        frame: 1,
        lane: "base",
        laneKey: "layout",
        layer: "desktop",
        prop: "x",
        reason: "replace",
        sourceLabel: "desktop.icon.test",
        targetId: 1,
        timeMs: 50,
        to: 120,
        type: "retarget",
        value: 80,
        velocity: 12,
      }],
      frames: [0, 50, 100].map((timeMs, frame) => ({
        activeAnimationCount: 1,
        frame,
        timeMs,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.test",
          targetId: 1,
          to: frame === 0 ? 100 : 120,
          value: frame === 0 ? 0 : frame === 1 ? 80 : 125,
          velocity: frame === 1 ? 12 : 0,
        }],
      })),
      timeRangeMs: { max: 100, min: 0 },
    },
    tracks: [{
      driver: "spring",
      key: "1:x:base:layout",
      lane: "base",
      laneKey: "layout",
      layer: "desktop",
      prop: "x",
      sampleCount: 3,
      sourceLabel: "desktop.icon.test",
      targetId: 1,
    }],
    version: 1,
    warnings: [{
      lane: "base",
      laneKey: "layout",
      prop: "x",
      sourceLabel: "desktop.icon.test",
      targetId: 1,
      type: "overshoot",
    }],
  };
  return { ...trace, ...overrides };
}

export function runMotionReplayDocumentTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[motion replay document test failed] ${message}`);
  };
  const rawTrace = makeMotionReplayDocumentTestTrace();
  const document = createMotionReplayDocument(rawTrace, {
    id: "capture-test",
    now: () => "2026-08-02T01:00:00.000Z",
  });

  assert(document.schema === MOTION_REPLAY_DOCUMENT_SCHEMA, "documents should expose their stable interface schema");
  assert(document.sourceSchema === "pixi-motion-replay-trace/v1", "documents should expose the immutable source trace schema without exporting raw data");
  assert(document.id === "capture-test", "documents should preserve an explicit stable id");
  const summary = document.summary();
  assert(summary.frameCount === 3 && summary.valueCount === 3, "summary should expose capture facts without raw trace access");
  assert(summary.durationMs === 100 && summary.warningCount === 1, "summary should include duration and warning facts");
  assert(JSON.stringify(document.timeRange()) === JSON.stringify({ max: 100, min: 0 }), "timeRange should expose normalized bounds");

  rawTrace.schema = "mutated-after-load";
  rawTrace.timeline.frames[1].values[0].value = -999;
  assert(document.getView("frame-rows", { timeMs: 50 })[0].value !== -999, "the document should own normalized capture facts after load");
  assert(document.getView("overview", { timeMs: 50 }).length > 0, "overview should be available through the view seam");
  assert(document.getView("event-rows", { timeMs: 50 }).length > 0, "event rows should be available through the view seam");
  assert(document.getView("curve-groups", { timeMs: 50 }).length === 1, "curve groups should be available through the view seam");
  assert(document.getView("overlay-rows", { timeMs: 50 }).length === 1, "overlay rows should be available through the view seam");
  assert(document.getView("track-chart", { cursorTimeMs: 50 }).summary.trackCount === 1, "track charts should be available through the view seam");
  assert(document.getView("inspector", { selectedTimeMs: 50 }).current.value === 80, "inspectors should be available through the view seam");
  assert(document.getView("time.normalize", { timeMs: 999 }) === 100, "time normalization should clamp through the document");
  assert(document.getView("step.frame", { direction: "next", timeMs: 0 }) === 50, "frame stepping should use document indexes");
  assert(document.getView("step.event", { direction: "next", timeMs: 0 })?.timeMs === 50, "event stepping should use document indexes");
  assert(document.getView("step.frame", { direction: "previous", timeMs: 100 }) === 50, "previous frame stepping should move from an exact final timestamp");
  assert(document.getView("step.event", { direction: "previous", timeMs: 50 })?.timeMs === 0, "previous event stepping should move from an exact final event timestamp");

  const firstCurves = document.getView("curve-groups", { filters: {}, timeMs: 25 });
  const secondCurves = document.getView("curve-groups", { filters: {}, timeMs: 75 });
  assert(firstCurves[0].valuePath === secondCurves[0].valuePath, "cursor-only curve reads should reuse structural paths");
  assert(firstCurves[0].cursorX !== secondCurves[0].cursorX, "cursor-only curve reads should still update cursor position");

  const analysis = document.analyze({ filters: {} });
  assert(analysis.schema === "lumeria-motion-replay-analysis/v1", "analysis should expose a stable result schema");
  assert(analysis.findings.some((finding) => finding.code === "motion.overshoot"), "analysis should retain structured anomaly evidence from the capture");
  assert(analysis.findings.every((finding) => Array.isArray(finding.evidence) && Array.isArray(finding.counterEvidence)), "all findings should expose evidence and counter-evidence");
  assert(analysis.summary.headline.includes("需关注"), "analysis should expose a readable Chinese summary");
  const markdownAnalysis = document.analyze({ format: "markdown" });
  assert(markdownAnalysis.format === "markdown" && markdownAnalysis.content.includes("## 诊断发现"), "documents should provide a readable Markdown analysis without changing the structured schema");

  const jsonExport = document.export({ format: "json" });
  assert(jsonExport.mediaType === "application/json", "JSON export should describe its media type");
  assert(JSON.parse(jsonExport.content).schema === "pixi-motion-replay-trace/v1", "JSON export should retain the source trace schema");
  const intervalExport = document.export({ endMs: 75, format: "interval", startMs: 25 });
  assert(intervalExport.data.timeline.frames.every((frame) => frame.timeMs >= 25 && frame.timeMs <= 75), "interval export should stay inside requested bounds");
  assert(!Object.hasOwn(intervalExport, "content"), "structured interval exports should not materialize a text duplicate");
  const intervalJsonExport = document.export({ endMs: 75, format: "interval", presentation: "json", startMs: 25 });
  assert(!Object.hasOwn(intervalJsonExport, "data") && JSON.parse(intervalJsonExport.content).summary.frameCount > 0, "JSON interval exports should contain only the requested presentation");
  const focusedExport = document.export({ format: "focused", interval: { endMs: 75, startMs: 25 } });
  assert(focusedExport.data.context.interval.startMs === 25, "focused export should preserve the requested context");

  let unknownViewError = null;
  try {
    document.getView("unknown");
  } catch (error) {
    unknownViewError = error;
  }
  assert(unknownViewError?.code === "motion-replay-view-not-found", "unknown views should fail with a stable code");

  document.dispose();
  document.dispose();
  let disposedError = null;
  try {
    document.summary();
  } catch (error) {
    disposedError = error;
  }
  assert(disposedError?.code === "motion-replay-document-disposed", "disposed documents should fail explicitly");

  let schemaError = null;
  try {
    createMotionReplayDocument({ schema: "unsupported" });
  } catch (error) {
    schemaError = error;
  }
  assert(schemaError?.code === "motion-replay-schema-not-supported" && /不支持/.test(schemaError?.message || ""), "document construction should reject unsupported source schemas with a stable readable error");
}
