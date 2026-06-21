import {
  buildMotionLabCurveRows,
  buildMotionLabOverviewRows,
  buildMotionLabScenarioRows,
  buildMotionLabTimelineRows,
  MOTION_LAB_SCENARIOS,
  shouldMountMotionLab,
} from "./motionLabModel.js";

function makeReport() {
  return {
    config: { enabled: true },
    curveStats: [{
      driver: "spring",
      key: "1:x:base:layout",
      lane: "base",
      laneKey: "layout",
      maxVelocity: 120.5,
      prop: "x",
      sampleCount: 12,
      sourceLabel: "motionLab.pageTrack",
      targetId: 1,
    }],
    history: {
      events: [{
        prop: "x",
        sourceLabel: "motionLab.pageTrack",
        targetId: 1,
        timeMs: 10,
        to: 100,
        type: "start",
        value: 0,
      }, {
        prop: "x",
        sourceLabel: "motionLab.pageTrack",
        targetId: 1,
        timeMs: 40,
        to: 100,
        type: "arrive",
        value: 96,
      }],
      samples: [{ frame: 1 }, { frame: 2 }],
    },
    summary: {
      activeAnimationCount: 1,
      warningCount: 0,
    },
  };
}

export function runMotionLabModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion lab model test failed] ${message}`);
  };

  assert(shouldMountMotionLab("?motionLab=1", true), "motionLab=1 should mount lab in dev");
  assert(shouldMountMotionLab("motionLab=true", true), "bare search string should be accepted");
  assert(shouldMountMotionLab("?motionLab", true), "present motionLab param should mount lab in dev");
  assert(!shouldMountMotionLab("?motionLab=0", true), "motionLab=0 should not mount lab");
  assert(!shouldMountMotionLab("?motionLab=false", true), "motionLab=false should not mount lab");
  assert(!shouldMountMotionLab("?motionLab=1", false), "motion lab should be dev-only");

  const scenarioRows = buildMotionLabScenarioRows(MOTION_LAB_SCENARIOS, "desktop-page");
  assert(scenarioRows.length >= 4, "scenario list should expose seed rows");
  assert(scenarioRows.some((row) => row.id === "desktop-page" && row.selected), "selected scenario should be marked");

  const report = makeReport();
  const overviewRows = buildMotionLabOverviewRows(report, {
    summary: { eventCount: 2, frameCount: 3 },
  });
  assert(overviewRows.some((row) => row.label === "runtime" && row.value === "debug"), "overview should expose debug runtime state");
  assert(overviewRows.some((row) => row.label === "trace frames/events" && row.value === "3 / 2"), "overview should expose trace counts");

  const timelineRows = buildMotionLabTimelineRows(report);
  assert(timelineRows[0].type === "arrive", "timeline rows should show newest events first");
  assert(timelineRows[0].detail.includes("motionLab.pageTrack"), "timeline rows should include source label");

  const curveRows = buildMotionLabCurveRows(report);
  assert(curveRows.length === 1, "curve rows should expose curve stats");
  assert(curveRows[0].label === "motionLab.pageTrack.x", "curve row should include source label and prop");
  assert(curveRows[0].samples === "12", "curve row should expose sample count");
}
