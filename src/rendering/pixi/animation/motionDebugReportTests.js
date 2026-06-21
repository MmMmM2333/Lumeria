import { createMotionRuntime, spring, tween } from "./motionRuntime.js";
import {
  createMotionDebugAIReport,
  installMotionDebugGlobal,
  MOTION_DEBUG_GLOBAL_KEY,
} from "./motionDebugReport.js";

function parseReportJson(report) {
  return JSON.parse(report.json);
}

function seedRuntime(runtime) {
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
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[motion debug report test failed] ${message}`);
  };

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    seedRuntime(runtime);

    const summary = createMotionDebugAIReport(runtime, { mode: "summary" });
    const data = parseReportJson(summary);

    assert(summary.markdown.includes("# Pixi Motion Debug AI Report"), "summary report should produce Markdown");
    assert(summary.copyText.includes("```json"), "summary copy text should include a fenced JSON payload");
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
    const data = parseReportJson(full);

    assert(data.mode === "full", "full JSON should preserve the mode");
    assert(data.report.history?.events?.length > 0, "full report should include lifecycle history");
    assert(data.report.history?.samples?.length > 0, "full report should include timeline samples");
    assert(data.report.channels?.length > 0, "full report should include channel breakdown");
    assert(data.report.targets?.some((entry) => entry.sourceLabel === "folder.panel"), "full report should include target metadata");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    seedRuntime(runtime);

    const selected = createMotionDebugAIReport(runtime, {
      mode: "selectedTarget",
      selection: { sourceLabel: "folder.panel" },
    });
    const data = parseReportJson(selected);

    assert(data.mode === "selectedTarget", "selected target JSON should preserve the mode");
    assert(data.selection.sourceLabel === "folder.panel", "selected target report should preserve the selection");
    assert(data.report.targets.length === 1, "selected target report should include only the matching target metadata");
    assert(data.report.targets[0].sourceLabel === "folder.panel", "selected target should match the requested source label");
    assert(data.report.animations.length === 1, "selected target report should filter animations to the target");
    assert(data.report.animations[0].sourceLabel === "folder.panel", "selected animation should retain its source label");
    assert(data.report.warnings.length === 0, "selected target report should not include unrelated warnings");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false, maxDeltaSeconds: 1 });
    const target = {};

    assert(installMotionDebugGlobal({ dev: false, runtime, target }) == null, "global commands should not install outside dev mode");
    assert(target[MOTION_DEBUG_GLOBAL_KEY] == null, "non-dev install should not mutate the target");

    seedRuntime(runtime);
    const commands = installMotionDebugGlobal({ dev: true, runtime, target });

    assert(target[MOTION_DEBUG_GLOBAL_KEY] === commands, "dev install should expose global motion debug commands");
    assert(typeof commands.summary === "function", "global commands should expose summary report");
    assert(typeof commands.full === "function", "global commands should expose full report");
    assert(typeof commands.selectedTarget === "function", "global commands should expose selected target report");
    assert(typeof commands.configure === "function", "global commands should expose runtime configuration");
    assert(JSON.parse(commands.summary().json).mode === "summary", "global summary should return parseable report JSON");
    assert(JSON.parse(commands.full().json).mode === "full", "global full should return parseable report JSON");
    assert(
      JSON.parse(commands.selectedTarget({ sourceLabel: "folder.panel" }).json).report.targets[0].sourceLabel === "folder.panel",
      "global selected target should return the requested target",
    );

    commands.uninstall();
    assert(target[MOTION_DEBUG_GLOBAL_KEY] == null, "global commands should uninstall cleanly");
  }
}
