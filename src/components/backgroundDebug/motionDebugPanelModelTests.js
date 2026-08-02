import {
  buildMotionAnimationRows,
  buildMotionCancelReasonRows,
  buildMotionFilterSummary,
  buildMotionCurveChartGroups,
  buildMotionLayerTreeRows,
  buildMotionOverviewRows,
  buildMotionPropertyRows,
  buildMotionReplayCaptureRows,
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
  const replayRows = buildMotionReplayCaptureRows(
    { active: true, sampleHz: 60, seconds: 12 },
    {
      capture: { requestedDurationMs: 12000, sampleHz: 60 },
      schema: "pixi-motion-replay-trace/v1",
      summary: { eventCount: 8, frameCount: 16, targetCount: 3, trackCount: 4 },
    },
    {
      actualBytes: 4096,
      estimate: { eventCount: 8, frameCount: 16, jsonSizeLabel: "4.0 KB" },
      profile: { id: "alpha-focus", label: "Alpha Focus" },
    },
  );
  assert(replayRows.some((row) => row.label === "捕获状态" && row.value === "捕获中"), "replay rows should expose capture active state");
  assert(replayRows.some((row) => row.label === "捕获配置" && row.value === "Alpha Focus"), "replay rows should expose capture profile");
  assert(replayRows.some((row) => row.label === "捕获窗口" && row.value === "12s"), "replay rows should expose capture window");
  assert(replayRows.some((row) => row.label === "采样率" && row.value === "60Hz"), "replay rows should expose capture sample rate");
  assert(replayRows.some((row) => row.label === "预计规模" && row.value === "16f / 8e / 4.0 KB"), "replay rows should expose estimated capture size");
  assert(replayRows.some((row) => row.label === "实际 JSON" && row.value === "4.0 KB"), "replay rows should expose actual trace JSON size");
  assert(replayRows.some((row) => row.label === "帧 / 事件" && row.value === "16 / 8"), "replay rows should expose trace frame/event counts");
  assert(replayRows.some((row) => row.label === "协议" && row.value === "pixi-motion-replay-trace/v1"), "replay rows should expose trace schema");

  const disabledConfig = buildMotionRuntimeDebugConfig({
    overlayEnabled: true,
    recordEnabled: true,
  });
  assert(disabledConfig.enabled === false, "runtime config should keep motion debug disabled by default");
  assert(disabledConfig.overlayEnabled === false, "runtime config should gate overlay behind Enable");
  assert(disabledConfig.recordHistory === false, "runtime config should gate recording behind Enable");

  const config = buildMotionRuntimeDebugConfig({
    customSeconds: 45,
    enabled: true,
    overlayEnabled: true,
    recordEnabled: true,
    timeScale: 0.5,
    windowPreset: MOTION_RECORD_WINDOW_CUSTOM,
  });
  assert(config.enabled === true, "runtime config should enable motion debug");
  assert(config.overlayEnabled === true, "runtime config should preserve overlay toggle");
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
      overlayEnabled: true,
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
    targets: [{
      kind: "FolderPanel",
      label: "Folder A panel",
      layer: "folder",
      sourceLabel: "folder.panel",
      targetId: 3,
    }, {
      kind: "Icon",
      label: "App A",
      layer: "desktop",
      sourceLabel: "desktop.icon.jiggle",
      targetId: 9,
    }, {
      kind: "Icon",
      label: "Idle App",
      layer: "desktop",
      sourceLabel: "desktop.icon.idle",
      targetId: 12,
    }],
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
  report.history.samples = [{
    activeAnimationCount: 2,
    frame: 1,
    timeMs: 0,
    animations: [{
      driver: "spring",
      from: 0,
      lane: "base",
      laneKey: "panel-y",
      prop: "y",
      sourceLabel: "folder.panel",
      targetId: 3,
      to: 120,
      value: 0,
      velocity: 0,
    }, {
      driver: "tween",
      from: 0,
      lane: "additive",
      laneKey: "icon-jiggle-x",
      prop: "x",
      sourceLabel: "desktop.icon.jiggle",
      targetId: 9,
      to: 10,
      value: 0,
      velocity: 2,
    }],
  }, {
    activeAnimationCount: 2,
    frame: 2,
    timeMs: 50,
    animations: [{
      driver: "spring",
      from: 0,
      lane: "base",
      laneKey: "panel-y",
      prop: "y",
      sourceLabel: "folder.panel",
      targetId: 3,
      to: 120,
      value: 60,
      velocity: 8,
    }, {
      driver: "tween",
      from: 0,
      lane: "additive",
      laneKey: "icon-jiggle-x",
      prop: "x",
      sourceLabel: "desktop.icon.jiggle",
      targetId: 9,
      to: 10,
      value: 5,
      velocity: 2,
    }],
  }, {
    activeAnimationCount: 2,
    frame: 3,
    timeMs: 100,
    animations: [{
      driver: "spring",
      from: 0,
      lane: "base",
      laneKey: "panel-y",
      prop: "y",
      sourceLabel: "folder.panel",
      targetId: 3,
      to: 120,
      value: 90,
      velocity: 4,
    }, {
      driver: "tween",
      from: 0,
      lane: "additive",
      laneKey: "icon-jiggle-x",
      prop: "x",
      sourceLabel: "desktop.icon.jiggle",
      targetId: 9,
      to: 10,
      value: 10,
      velocity: 0,
    }],
  }];

  const overview = buildMotionOverviewRows(report);
  assert(overview.some((row) => row.label === "记录历史" && row.value === "开"), "overview should expose record state");
  assert(overview.some((row) => row.label === "覆盖层" && row.value === "开"), "overview should expose overlay state");
  assert(overview.some((row) => row.label === "事件 / 采样" && row.value === "3 / 3"), "overview should expose history counts");
  assert(overview.some((row) => row.label === "时间倍率" && row.value === "0.50x"), "overview should expose time scale");

  const animationRows = buildMotionAnimationRows(report);
  assert(animationRows[0].target === "folder.panel", "animation rows should prefer sourceLabel");
  assert(animationRows[0].valueTo === "12.35 -> 120.00", "animation rows should format value to target");
  assert(animationRows[0].lane === "base/panel-y", "animation rows should include lane and laneKey");

  const propertyRows = buildMotionPropertyRows(report, { preset: "all", query: "" });
  assert(propertyRows.length === 2, "property rows should include active animations");
  assert(propertyRows[0].targetProp === "folder.panel.y", "property rows should include target.prop");
  assert(propertyRows[0].delta === "107.66", "property rows should expose to-value delta");
  assert(propertyRows[0].sourceLabel === "folder.panel", "property rows should expose sourceLabel");
  assert(propertyRows[0].targetId === 3 && propertyRows[0].prop === "y", "property rows should expose selection identifiers");
  const queriedProperties = buildMotionPropertyRows(report, { preset: "all", query: "jiggle" });
  assert(queriedProperties.length === 1 && queriedProperties[0].laneKey === "icon-jiggle-x", "query filter should narrow property rows");

  const layerRows = buildMotionLayerTreeRows(report, { preset: "all", query: "" });
  const desktopLayer = layerRows.find((row) => row.layer === "desktop");
  const folderLayer = layerRows.find((row) => row.layer === "folder");
  assert(desktopLayer?.targetCount === "2", "layer tree should group targets by layer");
  assert(desktopLayer?.activeCount === "1", "layer tree should count active targets in a layer");
  assert(desktopLayer?.sources.includes("desktop.icon.jiggle"), "layer tree should expose source labels");
  assert(folderLayer?.props === "y", "layer tree should summarize animated props");
  const queriedLayerRows = buildMotionLayerTreeRows(report, { preset: "all", query: "jiggle" });
  assert(queriedLayerRows.length === 1 && queriedLayerRows[0].layer === "desktop", "query filter should narrow layer tree rows");
  const warningLayerRows = buildMotionLayerTreeRows(report, { preset: "warnings", query: "" });
  assert(warningLayerRows.length === 1 && warningLayerRows[0].layer === "unknown", "warnings preset should narrow layer tree to warning targets");

  const cancelRows = buildMotionCancelReasonRows(report);
  assert(cancelRows[0].key === "replace" && cancelRows[0].value === "2", "cancel reasons should sort by count");
  assert(buildMotionCancelReasonRows({})[0].key === "无", "empty cancel reasons should produce an empty row");

  const warningRows = buildMotionWarningRows(report);
  assert(warningRows[0].key === "missing-target-metadata", "warning rows should include warning type");
  assert(warningRows[0].detail.includes("target 7"), "warning rows should include target identity");

  const timelineGroups = buildMotionTimelineGroups(report, { preset: "all", query: "" });
  assert(timelineGroups.length === 2, "timeline groups should group events by target/lane");
  const panelTimeline = timelineGroups.find((group) => group.label.includes("folder.panel / base/panel-y"));
  assert(panelTimeline, "timeline groups should label target and lane");
  assert(panelTimeline.targetId === 3 && panelTimeline.laneKey === "panel-y", "timeline groups should expose selection identifiers");
  assert(panelTimeline.events[0].type === "cancel", "timeline events should sort newest first inside grouped output");
  assert(panelTimeline.events[0].detail.includes("reason=replace"), "timeline event rows should expose cancel reason");
  assert(panelTimeline.events[0].timeMs === 80 && panelTimeline.events[0].targetId === 3, "timeline events should expose selected time and target");
  const queriedTimeline = buildMotionTimelineGroups(report, { preset: "all", query: "jiggle" });
  assert(queriedTimeline.length === 1 && queriedTimeline[0].label.includes("desktop.icon.jiggle"), "query filter should narrow timeline groups");
  const warningTimeline = buildMotionTimelineGroups(report, { preset: "warnings", query: "" });
  assert(warningTimeline.length === 0, "warnings preset should use warning track keys for timeline filtering");
  const filterSummary = buildMotionFilterSummary(report, { preset: "active", query: "panel" });
  assert(filterSummary.preset === "active", "filter summary should preserve normalized preset");
  assert(filterSummary.text === "1 个属性 / 2 个事件", "filter summary should count filtered properties and timeline events");

  const curveGroups = buildMotionCurveChartGroups(report, { preset: "all", query: "" });
  assert(curveGroups.length === 2, "curve chart should group sampled tracks");
  const panelCurve = curveGroups.find((group) => group.label === "folder.panel.y");
  assert(panelCurve, "curve chart should label target.prop");
  assert(panelCurve.targetId === 3 && panelCurve.prop === "y" && panelCurve.laneKey === "panel-y", "curve chart should expose selection identifiers");
  assert(panelCurve.latestTimeMs === 100, "curve chart should expose latest selected time");
  assert(panelCurve.summary.includes("3 个采样"), "curve chart summary should include sample count");
  assert(panelCurve.valuePath.startsWith("M "), "curve chart should expose a value path");
  assert(panelCurve.toPath.startsWith("M "), "curve chart should expose a target path");
  assert(panelCurve.deltaPath.startsWith("M "), "curve chart should expose a delta path");
  assert(panelCurve.velocityPath.startsWith("M "), "curve chart should expose a velocity path");
  assert(panelCurve.eventMarkers.length === 2, "curve chart should include matching lifecycle event markers");
  assert(panelCurve.series.value.length === 3, "curve chart should keep normalized value points");
  assert(panelCurve.series.value.every((point) => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100), "normalized value points should stay in chart bounds");
  assert(panelCurve.stats.maxVelocity === 8, "curve chart should expose track stats");
  const queriedCurves = buildMotionCurveChartGroups(report, { preset: "all", query: "jiggle" });
  assert(queriedCurves.length === 1 && queriedCurves[0].label === "desktop.icon.jiggle.x", "query filter should narrow curve groups");
}
