import {
  applyMotionLabParamPreset,
  buildMotionLabParamPresetRows,
  buildMotionLabCurveRows,
  buildMotionLabAssertionRows,
  buildMotionLabCompareRows,
  buildMotionLabOverviewRows,
  buildMotionLabScenarioRows,
  buildMotionLabTraceDiffRows,
  createMotionLabCompareExport,
  createMotionLabBaselineCompareExport,
  createMotionLabRunSnapshot,
  createMotionLabTraceDiffExport,
  DEFAULT_MOTION_LAB_PARAMS,
  getMotionLabParamPreset,
  buildMotionLabTimelineRows,
  MOTION_LAB_COMPARE_SCHEMA,
  MOTION_LAB_PARAM_PRESET_IDS,
  MOTION_LAB_TRACE_DIFF_SCHEMA,
  normalizeMotionLabParams,
  resolveMotionLabParamPresetId,
  shouldMountMotionLab,
} from "./motionLabModel.js";
import {
  evaluateMotionLabScenarioAssertions,
  getMotionLabScenario,
  MOTION_LAB_SCENARIO_IDS,
  MOTION_LAB_SCENARIOS,
} from "./motionLabScenarios.js";

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

  assert(MOTION_LAB_SCENARIOS.length === 12, "scenario DSL should expose the first 12 scenarios");
  assert(MOTION_LAB_SCENARIO_IDS.every((id) => MOTION_LAB_SCENARIOS.some((scenario) => scenario.id === id)), "scenario IDs should match the required set");
  assert(MOTION_LAB_SCENARIOS.every((scenario) => typeof scenario.run === "function"), "every scenario should expose a run function");
  assert(MOTION_LAB_SCENARIOS.every((scenario) => scenario.assertions.length >= 1), "every scenario should expose at least one assertion");

  const scenarioRows = buildMotionLabScenarioRows(MOTION_LAB_SCENARIOS, "desktop-page-scrub");
  assert(scenarioRows.length === 12, "scenario list should expose all DSL rows");
  assert(scenarioRows.some((row) => row.id === "desktop-page-scrub" && row.selected), "selected scenario should be marked");
  assert(scenarioRows.every((row) => row.assertionCount >= 1), "scenario rows should expose assertion counts");

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

  const scenario = getMotionLabScenario("desktop-page-scrub");
  assert(scenario.id === "desktop-page-scrub", "scenario lookup should resolve known scenarios");
  const passedAssertions = evaluateMotionLabScenarioAssertions({
    assertions: [{
      id: "sample",
      label: "sample assertion",
      test: () => true,
    }],
  }, { report });
  const assertionRows = buildMotionLabAssertionRows(passedAssertions);
  assert(assertionRows[0].status === "pass", "assertion rows should expose pass state");

  const normalizedParams = normalizeMotionLabParams({
    damping: 18,
    distancePx: 180,
    ease: "sine.inOut",
    interruptPolicy: "blend",
    springMass: 9,
    stiffness: 500,
  });
  assert(normalizedParams.springDamping === 18, "params should keep legacy damping alias");
  assert(normalizedParams.springStiffness === 500, "params should keep legacy stiffness alias");
  assert(normalizedParams.pageDistancePx === 180, "params should keep legacy distance alias for page distance");
  assert(normalizedParams.dragDistancePx === 180, "params should keep legacy distance alias for drag distance");
  assert(normalizedParams.springMass === 3, "params should clamp spring mass");
  assert(normalizedParams.ease === "sine.inOut", "params should accept supported ease");
  assert(normalizedParams.interruptPolicy === "blend", "params should accept supported interrupt policy");
  assert(normalizeMotionLabParams({ ease: "unknown" }).ease === DEFAULT_MOTION_LAB_PARAMS.ease, "params should reject unknown ease");

  assert(MOTION_LAB_PARAM_PRESET_IDS.join(",") === "snappy,soft,slow,interrupt-heavy", "param presets should expose required IDs in stable order");
  const snappyParams = applyMotionLabParamPreset(DEFAULT_MOTION_LAB_PARAMS, "snappy");
  assert(snappyParams.durationMs < DEFAULT_MOTION_LAB_PARAMS.durationMs, "snappy preset should shorten tween duration");
  assert(snappyParams.springStiffness > DEFAULT_MOTION_LAB_PARAMS.springStiffness, "snappy preset should stiffen spring");
  assert(snappyParams.ease === "power3.out", "snappy preset should use a fast ease");
  const softParams = applyMotionLabParamPreset(DEFAULT_MOTION_LAB_PARAMS, "soft");
  assert(softParams.springStiffness < DEFAULT_MOTION_LAB_PARAMS.springStiffness, "soft preset should loosen spring stiffness");
  assert(softParams.iconPressScale > DEFAULT_MOTION_LAB_PARAMS.iconPressScale, "soft preset should reduce press compression");
  const slowParams = applyMotionLabParamPreset(DEFAULT_MOTION_LAB_PARAMS, "slow");
  assert(slowParams.durationMs > DEFAULT_MOTION_LAB_PARAMS.durationMs, "slow preset should lengthen tween duration");
  assert(slowParams.interruptDelayMs > DEFAULT_MOTION_LAB_PARAMS.interruptDelayMs, "slow preset should delay interruptions");
  const interruptHeavyParams = applyMotionLabParamPreset(DEFAULT_MOTION_LAB_PARAMS, "interrupt-heavy");
  assert(interruptHeavyParams.interruptPolicy === "replace", "interrupt-heavy preset should stress replacement interrupts");
  assert(interruptHeavyParams.interruptDelayMs < DEFAULT_MOTION_LAB_PARAMS.interruptDelayMs, "interrupt-heavy preset should shorten interruption delay");
  assert(applyMotionLabParamPreset({ durationMs: 777 }, "unknown").durationMs === 777, "unknown preset should keep current normalized params");
  assert(getMotionLabParamPreset(" SNAPPY ")?.id === "snappy", "preset lookup should trim and lowercase ids");
  assert(getMotionLabParamPreset("missing") == null, "unknown preset lookup should return null");
  assert(resolveMotionLabParamPresetId(snappyParams) === "snappy", "preset resolver should identify exact preset params");
  assert(resolveMotionLabParamPresetId({ ...snappyParams, durationMs: snappyParams.durationMs + 20 }) === "custom", "preset resolver should mark edited params as custom");
  const presetRows = buildMotionLabParamPresetRows(snappyParams);
  assert(presetRows.length === 4, "preset rows should expose all required presets");
  assert(presetRows.some((row) => row.id === "snappy" && row.selected && row.summary.includes("ms")), "preset rows should mark selected preset and expose summary");

  const traceA = {
    capture: { durationMs: 120 },
    summary: {
      byDriver: { spring: 2, tween: 1 },
      byProp: { x: 2, y: 1 },
      eventCount: 3,
      frameCount: 4,
      targetCount: 2,
      trackCount: 2,
      valueCount: 5,
      warningCount: 0,
    },
    timeline: { timeRangeMs: { max: 120, min: 0 } },
  };
  const traceB = {
    capture: { durationMs: 240 },
    summary: {
      byDriver: { spring: 4, tween: 1 },
      byProp: { alpha: 1, x: 4 },
      eventCount: 6,
      frameCount: 8,
      targetCount: 3,
      trackCount: 3,
      valueCount: 11,
      warningCount: 1,
    },
    timeline: { timeRangeMs: { max: 240, min: 0 } },
  };
  const snapshotA = createMotionLabRunSnapshot({
    assertions: passedAssertions,
    params: normalizedParams,
    report,
    scenario,
    trace: traceA,
  });
  const snapshotB = createMotionLabRunSnapshot({
    assertions: [{ id: "sample", passed: false }],
    params: { ...normalizedParams, durationMs: 520 },
    report: {
      ...report,
      history: { events: [...report.history.events, ...report.history.events], samples: report.history.samples },
      summary: { activeAnimationCount: 0, warningCount: 1 },
    },
    scenario,
    trace: traceB,
  });
  assert(snapshotA.schema == null, "run snapshot should stay lightweight without nested schema");
  assert(snapshotA.summary.assertionPassedCount === 1, "run snapshot should count passed assertions");
  assert(snapshotB.summary.assertionFailedCount === 1, "run snapshot should count failed assertions");
  assert(snapshotB.summary.eventCount === 4, "run snapshot should count report events");

  const compareRows = buildMotionLabCompareRows(snapshotB, snapshotA);
  assert(compareRows.some((row) => row.label === "param:durationMs" && row.delta === "+160"), "compare rows should expose changed motion params");
  assert(compareRows.some((row) => row.label === "events" && row.delta === "+2"), "compare rows should expose event delta");
  assert(compareRows.some((row) => row.label === "trace values" && row.delta === "+6"), "compare rows should expose trace value delta");
  const compareExport = createMotionLabCompareExport(snapshotB, snapshotA);
  assert(compareExport.schema === MOTION_LAB_COMPARE_SCHEMA, "compare export should expose schema");
  assert(compareExport.rows.length === compareRows.length, "compare export should include rows");
  const baselineCompareExport = createMotionLabBaselineCompareExport(snapshotB, snapshotA);
  assert(baselineCompareExport.schema === MOTION_LAB_COMPARE_SCHEMA, "baseline compare export should reuse compare schema");
  assert(baselineCompareExport.compareMode === "baseline", "baseline compare export should expose compare mode");
  assert(baselineCompareExport.baseline.summary.eventCount === snapshotA.summary.eventCount, "baseline compare export should include saved baseline snapshot");
  assert(baselineCompareExport.current.summary.eventCount === snapshotB.summary.eventCount, "baseline compare export should include current run snapshot");
  assert(baselineCompareExport.rows.some((row) => row.label === "param:durationMs" && row.delta === "+160"), "baseline compare export should include param deltas");
  assert(baselineCompareExport.rows.some((row) => row.label === "events" && row.delta === "+2"), "baseline compare export should include metric deltas");

  const diffRows = buildMotionLabTraceDiffRows(traceB, traceA);
  assert(diffRows.some((row) => row.label === "frames" && row.delta === "+4"), "trace diff rows should expose frame delta");
  assert(diffRows.some((row) => row.label === "prop:alpha" && row.delta === "+1"), "trace diff rows should expose changed props");
  assert(diffRows.some((row) => row.label === "driver:spring" && row.delta === "+2"), "trace diff rows should expose changed drivers");
  const traceDiffExport = createMotionLabTraceDiffExport(traceB, traceA);
  assert(traceDiffExport.schema === MOTION_LAB_TRACE_DIFF_SCHEMA, "trace diff export should expose schema");
  assert(traceDiffExport.rows.length === diffRows.length, "trace diff export should include rows");
}
