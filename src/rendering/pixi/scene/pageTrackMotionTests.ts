import { createMotionRuntime } from "../animation/motionRuntime.js";
import type { MotionRuntime } from "../animation/motionRuntime.js";
import {
  createPageTrackMotionState,
  getPageTrackX,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[pageTrackMotion test failed] ${message}`);
}

function runUntil(runtime: MotionRuntime, condition: () => boolean, maxFrames = 240): boolean {
  for (let index = 0; index < maxFrames; index += 1) {
    runtime.step(1 / 60);
    if (condition()) return true;
  }
  return false;
}

function nearlyEqual(a: number, b: number, epsilon = 0.001): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function runPageTrackMotionTests(): void {
  {
    assert(getPageTrackX(2, 320) === -640, "page index should project to negative track offset");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };
    let updateCount = 0;

    const result = updatePageTrackMotion(motionState, pageTrack, {
      onFrame: () => { updateCount += 1; },
      pageSpan: 500,
      runtime,
      scrub: { fromIndex: 0, progress: 0.4, toIndex: 1 },
    });

    assert(result.mode === "scrub", "scrub state should create a progress-driven control");
    assert(nearlyEqual(pageTrack.x, -200), `scrub progress should write the interpolated track x, got ${pageTrack.x}`);
    assert(updateCount === 1, "scrub progress should flush an immediate update callback");

    updatePageTrackMotion(motionState, pageTrack, {
      onFrame: () => { updateCount += 1; },
      pageSpan: 500,
      runtime,
      scrub: { fromIndex: 0, progress: 0.75, toIndex: 1 },
    });

    assert(nearlyEqual(pageTrack.x, -375), "scrub progress should update an existing control without recreating it");
    assert(motionState.control?.state?.driver.type === "progress", "active scrub control should keep the progress driver");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };
    runtime.configureDebug({ enabled: true });

    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: { fromIndex: 0, progress: 0.35, toIndex: 1 },
    });
    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: {
        fromIndex: 0,
        progress: 0.35,
        settle: true,
        settleToken: "release-1",
        toIndex: 1,
        velocity: 0.8,
      },
    });

    assert(motionState.mode === "settle", "settling scrub should switch the page-track state to settle mode");
    assert(motionState.control?.state?.driver.type === "spring", "settling scrub should hand progress off to a spring driver");
    assert(runUntil(runtime, () => motionState.control?.completed === true), "settling scrub should complete under deterministic stepping");
    assert(nearlyEqual(pageTrack.x, -400), `positive velocity should settle to the destination page, got ${pageTrack.x}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: -240 };

    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: { fromIndex: 0, progress: 0.6, toIndex: 1 },
    });
    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: {
        fromIndex: 0,
        progress: 0.6,
        settle: true,
        settleToken: "release-2",
        targetProgress: 0,
        toIndex: 1,
      },
    });

    assert(runUntil(runtime, () => motionState.control?.completed === true), "explicit target progress should complete");
    assert(nearlyEqual(pageTrack.x, 0), `explicit target progress should settle back to the source page, got ${pageTrack.x}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };
    runtime.configureDebug({ enabled: true });

    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: { fromIndex: 0, progress: 0.55, toIndex: 1 },
    });
    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: {
        fromIndex: 0,
        progress: 0.55,
        settle: true,
        settleToken: "release-grab",
        targetProgress: 1,
        toIndex: 1,
      },
    });
    runtime.step(1 / 60);
    const inFlightX = pageTrack.x;
    assert(inFlightX < 0 && inFlightX > -400, "test setup should leave the settling track in flight");

    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: {
        fromIndex: 0,
        grab: true,
        grabToken: "grab-1",
        progress: 0,
        progressDelta: -0.1,
        toIndex: 1,
      },
    });

    const grabbedX = pageTrack.x;
    assert(grabbedX > inFlightX, "grab scrub should continue from the current settling track position and move backward without jumping to the discrete page index");

    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: {
        fromIndex: 0,
        grab: true,
        grabToken: "grab-1",
        progress: 0,
        progressDelta: 0.1,
        toIndex: 1,
      },
    });

    assert(pageTrack.x < inFlightX, "same grab gesture should preserve the captured progress offset while applying new deltas");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };
    runtime.configureDebug({ enabled: true });

    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: { fromIndex: 0, progress: 0.4, toIndex: 1 },
    });
    updatePageTrackMotion(motionState, pageTrack, {
      pageSpan: 400,
      runtime,
      scrub: { fromIndex: 1, progress: 0.2, toIndex: 2 },
    });

    assert(runtime.debugSnapshot().counters.canceledByReason["page-track-replace"] === 1, "page-track scrub route changes should use a specific replace reason");

    updatePageTrackMotion(motionState, pageTrack, {
      pageIndex: 2,
      pageSpan: 400,
      runtime,
    });

    assert(runtime.debugSnapshot().counters.canceledByReason["page-track-replace"] === 2, "page-track scrub-to-spring fallback should use the page-track replace reason");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };

    updatePageTrackMotion(motionState, pageTrack, {
      pageIndex: 2,
      pageSpan: 300,
      runtime,
    });

    assert(motionState.mode === "spring", "missing scrub state should use the ordinary spring path");
    assert(runUntil(runtime, () => motionState.control?.completed === true), "ordinary page-track spring should complete");
    assert(nearlyEqual(pageTrack.x, -600), `ordinary spring should land on the target page, got ${pageTrack.x}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };

    updatePageTrackMotion(motionState, pageTrack, {
      pageIndex: 2,
      pageSpan: 300,
      runtime,
    });
    runtime.step(1 / 60);
    assert(pageTrack.x < 0 && pageTrack.x > -600, "test setup should leave the ordinary page-track spring in flight");

    const result = updatePageTrackMotion(motionState, pageTrack, {
      pageIndex: 2,
      pageSpan: 300,
      runtime,
      snap: true,
    });

    assert(result.mode === "spring", "snap should keep the page-track state in spring mode");
    assert(nearlyEqual(pageTrack.x, -600), `snap should land immediately even when the target index is unchanged, got ${pageTrack.x}`);
    assert(!runtime.hasActiveWork(), "snap should cancel the in-flight spring instead of letting it keep animating");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };
    let frameCount = 0;

    updatePageTrackMotion(motionState, pageTrack, {
      onFrame: () => { frameCount += 1; },
      pageIndex: 0,
      pageSpan: 300,
      runtime,
    });

    assert(!runtime.hasActiveWork(), "page track should not create a spring when it is already at the target");
    assert(frameCount === 0, "unchanged page track target should not emit frame callbacks");

    updatePageTrackMotion(motionState, pageTrack, {
      onFrame: () => { frameCount += 1; },
      pageIndex: 0,
      pageSpan: 300,
      runtime,
    });

    assert(!runtime.hasActiveWork(), "reapplying the same page track target should stay idle");
    assert(frameCount === 0, "reapplying the same page track target should stay silent");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };
    runtime.configureDebug({ enabled: true });

    updatePageTrackMotion(motionState, pageTrack, {
      debugMetadata: {
        kind: "PageTrack",
        label: "Desktop page track",
        layer: "desktop",
      },
      pageIndex: 1,
      pageSpan: 320,
      runtime,
      sourceLabel: "desktop.pageTrack",
    });

    const report = runtime.debugReport({ includeTargets: true });
    const target = report.targets?.find((entry) => entry.sourceLabel === "desktop.pageTrack");
    assert(target?.kind === "PageTrack", "page track motion should describe its animated target");
    assert(target?.pageIndex === 1, "page track metadata should include the destination page index");
    assert(report.animations[0]?.sourceLabel === "desktop.pageTrack", "page track animation should expose its source label");
    assert(report.warnings.length === 0, "described page track motion should not produce missing metadata warnings");
  }
}
