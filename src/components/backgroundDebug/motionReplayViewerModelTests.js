import {
  assertMotionReplayImportSize,
  buildMotionReplayCurveGroups,
  buildMotionReplayEventRows,
  buildMotionReplayFilterSummary,
  buildMotionReplayFrameRows,
  buildMotionReplayOverlayRows,
  buildMotionReplayOverviewRows,
  createMotionReplayIntervalExport,
  findMotionReplayFrame,
  findMotionReplayEventStep,
  findMotionReplayEventStepTime,
  findMotionReplayFrameStepTime,
  MOTION_REPLAY_IMPORT_MAX_BYTES,
  MOTION_REPLAY_INTERVAL_SCHEMA,
  normalizeMotionReplayTime,
  normalizeMotionReplayTrace,
  parseMotionReplayTraceJson,
} from "./motionReplayViewerModel.js";

function makeTrace() {
  return {
    capture: {
      requestedDurationMs: 100,
      sampleHz: 60,
    },
    generatedAt: "2026-06-21T00:00:00.000Z",
    mode: "property-accurate-visual-replay",
    schema: "pixi-motion-replay-trace/v1",
    source: {
      reportVersion: 1,
      runtime: { frames: 10, timeMs: 100 },
    },
    summary: {
      eventCount: 3,
      frameCount: 3,
      targetCount: 2,
      trackCount: 2,
      valueCount: 6,
      warningCount: 0,
    },
    targets: [{
      kind: "Icon",
      label: "App A",
      sourceLabel: "desktop.icon.node",
      targetId: 1,
    }, {
      kind: "FolderPanel",
      label: "Folder",
      sourceLabel: "folder.panel",
      targetId: 2,
    }],
    timeline: {
      events: [{
        driver: "spring",
        frame: 1,
        lane: "base",
        laneKey: "layout",
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
        frame: 2,
        lane: "base",
        laneKey: "layout",
        prop: "x",
        sourceLabel: "desktop.icon.node",
        targetId: 1,
        timeMs: 50,
        to: 100,
        type: "arrive",
        value: 95,
        velocity: 8,
      }, {
        driver: "tween",
        frame: 3,
        lane: "base",
        laneKey: "panel-y",
        prop: "y",
        sourceLabel: "folder.panel",
        targetId: 2,
        timeMs: 100,
        to: 20,
        type: "complete",
        value: 20,
        velocity: 0,
      }],
      frames: [{
        activeAnimationCount: 2,
        frame: 1,
        timeMs: 0,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          prop: "x",
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          to: 100,
          value: 0,
          velocity: 0,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "panel-y",
          prop: "y",
          sourceLabel: "folder.panel",
          targetId: 2,
          to: 20,
          value: 0,
          velocity: 0,
        }],
      }, {
        activeAnimationCount: 2,
        frame: 2,
        timeMs: 50,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          prop: "x",
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          to: 100,
          value: 80,
          velocity: 12,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "panel-y",
          prop: "y",
          sourceLabel: "folder.panel",
          targetId: 2,
          to: 20,
          value: 10,
          velocity: 4,
        }],
      }, {
        activeAnimationCount: 2,
        frame: 3,
        timeMs: 100,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "layout",
          prop: "x",
          sourceLabel: "desktop.icon.node",
          targetId: 1,
          to: 100,
          value: 100,
          velocity: 0,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "panel-y",
          prop: "y",
          sourceLabel: "folder.panel",
          targetId: 2,
          to: 20,
          value: 20,
          velocity: 0,
        }],
      }],
      timeRangeMs: { max: 100, min: 0 },
    },
    tracks: [{
      driver: "spring",
      key: "1:x:base:layout",
      lane: "base",
      laneKey: "layout",
      prop: "x",
      sourceLabel: "desktop.icon.node",
      targetId: 1,
    }, {
      driver: "tween",
      key: "2:y:base:panel-y",
      lane: "base",
      laneKey: "panel-y",
      prop: "y",
      sourceLabel: "folder.panel",
      targetId: 2,
    }],
    version: 1,
    warnings: [],
  };
}

