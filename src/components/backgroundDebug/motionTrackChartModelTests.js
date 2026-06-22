import {
  buildMotionTrackChartModel,
  MOTION_TRACK_CHART_DISPLAY_NORMALIZED,
  MOTION_TRACK_CHART_DISPLAY_RAW,
  normalizeMotionTrackChartSeriesVisibility,
  normalizeMotionTrackChartZoomWindow,
} from "./motionTrackChartModel.js";

function makeTrace() {
  return {
    generatedAt: "2026-06-22T00:00:00.000Z",
    mode: "property-accurate-visual-replay",
    schema: "pixi-motion-replay-trace/v1",
    summary: {
      eventCount: 4,
      frameCount: 3,
      targetCount: 2,
      trackCount: 2,
      valueCount: 6,
      warningCount: 0,
    },
    targets: [{
      kind: "Icon",
      label: "Smoke Icon",
      layer: "desktop",
      sourceLabel: "desktop.icon.smoke",
      targetId: 1,
    }, {
      kind: "Panel",
      label: "Smoke Panel",
      layer: "folder",
      sourceLabel: "folder.panel.smoke",
      targetId: 2,
    }],
    timeline: {
      events: [{
        driver: "spring",
        frame: 0,
        lane: "base",
        laneKey: "default",
        layer: "desktop",
        prop: "x",
        sourceLabel: "desktop.icon.smoke",
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
        laneKey: "default",
        layer: "desktop",
        prop: "x",
        reason: "replace",
        sourceLabel: "desktop.icon.smoke",
        targetId: 1,
        timeMs: 50,
        to: 100,
        type: "retarget",
        value: 50,
        velocity: 12,
      }, {
        driver: "spring",
        frame: 2,
        lane: "base",
        laneKey: "default",
        layer: "desktop",
        prop: "x",
        sourceLabel: "desktop.icon.smoke",
        targetId: 1,
        timeMs: 100,
        to: 100,
        type: "complete",
        value: 100,
        velocity: 0,
      }, {
        driver: "tween",
        frame: 2,
        lane: "base",
        laneKey: "fade",
        layer: "folder",
        prop: "alpha",
        sourceLabel: "folder.panel.smoke",
        targetId: 2,
        timeMs: 100,
        to: 1,
        type: "complete",
        value: 1,
        velocity: 0,
      }],
      frames: [0, 50, 100].map((timeMs, frame) => ({
        activeAnimationCount: 2,
        frame,
        timeMs,
        values: [{
          driver: "spring",
          lane: "base",
          laneKey: "default",
          layer: "desktop",
          prop: "x",
          sourceLabel: "desktop.icon.smoke",
          targetId: 1,
          to: 100,
          value: timeMs,
          velocity: timeMs === 50 ? 12 : 0,
        }, {
          driver: "tween",
          lane: "base",
          laneKey: "fade",
          layer: "folder",
          prop: "alpha",
          sourceLabel: "folder.panel.smoke",
          targetId: 2,
          to: 1,
          value: timeMs / 100,
          velocity: timeMs === 50 ? 0.2 : 0,
        }],
      })),
      timeRangeMs: { max: 100, min: 0 },
    },
    tracks: [{
      driver: "spring",
      key: "1:x:base:default",
      lane: "base",
      laneKey: "default",
      layer: "desktop",
      prop: "x",
      sampleCount: 3,
      sourceLabel: "desktop.icon.smoke",
      targetId: 1,
    }, {
      driver: "tween",
      key: "2:alpha:base:fade",
      lane: "base",
      laneKey: "fade",
      layer: "folder",
      prop: "alpha",
      sampleCount: 3,
      sourceLabel: "folder.panel.smoke",
      targetId: 2,
    }],
    version: 1,
    warnings: [],
  };
}

