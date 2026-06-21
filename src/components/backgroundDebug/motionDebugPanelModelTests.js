import {
  buildMotionAnimationRows,
  buildMotionCancelReasonRows,
  buildMotionFilterSummary,
  buildMotionOverviewRows,
  buildMotionPropertyRows,
  buildMotionRuntimeDebugConfig,
  buildMotionTimelineGroups,
  buildMotionWarningRows,
  MOTION_FILTER_PRESETS,
  MOTION_RECORD_WINDOW_CUSTOM,
  normalizeMotionFilterPreset,
  normalizeMotionCustomSeconds,
  normalizeMotionTimeScale,
  resolveMotionRecordWindowMs,
} from "./motionDebugPanelModel.js";

export function runMotionDebugPanelModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion debug panel model test failed] ${message}`);
  };

  assert(resolveMotionRecordWindowMs("10000", 30) === 10000, "preset windows should resolve directly");
  assert(resolveMotionRecordWindowMs("bad", 30) === 30000, "unknown preset should fall back to 30s");
  assert(resolveMotionRecordWindowMs(MOTION_RECORD_WINDOW_CUSTOM, 0) === 1000, "custom window should clamp to 1s");
  assert(resolveMotionRecordWindowMs(MOTION_RECORD_WINDOW_CUSTOM, 999) === 300000, "custom window should clamp to 300s");
  assert(normalizeMotionCustomSeconds("42.4") === 42, "custom seconds should normalize numeric input");
  assert(normalizeMotionTimeScale(-1) === 0, "time scale should clamp to 0");
  assert(normalizeMotionTimeScale(4) === 2, "time scale should clamp to 2");
  assert(MOTION_FILTER_PRESETS.length === 3, "filter presets should expose the MVP preset set");
  assert(normalizeMotionFilterPreset("bad") === "all", "unknown filter preset should normalize to all");

  const config = buildMotionRuntimeDebugConfig({
    customSeconds: 45,
    recordEnabled: true,
    timeScale: 0.5,
    windowPreset: MOTION_RECORD_WINDOW_CUSTOM,
  });
  assert(config.enabled === true, "runtime config should enable motion debug");
  assert(config.recordHistory === true, "runtime config should preserve record toggle");
  assert(config.recordWindowMs === 45000, "runtime config should use the custom window");
  assert(config.sampleHz === 10, "runtime config should use the MVP recording sample rate");
  assert(config.timeScale === 0.5, "runtime config should preserve time scale");

  const report = {
    animations: [{
      driver: "spring",
      lane: "base",
      laneKey: "panel-y",
      prop: "y",
      sourceLabel: "folder.panel",
      targetId: 3,
      to: 120,
      value: 12.345,
      velocity: -5.678,
    }, {
      driver: "tween",
      lane: "additive",
      laneKey: "icon-jiggle-x",
      prop: "x",
      sourceLabel: "desktop.icon.jiggle",
      targetId: 9,
      to: 10,
      value: 4,
      velocity: 2,
    }],
    config: {
      recordHistory: true,
      recordWindowMs: 60000,
      timeScale: 0.5,
    },
    counters: {
      canceledByReason: {
        replace: 2,
        release: 1,
      },
    },
    history: {
      events: [{ type: "start" }],
      samples: [{ activeAnimationCount: 1 }],
    },
    summary: {
      activeAnimationCount: 1,
      activeChannelCount: 1,
      activeTargetCount: 1,
      warningCount: 1,
    },
    warnings: [{
      laneKey: "missing-metadata",
      prop: "x",
      targetId: 7,
      type: "missing-target-metadata",
    }],
  };
  report.history.events = [{
    driver: "spring",
    frame: 1,
    lane: "base",
    laneKey: "panel-y",
    prop: "y",
    sourceLabel: "folder.panel",
    targetId: 3,
    timeMs: 10,
    to: 120,
    type: "start",
    value: 0,
    velocity: 0,
  }, {
    driver: "spring",
    frame: 4,
    lane: "base",
    laneKey: "panel-y",
    prop: "y",
    reason: "replace",
    sourceLabel: "folder.panel",
    targetId: 3,
    timeMs: 80,
    to: 120,
    type: "cancel",
    value: 24,
    velocity: 12,
  }, {
    driver: "tween",
    frame: 2,
    lane: "additive",
    laneKey: "icon-jiggle-x",
    prop: "x",
    sourceLabel: "desktop.icon.jiggle",
    targetId: 9,
    timeMs: 24,
    to: 10,
    type: "start",
    value: 0,
    velocity: 2,
  }];

  const overview = buildMotionOverviewRows(report);
  assert(overview.some((row) => row.label === "record" && row.value === "on"), "overview should expose record state");
  assert(overview.some((row) => row.label === "events/samples" && row.value === "3 / 1"), "overview should expose history counts");
  assert(overview.some((row) => row.label === "timeScale" && row.value === "0.50x"), "overview should expose time scale");

  const animationRows = buildMotionAnimationRows(report);
  assert(animationRows[0].target === "folder.panel", "animation rows should prefer sourceLabel");
  assert(animationRows[0].valueTo === "12.35 -> 120.00", "animation rows should format value to target");
  assert(animationRows[0].lane === "base/panel-y", "animation rows should include lane and laneKey");

  const propertyRows = buildMotionPropertyRows(report, { preset: "all", query: "" });
  assert(propertyRows.length === 2, "property rows should include active animations");
  assert(propertyRows[0].targetProp === "folder.panel.y", "property rows should include target.prop");
  assert(propertyRows[0].delta === "107.66", "property rows should expose to-value delta");
  assert(propertyRows[0].sourceLabel === "folder.panel", "property rows should expose sourceLabel");
  const queriedProperties = buildMotionPropertyRows(report, { preset: "all", query: "jiggle" });
  assert(queriedProperties.length === 1 && queriedProperties[0].laneKey === "icon-jiggle-x", "query filter should narrow property rows");

  const cancelRows = buildMotionCancelReasonRows(report);
  assert(cancelRows[0].key === "replace" && cancelRows[0].value === "2", "cancel reasons should sort by count");
  assert(buildMotionCancelReasonRows({})[0].key === "none", "empty cancel reasons should produce an empty row");

  const warningRows = buildMotionWarningRows(report);
  assert(warningRows[0].key === "missing-target-metadata", "warning rows should include warning type");
  assert(warningRows[0].detail.includes("target 7"), "warning rows should include target identity");

  const timelineGroups = buildMotionTimelineGroups(report, { preset: "all", query: "" });
  assert(timelineGroups.length === 2, "timeline groups should group events by target/lane");
  const panelTimeline = timelineGroups.find((group) => group.label.includes("folder.panel / base/panel-y"));
  assert(panelTimeline, "timeline groups should label target and lane");
  assert(panelTimeline.events[0].type === "cancel", "timeline events should sort newest first inside grouped output");
  assert(panelTimeline.events[0].detail.includes("reason=replace"), "timeline event rows should expose cancel reason");
  const queriedTimeline = buildMotionTimelineGroups(report, { preset: "all", query: "jiggle" });
  assert(queriedTimeline.length === 1 && queriedTimeline[0].label.includes("desktop.icon.jiggle"), "query filter should narrow timeline groups");
  const warningTimeline = buildMotionTimelineGroups(report, { preset: "warnings", query: "" });
  assert(warningTimeline.length === 0, "warnings preset should use warning track keys for timeline filtering");
  const filterSummary = buildMotionFilterSummary(report, { preset: "active", query: "panel" });
  assert(filterSummary.preset === "active", "filter summary should preserve normalized preset");
  assert(filterSummary.text === "1 props / 2 events", "filter summary should count filtered properties and timeline events");
}
