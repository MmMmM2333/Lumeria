import { springGroupTo } from "./springGroup.js";
import { clearMotionPreferencesForTests, setReducedMotionForTests } from "./motionPreferences.js";
import { pageTrackSpring, springTo, stopSpring, stopTargetSprings } from "./springMotion.js";

function makeTimerHost() {
  let nextId = 1;
  const timers = new Map();
  return {
    clearTimeout(id) {
      timers.delete(id);
    },
    runAll() {
      const pending = Array.from(timers.entries());
      for (const [id, callback] of pending) {
        if (!timers.has(id)) continue;
        timers.delete(id);
        callback();
      }
    },
    setTimeout(callback) {
      const id = nextId;
      nextId += 1;
      timers.set(id, callback);
      return id;
    },
    get size() {
      return timers.size;
    },
  };
}

export function runSpringGroupTests() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`[Spring group test failed] ${message}`);
  };

  {
    const scheduler = makeTimerHost();
    const target = { x: 0 };
    let completed = 0;
    const group = springGroupTo([
      { target, prop: "x", to: 10, options: { delay: 0.1, snap: true } },
    ], {
      scheduler,
      onComplete: () => {
        completed += 1;
      },
    });

    assert(scheduler.size === 1, "delayed spring should schedule a timer");
    group.cancel();
    scheduler.runAll();
    assert(target.x === 0, "canceling before delay should not mutate the target");
    assert(completed === 0, "canceling before delay should not complete the group");
    assert(group.canceled === true, "group should expose canceled state");
  }

  {
    const target = { x: 0, y: 0 };
    let completed = 0;
    const group = springGroupTo([
      { target, prop: "x", to: 12, options: { snap: true } },
      { target, prop: "y", to: 24, options: { snap: true } },
    ], {
      onComplete: () => {
        completed += 1;
      },
    });

    assert(target.x === 12 && target.y === 24, "snap entries should apply all target values");
    assert(completed === 1, "group should complete exactly once after all entries finish");
    assert(group.completed === true, "group should expose completed state");
  }

  {
    setReducedMotionForTests(true);
    try {
      const target = { x: 0, y: 0 };
      let completed = 0;
      const group = springGroupTo([
        { target, prop: "x", to: 12 },
        { target, prop: "y", to: 24 },
      ], {
        onComplete: () => {
          completed += 1;
        },
      });

      assert(target.x === 12 && target.y === 24, "reduced-motion group should snap all target values");
      assert(completed === 1, "reduced-motion group should complete exactly once");
    assert(group.completed === true, "reduced-motion group should expose completed state");
    } finally {
      clearMotionPreferencesForTests();
    }
  }

  {
    let arrived = 0;
    let completed = 0;
    const target = { x: 0 };
    springGroupTo([
      {
        target,
        prop: "x",
        to: 10,
        options: {
          onArrive: () => {
            arrived += 1;
          },
          snap: true,
        },
      },
    ], {
      onComplete: () => {
        completed += 1;
      },
    });

    assert(arrived === 1, "spring group should pass entry onArrive to snapped springs");
    assert(completed === 1, "entry onArrive should not prevent group completion");
    assert(target.x === 10, "spring group snapped arrival should still write the target value");
  }

  {
    const first = { x: 0 };
    const second = { y: 0 };
    const calls = [];
    const group = springGroupTo([
      {
        target: first,
        prop: "x",
        to: 10,
        options: { onArrive: () => calls.push("first-arrive"), snap: true },
      },
      {
        target: second,
        prop: "y",
        to: 20,
        options: { onArrive: () => calls.push("second-arrive"), snap: true },
      },
    ], {
      onArrive: () => calls.push("group-arrive"),
      onComplete: () => calls.push("group-complete"),
    });

    assert(
      calls.join(",") === "first-arrive,second-arrive,group-arrive,group-complete",
      "group onArrive should fire after all entry arrivals and before group completion"
    );
    assert(group.arrived === true, "group should expose arrived state");
    assert(group.completed === true, "group should still expose completed state after arrival");
  }

  {
    const target = { x: 0 };
    let completed = 0;
    const group = springGroupTo([
      { target, prop: "x", to: 10 },
    ], {
      onComplete: () => {
        completed += 1;
      },
    });

    stopSpring(target, "x");
    assert(completed === 0, "external spring stop should not complete the group");
    assert(group.canceled === true, "external spring stop should cancel the group");
  }

  {
    const target = { destroyed: true, x: 0 };
    let completed = 0;
    const group = springGroupTo([
      { target, prop: "x", to: 10 },
    ], {
      onComplete: () => {
        completed += 1;
      },
    });

    assert(target.x === 0, "destroyed targets should not start spring motion");
    assert(completed === 0, "destroyed targets should not complete the group");
    assert(group.canceled === true, "destroyed targets should cancel the group");
  }

  {
    const scheduler = makeTimerHost();
    const target = { x: 0, y: 0 };
    let completed = 0;
    const group = springGroupTo([
      { target, prop: "x", to: 10 },
      { target, prop: "y", to: 20, options: { delay: 0.1 } },
    ], {
      scheduler,
      onComplete: () => {
        completed += 1;
      },
    });

    const activeSpring = springTo(target, "x", 30, pageTrackSpring);
    const velocityBeforeReleaseRetarget = activeSpring.velocity;
    group.release();
    scheduler.runAll();
    const retargeted = springTo(target, "x", 40, pageTrackSpring);

    assert(group.released === true, "release should expose released state");
    assert(group.canceled === false, "release should not mark the group canceled");
    assert(completed === 0, "release should not complete the group");
    assert(target.y === 0, "release should clear delayed entries without starting them");
    assert(retargeted === activeSpring, "release should leave active springs available for retargeting");
    assert(retargeted.velocity === velocityBeforeReleaseRetarget, "release retarget should preserve active spring velocity");
    stopTargetSprings(target);
  }
}
