import { springGroupTo } from "./springGroup.js";
import { stopSpring } from "./springMotion.js";

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
}
