import {
  buildMotionInspectorModel,
} from "./motionInspectorModel.js";

function makeTrace() {
  return {
    generatedAt: "2026-06-23T00:00:00.000Z",
    mode: "property-accurate-visual-replay",
    schema: "pixi-motion-replay-trace/v1",
    targets: [{
      kind: "Icon",
      label: "App A",
      layer: "desktop",
      rawTarget: { shouldNotLeak: true },
      sourceLabel: "desktop.icon.node",
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
        sourceLabel: "desktop.icon.node",
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
        sourceLabel: "desktop.icon.node",
        targetId: 1,
        timeMs: 50,
        to: 120,
        type: "retarget",
        value: 80,
        velocity: 6,
      }, {
        driver: "spring",
        frame: 2,
        lane: "additive",
        laneKey: "jiggle",
        layer: "desktop",
        prop: "x",
        reason: "replace",
        sourceLabel: "desktop.icon.node",
        targetId: 1,
        timeMs: 60,
        to: 4,
        type: "cancel",
        value: 8,
        velocity: -2,
      }],
      frames: [0, 50, 100].map((timeMs, frame) => ({
        activeAnimationCount: 3,
        frame,
        timeMs,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "x",
          rawTarget: { shouldNotLeak: true },
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          to: 120,
          value: timeMs === 0 ? 0 : 80,
          velocity: timeMs === 50 ? 6 : 0,
        }, {
          driver: "spring",
          lane: "additive",
          laneKey: "jiggle",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          to: timeMs === 50 ? 4 : 0,
          value: timeMs === 50 ? 8 : 0,
          velocity: timeMs === 50 ? -2 : 0,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "fade",
          layer: "desktop",
          prop: "alpha",
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          to: 1,
          value: timeMs / 100,
          velocity: 0.01,
        }],
      })),
      timeRangeMs: { max: 100, min: 0 },
    },
    tracks: [],
    warnings: [{
      laneKey: "jiggle",
      prop: "x",
      rawTarget: { shouldNotLeak: true },
      sourceLabel: "desktop.icon.node",
      targetId: 1,
      type: "overshoot",
    }],
  };
}

export function runMotionInspectorModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion inspector model test failed] ${message}`);
  };

  const selectedTrack = {
    lane: "base",
    laneKey: "layout",
    prop: "x",
    sourceLabel: "desktop.icon.node",
    targetId: 1,
  };
  const inspector = buildMotionInspectorModel(makeTrace(), {
    selectedTarget: { sourceLabel: "desktop.icon.node", targetId: 1 },
    selectedTimeMs: 50,
    selectedTrack,
  });
  assert(inspector.selected.timeMs === 50, "inspector should preserve selected replay time");
  assert(inspector.current.prop === "x" && inspector.current.laneKey === "layout", "inspector should expose selected track current value");
  assert(inspector.current.valueLabel === "80" && inspector.current.toLabel === "120", "current value should be formatted");
  assert(inspector.current.deltaLabel === "40" && inspector.current.velocityLabel === "6", "current delta and velocity should be formatted");
  assert(inspector.laneBreakdown.length === 2, "lane breakdown should include base and additive lanes for selected prop");
  assert(inspector.laneBreakdown[0].lane === "base", "lane breakdown should sort base before additive");
  assert(inspector.laneBreakdown[1].lane === "additive", "lane breakdown should include additive contribution");
  assert(inspector.recentEvents.some((event) => event.type === "retarget"), "recent events should include matching lifecycle events");
  assert(inspector.recentEvents.some((event) => event.timeLabel === "50ms"), "recent event time labels should preserve integer trailing zeroes");
  assert(inspector.warnings.length === 1 && inspector.warnings[0].type === "overshoot", "warnings should match selected target/track");
  assert(inspector.whyRows.some((row) => row.key === "current-value"), "why rows should explain current value");
  assert(inspector.whyRows.some((row) => row.key === "lane-breakdown"), "why rows should explain multiple lanes");
  assert(inspector.whyRows.some((row) => row.key === "recent-event"), "why rows should explain recent lifecycle event");
  assert(!JSON.stringify(inspector).includes("rawTarget"), "inspector should not retain raw target refs");

  const targetOnly = buildMotionInspectorModel(makeTrace(), {
    selectedTarget: { sourceLabel: "desktop.icon.node", targetId: 1 },
    selectedTimeMs: 50,
  });
  assert(targetOnly.current.prop === "alpha" || targetOnly.current.prop === "x", "target-only inspector should expose a current value");
  assert(targetOnly.laneBreakdown.length === 3, "target-only inspector should include current target values");

  const missingTrack = buildMotionInspectorModel(makeTrace(), {
    selectedTimeMs: 50,
    selectedTrack: {
      lane: "base",
      laneKey: "missing",
      prop: "scale",
      sourceLabel: "desktop.icon.node",
      targetId: 1,
    },
  });
  assert(missingTrack.current === null, "missing selected track should not invent current values");
  assert(missingTrack.whyRows.some((row) => row.key === "no-current-sample"), "missing selected track should explain absent sample");
}
