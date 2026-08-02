import {
  createMotionFocusedDebugExport,
  formatMotionFocusedDebugMarkdown,
  MOTION_FOCUSED_DEBUG_SCHEMA,
} from "./motionFocusedDebugExportModel.js";

function makeTrace() {
  return {
    capture: {
      profile: {
        id: "default-visual",
        includeEvents: true,
        includeSamples: true,
        label: "Default Visual",
        propAllowlist: ["x", "y", "alpha"],
        targetFilters: {},
      },
      requestedDurationMs: 160,
      sampleHz: 60,
    },
    generatedAt: "2026-06-21T00:00:00.000Z",
    mode: "property-accurate-visual-replay",
    schema: "pixi-motion-replay-trace/v1",
    summary: {
      eventCount: 4,
      frameCount: 4,
      targetCount: 2,
      trackCount: 3,
      valueCount: 12,
      warningCount: 1,
    },
    targets: [{
      kind: "Icon",
      label: "App A",
      layer: "desktop",
      rawTarget: { shouldNotLeak: true },
      sourceLabel: "desktop.icon.node",
      targetId: 1,
      targetPart: "node",
    }, {
      kind: "FolderPanel",
      label: "Folder",
      layer: "folder",
      sourceLabel: "folder.panel",
      targetId: 2,
      targetPart: "panel",
    }],
    timeline: {
      events: [{
        driver: "spring",
        frame: 1,
        lane: "base",
        laneKey: "layout",
        layer: "desktop",
        prop: "x",
        sourceLabel: "desktop.icon.node",
        targetId: 1,
        targetKind: "Icon",
        timeMs: 0,
        to: 100,
        type: "start",
        value: 0,
        velocity: 0,
      }, {
        driver: "spring",
        frame: 2,
        lane: "base",
        laneKey: "layout",
        layer: "desktop",
        prop: "x",
        reason: "replace",
        sourceLabel: "desktop.icon.node",
        targetId: 1,
        targetKind: "Icon",
        timeMs: 50,
        to: 100,
        type: "cancel",
        value: 90,
        velocity: 12,
      }, {
        driver: "tween",
        frame: 3,
        lane: "base",
        laneKey: "fade",
        layer: "desktop",
        prop: "alpha",
        sourceLabel: "desktop.icon.node",
        targetId: 1,
        targetKind: "Icon",
        timeMs: 100,
        to: 0.5,
        type: "complete",
        value: 0.5,
        velocity: 0,
      }, {
        driver: "tween",
        frame: 4,
        lane: "base",
        laneKey: "panel-y",
        layer: "folder",
        prop: "y",
        sourceLabel: "folder.panel",
        targetId: 2,
        targetKind: "FolderPanel",
        timeMs: 150,
        to: 20,
        type: "complete",
        value: 20,
        velocity: 0,
      }],
      frames: [0, 50, 100, 150].map((timeMs, index) => ({
        activeAnimationCount: 3,
        frame: index + 1,
        timeMs,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          targetKind: "Icon",
          to: 100,
          value: Math.min(100, timeMs * 2),
          velocity: timeMs === 50 ? 12 : 0,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "fade",
          layer: "desktop",
          prop: "alpha",
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          targetKind: "Icon",
          to: 0.5,
          value: timeMs >= 100 ? 0.5 : 1,
          velocity: timeMs === 50 ? -2 : 0,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "panel-y",
          layer: "folder",
          prop: "y",
          sourceLabel: "folder.panel",
          targetId: 2,
          targetKind: "FolderPanel",
          to: 20,
          value: Math.min(20, timeMs / 5),
          velocity: timeMs === 50 ? 4 : 0,
        }],
      })),
      timeRangeMs: { max: 150, min: 0 },
    },
    tracks: [{
      driver: "spring",
      eventCount: 2,
      key: "1:x:base:layout",
      lane: "base",
      laneKey: "layout",
      layer: "desktop",
      prop: "x",
      sampleCount: 4,
      sourceLabel: "desktop.icon.node",
      targetId: 1,
    }, {
      driver: "tween",
      eventCount: 1,
      key: "1:alpha:base:fade",
      lane: "base",
      laneKey: "fade",
      layer: "desktop",
      prop: "alpha",
      sampleCount: 4,
      sourceLabel: "desktop.icon.node",
      targetId: 1,
    }, {
      driver: "tween",
      eventCount: 1,
      key: "2:y:base:panel-y",
      lane: "base",
      laneKey: "panel-y",
      layer: "folder",
      prop: "y",
      sampleCount: 4,
      sourceLabel: "folder.panel",
      targetId: 2,
    }],
    version: 1,
    warnings: [{
      laneKey: "layout",
      prop: "x",
      rawTarget: { shouldNotLeak: true },
      sourceLabel: "desktop.icon.node",
      targetId: 1,
      type: "overshoot",
    }],
  };
}

export function runMotionFocusedDebugExportModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion focused debug export model test failed] ${message}`);
  };

  const focusedOptions = {
    captureProfile: {
      id: "custom",
      includeEvents: true,
      includeSamples: true,
      label: "X Focus",
      propAllowlist: ["x"],
      targetFilters: { layers: ["desktop"] },
    },
    filters: { query: "icon" },
    generatedAt: "2026-06-22T00:00:00.000Z",
    interval: { endMs: 60, startMs: 0 },
    bookmark: {
      createdAt: "2026-06-22T00:00:00.000Z",
      endMs: 60,
      id: "bookmark-1",
      label: "retarget window",
      rawTarget: { shouldNotLeak: true },
      startMs: 0,
    },
    selection: {
      lane: "base",
      laneKey: "layout",
      prop: "x",
      targetId: 1,
    },
    visibleTracks: ["1:x:base:layout", "2:y:base:panel-y"],
  };
  const focused = createMotionFocusedDebugExport(makeTrace(), focusedOptions);
  const data = focused.data;
  const serialized = JSON.stringify(data);
  assert(data.schema === MOTION_FOCUSED_DEBUG_SCHEMA, "focused export should expose the focused schema");
  assert(data.version === 1, "focused export should expose a schema version");
  assert(data.context.interval.startMs === 0 && data.context.interval.endMs === 60, "focused export should preserve normalized interval");
  assert(data.context.selection.targetId === 1 && data.context.selection.prop === "x", "focused export should preserve selection context");
  assert(data.context.captureProfile.label === "X Focus", "focused export should include capture profile context");
  assert(data.context.filters.query === "icon", "focused export should include filter context");
  assert(data.context.visibleTracks.length === 2, "focused export should include visible track context");
  assert(data.context.bookmark.label === "retarget window", "focused export should include bookmark context");
  assert(!serialized.includes("shouldNotLeak"), "focused export should not serialize raw bookmark refs");
  assert(data.summary.frameCount === 2, "focused export should include matching frames in interval");
  assert(data.summary.eventCount === 2, "focused export should include matching events in interval");
  assert(data.summary.trackCount === 1 && data.tracks[0].key === "1:x:base:layout", "focused export should keep only matching visible tracks");
  assert(data.summary.targetCount === 1 && data.targets[0].sourceLabel === "desktop.icon.node", "focused export should keep used targets only");
  assert(data.summary.valueCount === 2, "focused export should count matching values");
  assert(data.timeline.frames.every((frame) => frame.values.length === 1), "focused export should filter frame values");
  assert(data.timeline.frames.every((frame) => frame.values[0].prop === "x"), "focused export should only include selected prop");
  assert(data.timeline.events.every((event) => event.prop === "x"), "focused export should only include selected events");
  assert(data.warnings.length === 1 && data.warnings[0].type === "overshoot", "focused export should keep warnings for used targets");
  assert(!serialized.includes("rawTarget"), "focused export should not serialize raw target references");
  assert(focused.presentation === "structured" && !Object.hasOwn(focused, "content"), "structured focused exports should not materialize text copies");
  const focusedMarkdown = createMotionFocusedDebugExport(makeTrace(), { ...focusedOptions, presentation: "markdown" });
  assert(focusedMarkdown.content.includes("Pixi Motion 聚焦调试报告"), "markdown should be readable when requested");
  assert(!Object.hasOwn(focusedMarkdown, "data"), "markdown focused exports should not duplicate structured data");

  const alphaFocused = createMotionFocusedDebugExport(makeTrace(), {
    captureProfile: {
      id: "alpha-focus",
      includeEvents: true,
      includeSamples: true,
      label: "Alpha Focus",
      propAllowlist: ["alpha"],
      targetFilters: { layers: ["desktop"] },
    },
    interval: { endMs: 150, startMs: 0 },
  }).data;
  assert(alphaFocused.summary.trackCount === 1, "capture profile should filter tracks by prop and layer");
  assert(alphaFocused.tracks[0].prop === "alpha", "capture profile should keep alpha track");
  assert(alphaFocused.timeline.frames.every((frame) => frame.values.every((value) => value.prop === "alpha")), "capture profile should filter frame values by prop");
  assert(alphaFocused.timeline.events.every((event) => event.prop === "alpha"), "capture profile should filter events by prop");

  const visibleTrackFocused = createMotionFocusedDebugExport(makeTrace(), {
    interval: { endMs: 150, startMs: 0 },
    visibleTracks: [{ targetId: 2, prop: "y", lane: "base", laneKey: "panel-y" }],
  }).data;
  assert(visibleTrackFocused.summary.trackCount === 1, "visible track objects should filter by track identity");
  assert(visibleTrackFocused.tracks[0].sourceLabel === "folder.panel", "visible track object filtering should keep the matching track");
  assert(visibleTrackFocused.targets[0].targetId === 2, "visible track filtering should keep matching targets");

  const reversedInterval = createMotionFocusedDebugExport(makeTrace(), {
    interval: { endMs: 0, startMs: 150 },
    selection: { sourceLabel: "folder.panel" },
  }).data;
  assert(reversedInterval.context.interval.startMs === 0 && reversedInterval.context.interval.endMs === 150, "interval should normalize reversed bounds");
  assert(reversedInterval.summary.trackCount === 1 && reversedInterval.tracks[0].prop === "y", "selection by sourceLabel should filter tracks");

  const markdown = formatMotionFocusedDebugMarkdown(data);
  assert(markdown.includes(MOTION_FOCUSED_DEBUG_SCHEMA), "standalone markdown formatter should include schema");
  assert(markdown.includes("书签：retarget window"), "standalone markdown formatter should include bookmark context");
  assert(markdown.includes("帧 / 事件：2/2"), "standalone markdown formatter should include summary counts");
}