export function runMotionTrackChartModelTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Motion track chart model test failed] ${message}`);
  };

  const trace = makeTrace();
  const chart = buildMotionTrackChartModel(trace, { cursorTimeMs: 50 });
  assert(chart.timeRangeMs.min === 0 && chart.timeRangeMs.max === 100, "chart should expose source time range");
  assert(chart.zoomWindow.startMs === 0 && chart.zoomWindow.endMs === 100, "default zoom should use full trace range");
  assert(chart.cursor.timeMs === 50 && chart.cursor.x === 50, "cursor should map to chart percentage");
  assert(chart.tracks.length === 2, "chart should group samples by track");

  const iconTrack = chart.tracks.find((track) => track.key === "1:x:base:default");
  assert(iconTrack, "chart should include the icon x track");
  assert(iconTrack.label === "desktop.icon.smoke.x", "track label should use source label and prop");
  assert(iconTrack.sampleCount === 3 && iconTrack.eventCount === 3, "track should expose sample and event counts");
  assert(iconTrack.timeline.startMs === 0 && iconTrack.timeline.endMs === 100, "track timeline should expose active time range");
  assert(iconTrack.timeline.startX === 0 && iconTrack.timeline.endX === 100 && iconTrack.timeline.width === 100, "track timeline should expose percent bounds");
  assert(iconTrack.series.value.path.startsWith("M "), "value series should expose an SVG path");
  assert(iconTrack.series.to.path.startsWith("M "), "to series should expose an SVG path");
  assert(iconTrack.series.delta.path.startsWith("M "), "delta series should expose an SVG path");
  assert(iconTrack.series.velocity.path.startsWith("M "), "velocity series should expose an SVG path");

  const rawChart = buildMotionTrackChartModel(trace, {
    cursorTimeMs: 50,
    displayMode: MOTION_TRACK_CHART_DISPLAY_RAW,
  });
  const rawValuePoint = rawChart.tracks.find((track) => track.key === iconTrack.key).series.value.points[1];
  assert(rawChart.displayMode === MOTION_TRACK_CHART_DISPLAY_RAW, "raw display mode should be preserved");
  assert(rawValuePoint.raw === 50 && rawValuePoint.value === 50, "raw mode point value should use source units");

  const normalizedChart = buildMotionTrackChartModel(trace, {
    cursorTimeMs: 50,
    displayMode: MOTION_TRACK_CHART_DISPLAY_NORMALIZED,
  });
  const normalizedValuePoint = normalizedChart.tracks.find((track) => track.key === iconTrack.key).series.value.points[1];
  assert(normalizedChart.displayMode === MOTION_TRACK_CHART_DISPLAY_NORMALIZED, "normalized display mode should be preserved");
  assert(normalizedValuePoint.raw === 50 && normalizedValuePoint.value === 0.5, "normalized mode point value should use 0..1 units");
  assert(normalizedValuePoint.x === 50 && normalizedValuePoint.y === 50, "normalized point should keep chart coordinates");

  const visibility = normalizeMotionTrackChartSeriesVisibility({
    delta: true,
    to: false,
    value: true,
    velocity: false,
  });
  assert(visibility.value && visibility.delta && !visibility.to && !visibility.velocity, "series visibility should normalize booleans");
  const visibilityChart = buildMotionTrackChartModel(trace, { seriesVisibility: visibility });
  const visibilityTrack = visibilityChart.tracks.find((track) => track.key === iconTrack.key);
  assert(visibilityTrack.visibleSeries.join(",") === "value,delta", "visible series should list enabled series in stable order");
  assert(visibilityTrack.series.to.visible === false && visibilityTrack.series.to.path === "", "hidden to series should not expose a path");
  assert(visibilityTrack.series.velocity.visible === false && visibilityTrack.series.velocity.path === "", "hidden velocity series should not expose a path");
  assert(visibilityTrack.series.delta.visible === true && visibilityTrack.series.delta.path.startsWith("M "), "visible delta series should expose a path");

  assert(iconTrack.eventMarkers.length === 3, "track should include event markers");
  assert(iconTrack.eventMarkers[0].type === "start" && iconTrack.eventMarkers[0].x === 0, "start marker should map to trace start");
  assert(iconTrack.eventMarkers[1].type === "retarget" && iconTrack.eventMarkers[1].x === 50, "retarget marker should map to event time");
  assert(iconTrack.eventMarkers[1].detail.includes("reason=replace"), "event marker detail should include reason");

  const zoom = normalizeMotionTrackChartZoomWindow(trace, { endMs: -20, startMs: 120 });
  assert(zoom.startMs === 0 && zoom.endMs === 100, "zoom window should clamp and normalize reversed bounds");
  const zoomChart = buildMotionTrackChartModel(trace, {
    cursorTimeMs: 120,
    zoomWindow: { endMs: 75, startMs: 25 },
  });
  const zoomTrack = zoomChart.tracks.find((track) => track.key === iconTrack.key);
  assert(zoomChart.zoomWindow.startMs === 25 && zoomChart.zoomWindow.endMs === 75, "chart should preserve requested zoom window");
  assert(zoomChart.cursor.timeMs === 75 && zoomChart.cursor.x === 100, "cursor should clamp to zoom end");
  assert(zoomTrack.sampleCount === 1, "zoom should filter samples to the window");
  assert(zoomTrack.series.value.points[0].timeMs === 50 && zoomTrack.series.value.points[0].x === 50, "zoomed sample should be positioned within zoom window");
  assert(zoomTrack.eventMarkers.length === 1 && zoomTrack.eventMarkers[0].type === "retarget", "zoom should filter event markers to the window");

  const filteredChart = buildMotionTrackChartModel(trace, { filters: { query: "folder" } });
  assert(filteredChart.tracks.length === 1 && filteredChart.tracks[0].key === "2:alpha:base:fade", "query filters should narrow chart tracks");

  const eventOnlyTrace = {
    ...trace,
    summary: { eventCount: 1, frameCount: 0, targetCount: 1, trackCount: 1, valueCount: 0, warningCount: 0 },
    timeline: {
      events: [{
        driver: "spring",
        frame: 12,
        lane: "base",
        laneKey: "interrupt",
        layer: "desktop",
        prop: "x",
        reason: "replace",
        sourceLabel: "desktop.icon.smoke",
        targetId: 1,
        timeMs: 40,
        to: 120,
        type: "cancel",
        value: 48,
        velocity: 20,
      }],
      frames: [],
      timeRangeMs: { max: 40, min: 40 },
    },
    tracks: [],
  };
  const eventOnlyChart = buildMotionTrackChartModel(eventOnlyTrace, { cursorTimeMs: 40 });
  assert(eventOnlyChart.tracks.length === 1, "event-only captures should still produce a track row");
  assert(eventOnlyChart.tracks[0].sampleCount === 0 && eventOnlyChart.tracks[0].eventCount === 1, "event-only track should expose event count without samples");
  assert(eventOnlyChart.tracks[0].eventMarkers[0].type === "cancel", "event-only track should expose event markers");
  assert(eventOnlyChart.tracks[0].series.value.path === "", "event-only track should not invent sample paths");
}
