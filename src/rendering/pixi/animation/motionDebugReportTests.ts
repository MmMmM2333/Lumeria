import { createMotionRuntime, spring, tween, type MotionRuntime } from "./motionRuntime.js";
import { createMotionDebugAIReport } from "./motionDebugReport.js";

function seedRuntime(runtime: MotionRuntime): void {
  const icon = { alpha: 1, scale: { x: 1, y: 1 } };
  const panel = { y: 0 };
  const unnamed = { x: 0 };
  runtime.configureDebug({
    enabled: true,
    maxEvents: 200,
    maxSamples: 200,
    recordHistory: true,
    sampleHz: 60,
  });
  runtime.describeTarget(icon.scale, {
    itemId: "app-a",
    kind: "Icon",
    label: "App A",
    layer: "desktop",
    sourceLabel: "desktop.icon.scale",
  });
  runtime.describeTarget(icon, {
    itemId: "app-a",
    kind: "Icon",
    label: "App A",
    layer: "desktop",
    sourceLabel: "desktop.icon.node",
  });
  runtime.describeTarget(panel, {
    folderId: "folder-a",
    kind: "FolderPanel",
    label: "Folder A panel",
    layer: "folder",
    sourceLabel: "folder.panel",
  });
  runtime.animate(icon.scale, "x", 1.12, {
    driver: tween({ duration: 1, ease: "linear" }),
    from: 1,
    laneKey: "icon-scale-x",
  });
  runtime.animate(icon.scale, "y", 1.12, {
    driver: tween({ duration: 1, ease: "linear" }),
    from: 1,
    laneKey: "icon-scale-y",
  });
  runtime.animate(icon, "alpha", 0.5, {
    driver: tween({ duration: 1, ease: "linear" }),
    from: 1,
    laneKey: "icon-alpha",
  });
  runtime.animate(panel, "y", 120, {
    driver: spring({
      damping: 26,
      mass: 1,
      restDelta: 0.01,
      restSpeed: 0.01,
      stiffness: 220,
    }),
    from: 0,
    laneKey: "panel-y",
  });
  runtime.animate(unnamed, "x", 10, {
    driver: tween({ duration: 1, ease: "linear" }),
    from: 0,
    laneKey: "missing-metadata",
  });
  runtime.step(1 / 60);
}

export function runMotionDebugReportTests() {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`[motion debug report test failed] ${message}`);
  }

  const readErrorCode = (error: unknown): unknown => (
    error && typeof error === "object" && "code" in error ? error.code : undefined
  );

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    seedRuntime(runtime);

    const summary = createMotionDebugAIReport(runtime, { mode: "summary" });
    const markdown = createMotionDebugAIReport(runtime, { mode: "summary", presentation: "markdown" });
    const json = createMotionDebugAIReport(runtime, { mode: "summary", presentation: "json" });

    assert(summary.presentation === "structured", "summary report should use structured presentation by default");
    assert(markdown.presentation === "markdown", "summary Markdown request should return Markdown presentation");
    assert(json.presentation === "json", "summary JSON request should return JSON presentation");
    const data = summary.data;
    assert(markdown.content.includes("# Pixi Motion AI debug report"), "summary report should produce Markdown on request");
    assert(JSON.parse(json.content).schema === "pixi-motion-ai-report/v1", "summary report should produce JSON on request");
    assert(summary.presentation === "structured" && !Object.hasOwn(summary, "content"), "structured reports should not materialize text copies");
    assert(markdown.presentation === "markdown" && !Object.hasOwn(markdown, "data"), "Markdown reports should not duplicate structured data");
    assert(json.presentation === "json" && !Object.hasOwn(json, "data"), "JSON reports should not duplicate structured data");
    assert(data.schema === "pixi-motion-ai-report/v1", "summary JSON should expose the report schema");
    assert(data.mode === "summary", "summary JSON should preserve the mode");
    assert(data.report.animations.length > 0, "summary JSON should include active animations");
    assert(data.report.history == null, "summary report should omit heavy history");
    assert(data.overview.warningCount === 1, "summary overview should include warning counts");
    assert(data.overview.topProps.some((entry) => entry.key === "x"), "summary overview should include top animated props");
    assert(typeof JSON.stringify(data) === "string", "summary report data should remain serializable");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    seedRuntime(runtime);

    const full = createMotionDebugAIReport(runtime, { mode: "full" });
    assert(full.presentation === "structured", "full report should use structured presentation by default");
    const data = full.data;

    assert(data.mode === "full", "full JSON should preserve the mode");
    assert((data.report.history?.events?.length ?? 0) > 0, "full report should include lifecycle history");
    assert((data.report.history?.samples?.length ?? 0) > 0, "full report should include timeline samples");
    assert((data.report.channels?.length ?? 0) > 0, "full report should include channel breakdown");
    assert((data.report.curveStats?.length ?? 0) > 0, "full report should include opt-in curve stats");
    assert(data.report.targets?.some((entry) => entry.sourceLabel === "folder.panel"), "full report should include target metadata");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    seedRuntime(runtime);

    const selected = createMotionDebugAIReport(runtime, {
      mode: "selectedTarget",
      selection: { sourceLabel: "folder.panel" },
    });
    assert(selected.presentation === "structured", "selected report should use structured presentation by default");
    const data = selected.data;

    assert(data.mode === "selectedTarget", "selected target JSON should preserve the mode");
    assert(data.selection?.sourceLabel === "folder.panel", "selected target report should preserve the selection");
    assert(data.report.targets?.length === 1, "selected target report should include only the matching target metadata");
    assert(data.report.targets[0]?.sourceLabel === "folder.panel", "selected target should match the requested source label");
    assert(data.report.animations.length === 1, "selected target report should filter animations to the target");
    assert(data.report.animations[0]?.sourceLabel === "folder.panel", "selected animation should retain its source label");
    assert(data.report.warnings.length === 0, "selected target report should not include unrelated warnings");
    assert(data.curveSummary.tracks.length === 1, "selected target report should include one curve summary track");
    assert(data.curveSummary.tracks[0]?.sourceLabel === "folder.panel", "selected curve summary should retain source label");
    assert((data.curveSummary.tracks[0]?.sampleCount ?? 0) > 0, "selected curve summary should count sampled points");
    assert((data.curveSummary.tracks[0]?.eventCount ?? 0) > 0, "selected curve summary should count lifecycle events");
    assert(!Object.hasOwn(selected, "content"), "selected target structured output should not include generated text internally");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    let invalidModeError = null;
    try {
      createMotionDebugAIReport(runtime, { mode: "typo" });
    } catch (error) {
      invalidModeError = error;
    }
    assert(readErrorCode(invalidModeError) === "diagnostic-params-invalid", "unknown report modes should fail instead of falling back to summary");

    for (const presentation of [false, null, ""]) {
      let invalidPresentationError = null;
      try {
        createMotionDebugAIReport(runtime, { presentation });
      } catch (error) {
        invalidPresentationError = error;
      }
      assert(readErrorCode(invalidPresentationError) === "diagnostic-presentation-invalid", "invalid presentation values should fail instead of falling back to structured");
    }
  }

}
