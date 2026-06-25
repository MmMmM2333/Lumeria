import {
  buildMotionReplayAnomalyJumps,
  MOTION_REPLAY_ANOMALY_TYPES,
} from "./motionReplayAnomalyModel.js";

function makeTrace() {
  return {
    generatedAt: "2026-06-23T00:00:00.000Z",
    mode: "property-accurate-visual-replay",
    schema: "pixi-motion-replay-trace/v1",
    summary: {
      eventCount: 4,
      frameCount: 4,
      targetCount: 2,
      trackCount: 3,
      valueCount: 12,
      warningCount: 2,
    },
    targets: [{
      kind: "Icon",
      label: "Anomaly Icon",
      layer: "desktop",
      rawTarget: { shouldNotLeak: true },
      sourceLabel: "desktop.icon.anomaly",
      targetId: 1,
    }, {
      kind: "Panel",
      label: "Panel",
      layer: "folder",
      sourceLabel: "folder.panel.anomaly",
      targetId: 2,
    }],
    timeline: {
      events: [{
        driver: "spring",
        frame: 1,
        lane: "base",
        laneKey: "layout",
        layer: "desktop",
        prop: "x",
        reason: "replace",
        sourceLabel: "desktop.icon.anomaly",
        targetId: 1,
        timeMs: 40,
        to: 120,
        type: "retarget",
        value: 96,
        velocity: 30,
      }, {
        driver: "spring",
        frame: 2,
        lane: "additive",
        laneKey: "jiggle",
        layer: "desktop",
        prop: "x",
        reason: "replace",
        sourceLabel: "desktop.icon.anomaly",
        targetId: 1,
        timeMs: 70,
        to: 4,
        type: "cancel",
        value: 12,
        velocity: -8,
      }, {
        driver: "tween",
        frame: 2,
        lane: "base",
        laneKey: "fade",
        layer: "folder",
        prop: "alpha",
        sourceLabel: "folder.panel.anomaly",
        targetId: 2,
        timeMs: 70,
        to: 1,
        type: "retarget",
        value: 0.8,
        velocity: 0.1,
      }, {
        driver: "spring",
        frame: 3,
        lane: "base",
        laneKey: "layout",
        layer: "desktop",
        prop: "y",
        sourceLabel: "desktop.icon.anomaly",
        targetId: 1,
        timeMs: 120,
        to: 0,
        type: "complete",
        value: 0,
        velocity: 0,
      }],
      frames: [{
        activeAnimationCount: 3,
        frame: 0,
        timeMs: 0,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 120,
          value: 0,
          velocity: 2,
        }, {
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "y",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 200,
          value: 0,
          velocity: 1,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "fade",
          layer: "folder",
          prop: "alpha",
          sourceLabel: "folder.panel.anomaly",
          targetId: 2,
          to: 1,
          value: 0,
          velocity: 0.1,
        }],
      }, {
        activeAnimationCount: 3,
        frame: 1,
        timeMs: 40,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 120,
          value: 96,
          velocity: 30,
        }, {
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "y",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 200,
          value: 40,
          velocity: 4,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "fade",
          layer: "folder",
          prop: "alpha",
          sourceLabel: "folder.panel.anomaly",
          targetId: 2,
          to: 1,
          value: 0.4,
          velocity: 0.1,
        }],
      }, {
        activeAnimationCount: 3,
        frame: 2,
        timeMs: 70,
        values: [{
          driver: "spring",
          lane: "additive",
          laneKey: "jiggle",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 4,
          value: 12,
          velocity: -8,
        }, {
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "y",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 200,
          value: 160,
          velocity: 6,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "fade",
          layer: "folder",
          prop: "alpha",
          sourceLabel: "folder.panel.anomaly",
          targetId: 2,
          to: 1,
          value: 0.8,
          velocity: 0.1,
        }],
      }, {
        activeAnimationCount: 2,
        frame: 3,
        timeMs: 120,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 120,
          value: 120,
          velocity: 0,
        }, {
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          layer: "desktop",
          prop: "y",
          sourceLabel: "desktop.icon.anomaly",
          targetId: 1,
          to: 200,
          value: 200,
          velocity: 0,
        }],
      }],
      timeRangeMs: { max: 120, min: 0 },
    },
    tracks: [],
    version: 1,
    warnings: [{
      laneKey: "jiggle",
      prop: "x",
      sourceLabel: "desktop.icon.anomaly",
      targetId: 1,
      type: "overshoot",
    }, {
      lane: "base",
      laneKey: "fade",
      prop: "alpha",
      sourceLabel: "folder.panel.anomaly",
      targetId: 2,
      timeMs: 70,
      type: "stalled",
    }],
  };
}

export function runMotionReplayAnomalyModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion replay anomaly model test failed] ${message}`);
  };

  assert(MOTION_REPLAY_ANOMALY_TYPES.join(",") === "max-velocity,max-delta,overshoot,warning,cancel,retarget", "anomaly type order should be stable");

  const rows = buildMotionReplayAnomalyJumps(makeTrace());
  const byType = Object.fromEntries(rows.map((row) => [row.type, row]));

  assert(rows.length === 6, "trace should expose six jump targets");
  assert(byType["max-velocity"].timeMs === 40, "max velocity should jump to the highest absolute velocity sample");
  assert(byType["max-velocity"].track.prop === "x" && byType["max-velocity"].track.laneKey === "layout", "max velocity should expose selected track ref");
  assert(byType["max-velocity"].metricLabel === "|v| 30", "max velocity should expose readable metric");
  assert(byType["max-delta"].timeMs === 0, "max delta should jump to the highest absolute delta sample");
  assert(byType["max-delta"].track.prop === "y", "max delta should expose the y track");
  assert(byType.overshoot.timeMs === 70, "overshoot warning without time should resolve to matching strongest sample");
  assert(byType.overshoot.track.laneKey === "jiggle", "overshoot should keep warning track lane");
  assert(byType.warning.warningType === "stalled" && byType.warning.timeMs === 70, "generic warning should prefer non-overshoot warnings when available");
  assert(byType.cancel.timeMs === 70 && byType.cancel.reason === "replace", "cancel should jump to cancel lifecycle event");
  assert(byType.retarget.timeMs === 40 && byType.retarget.reason === "replace", "retarget should jump to strongest retarget lifecycle event");

  const filteredRows = buildMotionReplayAnomalyJumps(makeTrace(), { filters: { query: "folder" } });
  assert(filteredRows.every((row) => row.sourceLabel === "folder.panel.anomaly"), "query filter should narrow anomaly jumps");
  assert(filteredRows.some((row) => row.type === "warning" && row.warningType === "stalled"), "query filter should keep matching warning");
  assert(!filteredRows.some((row) => row.type === "cancel"), "query filter should remove nonmatching cancel events");

  const json = JSON.stringify(rows);
  assert(!json.includes("rawTarget"), "anomaly rows should not leak raw target references");
  assert(!json.includes("shouldNotLeak"), "anomaly rows should not leak nested raw target data");

  assert(buildMotionReplayAnomalyJumps(null).length === 0, "missing trace should return no jump rows");
}
