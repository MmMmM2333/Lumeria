import assert from "node:assert/strict";
import { NativeWindowSync } from "./native-window-sync.js";
import { NativePresentationWatchdog } from "./native-presentation-watchdog.js";

{
  const sync = new NativeWindowSync();
  assert.equal(sync.sync((backing, notify) => {
    assert.equal(backing, true); assert.equal(notify, false);
    assert.equal(sync.pending, true, "in-flight changes are still pending");
    return true;
  }), true);
  assert.equal(sync.pending, false);
  assert.equal(sync.sync(() => { throw new Error("no work was requested"); }), false);
}

for (const phase of ["resize", "reconfigure"] as const) {
  const sync = new NativeWindowSync();
  let resolution = 1.5, notifiedResolution = 1.5, fail = false;
  const apply = (_backing: boolean, notify: boolean): boolean => {
    const next = fail ? 1.5 : 1;
    const changed = next !== resolution;
    resolution = next;
    if (fail) throw new Error(`${phase} failed after updating the viewport`);
    if (changed || notify) notifiedResolution = resolution;
    return true;
  };
  sync.sync(apply);
  assert.equal(notifiedResolution, 1);
  sync.request(); fail = true;
  assert.throws(() => sync.sync(apply), new RegExp(phase));
  assert.equal(resolution, 1.5); assert.equal(notifiedResolution, 1);
  assert.equal(sync.pending, true, "a failed GPU resize remains queued");
  sync.afterRecovery();
  sync.sync((backing, notify) => {
    assert.equal(backing, true);
    assert.equal(notify, true, "the unchanged post-recovery viewport must notify the UI");
    notifiedResolution = resolution;
    return true;
  });
  assert.equal(notifiedResolution, 1.5); assert.equal(sync.pending, false);
}

{
  const sync = new NativeWindowSync();
  sync.afterRecovery();
  assert.equal(sync.sync(() => false), false, "a suspended/minimized window defers work");
  assert.equal(sync.pending, true);
  sync.sync((backing, notify) => {
    assert.equal(backing, true); assert.equal(notify, true);
    return true;
  });
}

{
  const sync = new NativeWindowSync();
  sync.sync(() => {
    sync.request(false);
    assert.equal(sync.sync(() => { throw new Error("reentrant synchronization"); }), false);
    return true;
  });
  assert.equal(sync.pending, true, "new window events survive an in-flight synchronization");
  sync.sync((backing, notify) => {
    assert.equal(backing, false); assert.equal(notify, false);
    return true;
  });
  sync.request(false); sync.request(true); sync.request(false);
  sync.sync(backing => { assert.equal(backing, true); return true; });
}

{
  const watchdog = new NativePresentationWatchdog();
  assert.equal(watchdog.stalled(100_000), false, "idle time is not a stalled presentation");
  watchdog.beginFrame(100_000);
  assert.equal(watchdog.stalled(100_001), false, "new DPI work gets its own frame deadline");
  watchdog.beginFrame(104_000);
  assert.equal(watchdog.stalled(105_001), true, "repeated failed frames cannot extend the deadline");
  watchdog.reset();
  assert.equal(watchdog.stalled(200_000), false);
  watchdog.beginFrame(200_000);
  assert.equal(watchdog.stalled(205_000), false);
  assert.equal(watchdog.stalled(205_001), true);
}

console.log("Native window sync: partial GPU failures, recovery notifications, suspension, reentry and presentation deadlines passed");
