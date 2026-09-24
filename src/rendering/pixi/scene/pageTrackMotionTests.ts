import { createMotionRuntime } from "../animation/motionRuntime.js";
import type { MotionRuntime } from "../animation/motionRuntime.js";
import { getPageSwipeSpeed,setPageSwipeSpeed } from "../../pageSwipePreview.js";
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
    const runtime=createMotionRuntime({autoStart:false}),state=createPageTrackMotionState(),track={x:-540};
    updatePageTrackMotion(state,track,{runtime,pageIndex:0,pageSpan:900,
      scrub:{fromIndex:0.6,toIndex:0,progress:0,settle:true,settleToken:"wheel-interrupt-edge",targetProgress:1}});
    assert(nearlyEqual(track.x,-540),"wheel settle interrupting an edge spring must retain the displayed start position");
    assert(runUntil(runtime,()=>state.control?.completed===true),"interrupted page settle must complete");
    assert(nearlyEqual(track.x,0),"reverse wheel must finish at its committed page");
    updatePageTrackMotion(state,track,{runtime,pageIndex:2,pageSpan:900,scrub:null});
    assert(runUntil(runtime,()=>state.control?.completed===true),"edge may take ownership after the old scrub is cleared");
    assert(nearlyEqual(track.x,-1800),"edge page and rendered track must agree after navigation ownership changes");
  }
  const previousSpeed=getPageSwipeSpeed();
  for(const speed of [4,6] as const){
    setPageSwipeSpeed(speed);
    try{
      const runtime=createMotionRuntime({autoStart:false}),state=createPageTrackMotionState(),track={x:0};
      const update=(progress:number,time:number,settle=false)=>updatePageTrackMotion(state,track,{runtime,pageSpan:800,scrub:{fromIndex:0,toIndex:1,progress,continuousWheel:true,sampleTime:time,...(settle?{settle:true,targetProgress:1,settleToken:"speed-release"}:{})}});
      update(0.01,10);assert(nearlyEqual(track.x,-8),"slow input must follow immediately");
      runtime.step(.02);update(0.03,30);assert(nearlyEqual(track.x,-24),"slow input must not accumulate lag");
      update(1,40);assert(nearlyEqual(track.x,-24),"fast input cannot jump to its target");
      let previous=track.x;
      for(let frame=0;frame<6;frame++){
        runtime.step(1/120);assert(Math.abs(track.x-previous)<=speed*800/120+0.01,"active movement respects page-normalized speed");previous=track.x;
      }
      const beforeRelease=track.x;update(1,40,true);assert(nearlyEqual(track.x,beforeRelease),"release starts from the actual visible position");
      const control=state.control;update(1,40,true);assert(state.control===control,"unchanged render commits cannot restart the limiter");
      updatePageTrackMotion(state,track,{runtime,pageSpan:800,pageIndex:1,scrub:null});assert(state.control===control,"input presentation expiry cannot replace an unfinished limited settle");
      for(let frame=0;frame<150;frame++){
        runtime.step(1/120);assert(Math.abs(track.x-previous)<=speed*800/120+0.01,"release remains speed-bounded");assert(track.x>=-800.01,"limited release cannot overshoot");previous=track.x;
      }
      assert(nearlyEqual(track.x,-800),"limited release must reach the target");
      state.control?.cancel();
      const batched=createPageTrackMotionState(),batchedTrack={x:0};
      updatePageTrackMotion(batched,batchedTrack,{runtime,pageSpan:800,scrub:{fromIndex:0,toIndex:1,progress:1,continuousWheel:true,sampleTime:100,settle:true,targetProgress:1,settleToken:"batched"}});
      assert(nearlyEqual(batchedTrack.x,0),"release batched before the first render cannot snap to its input position");
      runtime.step(1/120);assert(batchedTrack.x<0&&batchedTrack.x>-speed*800/120-.01,"batched release obeys the same speed bound");batched.control?.cancel();
      const reverseState=createPageTrackMotionState(),reverseTrack={x:0};
      const reverse=(progress:number,time:number)=>updatePageTrackMotion(reverseState,reverseTrack,{runtime,pageSpan:800,scrub:{fromIndex:0,toIndex:1,progress,continuousWheel:true,sampleTime:time}});
      reverse(1,0);runtime.step(.05);const beforeReverse=reverseTrack.x;reverse(0,50);assert(nearlyEqual(reverseTrack.x,beforeReverse),"reversal is position-continuous");runtime.step(1/120);assert(reverseTrack.x>beforeReverse,"reversal follows the new target on the next frame");reverseState.control?.cancel();
      const mouse=createPageTrackMotionState(),mouseTrack={x:0};
      updatePageTrackMotion(mouse,mouseTrack,{runtime,pageSpan:800,scrub:{fromIndex:0,toIndex:1,progress:.8}});
      assert(nearlyEqual(mouseTrack.x,-640),"non-wheel scrub retains baseline behavior");mouse.control?.cancel();
    }finally{setPageSwipeSpeed(previousSpeed);}
  }
  // Release states reconstructed from the user's fast touchpad recordings.
  for(const [progress,velocity] of [[1,20.309367],[0.850115,19.498307],[0.999712,23.329792],[0.61565,16.457004]] as const){
    for(const sign of [1,-1]){
      const runtime=createMotionRuntime({autoStart:false}),state=createPageTrackMotionState(),track={x:0};
      const fromIndex=sign===1?0:1,toIndex=sign===1?1:0,span=695.2;
      updatePageTrackMotion(state,track,{runtime,pageSpan:span,scrub:{fromIndex,toIndex,progress}});
      updatePageTrackMotion(state,track,{runtime,pageSpan:span,scrub:{fromIndex,toIndex,progress,settle:true,settleToken:"touchpad-release",targetProgress:1,velocity}});
      let previous=track.x;
      for(let frame=0;frame<360;frame++){
        runtime.step(1/120);
        assert(sign*(track.x+toIndex*span)>=-0.01,"release must not cross the target page");
        assert(sign*(track.x-previous)<=0.01,"release must approach the page monotonically");previous=track.x;
      }
      assert(nearlyEqual(track.x,-toIndex*span),"release must finish at its page");state.control?.cancel();
    }
  }
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