export function runMotionReplayViewerModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion replay viewer model test failed] ${message}`);
  };

  const trace = normalizeMotionReplayTrace(makeTrace());
  assert(trace.timeline.frames.length === 3, "normalized trace should keep frames");
  assert(normalizeMotionReplayTime(trace, -10) === 0, "replay time should clamp to trace min");
  assert(normalizeMotionReplayTime(trace, 200) === 100, "replay time should clamp to trace max");
  assert(findMotionReplayFrame(trace, 75).frame === 2, "scrub should use the latest frame at or before time");
  assert(findMotionReplayFrameStepTime(trace, 0, "next") === 50, "next frame step should jump to the next frame time");
  assert(findMotionReplayFrameStepTime(trace, 75, "next") === 100, "next frame step should use the next strict frame time");
  assert(findMotionReplayFrameStepTime(trace, 75, "previous") === 50, "previous frame step should use the previous strict frame time");
  assert(findMotionReplayFrameStepTime(trace, 0, "previous") === 0, "previous frame step should stay on first frame at the lower edge");
  assert(findMotionReplayFrameStepTime(trace, 100, "next") === 100, "next frame step should stay on last frame at the upper edge");

  const nextIconEvent = findMotionReplayEventStep(trace, 0, "next", { query: "icon" });
  assert(nextIconEvent.timeMs === 50 && nextIconEvent.type === "arrive", "next event step should return the next filtered event");
  assert(findMotionReplayEventStepTime(trace, 0, "next", { query: "icon" }) === 50, "next event step time should follow the next filtered event");
  assert(findMotionReplayEventStepTime(trace, 75, "previous", { query: "icon" }) === 50, "previous event step should follow the previous filtered event");
  assert(findMotionReplayEventStep(trace, 0, "previous", { query: "icon" }) === null, "previous event step should return null before the first filtered event");
  assert(findMotionReplayEventStepTime(trace, 0, "previous", { query: "icon" }) === 0, "previous event step time should stay unchanged before the first filtered event");
  assert(findMotionReplayEventStep(trace, 100, "next", { query: "icon" }) === null, "next event step should return null after the last filtered event");
  assert(findMotionReplayEventStepTime(trace, 100, "next", { query: "icon" }) === 100, "next event step time should stay unchanged after the last filtered event");
  assert(findMotionReplayEventStep(trace, 50, "next", { query: "missing" }) === null, "event step should return null when no filtered event exists");
  assert(parseMotionReplayTraceJson(JSON.stringify(makeTrace())).schema === "pixi-motion-replay-trace/v1", "JSON import should parse trace schema");
  assert(MOTION_REPLAY_IMPORT_MAX_BYTES >= 1024 * 1024, "replay import size guard should allow MB-scale traces");
  assertMotionReplayImportSize(MOTION_REPLAY_IMPORT_MAX_BYTES);
  try {
    assertMotionReplayImportSize(MOTION_REPLAY_IMPORT_MAX_BYTES + 1);
    assert(false, "oversized replay imports should throw before parsing");
  } catch (error) {
    assert(String(error.message).includes("too large"), "oversized replay import error should be readable");
  }
  try {
    parseMotionReplayTraceJson(JSON.stringify(makeTrace()), { maxBytes: 10 });
    assert(false, "parse should reject oversized JSON text");
  } catch (error) {
    assert(String(error.message).includes("too large"), "parse size guard error should be readable");
  }
  try {
    normalizeMotionReplayTrace({ schema: "bad" });
    assert(false, "unsupported schema should throw");
  } catch (error) {
    assert(String(error.message).includes("Unsupported"), "unsupported schema error should be readable");
  }

  const overviewRows = buildMotionReplayOverviewRows(trace, 50);
  assert(overviewRows.some((row) => row.label === "viewer" && row.value === "loaded"), "overview should expose loaded state");
  assert(overviewRows.some((row) => row.label === "frames/events" && row.value === "3 / 3"), "overview should expose frame/event counts");

  const frameRows = buildMotionReplayFrameRows(trace, 75, { query: "" });
  assert(frameRows.length === 2, "frame rows should show current frame values");
  assert(frameRows[0].targetProp === "desktop.icon.node.x", "frame rows should label target.prop");
  assert(frameRows[0].delta === "20.00", "frame rows should expose to-value delta");
  const filteredFrameRows = buildMotionReplayFrameRows(trace, 75, { query: "folder" });
  assert(filteredFrameRows.length === 1 && filteredFrameRows[0].targetProp === "folder.panel.y", "frame rows should filter by target query");

  const eventRows = buildMotionReplayEventRows(trace, 48, { query: "icon" });
  assert(eventRows[0].type === "arrive", "event rows should prioritize nearest event for jumping");
  assert(eventRows[0].timeMs === 50, "event row should expose jump time");

  const curveGroups = buildMotionReplayCurveGroups(trace, 50, { query: "icon" });
  assert(curveGroups.length === 1, "curve groups should filter tracks by query");
  assert(curveGroups[0].valuePath.startsWith("M "), "curve groups should expose value path");
  assert(curveGroups[0].toPath.startsWith("M "), "curve groups should expose target path");
  assert(curveGroups[0].deltaPath.startsWith("M "), "curve groups should expose delta path");
  assert(curveGroups[0].velocityPath.startsWith("M "), "curve groups should expose velocity path");
  assert(curveGroups[0].cursorX === 50, "curve groups should synchronize cursor to replay time");
  assert(curveGroups[0].eventMarkers.length === 2, "curve groups should include matching event markers");

  const overlayRows = buildMotionReplayOverlayRows(trace, 50, { query: "" });
  assert(overlayRows.length === 2, "overlay rows should group current frame values by target");
  assert(overlayRows.some((row) => row.label === "desktop.icon.node" && row.propSummary === "x"), "overlay rows should expose target prop summary");
  assert(overlayRows.every((row) => row.valueCount >= 1 && row.primaryTrack), "overlay rows should expose selectable current tracks");

  const selectedOverlayRows = buildMotionReplayOverlayRows(trace, 50, { query: "" }, {
    selectedTarget: { targetId: 2 },
    selectedTrack: {
      lane: "base",
      laneKey: "panel-y",
      prop: "y",
      targetId: 2,
    },
  });
  assert(selectedOverlayRows[0].label === "folder.panel", "selected overlay target should sort first");
  assert(selectedOverlayRows[0].isSelected === true, "selected overlay target should be marked selected");
  assert(selectedOverlayRows[0].primaryTrack.prop === "y", "selected overlay row should expose selected primary track");
  assert(selectedOverlayRows[0].valueRows.some((row) => row.isSelected), "selected overlay value should be marked");

  const filteredOverlayRows = buildMotionReplayOverlayRows(trace, 50, { query: "folder" }, {
    selectedTarget: { targetId: 1 },
  });
  assert(filteredOverlayRows.length === 1 && filteredOverlayRows[0].label === "folder.panel", "overlay rows should follow replay query filters");
  assert(!JSON.stringify(filteredOverlayRows).includes("rawTarget"), "overlay rows should not leak raw target references");

  const filterSummary = buildMotionReplayFilterSummary(trace, 50, { query: "icon" });
  assert(filterSummary.text === "1 props / 2 events", "filter summary should count filtered frame values and events");

  const exported = createMotionReplayIntervalExport(trace, {
    endMs: 60,
    filters: { query: "icon" },
    startMs: 0,
  });
  const data = JSON.parse(exported.json);
  assert(data.schema === MOTION_REPLAY_INTERVAL_SCHEMA, "interval export should expose interval schema");
  assert(data.interval.startMs === 0 && data.interval.endMs === 60, "interval export should preserve requested range");
  assert(data.summary.frameCount === 2, "interval export should include matching frames in range");
  assert(data.summary.eventCount === 2, "interval export should include matching events in range");
  assert(data.summary.targetCount === 1, "interval export should include used targets only");
  assert(data.timeline.frames.every((frame) => frame.values.length === 1), "interval export should filter frame values by query");
}
