import {
  buildMotionAnimationRows,
  buildMotionCancelReasonRows,
  buildMotionOverviewRows,
  buildMotionRuntimeDebugConfig,
  buildMotionWarningRows,
  MOTION_RECORD_WINDOW_CUSTOM,
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
      to: 120,
      value: 12.345,
      velocity: -5.678,
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

  const overview = buildMotionOverviewRows(report);
  assert(overview.some((row) => row.label === "record" && row.value === "on"), "overview should expose record state");
  assert(overview.some((row) => row.label === "events/samples" && row.value === "1 / 1"), "overview should expose history counts");
  assert(overview.some((row) => row.label === "timeScale" && row.value === "0.50x"), "overview should expose time scale");

  const animationRows = buildMotionAnimationRows(report);
  assert(animationRows[0].target === "folder.panel", "animation rows should prefer sourceLabel");
  assert(animationRows[0].valueTo === "12.35 -> 120.00", "animation rows should format value to target");
  assert(animationRows[0].lane === "base/panel-y", "animation rows should include lane and laneKey");

  const cancelRows = buildMotionCancelReasonRows(report);
  assert(cancelRows[0].key === "replace" && cancelRows[0].value === "2", "cancel reasons should sort by count");
  assert(buildMotionCancelReasonRows({})[0].key === "none", "empty cancel reasons should produce an empty row");

  const warningRows = buildMotionWarningRows(report);
  assert(warningRows[0].key === "missing-target-metadata", "warning rows should include warning type");
  assert(warningRows[0].detail.includes("target 7"), "warning rows should include target identity");
}
