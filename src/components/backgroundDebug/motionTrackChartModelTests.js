import {
  buildMotionTrackChartModel,
  MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT,
  MOTION_TRACK_CHART_DEFAULT_TRACK_LIMIT,
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
  assert(chart.axis.ticks.length === 5, "chart should expose default time axis ticks");
  assert(chart.axis.ticks[0].label === "0ms" && chart.axis.ticks[4].label === "100ms", "axis ticks should expose readable labels");
  assert(chart.limits.trackLimit === MOTION_TRACK_CHART_DEFAULT_TRACK_LIMIT, "chart should expose default track limit");
  assert(chart.limits.maxPointsPerSeries === MOTION_TRACK_CHART_DEFAULT_POINT_LIMIT, "chart should expose default point limit");
  assert(chart.summary.trackCount === 2 && chart.summary.visibleTrackCount === 2, "chart summary should expose track counts");
  assert(chart.summary.sampleCount === 6 && chart.summary.eventCount === 4, "chart summary should expose sample and event counts");
  assert(chart.tracks.length === 2, "chart should group samples by track");

  const iconTrack = chart.tracks.find((track) => track.key === "1:x:base:default");
  assert(iconTrack, "chart should include the icon x track");
  assert(iconTrack.label === "desktop.icon.smoke.x", "track label should use source label and prop");
  assert(iconTrack.targetProp === "desktop.icon.smoke.x", "track should expose targetProp for table UI");
  assert(iconTrack.laneLabel === "base/default", "track should expose lane label");
  assert(iconTrack.summary === "3 samples / 3 events", "track should expose compact summary");
  assert(iconTrack.sampleCount === 3 && iconTrack.eventCount === 3, "track should expose sample and event counts");
  assert(iconTrack.timeline.startMs === 0 && iconTrack.timeline.endMs === 100, "track timeline should expose active time range");
  assert(iconTrack.timeline.startX === 0 && iconTrack.timeline.endX === 100 && iconTrack.timeline.width === 100, "track timeline should expose percent bounds");
  assert(iconTrack.current.timeMs === 50 && iconTrack.current.value === 50, "track should expose current value at cursor");
  assert(iconTrack.current.to === 100 && iconTrack.current.delta === 50 && iconTrack.current.velocity === 12, "current value should include to/delta/velocity");
  assert(iconTrack.stats.maxAbsDelta === 100 && iconTrack.stats.maxAbsVelocity === 12, "track should expose max absolute stats");
  assert(iconTrack.rangeLabels.value === "0..100", "track should expose readable value range");
  assert(iconTrack.rangeLabels.velocity === "0..12", "track should expose readable velocity range");
  assert(iconTrack.series.value.path.startsWith("M "), "value series should expose an SVG path");
  assert(iconTrack.series.to.path.startsWith("M "), "to series should expose an SVG path");
  assert(iconTrack.series.delta.path.startsWith("M "), "delta series should expose an SVG path");
  assert(iconTrack.series.velocity.path.startsWith("M "), "velocity series should expose an SVG path");
  assert(iconTrack.series.value.pointCount === 3 && iconTrack.series.value.renderedPointCount === 3, "series should expose source and rendered point counts");

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

  const selectedChart = buildMotionTrackChartModel(trace, {
    selectedTrack: { targetId: 1, prop: "x", lane: "base", laneKey: "default" },
  });
  assert(selectedChart.tracks.find((track) => track.key === iconTrack.key).isSelected === true, "selected track object should mark matching chart track");
  assert(selectedChart.tracks.find((track) => track.key === "2:alpha:base:fade").isSelected === false, "nonmatching track should not be selected");

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
  assert(zoomChart.axis.ticks[0].label === "25ms" && zoomChart.axis.ticks.at(-1).label === "75ms", "zoom should drive axis labels");

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
  assert(eventOnlyChart.tracks[0].current === null, "event-only track should expose null current sample");
  assert(eventOnlyChart.tracks[0].rangeLabels.value === "none", "event-only track should expose empty range label");

  const denseTrace = {
    ...trace,
    summary: { eventCount: 0, frameCount: 12, targetCount: 3, trackCount: 3, valueCount: 36, warningCount: 0 },
    targets: [1, 2, 3].map((targetId) => ({
      kind: "Icon",
      label: `Dense ${targetId}`,
      layer: "desktop",
      sourceLabel: `desktop.icon.dense-${targetId}`,
      targetId,
    })),
    timeline: {
      events: [],
      frames: Array.from({ length: 12 }, (_, frame) => ({
        activeAnimationCount: 3,
        frame,
        timeMs: frame * 10,
        values: [1, 2, 3].map((targetId) => ({
          driver: "spring",
          lane: "base",
          laneKey: "dense",
          layer: "desktop",
          prop: "x",
          sourceLabel: `desktop.icon.dense-${targetId}`,
          targetId,
          to: 120,
          value: frame * targetId,
          velocity: targetId,
        })),
      })),
      timeRangeMs: { max: 110, min: 0 },
    },
    tracks: [],
  };
  const denseChart = buildMotionTrackChartModel(denseTrace, {
    maxPointsPerSeries: 4,
    trackLimit: 2,
  });
  assert(denseChart.summary.trackCount === 3 && denseChart.summary.visibleTrackCount === 2 && denseChart.summary.hiddenTrackCount === 1, "track limit should be visible in summary");
  assert(denseChart.limits.tracksLimited === true, "track limit should expose limited state");
  assert(denseChart.tracks.length === 2, "track limit should cap rendered tracks");
  assert(denseChart.tracks[0].series.value.pointCount === 12, "dense series should retain source point count");
  assert(denseChart.tracks[0].series.value.renderedPointCount === 4, "dense series should downsample rendered point count");
  assert(denseChart.tracks[0].series.value.points[0].timeMs === 0, "downsample should keep first point");
  assert(denseChart.tracks[0].series.value.points.at(-1).timeMs === 110, "downsample should keep last point");
}
