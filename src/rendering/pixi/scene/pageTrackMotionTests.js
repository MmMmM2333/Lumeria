import { createMotionRuntime } from "../animation/motionRuntime.js";
import {
  createPageTrackMotionState,
  getPageTrackX,
  updatePageTrackMotion,
} from "./pageTrackMotion.js";

function runUntil(runtime, condition, maxFrames = 240) {
  for (let index = 0; index < maxFrames; index += 1) {
    runtime.step(1 / 60);
    if (condition()) return true;
  }
  return false;
}

function nearlyEqual(a, b, epsilon = 0.001) {
  return Math.abs(a - b) <= epsilon;
}

export function runPageTrackMotionTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[pageTrackMotion test failed] ${message}`);
  };

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
    assert(motionState.control.state.driver.type === "progress", "active scrub control should keep the progress driver");
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };

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
    assert(motionState.control.state.driver.type === "spring", "settling scrub should hand progress off to a spring driver");
    assert(runUntil(runtime, () => motionState.control.completed), "settling scrub should complete under deterministic stepping");
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

    assert(runUntil(runtime, () => motionState.control.completed), "explicit target progress should complete");
    assert(nearlyEqual(pageTrack.x, 0), `explicit target progress should settle back to the source page, got ${pageTrack.x}`);
  }

  {
    const runtime = createMotionRuntime({ autoStart: false });
    const motionState = createPageTrackMotionState();
    const pageTrack = { x: 0 };

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
    assert(runUntil(runtime, () => motionState.control.completed), "ordinary page-track spring should complete");
    assert(nearlyEqual(pageTrack.x, -600), `ordinary spring should land on the target page, got ${pageTrack.x}`);
  }
}
